// src/bot/panels/account.panel.js
const { Markup } = require('telegraf');
const { maskPhone } = require('../../utils/mask.util');
const ledger = require('../../utils/ledger.util');

/**
 * 账号状态面板（AccountPanel）
 *
 * 显示当前账号详细信息及操作入口
 */
class AccountPanel {
  /**
   * @param {object} ctx
   * @param {{ account: object|null, strategy: object|null }} data
   * @returns {{ text: string, keyboard: object }}
   */
  static async render(ctx, data) {
    const text = this.buildText(data);
    const keyboard = this.buildKeyboard(data);
    return { text, keyboard };
  }

  static buildText({ account, strategy }) {
    let text = '👤 <b>账号信息</b>\n\n';

    if (!account) {
      text += ledger.box('账号', [
        { label: '状态', value: '🔴 未登录' },
        { text: '点击下方按钮登录执行账号' },
      ]);
      return text;
    }

    const rows = [
      { label: '手机', value: maskPhone(account.phone) },
      { label: '状态', value: `${this.statusIcon(account.status)} ${this.statusText(account.status)}` },
      { label: '下注群', value: account.target_chat_title || '未配置' },
      { label: '注册', value: this.formatDate(account.created_at) },
    ];

    if (account.status === 'ERROR' && account.last_error) {
      rows.push({ label: '错误', value: account.last_error });
    }
    if (strategy) {
      rows.push({ blank: true });
      rows.push({ label: '策略', value: strategy.is_running ? '🟢 运行中' : '🔴 已停止' });
    }

    text += ledger.box('账号', rows);
    return text;
  }

  static buildKeyboard({ account, strategy }) {
    const buttons = [];

    if (!account) {
      buttons.push([Markup.button.callback('➕ 登录执行账号', 'account:login')]);
    } else {
      if (account.status === 'ERROR') {
        buttons.push([Markup.button.callback('🔄 重新登录', 'account:login')]);
      }
      buttons.push(
        [Markup.button.callback('🎯 配置下注群', 'target_chat:config')],
        [Markup.button.callback('🗑️ 删除账号', 'account:delete_confirm')]
      );
    }

    buttons.push([Markup.button.callback('🔙 返回主菜单', 'dashboard:refresh')]);

    return Markup.inlineKeyboard(buttons);
  }

  static statusIcon(status) {
    return {
      PENDING_SETUP: '🟡',
      ACTIVE: '🟢',
      ERROR: '🔴',
      DELETED: '⚫',
    }[status] || '⚪';
  }

  static statusText(status) {
    return {
      PENDING_SETUP: '待配置',
      ACTIVE: '已登录',
      ERROR: '异常',
      DELETED: '已删除',
    }[status] || '未知';
  }

  static formatDate(dateStr) {
    if (!dateStr) return '未知';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('zh-CN');
    } catch (_) {
      return '未知';
    }
  }
}

module.exports = AccountPanel;
