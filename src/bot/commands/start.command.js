// src/bot/commands/start.command.js
const botUserDao = require('../../db/bot-user.dao');
const accountDao = require('../../db/account.dao');
const strategyConfigDao = require('../../db/strategy-config.dao');
const logger = require('../../utils/logger');

/**
 * /start 命令处理器
 *
 * 调用链：
 *   start.command.js
 *   → deleteQuietly(ctx) // 先删除用户发送的指令消息，防止与后发的面板混料
 *   → bot-user.dao.upsert(...)
 *   → account.dao.getActive(botUserId)
 *   → strategy-config.dao.getById(botUserId)
 *   → panelRenderer.render(ctx, 'dashboard', ..., { forceNew: true }) // 强制弹出新面板
 */
async function handleStart(ctx, { panelRenderer }) {
  const tgUser = ctx.from;
  const botUserId = String(tgUser.id);

  try {
    // 1. ✅ 先静默删除用户发送的 `/start` 文本命令，保证界面干净
    await deleteQuietly(ctx);

    // 2. 初始化 / 更新 bot_users 记录
    await botUserDao.upsert({
      bot_user_id: botUserId,
      username: tgUser.username || null,
      first_name: tgUser.first_name || null,
    });

    // 3. 读取账号信息
    const account = await accountDao.getActive(botUserId);

    // 4. 读取策略配置
    const strategy = await strategyConfigDao.getById(botUserId);

    // 5. 渲染主面板（传入 forceNew: true 强制生成新面板）
    await panelRenderer.render(
      ctx,
      'dashboard',
      {
        user: {
          id: botUserId,
          username: tgUser.username,
          first_name: tgUser.first_name,
        },
        account,
        strategy,
      },
      { forceNew: true } // 显式指示：不要尝试编辑旧消息，直接发送新面板
    );

    logger.info(`[START] 用户 ${botUserId} 进入主面板`);
  } catch (error) {
    logger.error(`[START] 用户 ${botUserId} 启动失败: ${error.message}`, error);
    await ctx.reply('❌ 系统异常，请稍后重试。');
  }
}

/**
 * 静默删除用户的来消息（私聊中 Bot 有权限删除）
 * 删除失败（消息过旧/无权限/已被清空）时忽略，不影响主流程
 */
async function deleteQuietly(ctx) {
  try {
    await ctx.deleteMessage();
  } catch (_) {
    // 忽略删除失败
  }
}

module.exports = { handleStart, deleteQuietly };
