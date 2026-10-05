// src/bot/panels/config.panel.js
const { Markup } = require('telegraf');
const { PLAY_TYPE_INFO } = require('../../core/strategy.engine');
const { MODE_INFO } = require('../../core/odds.engine');
const ledger = require('../../utils/ledger.util');

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
    let text = '⚙️ <b>策略配置</b>\n\n';

    if (!strategy) {
      text += ledger.box('当前配置', [{ text: '暂无配置，请先登录账号' }]);
      const buttons = [[Markup.button.callback('🔙 返回主菜单', 'dashboard:refresh')]];
      return { text, keyboard: Markup.inlineKeyboard(buttons) };
    }

    const playInfo = PLAY_TYPE_INFO[strategy.play_type];
    const modeInfo = MODE_INFO[strategy.mode];

    text += ledger.box('当前配置', [
      { label: '玩法', value: strategy.play_type + (playInfo ? ` · ${playInfo.short}` : '') },
      { label: '模式', value: strategy.mode + (modeInfo ? ` · ${modeInfo.short}` : '') },
      { label: '基础注', value: String(strategy.base_bet) },
      { label: '倍投', value: `${strategy.martingale_ratio}x` },
      { label: '连挂', value: String(strategy.consecutive_losses) },
    ]);

    const buttons = [
      [Markup.button.callback('🎲 修改玩法', 'config:play_type'), Markup.button.callback('💡 修改模式', 'config:mode')],
      [Markup.button.callback('💰 修改基础注', 'config:base_bet'), Markup.button.callback('📈 修改倍投', 'config:martingale')],
      [Markup.button.callback('🔙 返回主菜单', 'dashboard:refresh')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildPlayTypeSelect({ strategy }) {
    let text = '🎲 <b>选择玩法</b>\n\n';

    const rows = Object.entries(PLAY_TYPE_INFO).map(([name, info]) => ({
      label: (strategy && strategy.play_type === name ? '▸ ' : '  ') + name,
      value: info.short,
    }));
    text += ledger.box(`选择玩法${strategy ? ` · 当前 ${strategy.play_type}` : ''}`, rows);

    const details = Object.entries(PLAY_TYPE_INFO)
      .map(([name, info]) => `🔹 <b>${name}</b> — ${info.short}\n${info.detail}`)
      .join('\n\n');
    text += ledger.details(
      '📖 玩法详细说明（点击展开）',
      `${details}\n\n━━━━━━━━━━━━━━\n💰 金额 = 基础注 × 倍投比例 ^ 连挂数\n连输越多买越大，赢一把回到基础注`
    );

    const buttons = [
      [Markup.button.callback('顺龙', 'config:set_play_type:顺龙'), Markup.button.callback('反龙', 'config:set_play_type:反龙')],
      [Markup.button.callback('顺2反龙', 'config:set_play_type:顺2反龙'), Markup.button.callback('反2顺龙', 'config:set_play_type:反2顺龙')],
      [Markup.button.callback('🔙 返回', 'config:main')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildModeSelect({ strategy }) {
    let text = '💡 <b>选择赔率模式</b>\n\n';

    const rows = Object.entries(MODE_INFO).map(([name, info]) => ({
      label: (strategy && strategy.mode === name ? '▸ ' : '  ') + name,
      value: info.short,
    }));
    text += ledger.box(`赔率模式${strategy ? ` · 当前 ${strategy.mode}` : ''}`, rows);

    const details = Object.entries(MODE_INFO)
      .map(([name, info]) => `🔹 <b>${name}</b> — ${info.short}\n${info.detail}`)
      .join('\n\n');
    text += ledger.details(
      '📖 返奖与回本规则（点击展开）',
      `${details}\n\n━━━━━━━━━━━━━━\n💡 回本 = 不盈不亏，连挂计数保持不变`
    );

    const buttons = [
      [Markup.button.callback('2.17', 'config:set_mode:2.17'), Markup.button.callback('2.84', 'config:set_mode:2.84')],
      [Markup.button.callback('🔙 返回', 'config:main')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildMartingaleSelect({ strategy }) {
    let text = '📈 <b>修改倍投比例</b>\n\n';

    text += ledger.box('当前倍投比例', [
      { label: '比例', value: strategy ? `${strategy.martingale_ratio}x` : '未配置' },
      { label: '含义', value: '金额 = 基础注 × 比例 ^ 连挂' },
    ]);

    const buttons = [
      [Markup.button.callback('1.5x', 'config:set_martingale:1.5'), Markup.button.callback('2.0x', 'config:set_martingale:2.0')],
      [Markup.button.callback('2.5x', 'config:set_martingale:2.5'), Markup.button.callback('3.0x', 'config:set_martingale:3.0')],
      [Markup.button.callback('🔢 自定义', 'config:custom_input:martingale_ratio')],
      [Markup.button.callback('🔙 返回', 'config:main')],
    ];
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
  }

  static buildBaseBetSelect({ strategy }) {
    let text = '💰 <b>修改基础注</b>\n\n';

    text += ledger.box('当前基础注', [
      { label: '金额', value: strategy ? String(strategy.base_bet) : '未配置' },
      { label: '含义', value: '连挂为 0 时的下注金额' },
    ]);

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
