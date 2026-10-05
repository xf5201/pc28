// src/services/bet-sender.service.js
const betRecordDao = require('../db/bet-record.dao');
const accountDao = require('../db/account.dao');
const strategyConfigDao = require('../db/strategy-config.dao');
const operationLogDao = require('../db/operation-log.dao');
const { getDirectionLabel } = require('../core/strategy.engine');
const logger = require('../utils/logger');

// 下注消息发送超时（毫秒）：GramJS 连接假死时 sendMessage 会永久挂起
// （既不成功也不抛错），必须用超时兜底，否则该期下注会无声丢失。
const SEND_TIMEOUT_MS = 30000;

/**
 * 下注消息发送服务
 *
 * 文档参考：§9.9, §8.7
 *
 * 职责：
 *   - 通过 TG Client 发送下注消息到目标群
 *   - 成功 → status = SENT
 *   - Forbidden → status = FAILED + is_running = 0 + accounts.status = ERROR
 *   - 其他失败 → status = FAILED
 *
 * 接口：
 *   sendBetMessage(botUserId, betRecord)
 */
class BetSenderService {
  /**
   * @param {object} deps
   * @param {object} deps.sessionManager - SessionManager 实例
   * @param {object} deps.panelRenderer - PanelRenderer 实例
   */
  constructor(deps) {
    this.sessionManager = deps.sessionManager;
    this.panelRenderer = deps.panelRenderer;
  }

  /**
   * 发送下注消息（§8.7 事务后步骤）
   *
   * @param {string} botUserId
   * @param {object} betRecord - bet_records 行数据
   */
  async sendBetMessage(botUserId, betRecord) {
    const { id, period, direction, bet_amount, target_chat_id } = betRecord;

    logger.info(
      `[BET_SENDER] 用户 ${botUserId} 发送下注: ` +
      `期号=${period}, 方向=${direction}, 金额=${bet_amount}`
    );

    try {
      // 获取 TG Client
      const client = this.sessionManager.getClient(botUserId);
      if (!client) {
        throw new Error('TG Client 未连接');
      }

      // 发送消息到目标群（带超时保护）
      const dirLabel = getDirectionLabel(direction);
      const messageText = `${dirLabel} ${bet_amount}`;

      const sentMessage = await this._sendWithTimeout(client, target_chat_id, messageText);

      // 发送成功 → 更新状态为 SENT
      betRecordDao.markSent(id, sentMessage.id);

      operationLogDao.insert({
        bot_user_id: botUserId,
        action: 'BET_SENT',
        detail: `期号=${period}, 方向=${dirLabel}, 金额=${bet_amount}`,
      });

      logger.info(`[BET_SENDER] 用户 ${botUserId} 下注已发送: 期号=${period}`);

      // 推送面板更新
      await this._pushUpdate(botUserId);
    } catch (error) {
      await this._handleSendError(botUserId, id, period, error);
    }
  }

  /**
   * 带超时的消息发送
   *
   * @private
   */
  async _sendWithTimeout(client, chatId, messageText) {
    let timer;
    try {
      return await Promise.race([
        client.sendMessage(chatId, { message: messageText }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`发送超时（${SEND_TIMEOUT_MS / 1000} 秒，TG 连接可能已假死）`)),
            SEND_TIMEOUT_MS
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 处理发送失败
   *
   * @private
   */
  async _handleSendError(botUserId, betId, period, error) {
    const errorMessage = error.message || String(error);

    // 判断是否为 Forbidden（被群踢出/封禁）
    const isForbidden =
      errorMessage.includes('Forbidden') ||
      errorMessage.includes('CHAT_WRITE_FORBIDDEN') ||
      errorMessage.includes('USER_BANNED') ||
      errorMessage.includes('PEER_ID_INVALID');

    if (isForbidden) {
      // Forbidden → 立即停止策略 + 标记账号 ERROR（§8.7, §13.3）
      logger.error(`[BET_SENDER] 用户 ${botUserId} 被禁止发送消息，停止策略`);

      betRecordDao.markFailed(betId, 'Forbidden');
      strategyConfigDao.setStopped(botUserId);
      accountDao.updateStatus(botUserId, 'ERROR', 'Forbidden: 无法发送消息到目标群');

      operationLogDao.insert({
        bot_user_id: botUserId,
        action: 'BET_FAILED',
        detail: `期号=${period}, 原因=Forbidden`,
      });

      operationLogDao.insert({
        bot_user_id: botUserId,
        action: 'SESSION_ERROR',
        detail: '被禁止发送消息到目标群，策略已自动停止',
      });
    } else {
      // 其他失败 → FAILED（不进 PENDING）
      logger.error(`[BET_SENDER] 用户 ${botUserId} 下注发送失败: ${errorMessage}`);

      betRecordDao.markFailed(betId, errorMessage);

      operationLogDao.insert({
        bot_user_id: botUserId,
        action: 'BET_FAILED',
        detail: `期号=${period}, 原因=${errorMessage}`,
      });

      // 非权限类失败（超时/网络/连接假死）→ 重建连接自愈，
      // 否则 GramJS 假死后后续每一单都会继续挂起
      await this._recoverClient(botUserId);
    }

    // 推送面板更新
    await this._pushUpdate(botUserId);
  }

  /**
   * 重建用户的 TG 连接（自愈）
   *
   * 销毁假死 Client，用 DB 里的 Session 重新连接。
   * initClient 失败时会自行标记账号 ERROR 并停止策略（面板可见）。
   *
   * @private
   */
  async _recoverClient(botUserId) {
    try {
      const account = accountDao.getActive(botUserId);
      if (!account || !account.session_string) return;

      logger.info(`[BET_SENDER] 正在为用户 ${botUserId} 重建 TG 连接...`);
      await this.sessionManager.destroyClient(botUserId);
      await this.sessionManager.initClient(botUserId, account.session_string);
      logger.info(`[BET_SENDER] 用户 ${botUserId} TG 连接已重建`);
    } catch (err) {
      logger.error(`[BET_SENDER] 用户 ${botUserId} TG 连接重建失败: ${err.message}`);
    }
  }

  /**
   * 推送面板更新
   * @private
   */
  async _pushUpdate(botUserId) {
    if (!this.panelRenderer) return;

    try {
      const account = accountDao.getActive(botUserId);
      const strategy = strategyConfigDao.getById(botUserId);
      await this.panelRenderer.pushUpdate(botUserId, 'dashboard', {
        user: { id: botUserId },
        account,
        strategy,
      });
    } catch (err) {
      logger.warn(`[BET_SENDER] 推送面板更新失败: ${err.message}`);
    }
  }
}

module.exports = BetSenderService;