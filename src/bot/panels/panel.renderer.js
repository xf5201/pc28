// src/bot/panels/panel.renderer.js
const logger = require('../../utils/logger');

/**
 * 面板渲染器（PanelRenderer）
 */
const PANEL_ALIAS = {
  config_main:           { file: 'config',      subPanel: 'main' },
  config_play_type:      { file: 'config',      subPanel: 'play_type' },
  config_mode:           { file: 'config',      subPanel: 'mode' },
  config_martingale:     { file: 'config',      subPanel: 'martingale' },
  config_cut_off:        { file: 'config',      subPanel: 'cut_off' },
  target_chat_config:    { file: 'target-chat', subPanel: 'config' },
  target_chat_list:      { file: 'target-chat', subPanel: 'list' },
  target_chat_success:   { file: 'target-chat', subPanel: 'success' },
  report_daily:          { file: 'report',      subPanel: 'daily' },
  report_period:         { file: 'report',      subPanel: 'period' },
  report_detail:         { file: 'report',      subPanel: 'detail' },
  log_list:              { file: 'log' },
};

class PanelRenderer {
  constructor(bot, panelContextDao) {
    this.bot = bot;
    this.panelContextDao = panelContextDao;
  }

  _resolve(panelName, data) {
    const alias = PANEL_ALIAS[panelName];
    if (alias) {
      if (alias.subPanel && !data.subPanel) data.subPanel = alias.subPanel;
      return alias.file;
    }
    return panelName;
  }

  _normalizeMarkup(keyboard) {
    if (!keyboard) return undefined;
    if (keyboard.reply_markup) return keyboard.reply_markup;
    return keyboard;
  }

  /**
   * 渲染面板（用户主动触发）
   */
  async render(ctx, panelName, data = {}, options = {}) {
    const file = this._resolve(panelName, data);
    const PanelClass = require(`./${file}.panel.js`);
    const { text, keyboard } = await PanelClass.render(ctx, data);
    const reply_markup = this._normalizeMarkup(keyboard);

    const botUserId = String(ctx.from.id);
    const panelCtx = await this.panelContextDao.get(botUserId);

    // 辅助函数：发送全新的面板消息并同步数据库记录
    const sendNewAndSave = async () => {
      const msg = await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
      await this.panelContextDao.upsert(
        botUserId,
        msg.chat.id,
        msg.message_id,
        panelName
      );
      return msg;
    };

    // 如果显式要求 forceNew，或者当前没有旧面板上下文，直接发新消息
    if (options.forceNew || !panelCtx || !panelCtx.message_id) {
      await sendNewAndSave();
      logger.debug(`[PANEL] 用户 ${botUserId} 发送新面板: ${panelName}`);
      return;
    }

    try {
      // 尝试编辑现有面板
      await this.bot.telegram.editMessageText(
        panelCtx.chat_id,
        panelCtx.message_id,
        null,
        text,
        { parse_mode: 'HTML', reply_markup }
      );
      // 更新当前面板名称
      await this.panelContextDao.updatePanel(botUserId, panelName);
      logger.debug(`[PANEL] 用户 ${botUserId} 编辑更新面板: ${panelName}`);
    } catch (err) {
      const errDesc = err.description || err.message || '';

      // 内容未变化 → 忽略
      if (errDesc.includes('message is not modified')) {
        logger.debug(`[PANEL] 面板内容未变化，跳过编辑`);
        return;
      }

      // 消息被删除 / 无法找到旧消息 / query失效 → 自动自愈（重新发送）
      if (
        errDesc.includes('message to edit not found') ||
        errDesc.includes('message can\'t be edited') ||
        errDesc.includes('chat not found')
      ) {
        logger.warn(`[PANEL] 旧面板消息不存在，重新发送新面板`);
        await sendNewAndSave();
        return;
      }

      // 其他未预期的 API 错误，强行降级重新发送，确保界面能够展示
      logger.error(`[PANEL] 编辑面板失败 (${errDesc})，降级发送新消息`);
      await sendNewAndSave();
    }
  }

  /**
   * 推送更新（系统主动触发）
   */
  async pushUpdate(botUserId, panelName, data = {}) {
    const panelCtx = await this.panelContextDao.get(botUserId);
    if (!panelCtx || panelCtx.current_panel !== panelName) return;

    const file = this._resolve(panelName, data);
    const PanelClass = require(`./${file}.panel.js`);
    const { text, keyboard } = await PanelClass.render(
      { from: { id: botUserId } },
      data
    );
    const reply_markup = this._normalizeMarkup(keyboard);

    try {
      await this.bot.telegram.editMessageText(
        panelCtx.chat_id,
        panelCtx.message_id,
        null,
        text,
        { parse_mode: 'HTML', reply_markup }
      );
      logger.debug(`[PANEL] 推送更新: 用户 ${botUserId} → ${panelName}`);
    } catch (err) {
      const errDesc = err.description || '';
      if (errDesc.includes('message is not modified')) return;

      if (errDesc.includes('message to edit not found')) {
        logger.warn(`[PANEL] 用户 ${botUserId} 面板消息已删除，推送自愈重发`);
        try {
          const msg = await this.bot.telegram.sendMessage(botUserId, text, {
            parse_mode: 'HTML',
            reply_markup,
          });
          await this.panelContextDao.upsert(
            botUserId,
            msg.chat.id,
            msg.message_id,
            panelName
          );
        } catch (sendErr) {
          logger.warn(`[PANEL] 重发面板失败: ${sendErr.message}`);
        }
        return;
      }

      logger.warn(`[PANEL] 推送更新失败: ${err.message}`);
    }
  }
}

module.exports = PanelRenderer;
