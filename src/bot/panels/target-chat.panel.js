// src/bot/panels/target-chat.panel.js
const { Markup } = require('telegraf');

/**
 * 下注群配置面板（TargetChatPanel）
 *
 * 文档参考：§7.6
 *
 * 子面板（通过 data.subPanel 区分）：
 *   - config  → 选择配置方式
 *   - list    → 从列表选择
 *   - success → 配置成功
 */
class TargetChatPanel {
  /**
   * @param {object} ctx
   * @param {{ account?: object, groups?: Array, subPanel?: string, chatId?: string, chatTitle?: string }} data
   * @returns {{ text: string, keyboard: object }}
   */
  static async render(ctx, data) {
    const subPanel = data.subPanel || 'config';

    switch (subPanel) {
      case 'list':
        return this.buildList(data);
      case 'success':
        return this.buildSuccess(data);
      case 'config':
      default:
        return this.buildConfig(data);
    }
  }

  // ── 7.6.1 选择方式 ──

  static buildConfig({ account }) {
    let text = '🎯 <b>下注群配置</b>\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';

    if (account && account.target_chat_title) {
      text += `当前下注群：${account.target_chat_title}\n`;
      text += '━━━━━━━━━━━━━━━━━━━━\n';
    }

    text += '请选择配置方式\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';

    const buttons = [
      [Markup.button.callback('📋 从列表选择', 'target_chat:list')],
      [Markup.button.callback('🔗 输入群 ID', 'target_chat:input')],
      [Markup.button.callback('🔙 返回', 'dashboard:refresh')],
    ];

    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  // ── 7.6.2 从列表选择 ──

  static buildList({ groups }) {
    let text = '📋 <b>选择下注群</b>\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';

    const buttons = [];

    if (groups && groups.length > 0) {
      for (const group of groups) {
        buttons.push([
          Markup.button.callback(
            group.title,
            `target_chat:set:${group.id}`
          ),
        ]);
      }
    } else {
      text += '暂无可用群组\n';
    }

    text += '━━━━━━━━━━━━━━━━━━━━\n';

    buttons.push(
      [Markup.button.callback('🔄 刷新列表', 'target_chat:refresh_list')],
      [Markup.button.callback('🔙 返回', 'target_chat:config')]
    );

    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  // ── 7.6.3 配置成功 ──

  static buildSuccess({ chatId, chatTitle }) {
    let text = '✅ <b>下注群配置成功</b>\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += `群名称：${chatTitle || '未知'}\n`;
    text += `群 ID：${chatId || '未知'}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';

    const buttons = [
      [Markup.button.callback('🏠 返回主菜单', 'dashboard:refresh')],
    ];

    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }
}

module.exports = TargetChatPanel;