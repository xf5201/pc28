// src/bot/panels/confirm.panel.js
const { Markup } = require('telegraf');

/**
 * 确认对话框面板（ConfirmPanel）
 *
 * 文档参考：§7.7
 *
 * 通用确认面板，支持不同确认动作：
 *   - delete_account → 删除账号确认
 *
 * 通过 data.action 区分确认类型
 * 通过 data.confirmCallback / data.cancelCallback 自定义回调
 */
class ConfirmPanel {
  /**
   * @param {object} ctx
   * @param {{ action?: string, title?: string, message?: string, confirmCallback?: string, cancelCallback?: string }} data
   * @returns {{ text: string, keyboard: object }}
   */
  static async render(ctx, data) {
    const text = this.buildText(data);
    const keyboard = this.buildKeyboard(data);
    return { text, keyboard };
  }

  static buildText({ action, title, message }) {
    // 根据 action 生成默认文本
    if (!title && !message) {
      switch (action) {
        case 'delete_account':
          return this.buildDeleteAccountText();
        default:
          return this.buildGenericText();
      }
    }

    // 自定义文本
    let text = `⚠️ <b>${title || '确认操作'}</b>\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += `${message || '确定要执行此操作吗？'}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    return text;
  }

  /**
   * 7.7 删除账号确认
   */
  static buildDeleteAccountText() {
    let text = '⚠️ <b>删除执行账号</b>\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += '确定要删除执行账号吗？\n\n';
    text += '此操作会删除：\n';
    text += '• TG Session\n';
    text += '• 下注记录\n';
    text += '• 盈亏记录\n';
    text += '• 策略配置\n';
    text += '• 操作日志\n\n';
    text += '⛔ 此操作不可恢复！\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    return text;
  }

  /**
   * 通用确认文本
   */
  static buildGenericText() {
    let text = '⚠️ <b>确认操作</b>\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += '确定要执行此操作吗？\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    return text;
  }

  static buildKeyboard({ action, confirmCallback, cancelCallback }) {
    // 支持自定义回调
    const confirm = confirmCallback || this.getDefaultConfirmCallback(action);
    const cancel = cancelCallback || this.getDefaultCancelCallback(action);

    const buttons = [
      [
        Markup.button.callback('✅ 确认', confirm),
        Markup.button.callback('❌ 取消', cancel),
      ],
    ];

    return Markup.inlineKeyboard(buttons);
  }

  static getDefaultConfirmCallback(action) {
    switch (action) {
      case 'delete_account':
        return 'account:delete';
      default:
        return 'dashboard:refresh';
    }
  }

  static getDefaultCancelCallback(action) {
    switch (action) {
      case 'delete_account':
        return 'account:cancel_delete';
      default:
        return 'dashboard:refresh';
    }
  }
}

module.exports = ConfirmPanel;