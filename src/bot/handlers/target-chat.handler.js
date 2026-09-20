// src/bot/handlers/target-chat.handler.js
const accountDao = require('../../db/account.dao');
const logger = require('../../utils/logger');

/**
 * 下注群配置回调处理
 *
 * 支持回调：
 *   target_chat:config
 *   target_chat:list
 *   target_chat:input
 *   target_chat:set:{chatId}
 *   target_chat:refresh_list
 */
class TargetChatHandler {
  /**
   * @param {import('telegraf').Context} ctx
   * @param {string} action
   * @param {string[]} params
   * @param {{ panelRenderer: object, services: object }} deps
   */
  static async handle(ctx, action, params, { panelRenderer, services }) {
    const botUserId = String(ctx.from.id);

    switch (action) {
      case 'config':
        await this.handleConfig(ctx, botUserId, { panelRenderer });
        break;

      case 'list':
        await this.handleList(ctx, botUserId, { panelRenderer, services });
        break;

      case 'input':
        await this.handleInput(ctx, botUserId, { panelRenderer });
        break;

      case 'set':
        await this.handleSet(ctx, botUserId, params[0], { panelRenderer, services });
        break;

      case 'refresh_list':
        await this.handleRefreshList(ctx, botUserId, { panelRenderer, services });
        break;

      default:
        logger.warn(`[TARGET_CHAT] 未知操作: ${action}`);
        await ctx.answerCbQuery('未知操作');
    }
  }

  /**
   * 下注群配置入口面板
   */
  static async handleConfig(ctx, botUserId, { panelRenderer }) {
    const account = await accountDao.getActive(botUserId);
    if (!account) {
      await ctx.answerCbQuery('请先登录账号');
      return;
    }

    await panelRenderer.render(ctx, 'target_chat_config', { account });
    logger.info(`[TARGET_CHAT] 用户 ${botUserId} 进入下注群配置`);
  }

  /**
   * 从列表选择下注群
   */
  static async handleList(ctx, botUserId, { panelRenderer, services }) {
    const account = await accountDao.getActive(botUserId);
    if (!account) {
      await ctx.answerCbQuery('请先登录账号');
      return;
    }

    try {
      // 通过 session.manager 获取该用户 TG Client 的群列表
      const client = services.session.getClient(botUserId);
      if (!client) {
        await ctx.answerCbQuery('账号未连接，请重新登录', { show_alert: true });
        return;
      }

      // 获取用户已加入的群组列表
      const dialogs = await client.getDialogs({ limit: 100 });
      const groups = dialogs
        .filter((d) => d.isGroup || d.isChannel)
        .map((d) => ({
          id: String(d.id),
          title: d.title || '未命名群组',
        }));

      await panelRenderer.render(ctx, 'target_chat_list', { groups, account });
    } catch (error) {
      logger.error(`[TARGET_CHAT] 获取群列表失败: ${error.message}`, error);
      await ctx.answerCbQuery('获取群列表失败', { show_alert: true });
    }
  }

  /**
   * 手动输入群 ID（触发 WizardScene）
   */
  static async handleInput(ctx, botUserId, { panelRenderer }) {
    logger.info(`[TARGET_CHAT] 用户 ${botUserId} 触发手动输入群 ID`);
    return ctx.scene.enter('target_chat');
  }

  /**
   * 设置下注群
   *
   * @param {string} chatId - 目标群 ID
   */
  static async handleSet(ctx, botUserId, chatId, { panelRenderer, services }) {
    if (!chatId) {
      await ctx.answerCbQuery('参数缺失');
      return;
    }

    try {
      const account = await accountDao.getActive(botUserId);
      if (!account) {
        await ctx.answerCbQuery('请先登录账号');
        return;
      }

      // 尝试获取群标题
      let chatTitle = '未知群组';
      try {
        const client = services.session.getClient(botUserId);
        if (client) {
          const chat = await client.getChat(chatId);
          chatTitle = chat.title || chatId;
        }
      } catch (_) {
        // 无法获取标题时使用 ID
        chatTitle = chatId;
      }

      // 调用 service 更新下注群
      await services.account.updateTargetChat(botUserId, chatId, chatTitle);

      logger.info(`[TARGET_CHAT] 用户 ${botUserId} 设置下注群: ${chatId} (${chatTitle})`);

      // 显示配置成功面板
      await panelRenderer.render(ctx, 'target_chat_success', {
        chatId,
        chatTitle,
      });
    } catch (error) {
      logger.error(`[TARGET_CHAT] 设置下注群失败: ${error.message}`, error);
      await ctx.answerCbQuery(`设置失败：${error.message}`, { show_alert: true });
    }
  }

  /**
   * 刷新群列表
   */
  static async handleRefreshList(ctx, botUserId, { panelRenderer, services }) {
    // 复用 list 逻辑
    await this.handleList(ctx, botUserId, { panelRenderer, services });
  }
}

module.exports = TargetChatHandler;