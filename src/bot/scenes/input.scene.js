// src/bot/scenes/input.scene.js
const { Scenes } = require('telegraf');
const strategyConfigDao = require('../../db/strategy-config.dao');
const panelContextDao = require('../../db/panel-context.dao');
const logger = require('../../utils/logger');

/**
 * 自定义输入 WizardScene
 *
 * 核心原则：单消息模式
 *   - 不发送新消息，始终编辑当前面板消息
 *   - 输入完成后直接渲染回配置主面板
 */

const FIELD_CONFIG = {
  martingale_ratio: {
    label: '倍投比例',
    prompt: '请输入倍投比例（≥ 1.0，例如：1.5、2.0、2.5、3.0）',
    validate: (value) => {
      const num = parseFloat(value);
      if (isNaN(num)) return '请输入有效的数字';
      if (num < 1.0) return '倍投比例必须 ≥ 1.0';
      if (num > 10.0) return '倍投比例不能超过 10.0';
      return null;
    },
    parse: (value) => parseFloat(value),
    format: (value) => `${value}x`,
  },

  base_bet: {
    label: '初始下注金额',
    prompt: '请输入初始下注金额（正整数，例如：10、50、100、500）',
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || String(num) !== value.trim()) return '请输入有效的正整数';
      if (num < 1) return '初始下注金额必须 ≥ 1';
      if (num > 100000) return '初始下注金额不能超过 100000';
      return null;
    },
    parse: (value) => parseInt(value, 10),
    format: (value) => `${value}`,
  },

  cut_off_seconds: {
    label: '封盘时间',
    prompt: '请输入封盘时间（秒，非负整数，例如：5、10、15、20）',
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || String(num) !== value.trim()) return '请输入有效的非负整数';
      if (num < 0) return '封盘时间不能为负数';
      if (num > 120) return '封盘时间不能超过 120 秒';
      return null;
    },
    parse: (value) => parseInt(value, 10),
    format: (value) => `${value}秒`,
  },
};

const inputScene = new Scenes.WizardScene(
  'input',

  // ── 步骤 0：显示输入提示（编辑当前消息） ──
  async (ctx) => {
    const field = ctx.scene.state?.field;
    const botUserId = String(ctx.from.id);

    if (!field || !FIELD_CONFIG[field]) {
      await ctx.reply('❌ 无效的输入字段');
      return ctx.scene.leave();
    }

    ctx.wizard.state.field = field;
    ctx.wizard.state.botUserId = botUserId;

    const config = FIELD_CONFIG[field];
    const strategy = await strategyConfigDao.getById(botUserId);
    const currentValue = strategy ? strategy[field] : '未设置';

    let text = `🔢 <b>自定义${config.label}</b>\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += `当前值：${config.format ? config.format(currentValue) : currentValue}\n`;
    text += `${config.prompt}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += '💡 请直接发送数值消息\n';
    text += '💡 发送 /cancel 取消';

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❎ 取消', callback_data: 'config:main' }]
          ]
        }
      });
    } catch (err) {
      await ctx.reply(text, { parse_mode: 'HTML' });
    }

    logger.info(`[INPUT_SCENE] 用户 ${botUserId} 开始自定义输入: ${field}`);

    return ctx.wizard.next();
  },

  // ── 步骤 1：接收用户输入 ──
  async (ctx) => {
    const botUserId = ctx.wizard.state.botUserId;
    const field = ctx.wizard.state.field;
    const input = ctx.message?.text?.trim();

    if (input === '/cancel') {
      await ctx.reply('❎ 已取消输入');
      logger.info(`[INPUT_SCENE] 用户 ${botUserId} 取消输入: ${field}`);
      return ctx.scene.leave();
    }

    if (!input) {
      await ctx.reply('❌ 请输入有效值');
      return;
    }

    const config = FIELD_CONFIG[field];

    const validationError = config.validate(input);
    if (validationError) {
      await ctx.reply(`❌ ${validationError}\n请重新输入，或发送 /cancel 取消`);
      return;
    }

    const value = config.parse(input);

    try {
      const strategy = await strategyConfigDao.getById(botUserId);
      if (!strategy) {
        await ctx.reply('❌ 请先登录账号');
        return ctx.scene.leave();
      }

      await ctx.services.strategyExecutor.updateConfig(botUserId, { [field]: value });

      if (ctx.services.operationLog) {
        await ctx.services.operationLog.insert({
          bot_user_id: botUserId,
          action: 'UPDATE_CONFIG',
          detail: `${config.label}: ${config.format(value)}`,
        });
      }

      logger.info(`[INPUT_SCENE] 用户 ${botUserId} 更新配置: ${field} = ${value}`);

      // 删除用户发送的数字消息（保持界面干净）
      try {
        await ctx.deleteMessage();
      } catch (_) {}

      // 直接渲染回配置主面板（编辑当前消息）
      const updated = await strategyConfigDao.getById(botUserId);
      const panelRenderer = ctx.services.panelRenderer;

      await panelRenderer.render(ctx, 'config', {
        subPanel: 'main',
        strategy: updated,
      });

      return ctx.scene.leave();
    } catch (error) {
      logger.error(`[INPUT_SCENE] 用户 ${botUserId} 更新配置失败: ${error.message}`, error);
      await ctx.reply(`❌ 更新失败：${error.message}`);
      return ctx.scene.leave();
    }
  }
);

// 超时处理：2 分钟无操作自动退出
inputScene.use(async (ctx, next) => {
  const IDLE_TIMEOUT = 2 * 60 * 1000;
  if (!ctx.wizard.state.lastActivity) {
    ctx.wizard.state.lastActivity = Date.now();
  }

  const elapsed = Date.now() - ctx.wizard.state.lastActivity;
  if (elapsed > IDLE_TIMEOUT) {
    await ctx.reply('⏰ 输入已超时，请重新操作');
    return ctx.scene.leave();
  }

  ctx.wizard.state.lastActivity = Date.now();
  return next();
});

module.exports = inputScene;
