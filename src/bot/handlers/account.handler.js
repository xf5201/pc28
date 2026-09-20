// src/bot/handlers/account.handler.js
const accountDao = require('../../db/account.dao');
const strategyConfigDao = require('../../db/strategy-config.dao');
const panelContextDao = require('../../db/panel-context.dao');
const logger = require('../../utils/logger');

/**
账号管理回调处理

支持回调：
account:login
account:delete_confirm
account:delete
account:cancel_delete
*/
class AccountHandler {
  /**
  @param {import('telegraf').Context} ctx
  @param {string} action
  @param {string[]} params
  @param {{ panelRenderer: object, services: object }} deps
  */
  static async handle(ctx, action, params, { panelRenderer, services }) {
    const botUserId = String(ctx.from.id);

    switch (action) {
      case 'login':
        await this.handleLogin(ctx, botUserId, { panelRenderer });
        break;

      case 'delete_confirm':
        await this.handleDeleteConfirm(ctx, botUserId, { panelRenderer });
        break;

      case 'delete':
        await this.handleDelete(ctx, botUserId, { panelRenderer, services });
        break;

      case 'cancel_delete':
        await this.handleCancelDelete(ctx, botUserId, { panelRenderer });
        break;

      default:
        logger.warn(`[ACCOUNT] 未知操作: ${action}`);
        await ctx.answerCbQuery('未知操作');
    }
  }

  /**
  进入登录流程

  旧逻辑：
  ctx.scene.enter('login')

  新逻辑：
  1. 渲染 login 面板
  2. 写入 panel_context.wizard_state
  3. 后续用户发送手机号 / 验证码 / 2FA 由 login-text.handler.js 处理
  */
  static async handleLogin(ctx, botUserId, { panelRenderer }) {
    logger.info(`[ACCOUNT] 用户 ${botUserId} 开始登录流程`);

    const account = await accountDao.getActive(botUserId);

    if (account) {
      logger.info(`[ACCOUNT] 用户 ${botUserId} 已有执行账号，跳过登录`);
      return;
    }

    // 先渲染登录面板
    await panelRenderer.render(ctx, 'login', {
      step: 'phone',
    });

    // 再写入登录状态
    const loginState = {
      scene: 'login',
      step: 'phone',
      phone: null,
    };

    panelContextDao.updateWizardState(
      botUserId,
      JSON.stringify(loginState)
    );
  }

  /**
  显示删除确认面板
  */
  static async handleDeleteConfirm(ctx, botUserId, { panelRenderer }) {
    const account = await accountDao.getActive(botUserId);

    if (!account) {
      await ctx.answerCbQuery('当前没有已登录的账号');
      return;
    }

    await panelRenderer.render(ctx, 'confirm', {
      action: 'delete_account',
      title: '⚠️ 删除执行账号',
      message:
        '确定要删除执行账号吗？\n\n' +
        '此操作会删除：\n' +
        '• TG Session\n' +
        '• 下注记录\n' +
        '• 盈亏记录\n' +
        '• 策略配置\n' +
        '• 操作日志\n\n' +
        '此操作不可恢复！',
      confirmCallback: 'account:delete',
      cancelCallback: 'account:cancel_delete',
    });

    logger.info(`[ACCOUNT] 用户 ${botUserId} 进入删除确认`);
  }

  /**
  确认删除账号
  */
  static async handleDelete(ctx, botUserId, { panelRenderer, services }) {
    const account = await accountDao.getActive(botUserId);

    if (!account) {
      await ctx.answerCbQuery('当前没有已登录的账号');
      return;
    }

    try {
      // 调用 account.service 执行事务化删除
      await services.account.deleteAccount(botUserId);

      // 销毁 TG Client
      if (services.session) {
        await services.session.destroyClient(botUserId);
      }

      logger.info(`[ACCOUNT] 用户 ${botUserId} 账号已删除`);

      // 返回主面板（未登录状态）
      await panelRenderer.render(ctx, 'dashboard', {
        user: {
          id: botUserId,
          username: ctx.from.username,
          first_name: ctx.from.first_name,
        },
        account: null,
        strategy: null,
      });
    } catch (error) {
      logger.error(`[ACCOUNT] 用户 ${botUserId} 删除失败: ${error.message}`, error);
      await ctx.answerCbQuery(`删除失败：${error.message}`, { show_alert: true });
    }
  }

  /**
  取消删除，返回主面板
  */
  static async handleCancelDelete(ctx, botUserId, { panelRenderer }) {
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

    logger.info(`[ACCOUNT] 用户 ${botUserId} 取消删除`);
  }
}

module.exports = AccountHandler;