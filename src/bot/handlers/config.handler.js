// src/bot/handlers/config.handler.js
const strategyConfigDao = require('../../db/strategy-config.dao');
const logger = require('../../utils/logger');

class ConfigHandler {
  static async handle(ctx, action, params, { panelRenderer, services }) {
    const botUserId = String(ctx.from.id);

    switch (action) {
      case 'main': await this.handleMain(ctx, botUserId, { panelRenderer }); break;
      case 'play_type': await this.handlePlayTypeSelect(ctx, botUserId, { panelRenderer }); break;
      case 'mode': await this.handleModeSelect(ctx, botUserId, { panelRenderer }); break;
      case 'martingale': await this.handleMartingaleSelect(ctx, botUserId, { panelRenderer }); break;
      case 'base_bet': await this.handleBaseBetSelect(ctx, botUserId, { panelRenderer }); break;
      case 'cut_off': await this.handleCutOffSelect(ctx, botUserId, { panelRenderer }); break;

      case 'set_play_type': await this.handleSetConfig(ctx, botUserId, 'play_type', params[0], { panelRenderer, services }); break;
      case 'set_mode': await this.handleSetConfig(ctx, botUserId, 'mode', params[0], { panelRenderer, services }); break;
      case 'set_martingale': await this.handleSetConfig(ctx, botUserId, 'martingale_ratio', parseFloat(params[0]), { panelRenderer, services }); break;
      case 'set_base_bet': await this.handleSetConfig(ctx, botUserId, 'base_bet', parseInt(params[0], 10), { panelRenderer, services }); break;
      case 'set_cut_off': await this.handleSetConfig(ctx, botUserId, 'cut_off_seconds', parseInt(params[0], 10), { panelRenderer, services }); break;

      case 'custom_input': await this.handleCustomInput(ctx, botUserId, params[0], { panelRenderer }); break;

      default:
        logger.warn(`[CONFIG] 未知操作: ${action}`);
        await ctx.answerCbQuery('未知操作');
    }
  }

  static async handleMain(ctx, botUserId, { panelRenderer }) {
    const strategy = await strategyConfigDao.getById(botUserId);
    await panelRenderer.render(ctx, 'config', { subPanel: 'main', strategy });
  }

  static async handlePlayTypeSelect(ctx, botUserId, { panelRenderer }) {
    const strategy = await strategyConfigDao.getById(botUserId);
    await panelRenderer.render(ctx, 'config', { subPanel: 'play_type', strategy });
  }

  static async handleModeSelect(ctx, botUserId, { panelRenderer }) {
    const strategy = await strategyConfigDao.getById(botUserId);
    await panelRenderer.render(ctx, 'config', { subPanel: 'mode', strategy });
  }

  static async handleMartingaleSelect(ctx, botUserId, { panelRenderer }) {
    const strategy = await strategyConfigDao.getById(botUserId);
    await panelRenderer.render(ctx, 'config', { subPanel: 'martingale', strategy });
  }

  static async handleBaseBetSelect(ctx, botUserId, { panelRenderer }) {
    const strategy = await strategyConfigDao.getById(botUserId);
    await panelRenderer.render(ctx, 'config', { subPanel: 'base_bet', strategy });
  }

  static async handleCutOffSelect(ctx, botUserId, { panelRenderer }) {
    const strategy = await strategyConfigDao.getById(botUserId);
    await panelRenderer.render(ctx, 'config', { subPanel: 'cut_off', strategy });
  }

  static async handleSetConfig(ctx, botUserId, field, value, { panelRenderer, services }) {
    try {
      const strategy = await strategyConfigDao.getById(botUserId);
      if (!strategy) { await ctx.answerCbQuery('请先登录账号'); return; }

      this.validateConfigField(field, value);
      await services.strategyExecutor.updateConfig(botUserId, { [field]: value });
      logger.info(`[CONFIG] 用户 ${botUserId} 更新配置: ${field} = ${value}`);

      const updated = await strategyConfigDao.getById(botUserId);
      await panelRenderer.render(ctx, 'config', { subPanel: 'main', strategy: updated });
      await ctx.answerCbQuery('配置已更新');
    } catch (error) {
      logger.error(`[CONFIG] 更新配置失败: ${error.message}`);
      await ctx.answerCbQuery(`更新失败：${error.message}`, { show_alert: true });
    }
  }

  static async handleCustomInput(ctx, botUserId, field, { panelRenderer }) {
    try {
      // 进入自定义输入场景
      await ctx.scene.enter('input', { field });
      // 静默关闭按钮加载状态
      await ctx.answerCbQuery();
    } catch (error) {
      logger.error(`[CONFIG] 进入自定义输入场景失败: ${error.message}`);
      await ctx.answerCbQuery('进入输入模式失败，请重试', { show_alert: true });
    }
  }

  static validateConfigField(field, value) {
    switch (field) {
      case 'play_type':
        if (!['顺龙', '反龙', '顺2反龙', '反2顺龙'].includes(value)) throw new Error('无效的玩法类型');
        break;
      case 'mode':
        if (!['2.17', '2.84'].includes(value)) throw new Error('无效的赔率模式');
        break;
      case 'martingale_ratio': {
        const ratio = Number(value);
        if (isNaN(ratio) || ratio < 1.0) throw new Error('倍投比例必须 >= 1.0');
        break;
      }
      case 'base_bet': {
        const base = Number(value);
        if (!Number.isInteger(base) || base <= 0) throw new Error('初始下注金额必须为正整数');
        break;
      }
      case 'cut_off_seconds': {
        const secs = Number(value);
        if (!Number.isInteger(secs) || secs < 0) throw new Error('封盘秒数必须为非负整数');
        break;
      }
      default:
        throw new Error(`未知配置字段: ${field}`);
    }
  }
}

module.exports = ConfigHandler;
