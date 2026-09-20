// src/bot/panels/report.panel.js
const { Markup } = require('telegraf');

/**
 * 盈亏报表面板（ReportPanel）
 *
 * 文档参考：§7.8
 *
 * 子面板（通过 data.subPanel 区分）：
 *   - daily  → 日报
 *   - period → 周报 / 月报
 *   - detail → 盈亏明细（分页）
 */
class ReportPanel {
  /**
   * @param {object} ctx
   * @param {object} data
   * @returns {{ text: string, keyboard: object }}
   */
  static async render(ctx, data) {
    const subPanel = data.subPanel || 'daily';

    switch (subPanel) {
      case 'period':
        return this.buildPeriod(data);
      case 'detail':
        return this.buildDetail(data);
      case 'daily':
      default:
        return this.buildDaily(data);
    }
  }

  // ── 7.8.1 日报 ──

  static buildDaily({ date, totalProfit, winCount, loseCount, winRate }) {
    let text = '📊 <b>今日盈亏报表</b>\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += `📅 日期：${date || '未知'}\n`;
    text += `💰 总盈亏：${this.formatProfit(totalProfit)}\n`;
    text += `✅ 胜利：${winCount || 0} 次\n`;
    text += `❌ 失败：${loseCount || 0} 次\n`;
    text += `📈 胜率：${winRate || '0%'}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';

    const buttons = [
      [
        Markup.button.callback('◀ 昨日', `report:prev_day:${date}`),
        Markup.button.callback('▶ 明日', `report:next_day:${date}`),
      ],
      [
        Markup.button.callback('📊 本周', 'report:weekly'),
        Markup.button.callback('📊 本月', 'report:monthly'),
      ],
      [Markup.button.callback('📄 查看明细', 'report:detail:1')],
      [Markup.button.callback('🗑 清除今日记录', 'report:clear_today')],  // ← 新增按钮
      [Markup.button.callback('🔙 返回主菜单', 'dashboard:refresh')],
    ];

    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  // ── 周报 / 月报 ──

  static buildPeriod({ title, startDate, endDate, totalProfit, winCount, loseCount, winRate }) {
    let text = `📊 <b>${title || '盈亏报表'}</b>\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += `📅 周期：${startDate || '?'} ~ ${endDate || '?'}\n`;
    text += `💰 总盈亏：${this.formatProfit(totalProfit)}\n`;
    text += `✅ 胜利：${winCount || 0} 次\n`;
    text += `❌ 失败：${loseCount || 0} 次\n`;
    text += `📈 胜率：${winRate || '0%'}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';

    const buttons = [
      [Markup.button.callback('📄 查看明细', 'report:detail:1')],
      [Markup.button.callback('🔙 返回主菜单', 'dashboard:refresh')],
    ];

    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  // ── 7.8.2 盈亏明细（分页） ──

  static buildDetail({ page, totalPages, records }) {
    let text = `📊 <b>盈亏明细（第 ${page || 1} 页）</b>\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';

    if (records && records.length > 0) {
      for (const record of records) {
        const icon = record.is_rebate ? '🔄' : record.is_win ? '✅' : '❌';
        const profitStr = this.formatProfit(record.profit_loss);
        const rebateNote = record.is_rebate ? ' (回本)' : '';
        text += `第 ${record.period} 期：${profitStr} ${icon}${rebateNote}\n`;
      }
    } else {
      text += '暂无记录\n';
    }

    text += '━━━━━━━━━━━━━━━━━━━━\n';

    const buttons = [];

    if (page > 1) {
      buttons.push([Markup.button.callback('◀ 上一页', `report:detail:${page - 1}`)]);
    }
    if (page < (totalPages || 1)) {
      buttons.push([Markup.button.callback('▶ 下一页', `report:detail:${page + 1}`)]);
    }

    buttons.push([Markup.button.callback('🔙 返回', 'report:main')]);

    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  /**
   * 格式化盈亏金额
   */
  static formatProfit(amount) {
    if (amount === null || amount === undefined) return '0';
    const num = Number(amount);
    if (num > 0) return `+${num.toLocaleString()}`;
    if (num < 0) return num.toLocaleString();
    return '0';
  }
}

module.exports = ReportPanel;
