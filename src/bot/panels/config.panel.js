// src/bot/panels/config.panel.js
const { Markup } = require('telegraf');

class ConfigPanel {
  static async render(ctx, data) {
    const subPanel = data.subPanel || 'main';
    switch (subPanel) {
      case 'play_type': return this.buildPlayTypeSelect(data);
      case 'mode': return this.buildModeSelect(data);
      case 'martingale': return this.buildMartingaleSelect(data);
      case 'base_bet': return this.buildBaseBetSelect(data);
      case 'cut_off': return this.buildCutOffSelect(data);
      case 'main':
      default: return this.buildMain(data);
    }
  }

  static buildMain({ strategy }) {
    let text = '⚙️ <b>策略配置</b>\n━━━━━━━━━━━━━━━━━━━━\n当前配置：\n';
    if (strategy) {
      text += `🎲 玩法：${strategy.play_type}\n`;
      text += `💡 模式：${strategy.mode}\n`;
      text += `💰 初始下注：${strategy.base_bet}\n`;
      text += `📈 倍投比例：${strategy.martingale_ratio}x\n`;
      text += `⏱ 封盘：${strategy.cut_off_seconds}秒\n`;
    } else {
      text += '暂无配置，请先登录账号\n';
    }
    text += '━━━━━━━━━━━━━━━━━━━━\n';

    const buttons = [];
    if (strategy) {
      buttons.push(
        [Markup.button.callback('🎲 修改玩法', 'config:play_type')],
        [Markup.button.callback('💡 修改模式', 'config:mode')],
        [Markup.button.callback('💰 修改初始下注', 'config:base_bet')],
        [Markup.button.callback('📈 修改倍投比例', 'config:martingale')],
        [Markup.button.callback('⏱ 修改封盘时间', 'config:cut_off')]
      );
    }
    buttons.push([Markup.button.callback('🔙 返回主菜单', 'dashboard:refresh')]);
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildPlayTypeSelect({ strategy }) {
    let text = '🎲 <b>选择玩法</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    if (strategy) text += `当前：${strategy.play_type}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    const buttons = [
      [Markup.button.callback('顺龙', 'config:set_play_type:顺龙'), Markup.button.callback('反龙', 'config:set_play_type:反龙')],
      [Markup.button.callback('顺2反龙', 'config:set_play_type:顺2反龙'), Markup.button.callback('反2顺龙', 'config:set_play_type:反2顺龙')],
      [Markup.button.callback('🔙 返回', 'config:main')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildModeSelect({ strategy }) {
    let text = '💡 <b>选择赔率模式</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    if (strategy) text += `当前：${strategy.mode}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    const buttons = [
      [Markup.button.callback('2.17', 'config:set_mode:2.17'), Markup.button.callback('2.84', 'config:set_mode:2.84')],
      [Markup.button.callback('🔙 返回', 'config:main')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildMartingaleSelect({ strategy }) {
    let text = '📈 <b>修改倍投比例</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    if (strategy) text += `当前：${strategy.martingale_ratio}x\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    const buttons = [
      [Markup.button.callback('1.5x', 'config:set_martingale:1.5'), Markup.button.callback('2.0x', 'config:set_martingale:2.0')],
      [Markup.button.callback('2.5x', 'config:set_martingale:2.5'), Markup.button.callback('3.0x', 'config:set_martingale:3.0')],
      [Markup.button.callback('🔢 自定义', 'config:custom_input:martingale_ratio')],
      [Markup.button.callback('🔙 返回', 'config:main')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildBaseBetSelect({ strategy }) {
    let text = '💰 <b>修改初始下注金额</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    if (strategy) text += `当前：${strategy.base_bet}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    const buttons = [
      [Markup.button.callback('10', 'config:set_base_bet:10'), Markup.button.callback('50', 'config:set_base_bet:50')],
      [Markup.button.callback('100', 'config:set_base_bet:100'), Markup.button.callback('500', 'config:set_base_bet:500')],
      [Markup.button.callback('🔢 自定义', 'config:custom_input:base_bet')],
      [Markup.button.callback('🔙 返回', 'config:main')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildCutOffSelect({ strategy }) {
    let text = '⏱ <b>修改封盘时间</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    if (strategy) text += `当前：${strategy.cut_off_seconds}秒\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    const buttons = [
      [Markup.button.callback('5秒', 'config:set_cut_off:5'), Markup.button.callback('10秒', 'config:set_cut_off:10')],
      [Markup.button.callback('15秒', 'config:set_cut_off:15'), Markup.button.callback('20秒', 'config:set_cut_off:20')],
      [Markup.button.callback('🔢 自定义', 'config:custom_input:cut_off_seconds')],
      [Markup.button.callback('🔙 返回', 'config:main')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }
}

module.exports = ConfigPanel;