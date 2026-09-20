// src/services/notification.service.js
const accountDao = require('../db/account.dao');
const strategyConfigDao = require('../db/strategy-config.dao');
const logger = require('../utils/logger');

/**
 * 用户通知服务
 *
 * 文档参考：§9.11, §7.12
 *
 * 职责：
 *   - 推送面板更新（策略状态变化、下注、结算后）
 *   - 发送事件通知（异常、重要事件）
 *
 * 接口：
 *   pushToUser(botUserId)
 *   notifyEvent(botUserId, event, detail)
 */
class NotificationService {
  /**
   * @param {object} deps
   * @param {import('telegraf').Telegraf} deps.bot - Telegraf 实例
   * @param {object} deps.panelRenderer - PanelRenderer 实例
   */
  constructor(deps) {
    this.bot = deps.bot;
    this.panelRenderer = deps.panelRenderer;
  }

  /**
   * 推送主面板更新（§7.12.1）
   *
   * 仅当用户当前正在查看 dashboard 面板时才更新
   *
   * @param {string} botUserId
   */
  async pushToUser(botUserId) {
    try {
      const account = accountDao.getActive(botUserId);
      const strategy = strategyConfigDao.getById(botUserId);

      await this.panelRenderer.pushUpdate(botUserId, 'dashboard', {
        user: { id: botUserId },
        account,
        strategy,
      });
    } catch (error) {
      logger.warn(`[NOTIFICATION] 推送面板更新失败: 用户=${botUserId}, ${error.message}`);
    }
  }

  /**
   * 发送事件通知（§7.12.1）
   *
   * 通过 Bot API 发送独立消息（非 editMessageText）
   * 用于重要事件通知（如 Session 失效、策略自动停止等）
   *
   * @param {string} botUserId
   * @param {string} event - 事件类型
   * @param {string} detail - 事件详情
   */
  async notifyEvent(botUserId, event, detail) {
    try {
      const icons = {
        SESSION_ERROR: '⚠️',
        STRATEGY_STOPPED: '🛑',
        BET_FAILED: '❌',
        RECOVERY: '🔄',
        ERROR: '🔴',
        INFO: 'ℹ️',
      };

      const icon = icons[event] || '📢';
      const message = `${icon} <b>${event}</b>\n${detail || ''}`;

      await this.bot.telegram.sendMessage(botUserId, message, {
        parse_mode: 'HTML',
      });

      logger.info(`[NOTIFICATION] 用户 ${botUserId} 事件通知: ${event}`);
    } catch (error) {
      // 通知失败不抛异常
      logger.warn(`[NOTIFICATION] 发送通知失败: 用户=${botUserId}, ${error.message}`);
    }
  }

  /**
   * 批量推送面板更新
   *
   * @param {string[]} botUserIds
   */
  async pushToUsers(botUserIds) {
    for (const botUserId of botUserIds) {
      await this.pushToUser(botUserId);
    }
  }
}

module.exports = NotificationService;