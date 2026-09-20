// src/db/account.dao.js
const { getConnection } = require('./connection');

/**
 * accounts 表 DAO
 *
 * 文档参考：§4.3
 *
 * 状态：PENDING_SETUP | ACTIVE | ERROR | DELETED
 *
 * 规则（§5.4）：
 *   - 所有查询带 bot_user_id
 *   - 关键写操作使用事务（由 service 层调用 transaction）
 */

const accountDao = {
  /**
   * 获取用户的有效账号（非 DELETED）
   * @param {string} botUserId
   * @returns {object|undefined}
   */
  getActive(botUserId) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM accounts
      WHERE bot_user_id = ? AND status != 'DELETED'
    `).get(botUserId);
  },

  /**
   * 根据 ID 查询
   * @param {number} id
   * @returns {object|undefined}
   */
  getById(id) {
    const db = getConnection();
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  },

  /**
   * 插入新账号
   * @param {object} data
   */
  insert(data) {
    const db = getConnection();
    db.prepare(`
      INSERT INTO accounts (bot_user_id, phone, proxy, session_string, target_chat_id, target_chat_title, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.bot_user_id,
      data.phone,
      data.proxy || null,
      data.session_string,
      data.target_chat_id || null,
      data.target_chat_title || null,
      data.status || 'PENDING_SETUP'
    );
  },

  /**
   * 更新 Session（重新登录时）
   * @param {string} botUserId
   * @param {string} sessionString
   */
  updateSession(botUserId, sessionString) {
    const db = getConnection();
    db.prepare(`
      UPDATE accounts
      SET session_string = ?, status = 'PENDING_SETUP', last_error = NULL,
          updated_at = datetime('now', '+8 hours')
      WHERE bot_user_id = ?
    `).run(sessionString, botUserId);
  },

  /**
   * 更新下注群配置（配置完成后 status → ACTIVE）
   * @param {string} botUserId
   * @param {string} chatId
   * @param {string} chatTitle
   */
  updateTargetChat(botUserId, chatId, chatTitle) {
    const db = getConnection();
    db.prepare(`
      UPDATE accounts
      SET target_chat_id = ?, target_chat_title = ?, status = 'ACTIVE',
          updated_at = datetime('now', '+8 hours')
      WHERE bot_user_id = ?
    `).run(chatId, chatTitle, botUserId);
  },

  /**
   * 更新账号状态
   * @param {string} botUserId
   * @param {string} status - PENDING_SETUP | ACTIVE | ERROR | DELETED
   * @param {string|null} lastError
   */
  updateStatus(botUserId, status, lastError = null) {
    const db = getConnection();
    db.prepare(`
      UPDATE accounts
      SET status = ?, last_error = ?, updated_at = datetime('now', '+8 hours')
      WHERE bot_user_id = ?
    `).run(status, lastError, botUserId);
  },

  /**
   * 物理删除账号（删除账号流程 §8.8）
   * @param {string} botUserId
   */
  deleteByUser(botUserId) {
    const db = getConnection();
    db.prepare('DELETE FROM accounts WHERE bot_user_id = ?').run(botUserId);
  },

  /**
   * 获取所有需要恢复 Session 的账号（§8.1 启动流程）
   * @returns {Array}
   */
  getAllForRecovery() {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM accounts
      WHERE status IN ('PENDING_SETUP', 'ACTIVE', 'ERROR')
    `).all();
  },

  /**
   * 获取所有 ACTIVE 账号
   * @returns {Array}
   */
  getAllActive() {
    const db = getConnection();
    return db.prepare("SELECT * FROM accounts WHERE status = 'ACTIVE'").all();
  },
};

module.exports = accountDao;