// src/db/operation-log.dao.js
const { getConnection } = require('./connection');

/**
 * operation_logs 表 DAO
 *
 * 文档参考：§4.8
 *
 * action 枚举：
 *   LOGIN / LOGOUT / DELETE_ACCOUNT
 *   START_STRATEGY / STOP_STRATEGY
 *   UPDATE_CONFIG / UPDATE_TARGET_CHAT
 *   BET_CREATED / BET_SENT / BET_FAILED / BET_SETTLED
 *   SESSION_ERROR / CRAWLER_ERROR / SETTLEMENT_ERROR
 *   RECOVERY / ERROR
 */

const operationLogDao = {
  /**
   * 插入操作日志
   * @param {{ bot_user_id: string, action: string, detail?: string }} data
   */
  insert(data) {
    const db = getConnection();
    db.prepare(`
      INSERT INTO operation_logs (bot_user_id, action, detail)
      VALUES (?, ?, ?)
    `).run(data.bot_user_id, data.action, data.detail || null);
  },

  /**
   * 获取用户操作日志（分页）
   * @param {string} botUserId
   * @param {{ limit?: number, offset?: number }} options
   * @returns {Array}
   */
  listByUser(botUserId, options = {}) {
    const db = getConnection();
    const limit = options.limit || 10;
    const offset = options.offset || 0;

    return db.prepare(`
      SELECT * FROM operation_logs
      WHERE bot_user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(botUserId, limit, offset);
  },

  /**
   * 获取用户操作日志总数
   * @param {string} botUserId
   * @returns {number}
   */
  countByUser(botUserId) {
    const db = getConnection();
    return db.prepare('SELECT COUNT(*) as count FROM operation_logs WHERE bot_user_id = ?')
      .get(botUserId).count;
  },

  /**
   * 物理删除用户所有操作日志（删除账号 §8.8）
   * @param {string} botUserId
   */
  deleteByUser(botUserId) {
    const db = getConnection();
    db.prepare('DELETE FROM operation_logs WHERE bot_user_id = ?').run(botUserId);
  },
};

module.exports = operationLogDao;