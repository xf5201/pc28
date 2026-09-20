// src/bot/handlers/dashboard.handler.js
const accountDao = require('../../db/account.dao');
const strategyConfigDao = require('../../db/strategy-config.dao');
const logger = require('../../utils/logger');

/**
 * Dashboard 面板回调处理
 *
 * 支持回调：
 *   dashboard:refresh
 */
class DashboardHandler {
  /**
   * @param {import('telegraf').Context} ctx
   * @param {string} action
   * @param {string[]} params
   * @param {{ panelRenderer: object, services: object }} deps
   */
  static async handle(ctx, action, params, { panelRenderer, services }) {
    const botUserId = String(ctx.from.id);

    switch (action) {
      case 'refresh':
        await this.handleRefresh(ctx, botUserId, { panelRenderer });
        break;

      default:
        logger.warn(`[DASHBOARD] 未知操作: ${action}`);
        await ctx.answerCbQuery('未知操作');
    }
  }

  /**
   * 刷新主面板
   */
  static async handleRefresh(ctx, botUserId, { panelRenderer }) {
    const account = await accountDao.getActive(botUserId);
    const strategy = await strategyConfigDao.getById(botUserId);

    await panelRenderer.render(ctx, 'dashboard', {
      user: {
        id: botUserId,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
      },
      account,
      strategy,
    });

    logger.info(`[DASHBOARD] 用户 ${botUserId} 刷新主面板`);
  }
}

module.exports = DashboardHandler;