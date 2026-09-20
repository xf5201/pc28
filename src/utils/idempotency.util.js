// src/utils/idempotency.util.js
const logger = require('./logger');

/**
 * 幂等工具
 *
 * 文档参考：§2 核心原则（幂等）
 *
 * 用途：
 *   - Callback 幂等（防止重复处理）
 *   - 开奖幂等（UNIQUE period 已在 DB 层保证，此工具作辅助）
 *   - 下注幂等（UNIQUE bot_user_id+period 已在 DB 层保证）
 *   - 结算幂等（UNIQUE bet_record_id 已在 DB 层保证）
 *
 * 实现：
 *   - 基于内存 Set 记录已处理的键
 *   - 定期清理过期记录，防止内存泄漏
 *
 * 使用方式：
 *   const idempotency = require('./utils/idempotency.util');
 *   if (idempotency.checkAndMark('callback:12345')) {
 *     // 首次处理
 *   } else {
 *     // 重复，跳过
 *   }
 */

// 已处理的键集合
const processedKeys = new Set();

// 最大缓存数量（防止内存泄漏）
const MAX_CACHE_SIZE = 10000;

// 清理间隔（毫秒）
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 分钟

// 清理定时器
let cleanupTimer = null;

/**
 * 启动定期清理
 * @private
 */
function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    if (processedKeys.size > MAX_CACHE_SIZE) {
      const entries = Array.from(processedKeys);
      const removeCount = entries.length - Math.floor(MAX_CACHE_SIZE / 2);
      for (let i = 0; i < removeCount; i++) {
        processedKeys.delete(entries[i]);
      }
      logger.debug(`[IDEMPOTENCY] 清理了 ${removeCount} 条过期记录`);
    }
  }, CLEANUP_INTERVAL);

  // 允许进程退出
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * 检查并标记幂等键
 *
 * @param {string} key - 幂等键
 * @returns {boolean} true = 首次处理, false = 重复
 */
function checkAndMark(key) {
  if (!key) return false;

  if (processedKeys.has(key)) {
    logger.debug(`[IDEMPOTENCY] 重复键已忽略: ${key}`);
    return false;
  }

  processedKeys.add(key);
  startCleanup();
  return true;
}

/**
 * 仅检查（不标记）
 *
 * @param {string} key
 * @returns {boolean} true = 已处理过, false = 未处理
 */
function isProcessed(key) {
  return processedKeys.has(key);
}

/**
 * 仅标记（不检查）
 *
 * @param {string} key
 */
function mark(key) {
  if (!key) return;
  processedKeys.add(key);
  startCleanup();
}

/**
 * 移除标记（用于需要重新处理的场景）
 *
 * @param {string} key
 */
function unmark(key) {
  processedKeys.delete(key);
}

/**
 * 生成 Callback 幂等键
 *
 * @param {string} callbackQueryId
 * @returns {string}
 */
function callbackKey(callbackQueryId) {
  return `cb:${callbackQueryId}`;
}

/**
 * 生成开奖幂等键
 *
 * @param {string} period
 * @returns {string}
 */
function openResultKey(period) {
  return `open:${period}`;
}

/**
 * 生成下注幂等键
 *
 * @param {string} botUserId
 * @param {string} period
 * @returns {string}
 */
function betKey(botUserId, period) {
  return `bet:${botUserId}:${period}`;
}

/**
 * 生成结算幂等键
 *
 * @param {number} betRecordId
 * @returns {string}
 */
function settlementKey(betRecordId) {
  return `settle:${betRecordId}`;
}

/**
 * 清空所有记录（测试用）
 */
function clear() {
  processedKeys.clear();
}

/**
 * 获取当前缓存数量
 * @returns {number}
 */
function size() {
  return processedKeys.size;
}

module.exports = {
  checkAndMark,
  isProcessed,
  mark,
  unmark,
  callbackKey,
  openResultKey,
  betKey,
  settlementKey,
  clear,
  size,
};