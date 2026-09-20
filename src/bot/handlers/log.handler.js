// src/bot/handlers/log.handler.js
const operationLogDao = require('../../db/operation-log.dao');
const logger = require('../../utils/logger');

/**
 * 操作日志回调处理
 *
 * 支持回调：
 *   log:main
 *   log:list:{page}
 *   log:prev
 *   log:next
 */
class LogHandler {
  static PAGE_SIZE = 10;

  /**
   * @param {import('telegraf').Context} ctx
   * @param {string} action
   * @param {string[]} params
   * @param {{ panelRenderer: object, services: object }} deps
   */
  static async handle(ctx, action, params, { panelRenderer, services }) {
    const botUserId = String(ctx.from.id);

    switch (action) {
      case 'main':
        await this.handleMain(ctx, botUserId, { panelRenderer });
        break;

      case 'list':
        await this.handleList(ctx, botUserId, parseInt(params[0], 10) || 1, { panelRenderer });
        break;

      case 'prev': {
        const currentPage = parseInt(params[0], 10) || 1;
        await this.handleList(ctx, botUserId, Math.max(1, currentPage - 1), { panelRenderer });
        break;
      }

      case 'next': {
        const currentPage = parseInt(params[0], 10) || 1;
        await this.handleList(ctx, botUserId, currentPage + 1, { panelRenderer });
        break;
      }

      default:
        logger.warn(`[LOG] 未知操作: ${action}`);
        await ctx.answerCbQuery('未知操作');
    }
  }

  /**
   * 日志主面板（默认第 1 页）
   */
  static async handleMain(ctx, botUserId, { panelRenderer }) {
    await this.handleList(ctx, botUserId, 1, { panelRenderer });
  }

  /**
   * 分页展示操作日志
   * @param {number} page - 页码（从 1 开始）
   */
  static async handleList(ctx, botUserId, page, { panelRenderer }) {
    try {
      const offset = (page - 1) * this.PAGE_SIZE;

      // 查询日志列表
      const logs = await operationLogDao.listByUser(botUserId, {
        limit: this.PAGE_SIZE,
        offset,
      });

      // 查询总数以计算总页数
      const totalCount = await operationLogDao.countByUser(botUserId);
      const totalPages = Math.max(1, Math.ceil(totalCount / this.PAGE_SIZE));

      // 格式化日志条目
      const formattedLogs = logs.map((log) => ({
        time: this.formatTime(log.created_at),
        icon: this.actionIcon(log.action),
        text: this.actionText(log.action, log.detail),
      }));

      await panelRenderer.render(ctx, 'log_list', {
        page,
        totalPages,
        totalCount,
        logs: formattedLogs,
      });

      logger.info(`[LOG] 用户 ${botUserId} 查看操作日志第 ${page} 页`);
    } catch (error) {
      logger.error(`[LOG] 日志查询失败: ${error.message}`, error);
      await ctx.answerCbQuery('查询失败', { show_alert: true });
    }
  }

  /**
   * 操作类型 → 图标映射
   */
  static actionIcon(action) {
    const icons = {
      LOGIN: '✅',
      LOGOUT: '🚪',
      DELETE_ACCOUNT: '🗑️',
      START_STRATEGY: '🚀',
      STOP_STRATEGY: '🛑',
      UPDATE_CONFIG: '⚙️',
      UPDATE_TARGET_CHAT: '🎯',
      BET_CREATED: '📝',
      BET_SENT: '📤',
      BET_FAILED: '❌',
      BET_SETTLED: '💰',
      SESSION_ERROR: '⚠️',
      CRAWLER_ERROR: '🕷️',
      SETTLEMENT_ERROR: '💥',
      RECOVERY: '🔄',
      ERROR: '🔴',
    };
    return icons[action] || '📋';
  }

  /**
   * 操作类型 → 可读文本
   */
  static actionText(action, detail) {
    const texts = {
      LOGIN: '登录成功',
      LOGOUT: '退出登录',
      DELETE_ACCOUNT: '删除账号',
      START_STRATEGY: '启动策略',
      STOP_STRATEGY: '停止策略',
      UPDATE_CONFIG: '修改配置',
      UPDATE_TARGET_CHAT: '配置下注群',
      BET_CREATED: '创建下注',
      BET_SENT: '发送下注',
      BET_FAILED: '下注失败',
      BET_SETTLED: '结算完成',
      SESSION_ERROR: 'Session 异常',
      CRAWLER_ERROR: '爬虫异常',
      SETTLEMENT_ERROR: '结算异常',
      RECOVERY: '系统恢复',
      ERROR: '系统错误',
    };

    let text = texts[action] || action;
    if (detail) {
      text += `：${detail}`;
    }
    return text;
  }

  /**
   * 格式化时间（仅显示 HH:MM）
   */
  static formatTime(dateStr) {
    if (!dateStr) return '--:--';
    try {
      const d = new Date(dateStr);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch (_) {
      return '--:--';
    }
  }
}

module.exports = LogHandler;