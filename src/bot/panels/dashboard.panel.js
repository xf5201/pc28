// src/bot/panels/dashboard.panel.js
const { Markup } = require('telegraf');
const { maskPhone } = require('../../utils/mask.util');
const { PLAY_TYPE_INFO } = require('../../core/strategy.engine');
const { MODE_INFO } = require('../../core/odds.engine');
const ledger = require('../../utils/ledger.util');

/**
 * 主面板（DashboardPanel）
 * 文档参考：§7.3
 */
class DashboardPanel {
  static async render(ctx, data) {
    const text = this.buildText(data);
    const keyboard = this.buildKeyboard(data);
    return { text, keyboard };
  }

  static buildText({ user, account, strategy }) {
    let text = '🎲 <b>PC28 自动化助手</b>\n\n';

    const rows = [{ label: '用户', value: '@' + (user.username || user.id) }];

    if (!account) {
      rows.push({ label: '账号', value: '🔴 未登录' });
      rows.push({ text: '点击下方按钮登录执行账号' });
      text += ledger.box('账号 · 策略', rows);
      return text;
    }

    rows.push({ label: '手机', value: maskPhone(account.phone) });
    rows.push({ label: '状态', value: `${this.statusIcon(account.status)} ${this.statusText(account.status)}` });
    rows.push({ label: '下注群', value: account.target_chat_title || '未配置' });

    if (strategy) {
      const playInfo = PLAY_TYPE_INFO[strategy.play_type];
      const modeInfo = MODE_INFO[strategy.mode];
      rows.push({ blank: true });
      rows.push({ label: '策略', value: strategy.is_running ? '🟢 运行中' : '🔴 已停止' });
      rows.push({ label: '玩法', value: strategy.play_type + (playInfo ? ` · ${playInfo.short}` : '') });
      rows.push({ label: '模式', value: strategy.mode + (modeInfo ? ` · ${modeInfo.short}` : '') });
      rows.push({ label: '基础注', value: String(strategy.base_bet) });
      rows.push({ label: '倍投', value: `${strategy.martingale_ratio}x` });
      rows.push({ label: '连挂', value: String(strategy.consecutive_losses) });
    }

    text += ledger.box('账号 · 策略', rows);
    return text;
  }

  static buildKeyboard({ account, strategy }) {
    const buttons = [];

    if (!account) {
      // 未登录状态
      buttons.push([Markup.button.callback('➕ 登录执行账号', 'account:login')]);
    } else {
      // 已登录状态
      if (strategy && strategy.is_running) {
        buttons.push([Markup.button.callback('🛑 停止策略', 'strategy:stop')]);
      } else {
        buttons.push([Markup.button.callback('🚀 启动策略', 'strategy:start')]);
      }

      buttons.push(
        [Markup.button.callback('⚙️ 策略配置', 'config:main')],
        [Markup.button.callback('🎯 下注群配置', 'target_chat:config')],
        [Markup.button.callback('🗑️ 删除账号', 'account:delete_confirm')]
      );
    }

    // 公共底部按钮
    buttons.push(
      [Markup.button.callback('📊 盈亏报表', 'report:main')],
      [Markup.button.callback('📝 操作日志', 'log:main')],
      [Markup.button.callback('🔄 刷新', 'dashboard:refresh')]
    );

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
}

module.exports = DashboardPanel;
