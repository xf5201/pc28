// src/bot/handlers/report.handler.js
const logger = require('../../utils/logger');
const { formatDate, getBeijingNow, getBeijingNowString } = require('../../utils/format.util');
const profitLogDao = require('../../db/profit-log.dao');

/**
 * 盈亏报表回调处理
 *
 * 支持回调：
 *   report:main
 *   report:daily:{date}
 *   report:weekly
 *   report:monthly
 *   report:detail:{page}
 *   report:prev_day
 *   report:next_day
 *   report:clear_today
 */
class ReportHandler {
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
        await this.handleMain(ctx, botUserId, { panelRenderer, services });
        break;

      case 'daily':
        await this.handleDaily(ctx, botUserId, params[0], { panelRenderer, services });
        break;

      case 'weekly':
        await this.handleWeekly(ctx, botUserId, { panelRenderer, services });
        break;

      case 'monthly':
        await this.handleMonthly(ctx, botUserId, { panelRenderer, services });
        break;

      case 'detail':
        await this.handleDetail(ctx, botUserId, parseInt(params[0], 10) || 1, { panelRenderer, services });
        break;

      case 'prev_day':
        await this.handlePrevDay(ctx, botUserId, params[0], { panelRenderer, services });
        break;

      case 'next_day':
        await this.handleNextDay(ctx, botUserId, params[0], { panelRenderer, services });
        break;

      case 'clear_today':
        await this.handleClearToday(ctx, botUserId, { panelRenderer, services });
        break;

      default:
        logger.warn(`[REPORT] 未知操作: ${action}`);
        await ctx.answerCbQuery('未知操作');
    }
  }

  /**
   * 报表主面板（默认显示今日日报）
   */
  static async handleMain(ctx, botUserId, { panelRenderer, services }) {
    const today = getBeijingNowString('YYYY-MM-DD');
    await this.handleDaily(ctx, botUserId, today, { panelRenderer, services });
  }

  /**
   * 日报
   * @param {string} date - 格式 YYYY-MM-DD
   */
  static async handleDaily(ctx, botUserId, date, { panelRenderer, services }) {
    if (!date) {
      date = getBeijingNowString('YYYY-MM-DD');
    }

    try {
      const data = await services.accounting.getDailyProfit(botUserId, date);

      await panelRenderer.render(ctx, 'report_daily', {
        date,
        totalProfit: data.totalProfit || 0,
        winCount: data.winCount || 0,
        loseCount: data.loseCount || 0,
        winRate: data.winRate || '0%',
      });

      logger.info(`[REPORT] 用户 ${botUserId} 查看日报: ${date}`);
    } catch (error) {
      logger.error(`[REPORT] 日报查询失败: ${error.message}`, error);
      await ctx.answerCbQuery('查询失败', { show_alert: true });
    }
  }

  /**
   * 周报
   */
  static async handleWeekly(ctx, botUserId, { panelRenderer, services }) {
    try {
      const now = getBeijingNow();
      const dayOfWeek = now.getDay() || 7; // 周日=7
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - dayOfWeek + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const startDate = formatDate(startOfWeek, 'YYYY-MM-DD');
      const endDate = formatDate(endOfWeek, 'YYYY-MM-DD');

      const data = await services.accounting.getPeriodProfit(botUserId, startDate, endDate);

      await panelRenderer.render(ctx, 'report_period', {
        title: '本周盈亏报表',
        startDate,
        endDate,
        totalProfit: data.totalProfit || 0,
        winCount: data.winCount || 0,
        loseCount: data.loseCount || 0,
        winRate: data.winRate || '0%',
      });
    } catch (error) {
      logger.error(`[REPORT] 周报查询失败: ${error.message}`, error);
      await ctx.answerCbQuery('查询失败', { show_alert: true });
    }
  }

  /**
   * 月报
   */
  static async handleMonthly(ctx, botUserId, { panelRenderer, services }) {
    try {
      const now = getBeijingNow();
      const startDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 1), 'YYYY-MM-DD');
      const endDate = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'YYYY-MM-DD');

      const data = await services.accounting.getPeriodProfit(botUserId, startDate, endDate);

      await panelRenderer.render(ctx, 'report_period', {
        title: '本月盈亏报表',
        startDate,
        endDate,
        totalProfit: data.totalProfit || 0,
        winCount: data.winCount || 0,
        loseCount: data.loseCount || 0,
        winRate: data.winRate || '0%',
      });
    } catch (error) {
      logger.error(`[REPORT] 月报查询失败: ${error.message}`, error);
      await ctx.answerCbQuery('查询失败', { show_alert: true });
    }
  }

  /**
   * 盈亏明细（分页）
   * @param {number} page - 页码
   */
  static async handleDetail(ctx, botUserId, page, { panelRenderer, services }) {
    const PAGE_SIZE = 10;

    try {
      const data = await services.accounting.getPeriodProfit(botUserId, null, null, {
        page,
        pageSize: PAGE_SIZE,
      });

      await panelRenderer.render(ctx, 'report_detail', {
        page,
        pageSize: PAGE_SIZE,
        records: data.records || [],
        totalPages: data.totalPages || 1,
        totalCount: data.totalCount || 0,
      });

      logger.info(`[REPORT] 用户 ${botUserId} 查看明细第 ${page} 页`);
    } catch (error) {
      logger.error(`[REPORT] 明细查询失败: ${error.message}`, error);
      await ctx.answerCbQuery('查询失败', { show_alert: true });
    }
  }

  /**
   * 前一天
   */
  static async handlePrevDay(ctx, botUserId, currentDate, { panelRenderer, services }) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    const prevDate = formatDate(date, 'YYYY-MM-DD');
    await this.handleDaily(ctx, botUserId, prevDate, { panelRenderer, services });
  }

  /**
   * 后一天
   */
  static async handleNextDay(ctx, botUserId, currentDate, { panelRenderer, services }) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    const nextDate = formatDate(date, 'YYYY-MM-DD');
    await this.handleDaily(ctx, botUserId, nextDate, { panelRenderer, services });
  }

  /**
   * 清除今日所有记录
   */
  static async handleClearToday(ctx, botUserId, { panelRenderer, services }) {
    try {
      const today = getBeijingNowString('YYYY-MM-DD');
      await profitLogDao.deleteByUserAndDate(botUserId, today);
      await ctx.answerCbQuery('✅ 今日记录已清除');
      // 刷新日报面板
      await this.handleDaily(ctx, botUserId, today, { panelRenderer, services });
    } catch (error) {
      logger.error(`[REPORT] 清除今日记录失败: ${error.message}`, error);
      await ctx.answerCbQuery('清除失败', { show_alert: true });
    }
  }
}

module.exports = ReportHandler;
