// src/db/bot-user.dao.js
const { getConnection } = require('./connection');

/**
 * bot_users 表 DAO
 *
 * 文档参考：§4.2
 *
 * 规则（§5.4）：
 *   - 所有查询带 bot_user_id
 *   - 不承载业务决策
 */

const botUserDao = {
  /**
   * 根据 ID 查询用户
   * @param {string} botUserId
   * @returns {object|undefined}
   */
  getById(botUserId) {
    const db = getConnection();
    return db.prepare('SELECT * FROM bot_users WHERE bot_user_id = ?').get(botUserId);
  },

  /**
   * 创建或更新用户（upsert）
   * @param {{ bot_user_id: string, username?: string, first_name?: string }} data
   */
  upsert(data) {
    const db = getConnection();
    db.prepare(`
      INSERT INTO bot_users (bot_user_id, username, first_name)
      VALUES (?, ?, ?)
      ON CONFLICT(bot_user_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `).run(data.bot_user_id, data.username || null, data.first_name || null);
  },

  /**
   * 更新白名单状态
   * @param {string} botUserId
   * @param {number} isAllowed - 0 | 1
   */
  updateAllowed(botUserId, isAllowed) {
    const db = getConnection();
    db.prepare('UPDATE bot_users SET is_allowed = ? WHERE bot_user_id = ?')
      .run(isAllowed, botUserId);
  },

  /**
   * 更新角色
   * @param {string} botUserId
   * @param {string} role - 'USER' | 'ADMIN'
   */
  updateRole(botUserId, role) {
    const db = getConnection();
    db.prepare('UPDATE bot_users SET role = ? WHERE bot_user_id = ?')
      .run(role, botUserId);
  },

  /**
   * 获取所有允许的用户
   * @returns {Array}
   */
  getAllAllowed() {
    const db = getConnection();
    return db.prepare('SELECT * FROM bot_users WHERE is_allowed = 1').all();
  },
};

module.exports = botUserDao;