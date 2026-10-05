// src/bot/panels/login.panel.js
const { Markup } = require('telegraf');
const { maskPhone } = require('../../utils/mask.util');
const ledger = require('../../utils/ledger.util');

/**
 * 登录流程面板（LoginPanel）
 *
 * 文档参考：§7.4
 *
 * 重要原则：
 * 1. 本面板不允许 ctx.reply
 * 2. 本面板只通过 PanelRenderer.render() 渲染
 * 3. 所有登录步骤都通过 editMessageText 更新同一条消息
 *
 * 登录步骤：
 * phone   等待手机号
 * code    等待验证码
 * 2fa     等待 2FA 密码
 * success 登录成功
 */
class LoginPanel {
  /**
   * PanelRenderer 调用入口
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

    const errLine = errorMessage ? '\n❌ ' + errorMessage : '';

    if (step === 'phone') {
      let text = '📱 <b>登录执行账号</b> · 步骤 1/3\n\n';
      text += ledger.box('操作说明', [
        { label: '动作', value: '直接发送手机号消息' },
        { label: '格式', value: '+8613812341234' },
      ]);
      text += errLine;
      return text;
    }

    if (step === 'code') {
      let text = '🔐 <b>输入验证码</b> · 步骤 2/3\n\n';
      text += ledger.box('操作说明', [
        { label: '发送至', value: this.formatPhone(phone) },
        { label: '动作', value: '直接发送验证码消息' },
        { label: '注意', value: '需带空格，如 1 2 3 4 5' },
      ]);
      text += '\n💡 带空格输入可防止风控拦截';
      text += errLine;
      return text;
    }

    if (step === '2fa') {
      let text = '🔒 <b>两步验证</b> · 步骤 3/3\n\n';
      text += ledger.box('操作说明', [
        { label: '原因', value: '账号已开启两步验证' },
        { label: '动作', value: '直接发送 2FA 密码消息' },
      ]);
      text += errLine;
      return text;
    }

    if (step === 'success') {
      let text = '✅ <b>登录成功</b>\n\n';
      text += ledger.box('账号', [
        { label: '手机', value: this.formatPhone(phone) },
        { label: '状态', value: '🟢 已登录' },
        { label: '下一步', value: '配置下注群' },
      ]);
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
