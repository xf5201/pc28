// src/bot/handlers/strategy.handler.js
const accountDao = require('../../db/account.dao');
const strategyConfigDao = require('../../db/strategy-config.dao');
const logger = require('../../utils/logger');

/**
 * 策略启停回调处理
 *
 * 支持回调：
 *   strategy:start
 *   strategy:stop
 *
 * 核心规则：
 *   - 启动要求 account.status = ACTIVE
 *   - 停止 ≠ 删除：不销毁 Session，不删除 PENDING 下注
 *   - 事务化操作
 */
class StrategyHandler {
  /**
   * @param {import('telegraf').Context} ctx
   * @param {string} action
   * @param {string[]} params
   * @param {{ panelRenderer: object, services: object }} deps
   */
  static async handle(ctx, action, params, { panelRenderer, services }) {
    const botUserId = String(ctx.from.id);

    switch (action) {
      case 'start':
        await this.handleStart(ctx, botUserId, { panelRenderer, services });
        break;

      case 'stop':
        await this.handleStop(ctx, botUserId, { panelRenderer, services });
        break;

      default:
        logger.warn(`[STRATEGY] 未知操作: ${action}`);
        await ctx.answerCbQuery('未知操作');
    }
  }

  /**
   * 启动策略
   *
   * 调用链：
   *   strategy-executor.startStrategy(botUserId)
   *   → BEGIN IMMEDIATE 事务
   *     ├─ SELECT accounts WHERE bot_user_id = ? → 校验 status = ACTIVE
   *     ├─ SELECT strategy_config WHERE bot_user_id = ? → 校验 target_chat_id 非空
   *     ├─ UPDATE strategy_config SET is_running = 1
   *     ├─ INSERT operation_logs (START_STRATEGY)
   *     └─ COMMIT
   *   → panelRenderer.pushUpdate(botUserId, 'dashboard', ...)
   */
  static async handleStart(ctx, botUserId, { panelRenderer, services }) {
    try {
      // 前置校验：账号必须存在且状态为 ACTIVE
      const account = await accountDao.getActive(botUserId);
      if (!account) {
        await ctx.answerCbQuery('❌ 请先登录执行账号', { show_alert: true });
        return;
      }
      if (account.status !== 'ACTIVE') {
        await ctx.answerCbQuery('❌ 账号状态异常，请先完成配置', { show_alert: true });
        return;
      }
      if (!account.target_chat_id) {
        await ctx.answerCbQuery('❌ 请先配置下注群', { show_alert: true });
        return;
      }

      // 校验策略配置是否存在
      const strategy = await strategyConfigDao.getById(botUserId);
      if (!strategy) {
        await ctx.answerCbQuery('❌ 请先配置策略', { show_alert: true });
        return;
      }
      if (strategy.is_running === 1) {
        await ctx.answerCbQuery('策略已在运行中');
        return;
      }

      // 调用 strategy-executor 事务化启动
      await services.strategyExecutor.startStrategy(botUserId);

      logger.info(`[STRATEGY] 用户 ${botUserId} 策略已启动`);

      // 刷新面板
      await panelRenderer.render(ctx, 'dashboard', {
        user: {
          id: botUserId,
          username: ctx.from.username,
          first_name: ctx.from.first_name,
        },
        account: await accountDao.getActive(botUserId),
        strategy: await strategyConfigDao.getById(botUserId),
      });
    } catch (error) {
      logger.error(`[STRATEGY] 用户 ${botUserId} 启动失败: ${error.message}`, error);
      await ctx.answerCbQuery(`启动失败：${error.message}`, { show_alert: true });
    }
  }

  /**
   * 停止策略
   *
   * 调用链：
   *   strategy-executor.stopStrategy(botUserId)
   *   → BEGIN IMMEDIATE 事务
   *     ├─ UPDATE strategy_config SET is_running = 0
   *     ├─ INSERT operation_logs (STOP_STRATEGY)
   *     └─ COMMIT
   *   → 不销毁 Client / 不删除 Session / 不删除 PENDING 下注
   *   → panelRenderer.pushUpdate(botUserId, 'dashboard', ...)
   */
  static async handleStop(ctx, botUserId, { panelRenderer, services }) {
    try {
      const strategy = await strategyConfigDao.getById(botUserId);
      if (!strategy) {
        await ctx.answerCbQuery('当前没有策略配置');
        return;
      }
      if (strategy.is_running === 0) {
        await ctx.answerCbQuery('策略已处于停止状态');
        return;
      }

      // 调用 strategy-executor 事务化停止
      await services.strategyExecutor.stopStrategy(botUserId);

      logger.info(`[STRATEGY] 用户 ${botUserId} 策略已停止`);

      // 刷新面板
      await panelRenderer.render(ctx, 'dashboard', {
        user: {
          id: botUserId,
          username: ctx.from.username,
          first_name: ctx.from.first_name,
        },
        account: await accountDao.getActive(botUserId),
        strategy: await strategyConfigDao.getById(botUserId),
      });
    } catch (error) {
      logger.error(`[STRATEGY] 用户 ${botUserId} 停止失败: ${error.message}`, error);
      await ctx.answerCbQuery(`停止失败：${error.message}`, { show_alert: true });
    }
  }
}

module.exports = StrategyHandler;