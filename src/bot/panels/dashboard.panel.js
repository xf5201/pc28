// src/bot/panels/dashboard.panel.js
const { Markup } = require('telegraf');
const { maskPhone } = require('../../utils/mask.util');

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
    let text = '🎲 <b>PC28 自动化助手</b>\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += `👤 用户：@${user.username || user.id}\n`;

    if (!account) {
      text += '🤖 账号：🔴 未登录\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      return text;
    }

    text += `📱 账号：${maskPhone(account.phone)}\n`;
    text += `🤖 状态：${this.statusIcon(account.status)} ${this.statusText(account.status)}\n`;
    text += `🎯 下注群：${account.target_chat_title || '未配置'}\n`;

    if (strategy) {
      text += `📌 策略：${strategy.is_running ? '🟢 运行中' : '🔴 已停止'}\n`;
      text += `🎲 玩法：${strategy.play_type}\n`;
      text += `📈 倍投：${strategy.martingale_ratio}x\n`;
      text += `🔢 初始下注：${strategy.base_bet}\n`;
      text += `🔄 连挂：${strategy.consecutive_losses}\n`;
      text += `💡 模式：${strategy.mode}\n`;
      text += `⏱ 封盘：${strategy.cut_off_seconds}秒\n`;
    }

    text += '━━━━━━━━━━━━━━━━━━━━\n';
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
