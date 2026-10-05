// src/bot/panels/config.panel.js
const { Markup } = require('telegraf');
const { PLAY_TYPE_INFO } = require('../../core/strategy.engine');
const { MODE_INFO } = require('../../core/odds.engine');

class ConfigPanel {
  static async render(ctx, data) {
    const subPanel = data.subPanel || 'main';
    switch (subPanel) {
      case 'play_type': return this.buildPlayTypeSelect(data);
      case 'mode': return this.buildModeSelect(data);
      case 'martingale': return this.buildMartingaleSelect(data);
      case 'base_bet': return this.buildBaseBetSelect(data);
      case 'main':
      default: return this.buildMain(data);
    }
  }

  static buildMain({ strategy }) {
    let text = '⚙️ <b>策略配置</b>\n━━━━━━━━━━━━━━━━━━━━\n当前配置：\n';
    if (strategy) {
      const playInfo = PLAY_TYPE_INFO[strategy.play_type];
      const modeInfo = MODE_INFO[strategy.mode];
      text += `🎲 玩法：${strategy.play_type}${playInfo ? `（${playInfo.short}）` : ''}\n`;
      text += `💡 模式：${strategy.mode}${modeInfo ? `（${modeInfo.short}）` : ''}\n`;
      text += `💰 初始下注：${strategy.base_bet}\n`;
      text += `📈 倍投比例：${strategy.martingale_ratio}x\n`;
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
        [Markup.button.callback('📈 修改倍投比例', 'config:martingale')]
      );
    }
    buttons.push([Markup.button.callback('🔙 返回主菜单', 'dashboard:refresh')]);
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildPlayTypeSelect({ strategy }) {
    let text = '🎲 <b>选择玩法</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    if (strategy) text += `当前：${strategy.play_type}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += '📖 所有玩法都根据<b>上一期开奖的大小</b>决定下注方向：\n\n';
    for (const [name, info] of Object.entries(PLAY_TYPE_INFO)) {
      text += `🔹 <b>${name}</b>（${info.short}）\n${info.detail}\n\n`;
    }
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += '💰 金额 = 基础注 × 倍投比例 ^ 连挂数\n连输越多买越大，赢一把回到基础注';
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
    text += '📖 押中方向后按本金倍数返奖，特殊号码按回本处理：\n\n';
    for (const [name, info] of Object.entries(MODE_INFO)) {
      text += `🔹 <b>${name}</b>（${info.short}）\n${info.detail}\n\n`;
    }
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += '💡 回本 = 不盈不亏，连挂计数保持不变';
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
}

module.exports = ConfigPanel;