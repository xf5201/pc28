// src/services/strategy-executor.service.js
const accountDao = require('../db/account.dao');
const strategyConfigDao = require('../db/strategy-config.dao');
const betRecordDao = require('../db/bet-record.dao');
const openResultDao = require('../db/open-result.dao');
const operationLogDao = require('../db/operation-log.dao');
const { transaction } = require('../db/connection');
const { calcDirection, calcAmount } = require('../core/strategy.engine');
const { getOdds } = require('../core/odds.engine');
const logger = require('../utils/logger');

/**
 * 从期号中解析出全局递增的序号
 * 期号格式：YYYYMMDD-N...（如 20260813-26244）
 *
 * @param {string} period
 * @returns {number|null} 解析失败返回 null
 */
function termOf(period) {
  if (!period) return null;
  const idx = String(period).indexOf('-');
  if (idx < 0) return null;
  const n = parseInt(String(period).slice(idx + 1), 10);
  return Number.isNaN(n) ? null : n;
}

class StrategyExecutorService {
  constructor(deps) {
    this.periodService = deps.periodService;
    this.betSender = deps.betSender;
    this.panelRenderer = deps.panelRenderer;
  }

  async startStrategy(botUserId) {
    transaction(() => {
      const account = accountDao.getActive(botUserId);
      if (!account || account.status !== 'ACTIVE') throw new Error('账号状态异常或未配置下注群');
      
      const strategy = strategyConfigDao.getById(botUserId);
      if (!strategy) throw new Error('策略配置不存在');
      if (strategy.is_running === 1) throw new Error('策略已在运行中');

      strategyConfigDao.setRunning(botUserId);
      operationLogDao.insert({ bot_user_id: botUserId, action: 'START_STRATEGY', detail: `玩法=${strategy.play_type}` });
    });

    logger.info(`[STRATEGY_EXEC] 用户 ${botUserId} 策略已启动`);
    if (this.panelRenderer) {
      await this.panelRenderer.pushUpdate(botUserId, 'dashboard', {
        user: { id: botUserId },
        account: accountDao.getActive(botUserId),
        strategy: strategyConfigDao.getById(botUserId),
      });
    }
  }

  async stopStrategy(botUserId) {
    transaction(() => {
      const strategy = strategyConfigDao.getById(botUserId);
      if (!strategy || strategy.is_running === 0) throw new Error('策略已处于停止状态');

      strategyConfigDao.setStopped(botUserId);
      operationLogDao.insert({ bot_user_id: botUserId, action: 'STOP_STRATEGY', detail: null });
    });

    logger.info(`[STRATEGY_EXEC] 用户 ${botUserId} 策略已停止`);
    if (this.panelRenderer) {
      await this.panelRenderer.pushUpdate(botUserId, 'dashboard', {
        user: { id: botUserId },
        account: accountDao.getActive(botUserId),
        strategy: strategyConfigDao.getById(botUserId),
      });
    }
  }

  async triggerBet(botUserId, period) {
    let betRecord = null;

    try {
      transaction(() => {
        const strategy = strategyConfigDao.getRunning(botUserId);
        if (!strategy) return;

        const account = accountDao.getActive(botUserId);
        if (!account || account.status !== 'ACTIVE') return;

        // 封盘校验
        const latestResult = openResultDao.getLatest();
        if (latestResult && latestResult.next_open_time) {
          const check = this.periodService.shouldBet(period, latestResult.next_open_time, strategy.cut_off_seconds);
          if (!check.should) {
            logger.info(`[STRATEGY_EXEC] 用户 ${botUserId} 期号 ${period} ${check.reason}`);
            return;
          }
        }

        // 一期一注校验
        if (betRecordDao.getByUserAndPeriod(botUserId, period)) return;

        // 获取上期方向
        const lastResult = openResultDao.getLatest();
        let lastDir = lastResult ? lastResult.direction : null;

        // 【🔥 核心适配】处理新的组合方向格式 "SMALL,EVEN"
        // 目前的玩法(顺龙/反龙/小刚)默认针对"大小"进行计算，因此提取逗号前的第一部分(Size)
        if (lastDir && typeof lastDir === 'string' && lastDir.includes(',')) {
          lastDir = lastDir.split(',')[0]; // 提取 "SMALL" 或 "BIG"
        }

        // ── 跳期保护 ──
        // 若距上一次下注中间跨越了期次（有期未下注），说明策略中断过，
        // 此时继续沿用旧的连挂数会导致金额严重偏离，故重置为 0。
        let losses = strategy.consecutive_losses;
        const lastBet = betRecordDao.getLatestByUser(botUserId);
        const currTerm = termOf(period);
        const lastTerm = lastBet ? termOf(lastBet.period) : null;

        if (currTerm !== null && lastTerm !== null && currTerm - lastTerm > 1) {
          const gap = currTerm - lastTerm;
          logger.warn(
            `[STRATEGY_EXEC] 用户 ${botUserId} 跳期 ${gap} 期未下注 ` +
            `(${lastBet.period} → ${period})，连挂重置 ${losses} → 0`
          );

          losses = 0;
          // 只清零连挂，保留当前模式（顺2反龙/反2顺龙的 FOLLOW/REVERSE）
          strategyConfigDao.updateLossesAndDirection(botUserId, 0, strategy.current_direction);

          operationLogDao.insert({
            bot_user_id: botUserId,
            action: 'LOSS_RESET',
            detail: `跳期 ${gap} 期 (${lastBet.period} → ${period})，连挂 ${strategy.consecutive_losses} → 0`,
          });
        }

        // 计算下注方向和金额（使用重置后的连挂数）
        const direction = calcDirection(lastDir, strategy.play_type, losses, strategy.current_direction);
        const betAmount = calcAmount(strategy.base_bet, strategy.martingale_ratio, losses);
        const odds = getOdds(strategy.mode, strategy.play_type, direction);

        // 创建下注记录
        const betId = betRecordDao.insert({
          bot_user_id: botUserId, strategy_config_id: strategy.id, period, direction,
          bet_amount: betAmount, mode: strategy.mode, odds, target_chat_id: account.target_chat_id,
        });

        betRecord = betRecordDao.getById(betId);
        operationLogDao.insert({ bot_user_id: botUserId, action: 'BET_CREATED', detail: `期号=${period}, 方向=${direction}, 金额=${betAmount}` });
        logger.info(`[STRATEGY_EXEC] 下注创建: 用户=${botUserId}, 期号=${period}, 方向=${direction}, 金额=${betAmount}`);
      });

      if (betRecord) {
        logger.info(`[STRATEGY_EXEC] 用户 ${botUserId} 下注已生成，将延迟 30 秒后发送...`);
        
        // ⚠️ 必须使用 setTimeout 异步延迟，千万不能用 await sleep()
        // 否则会阻塞主线程，导致其他用户的结算和下注被严重卡死
        setTimeout(async () => {
          try {
            await this.betSender.sendBetMessage(botUserId, betRecord);
          } catch (err) {
            logger.error(`[STRATEGY_EXEC] 延迟发送下注失败: ${err.message}`);
          }
        }, 15000); // 30000 毫秒 = 30 秒
      }
      return betRecord ? 'created_delayed' : 'skipped';
    } catch (error) {
      logger.error(`[STRATEGY_EXEC] 下注失败: ${error.message}`, error);
      return 'error';
    }
  }

  async updateConfig(botUserId, config) {
    const strategy = strategyConfigDao.getById(botUserId);
    if (!strategy) throw new Error('请先登录账号');
    strategyConfigDao.updateConfig(botUserId, config);
    operationLogDao.insert({ bot_user_id: botUserId, action: 'UPDATE_CONFIG', detail: JSON.stringify(config) });
  }
}

module.exports = StrategyExecutorService;