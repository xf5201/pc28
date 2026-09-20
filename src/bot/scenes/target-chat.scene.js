// src/bot/scenes/target-chat.scene.js
const { Scenes } = require('telegraf');
const accountDao = require('../../db/account.dao');
const logger = require('../../utils/logger');

/**
 * 下注群 ID 手动输入 WizardScene
 *
 * 文档参考：§7.6.1（输入群 ID）、§8.3（配置完成后 status = ACTIVE）
 *
 * 用途：
 *   当用户点击 [🔗 输入群 ID] 时触发
 *   输入目标群的 chat ID（如 -1001234567890）
 *
 * 进入方式：
 *   target-chat.handler → target_chat:input
 *   → ctx.scene.enter('target_chat')
 *
 * 完成后：
 *   → account.service.updateTargetChat(botUserId, chatId, chatTitle)
 *   → accounts.status → ACTIVE
 *   → 显示配置成功面板
 *   → 返回主面板
 */
const targetChatScene = new Scenes.WizardScene(
  'target_chat',

  // ── 步骤 0：显示输入提示 ──
  async (ctx) => {
    ctx.wizard.state.botUserId = String(ctx.from.id);

    // 校验账号是否存在
    const account = await accountDao.getActive(ctx.wizard.state.botUserId);
    if (!account) {
      await ctx.reply('❌ 请先登录执行账号');
      return ctx.scene.leave();
    }

    let text = '🔗 <b>输入下注群 ID</b>\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += '请输入目标群的 Chat ID\n';
    text += '格式：-1001234567890\n\n';
    text += '💡 获取方式：\n';
    text += '1. 将 @RawDataBot  拉入群中\n';
    text += '2. 查看 message.chat.id\n';
    text += '3. 复制 ID 后移除机器人\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    text += '💡 请直接发送群 ID 消息\n';
    text += '💡 发送 /cancel 取消';

    await ctx.reply(text, { parse_mode: 'HTML' });

    logger.info(`[TARGET_CHAT_SCENE] 用户 ${ctx.wizard.state.botUserId} 开始输入群 ID`);

    return ctx.wizard.next();
  },

  // ── 步骤 1：接收群 ID ──
  async (ctx) => {
    const botUserId = ctx.wizard.state.botUserId;
    const input = ctx.message?.text?.trim();

    // 取消命令
    if (input === '/cancel') {
      await ctx.reply('❎ 已取消输入');
      logger.info(`[TARGET_CHAT_SCENE] 用户 ${botUserId} 取消输入群 ID`);
      return ctx.scene.leave();
    }

    if (!input) {
      await ctx.reply('❌ 请输入群 ID');
      return;
    }

    // 校验群 ID 格式
    // 群组 ID 通常为负数，超级群/频道以 -100 开头
    const chatId = input.trim();
    if (!/^-?\d+$/.test(chatId)) {
      await ctx.reply('❌ 群 ID 格式错误，请输入数字（如 -1001234567890）');
      return;
    }

    const numericId = parseInt(chatId, 10);
    if (numericId >= 0) {
      await ctx.reply('❌ 群 ID 应为负数（群组 ID 以 - 开头）');
      return;
    }

    try {
      // 校验账号是否存在
      const account = await accountDao.getActive(botUserId);
      if (!account) {
        await ctx.reply('❌ 请先登录执行账号');
        return ctx.scene.leave();
      }

      // 尝试获取群标题（通过 TG Client）
      let chatTitle = chatId;
      try {
        const client = ctx.services.session.getClient(botUserId);
        if (client) {
          const chat = await client.getChat(numericId);
          chatTitle = chat.title || chatId;
        }
      } catch (fetchError) {
        logger.warn(
          `[TARGET_CHAT_SCENE] 用户 ${botUserId} 获取群信息失败: ${fetchError.message}`
        );
        // 获取失败不影响配置流程，使用 ID 作为标题
        chatTitle = chatId;
      }

      // 调用 account.service 更新下注群
      await ctx.services.account.updateTargetChat(botUserId, chatId, chatTitle);

      // 记录操作日志
      if (ctx.services.operationLog) {
        await ctx.services.operationLog.insert({
          bot_user_id: botUserId,
          action: 'UPDATE_TARGET_CHAT',
          detail: `下注群: ${chatTitle} (${chatId})`,
        });
      }

      logger.info(
        `[TARGET_CHAT_SCENE] 用户 ${botUserId} 配置下注群成功: ${chatTitle} (${chatId})`
      );

      // 显示配置成功消息
      let successText = '✅ <b>下注群配置成功</b>\n';
      successText += '━━━━━━━━━━━━━━━━━━━━\n';
      successText += `群名称：${chatTitle}\n`;
      successText += `群 ID：${chatId}\n`;
      successText += '━━━━━━━━━━━━━━━━━━━━\n';

      await ctx.reply(successText, { parse_mode: 'HTML' });

      // 返回主面板
      const updatedAccount = await accountDao.getActive(botUserId);
      const strategyConfigDao = require('../../db/strategy-config.dao');
      const strategy = await strategyConfigDao.getById(botUserId);

      if (ctx.services.panelRenderer) {
        await ctx.services.panelRenderer.render(ctx, 'dashboard', {
          user: {
            id: botUserId,
            username: ctx.from.username,
            first_name: ctx.from.first_name,
          },
          account: updatedAccount,
          strategy,
        });
      }

      return ctx.scene.leave();
    } catch (error) {
      logger.error(
        `[TARGET_CHAT_SCENE] 用户 ${botUserId} 配置下注群失败: ${error.message}`,
        error
      );
      await ctx.reply(`❌ 配置失败：${error.message}`);
      return ctx.scene.leave();
    }
  }
);

// 超时处理：3 分钟无操作自动退出
targetChatScene.use(async (ctx, next) => {
  const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 分钟

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

module.exports = targetChatScene;