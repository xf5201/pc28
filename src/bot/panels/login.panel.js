// src/bot/panels/login.panel.js
const { Markup } = require('telegraf');
const { maskPhone } = require('../../utils/mask.util');

/**
登录流程面板（LoginPanel）

文档参考：§7.4

重要原则：
1. 本面板不允许 ctx.reply
2. 本面板只通过 PanelRenderer.render() 渲染
3. 所有登录步骤都通过 editMessageText 更新同一条消息

登录步骤：
phone   等待手机号
code    等待验证码
2fa     等待 2FA 密码
success 登录成功
*/
class LoginPanel {
  /**
  PanelRenderer 调用入口
  */
  static async render(ctx, data = {}) {
    const text = this.buildText(data);
    const keyboard = this.buildKeyboard(data);
    return { text, keyboard };
  }

  static formatPhone(phone) {
    if (!phone) return '未知号码';
    return maskPhone(phone);
  }

  static buildText(data = {}) {
    const {
      step = 'phone',
      phone = null,
      errorMessage = null,
    } = data;

    let text = '';

    if (step === 'phone') {
      text += '📱 <b>登录执行账号</b>\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '步骤：1/3\n';
      text += '请输入您的 Telegram 手机号\n';
      text += '格式：<code>+8613812341234</code>\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '💡 请直接发送手机号消息';

      if (errorMessage) {
        text += `\n\n❌ ${errorMessage}`;
      }

      return text;
    }

    if (step === 'code') {
      text += '🔐 <b>验证码</b>\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '步骤：2/3\n';
      text += `已向 ${this.formatPhone(phone)} 发送验证码\n`;
      text += '⚠️ 为防止风控拦截，请输入带空格的验证码\n';
      text += '例如：<code>1 2 3 4 5</code>\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '💡 请直接发送带空格的验证码消息';

      if (errorMessage) {
        text += `\n\n❌ ${errorMessage}`;
      }

      return text;
    }

    if (step === '2fa') {
      text += '🔒 <b>两步验证</b>\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '步骤：3/3\n';
      text += '您的账号启用了两步验证\n';
      text += '请输入 2FA 密码\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += '💡 请直接发送 2FA 密码消息';

      if (errorMessage) {
        text += `\n\n❌ ${errorMessage}`;
      }

      return text;
    }

    if (step === 'success') {
      text += '✅ <b>登录成功</b>\n';
      text += '━━━━━━━━━━━━━━━━━━━━\n';
      text += `账号：${this.formatPhone(phone)}\n`;
      text += '状态：🟢 已登录\n';
      text += '下一步请配置下注群\n';
      text += '━━━━━━━━━━━━━━━━━━━━';
      return text;
    }

    return '登录面板状态异常，请刷新重试';
  }

  static buildKeyboard(data = {}) {
    const { step = 'phone' } = data;

    if (step === 'phone') {
      return Markup.inlineKeyboard([
        [Markup.button.callback('🚫 取消登录', 'login:cancel')],
        [Markup.button.callback('🔙 返回主菜单', 'login:back_dashboard')],
      ]);
    }

    if (step === 'code' || step === '2fa') {
      return Markup.inlineKeyboard([
        [Markup.button.callback('🚫 取消登录', 'login:cancel')],
      ]);
    }

    if (step === 'success') {
      return Markup.inlineKeyboard([
        [Markup.button.callback('🎯 配置下注群', 'target_chat:config')],
        [Markup.button.callback('🏠 返回主菜单', 'login:back_dashboard')],
      ]);
    }

    return Markup.inlineKeyboard([
      [Markup.button.callback('🔄 刷新', 'dashboard:refresh')],
    ]);
  }
}

module.exports = LoginPanel;