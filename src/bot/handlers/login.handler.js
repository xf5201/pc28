// src/bot/handlers/login.handler.js
const accountDao = require('../../db/account.dao');
const strategyConfigDao = require('../../db/strategy-config.dao');
const panelContextDao = require('../../db/panel-context.dao');
const logger = require('../../utils/logger');

/**
登录面板按钮处理

支持回调：
login:cancel
login:back_dashboard
*/
class LoginHandler {
  /**
  @param {import('telegraf').Context} ctx
  @param {string} action
  @param {string[]} params
  @param {{ panelRenderer: object, services: object }} deps
  */
  static async handle(ctx, action, params, { panelRenderer, services }) {
    const botUserId = String(ctx.from.id);

    switch (action) {
      case 'cancel':
        await this.handleCancel(ctx, botUserId, { panelRenderer, services });
        break;

      case 'back_dashboard':
        await this.handleBackDashboard(ctx, botUserId, { panelRenderer });
        break;

      default:
        logger.warn(`[LOGIN] 未知操作: ${action}`);
    }
  }

  /**
  取消登录
  */
  static async handleCancel(ctx, botUserId, { panelRenderer, services }) {
    logger.info(`[LOGIN] 用户 ${botUserId} 取消登录`);

    // 如果后续 account.service 提供 cancelLogin，可以在这里调用
    if (services?.account?.cancelLogin) {
      try {
        await services.account.cancelLogin(botUserId);
      } catch (error) {
        logger.warn(`[LOGIN] cancelLogin 失败: ${error.message}`);
      }
    }

    await panelContextDao.clearWizardState(botUserId);

    await this.renderDashboard(ctx, botUserId, panelRenderer);
  }

  /**
  返回主菜单
  */
  static async handleBackDashboard(ctx, botUserId, { panelRenderer }) {
    logger.info(`[LOGIN] 用户 ${botUserId} 从登录面板返回主菜单`);

    await panelContextDao.clearWizardState(botUserId);

    await this.renderDashboard(ctx, botUserId, panelRenderer);
  }

  /**
  渲染主面板
  */
  static async renderDashboard(ctx, botUserId, panelRenderer) {
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
  }
}

module.exports = LoginHandler;