// src/db/strategy-config.dao.js
const { getConnection } = require('./connection');

/**
 * strategy_config 表 DAO
 *
 * 文档参考：§4.4
 *
 * 字段：mode / play_type / base_bet / martingale_ratio
 *       cut_off_seconds / is_running / current_direction / consecutive_losses
 */

const strategyConfigDao = {
  /**
   * 获取用户的策略配置
   * @param {string} botUserId
   * @returns {object|undefined}
   */
  getById(botUserId) {
    const db = getConnection();
    return db.prepare('SELECT * FROM strategy_config WHERE bot_user_id = ?').get(botUserId);
  },

  /**
   * 创建策略配置（登录成功后初始化）
   * @param {object} data
   */
  insert(data) {
    const db = getConnection();
    db.prepare(`
      INSERT INTO strategy_config
        (bot_user_id, mode, play_type, base_bet, martingale_ratio, cut_off_seconds)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.bot_user_id,
      data.mode || '2.84',
      data.play_type || '顺龙',
      data.base_bet || 100,
      data.martingale_ratio || 2.0,
      data.cut_off_seconds || 10
    );
  },

  /**
   * 更新配置字段（部分更新）
   * @param {string} botUserId
   * @param {object} fields - { mode?, play_type?, base_bet?, martingale_ratio?, cut_off_seconds? }
   */
  updateConfig(botUserId, fields) {
    const db = getConnection();
    const allowed = ['mode', 'play_type', 'base_bet', 'martingale_ratio', 'cut_off_seconds'];
    const sets = [];
    const values = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now', '+8 hours')");
    values.push(botUserId);

    db.prepare(`UPDATE strategy_config SET ${sets.join(', ')} WHERE bot_user_id = ?`)
      .run(...values);
  },

  /**
   * 启动策略（is_running = 1）
   * @param {string} botUserId
   */
  setRunning(botUserId) {
    const db = getConnection();
    db.prepare(`
      UPDATE strategy_config
      SET is_running = 1, updated_at = datetime('now', '+8 hours')
      WHERE bot_user_id = ?
    `).run(botUserId);
  },

  /**
   * 停止策略（is_running = 0）
   * @param {string} botUserId
   */
  setStopped(botUserId) {
    const db = getConnection();
    db.prepare(`
      UPDATE strategy_config
      SET is_running = 0, updated_at = datetime('now', '+8 hours')
      WHERE bot_user_id = ?
    `).run(botUserId);
  },

  /**
   * 更新连挂次数和当前方向（结算后调用）
   * @param {string} botUserId
   * @param {number} consecutiveLosses
   * @param {string|null} currentDirection
   */
  updateLossesAndDirection(botUserId, consecutiveLosses, currentDirection) {
    const db = getConnection();
    db.prepare(`
      UPDATE strategy_config
      SET consecutive_losses = ?, current_direction = ?, updated_at = datetime('now', '+8 hours')
      WHERE bot_user_id = ?
    `).run(consecutiveLosses, currentDirection, botUserId);
  },

  /**
   * 获取所有运行中的策略（§8.9 重启恢复）
   * @returns {Array}
   */
  getAllRunning() {
    const db = getConnection();
    return db.prepare('SELECT * FROM strategy_config WHERE is_running = 1').all();
  },

  /**
   * 获取运行中的策略（单用户）
   * @param {string} botUserId
   * @returns {object|undefined}
   */
  getRunning(botUserId) {
    const db = getConnection();
    return db.prepare('SELECT * FROM strategy_config WHERE bot_user_id = ? AND is_running = 1')
      .get(botUserId);
  },

  /**
   * 物理删除（删除账号流程 §8.8）
   * @param {string} botUserId
   */
  deleteByUser(botUserId) {
    const db = getConnection();
    db.prepare('DELETE FROM strategy_config WHERE bot_user_id = ?').run(botUserId);
  },
};

module.exports = strategyConfigDao;
