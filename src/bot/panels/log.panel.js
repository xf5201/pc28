// src/bot/panels/log.panel.js
const { Markup } = require('telegraf');
const ledger = require('../../utils/ledger.util');

/**
 * 操作日志面板（LogPanel）
 *
 * 文档参考：§7.9
 *
 * 显示格式：
 *   HH:MM 🚀 启动策略
 *   HH:MM ⚙️ 修改配置：倍投 2.0x
 */
class LogPanel {
  /**
   * @param {object} ctx
   * @param {{ page?: number, totalPages?: number, logs?: Array }} data
   * @returns {{ text: string, keyboard: object }}
   */
  static async render(ctx, data) {
    const text = this.buildText(data);
    const keyboard = this.buildKeyboard(data);
    return { text, keyboard };
  }

  static buildText({ page, logs }) {
    let text = `📝 <b>操作日志</b>\n\n`;

    if (logs && logs.length > 0) {
      const rows = logs.map((log) => ({ label: log.time, value: `${log.icon} ${log.text}` }));
      text += ledger.box(`第 ${page || 1} 页`, rows);
    } else {
      text += ledger.box(`第 ${page || 1} 页`, [{ text: '暂无操作记录' }]);
    }

    return text;
  }

  static buildKeyboard({ page, totalPages }) {
    const buttons = [];
    const currentPage = page || 1;
    const total = totalPages || 1;

    if (currentPage > 1) {
      buttons.push([Markup.button.callback('◀ 上一页', `log:prev:${currentPage}`)]);
    }
    if (currentPage < total) {
      buttons.push([Markup.button.callback('▶ 下一页', `log:next:${currentPage}`)]);
    }

    buttons.push([Markup.button.callback('🔙 返回主菜单', 'dashboard:refresh')]);

    return Markup.inlineKeyboard(buttons);
  }
}

module.exports = LogPanel;