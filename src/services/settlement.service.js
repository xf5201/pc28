// src/services/settlement.service.js
const betRecordDao = require('../db/bet-record.dao');
const profitLogDao = require('../db/profit-log.dao');
const strategyConfigDao = require('../db/strategy-config.dao');
const openResultDao = require('../db/open-result.dao');
const operationLogDao = require('../db/operation-log.dao');
const { transaction } = require('../db/connection');
// 【修改】引入新增的 calcNextState
const { checkWin, calcNextState } = require('../core/strategy.engine');
const logger = require('../utils/logger');

/**
 * 结算服务
 *
 * 文档参考：§9.10, §8.6, §14.3, §14.7
 *
 * 职责：
 *   - 根据开奖结果结算所有 SENT/PENDING 下注
 *   - 事务化逐条结算
 *   - 更新连挂计数与策略模式（适配顺2反龙/反2顺龙）
 *   - 返回已结算的用户列表（供 triggerBet 使用）
 */
class SettlementService {
  constructor(deps) {
    this.panelRenderer = deps.panelRenderer;
  }

  /**
   * 结算指定期号的所有下注（§8.6）
   */
  async settleAll(currentPeriod) {
    // 1. 获取当前期号的开奖结果
    const openResult = openResultDao.getByPeriod(currentPeriod);
    if (!openResult) {
      logger.warn(`[SETTLEMENT] 期号 ${currentPeriod} 无开奖结果，跳过结算`);
      return [];
    }

    // 2. 获取所有待结算的下注
    const pendingBets = betRecordDao.listPendingByPeriod(currentPeriod);

    if (pendingBets.length === 0) {
      logger.debug(`[SETTLEMENT] 期号 ${currentPeriod} 无待结算下注`);
      return [];
    }

    logger.info(`[SETTLEMENT] 期号 ${currentPeriod} 待结算下注: ${pendingBets.length} 条`);

    const runningUsers = new Set();

    // 3. 逐条事务化结算
    for (const bet of pendingBets) {
      try {
        await this._settleBet(bet, openResult);

        // 检查该用户策略是否仍在运行
        const strategy = strategyConfigDao.getRunning(bet.bot_user_id);
        if (strategy) {
          runningUsers.add(bet.bot_user_id);
        }
      } catch (error) {
        logger.error(
          `[SETTLEMENT] 结算失败: bet_id=${bet.id}, 用户=${bet.bot_user_id} → ${error.message}`,
          error
        );

        operationLogDao.insert({
          bot_user_id: bet.bot_user_id,
          action: 'SETTLEMENT_ERROR',
          detail: `期号=${currentPeriod}, bet_id=${bet.id}, 原因=${error.message}`,
        });
      }
    }

    logger.info(
      `[SETTLEMENT] 期号 ${currentPeriod} 结算完成, ` +
      `RUNNING 用户: ${runningUsers.size} 个`
    );

    return Array.from(runningUsers);
  }

  /**
   * 结算单条下注
   * @private
   */
  async _settleBet(bet, openResult) {
    const { id, bot_user_id, period, direction, bet_amount, mode } = bet;

    // 1. 判定胜负
    const result = checkWin(
      direction,
      period,
      openResult.open_text,
      bet_amount,
      mode
    );

    // 2. 事务化更新
    transaction(() => {
      // 更新下注记录状态
      betRecordDao.settle(id, {
        isWin: result.isWin,
        isRebate: result.isRebate,
        profitLoss: result.profitLoss,
      });

      // 插入盈亏记录（UNIQUE bet_record_id 幂等）
      profitLogDao.insert({
        bot_user_id,
        bet_record_id: id,
        period,
        bet_amount,
        profit_loss: result.profitLoss,
        is_win: result.isWin,
        is_rebate: result.isRebate,
      });

      // 【🔥 核心修改】更新连挂计数和当前方向（适配新玩法状态机）
      const strategy = strategyConfigDao.getById(bot_user_id);
      if (strategy) {
        // 尝试使用新玩法的状态机计算（顺2反龙 / 反2顺龙）
        const nextState = calcNextState(
          strategy.play_type,
          result.isWin,
          result.isRebate,
          strategy.consecutive_losses,
          strategy.current_direction
        );

        if (nextState) {
          // 新玩法：直接写入计算好的 newLosses 和 newMode (FOLLOW/REVERSE)
          strategyConfigDao.updateLossesAndDirection(
            bot_user_id,
            nextState.newLosses,
            nextState.newMode 
          );
        } else {
          // 传统玩法（顺龙/反龙）：保持原有逻辑
          let newLosses = strategy.consecutive_losses;
          if (result.newLosses === '+1') {
            newLosses = strategy.consecutive_losses + 1;
          } else if (result.newLosses === 0) {
            newLosses = 0;
          }
          // 'UNCHANGED' (回本) → 保持不变
          
          strategyConfigDao.updateLossesAndDirection(
            bot_user_id,
            newLosses,
            result.direction // 传统玩法存入实际开奖方向
          );
        }
      }

      // 记录操作日志
      const resultText = result.isRebate
        ? '回本'
        : result.isWin
          ? `赢 +${result.profitLoss}`
          : `输 ${result.profitLoss}`;

      operationLogDao.insert({
        bot_user_id,
        action: 'BET_SETTLED',
        detail: `期号=${period}, ${resultText}`,
      });
    });

    logger.info(
      `[SETTLEMENT] 用户 ${bot_user_id} 期号 ${period} 结算: ` +
      `方向=${direction}, 金额=${bet_amount}, ` +
      `结果=${result.isRebate ? '回本' : result.isWin ? '赢' : '输'}, ` +
      `盈亏=${result.profitLoss}`
    );

    // 推送面板更新
    if (this.panelRenderer) {
      try {
        const accountDao = require('../db/account.dao');
        const account = accountDao.getActive(bot_user_id);
        const strategy = strategyConfigDao.getById(bot_user_id);
        await this.panelRenderer.pushUpdate(bot_user_id, 'dashboard', {
          user: { id: bot_user_id },
          account,
          strategy,
        });
      } catch (err) {
        logger.warn(`[SETTLEMENT] 推送面板更新失败: ${err.message}`);
      }
    }
  }
}

module.exports = SettlementService;