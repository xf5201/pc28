// src/index.js
/**
 * PC28 多用户系统 - 启动入口
 *
 * 文档参考：§8.1 启动流程
 *
 * 启动顺序：
 *   1. 加载 .env 配置
 *   2. 初始化 logger
 *   3. 初始化 DB + PRAGMA
 *   4. 执行 migrations
 *   5. 初始化 Bot + 中间件 + 面板渲染器 + Services
 *   6. 恢复 Session（loadActiveSessions）
 *   7. 恢复策略状态（is_running = 1）
 *   8. 检查 PENDING/SENT 下注
 *   9. 启动 crawler
 *  10. 启动 Bot
 *  11. SYSTEM_READY
 */

const { Telegraf, session, Scenes } = require('telegraf');

// ── Utils ──
const { getConfig } = require('./utils/config.loader');
const logger = require('./utils/logger');

// ── DB ──
const { getConnection, close: closeDb } = require('./db/connection');
const { runMigrations } = require('./db/migrate');
const accountDao = require('./db/account.dao');
const strategyConfigDao = require('./db/strategy-config.dao');
const betRecordDao = require('./db/bet-record.dao');
const panelContextDao = require('./db/panel-context.dao');

// ── Services ──
const SessionManager = require('./services/session.manager');
const AccountService = require('./services/account.service');
const PeriodService = require('./services/period.service');
const BetSenderService = require('./services/bet-sender.service');
const SettlementService = require('./services/settlement.service');
const CrawlerService = require('./services/crawler.service');
const StrategyExecutorService = require('./services/strategy-executor.service');
const NotificationService = require('./services/notification.service');
const AccountingService = require('./services/accounting.service');

// ── Bot ──
const PanelRenderer = require('./bot/panels/panel.renderer');
const CallbackRouter = require('./bot/handlers/callback.router');
const whitelistMiddleware = require('./bot/middleware/whitelist.middleware');
const callbackMiddleware = require('./bot/middleware/callback.middleware');
const panelMiddleware = require('./bot/middleware/panel.middleware');
const { handleStart } = require('./bot/commands/start.command');

// ── Handlers ──
const LoginTextHandler = require('./bot/handlers/login-text.handler'); // 【新增】引入登录文本处理器

// ── Scenes ──
// 【修改】移除了 loginScene，登录流程已改为单消息面板模式
const inputScene = require('./bot/scenes/input.scene');
const targetChatScene = require('./bot/scenes/target-chat.scene');

/**
 * 主启动函数
 */
async function main() {
  // ═══════════════════════════════════════════
  // 1. 加载 .env 配置
  // ═══════════════════════════════════════════
  let config;
  try {
    config = getConfig();
    console.log('[BOOT] 配置加载完成');
  } catch (error) {
    console.error('[BOOT] 配置加载失败:', error.message);
    process.exit(1);
  }

  // ═══════════════════════════════════════════
  // 2. 初始化 logger
  // ═══════════════════════════════════════════
  logger.init();
  logger.info('[BOOT] Logger 已初始化');
  logger.audit('SYSTEM_START', { env: config.nodeEnv, tz: config.timezone });

  // ═══════════════════════════════════════════
  // 3. 初始化 DB + PRAGMA
  // ═══════════════════════════════════════════
  const db = getConnection();
  logger.info('[BOOT] SQLite 连接已建立');

  // ═══════════════════════════════════════════
  // 4. 执行 migrations
  // ═══════════════════════════════════════════
  runMigrations();
  logger.info('[BOOT] 数据库迁移完成');

  // ═══════════════════════════════════════════
  // 5. 初始化 Bot + 中间件 + 面板渲染器 + Services
  // ═══════════════════════════════════════════
  const bot = new Telegraf(config.botToken);

  // 面板渲染器
  const panelRenderer = new PanelRenderer(bot, panelContextDao);

  // ── 初始化 Services ──
  const sessionManager = new SessionManager({
    apiId: config.tgApiId,
    apiHash: config.tgApiHash,
  });

  const accountService = new AccountService(sessionManager, {
    apiId: config.tgApiId,
    apiHash: config.tgApiHash,
  });

  const periodService = new PeriodService();

  const betSender = new BetSenderService({
    sessionManager,
    panelRenderer,
  });

  const settlementService = new SettlementService({
    panelRenderer,
  });

  const strategyExecutor = new StrategyExecutorService({
    periodService,
    betSender,
    panelRenderer,
  });

  const crawlerService = new CrawlerService({
    settlementService,
    strategyExecutor,
    periodService,
    intervalMs: config.crawlerIntervalMs,
  });

  const notificationService = new NotificationService({
    bot,
    panelRenderer,
  });

  const accountingService = new AccountingService();

  // 聚合 services（供 handler / scene 使用）
  const services = {
    account: accountService,
    session: sessionManager,
    period: periodService,
    betSender,
    settlement: settlementService,
    strategyExecutor,
    crawler: crawlerService,
    notification: notificationService,
    accounting: accountingService,
    panelRenderer,
  };

  // ── 注入 services 到 ctx（供 handler / scene 使用） ──
  bot.use((ctx, next) => {
    ctx.services = services;
    return next();
  });

  // ── 中间件（顺序很重要） ──
  bot.use(session()); // Telegraf session（其他 Scene 仍需要）
  bot.use(whitelistMiddleware);
  bot.use(callbackMiddleware);
  bot.use(panelMiddleware);

  // ── Scenes ──
  // 【修改】从 Stage 中移除了 loginScene
  const stage = new Scenes.Stage([inputScene, targetChatScene], {
    ttl: 300, // Scene 超时 5 分钟
  });
  bot.use(stage.middleware());

  // ── 登录文本拦截（新增） ──
  // 用于拦截用户在登录面板中输入的手机号、验证码、2FA密码
  const loginTextHandler = new LoginTextHandler({
    panelRenderer,
    panelContextDao,
    accountService,
  });

  bot.on('text', async (ctx, next) => {
    const handled = await loginTextHandler.handle(ctx);
    if (handled) return; // 如果已被登录处理器处理，则不继续向下传递
    return next();
  });

  // ── Callback Router ──
  const callbackRouter = new CallbackRouter(panelRenderer, services);
  bot.on('callback_query', (ctx) => callbackRouter.handle(ctx));

  // ── Commands ──
  bot.start((ctx) => handleStart(ctx, { panelRenderer }));

  // ── 定时刷新面板（§7.12.2） ──
  const refreshTimer = setInterval(async () => {
    try {
      const activeUsers = panelContextDao.getActiveUsers('dashboard');
      for (const userId of activeUsers) {
        try {
          const account = accountDao.getActive(userId);
          const strategy = strategyConfigDao.getById(userId);
          await panelRenderer.pushUpdate(userId, 'dashboard', {
            user: { id: userId },
            account,
            strategy,
          });
        } catch (err) {
          logger.warn(`[BOOT] 定时刷新面板失败: 用户=${userId}, ${err.message}`);
        }
      }
    } catch (err) {
      logger.warn(`[BOOT] 定时刷新面板异常: ${err.message}`);
    }
  }, 30000); // 30 秒刷新一次
  if (refreshTimer.unref) refreshTimer.unref();

  // ═══════════════════════════════════════════
  // 6. 恢复 Session（loadActiveSessions）
  // ═══════════════════════════════════════════
  logger.info('[BOOT] 开始恢复 Session...');
  await sessionManager.loadActiveSessions();
  logger.info(`[BOOT] Session 恢复完成，活跃连接: ${sessionManager.getActiveCount()}`);

  // ═══════════════════════════════════════════
  // 7. 恢复策略状态（is_running = 1）
  // ═══════════════════════════════════════════
  const runningStrategies = strategyConfigDao.getAllRunning();
  if (runningStrategies.length > 0) {
    logger.info(`[BOOT] 发现 ${runningStrategies.length} 个运行中的策略，等待 crawler 触发下注`);
    for (const strategy of runningStrategies) {
      logger.info(
        `[BOOT] 策略恢复: 用户=${strategy.bot_user_id}, ` +
        `玩法=${strategy.play_type}, 连挂=${strategy.consecutive_losses}`
      );
    }
  } else {
    logger.info('[BOOT] 没有运行中的策略');
  }

  // ═══════════════════════════════════════════
  // 8. 检查 PENDING/SENT 下注
  // ═══════════════════════════════════════════
  const allAccounts = accountDao.getAllActive();
  let pendingCount = 0;
  for (const account of allAccounts) {
    const pending = betRecordDao.listPendingByUser(account.bot_user_id);
    if (pending.length > 0) {
      pendingCount += pending.length;
      logger.info(
        `[BOOT] 用户 ${account.bot_user_id} 有 ${pending.length} 条待结算下注`
      );
    }
  }
  if (pendingCount > 0) {
    logger.info(`[BOOT] 共有 ${pendingCount} 条待结算下注，等待 crawler 拉取开奖结果`);
  } else {
    logger.info('[BOOT] 没有待结算的下注');
  }

  // ═══════════════════════════════════════════
  // 9. 启动 crawler
  // ═══════════════════════════════════════════
  crawlerService.start();
  logger.info('[BOOT] Crawler 已启动');

  // ═══════════════════════════════════════════
  // 10. 启动 Bot
  // ═══════════════════════════════════════════
  await bot.launch();
  logger.info('[BOOT] Bot 已启动');

  // ═══════════════════════════════════════════
  // 11. SYSTEM_READY
  // ═══════════════════════════════════════════
  logger.info('═══════════════════════════════════════');
  logger.info('  PC28 多用户系统已就绪 (SYSTEM_READY)');
  logger.info(`  环境: ${config.nodeEnv}`);
  logger.info(`  活跃 Session: ${sessionManager.getActiveCount()}`);
  logger.info(`  运行中策略: ${runningStrategies.length}`);
  logger.info(`  待结算下注: ${pendingCount}`);
  logger.info('═══════════════════════════════════════');
  logger.audit('SYSTEM_READY', {
    activeSessions: sessionManager.getActiveCount(),
    runningStrategies: runningStrategies.length,
    pendingBets: pendingCount,
  });

  // ── 优雅关闭 ──
  const shutdown = async (signal) => {
    logger.info(`[BOOT] 收到 ${signal} 信号，开始优雅关闭...`);
    logger.audit('SYSTEM_SHUTDOWN', { signal });

    // 停止 crawler
    crawlerService.stop();

    // 停止 Bot
    bot.stop(signal);

    // 销毁所有 Session
    await sessionManager.destroyAll();

    // 关闭数据库
    closeDb();

    // 关闭日志
    logger.close();

    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  // 未捕获异常处理
  process.on('uncaughtException', (error) => {
    logger.error(`[BOOT] 未捕获异常: ${error.message}`, error);
    logger.audit('UNCAUGHT_EXCEPTION', { error: error.message, stack: error.stack });
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`[BOOT] 未处理的 Promise 拒绝: ${reason}`);
    logger.audit('UNHANDLED_REJECTION', { reason: String(reason) });
  });
}

// ── 启动 ──
main().catch((error) => {
  console.error('[BOOT] 启动失败:', error);
  if (logger._initialized) {
    logger.error(`[BOOT] 启动失败: ${error.message}`, error);
  }
  process.exit(1);
});