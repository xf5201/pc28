// src/db/profit-log.dao.js
const { getConnection } = require('./connection');

/**
 * profit_logs 表 DAO
 *
 * 文档参考：§4.7
 *
 * UNIQUE(bet_record_id) → 一条下注只有一条盈亏记录 → 幂等
 */

const profitLogDao = {
  /**
   * 插入盈亏记录（UNIQUE bet_record_id 防重）
   * @param {object} data
   * @returns {boolean} 是否插入成功
   */
  insert(data) {
    const db = getConnection();
    try {
      db.prepare(`
        INSERT INTO profit_logs (bot_user_id, bet_record_id, period, bet_amount, profit_loss, is_win, is_rebate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.bot_user_id,
        data.bet_record_id,
        data.period,
        data.bet_amount,
        data.profit_loss,
        data.is_win ? 1 : 0,
        data.is_rebate ? 1 : 0
      );
      return true;
    } catch (error) {
      // UNIQUE constraint → 幂等
      if (error.message && error.message.includes('UNIQUE')) {
        return false;
      }
      throw error;
    }
  },

  /**
   * 获取用户某日期的盈亏记录
   * @param {string} botUserId
   * @param {string} startDate - 'YYYY-MM-DD'
   * @param {string} endDate - 'YYYY-MM-DD'（不含）
   * @returns {Array}
   */
  listByDateRange(botUserId, startDate, endDate) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM profit_logs
      WHERE bot_user_id = ? AND created_at >= ? AND created_at < ?
      ORDER BY created_at DESC
    `).all(botUserId, startDate, endDate);
  },

  /**
   * 统计用户某日期的盈亏汇总
   * @param {string} botUserId
   * @param {string} startDate
   * @param {string} endDate
   * @returns {{ totalProfit: number, winCount: number, loseCount: number, rebateCount: number }}
   */
  summarizeByDateRange(botUserId, startDate, endDate) {
    const db = getConnection();
    return db.prepare(`
      SELECT
        COALESCE(SUM(profit_loss), 0) as totalProfit,
        COALESCE(SUM(CASE WHEN is_win = 1 AND is_rebate = 0 THEN 1 ELSE 0 END), 0) as winCount,
        COALESCE(SUM(CASE WHEN is_win = 0 AND is_rebate = 0 THEN 1 ELSE 0 END), 0) as loseCount,
        COALESCE(SUM(CASE WHEN is_rebate = 1 THEN 1 ELSE 0 END), 0) as rebateCount
      FROM profit_logs
      WHERE bot_user_id = ? AND created_at >= ? AND created_at < ?
    `).get(botUserId, startDate, endDate);
  },

  /**
   * 获取用户总盈亏
   * @param {string} botUserId
   * @returns {number}
   */
  getTotalProfit(botUserId) {
    const db = getConnection();
    const row = db.prepare(`
      SELECT COALESCE(SUM(profit_loss), 0) as total
      FROM profit_logs WHERE bot_user_id = ?
    `).get(botUserId);
    return row.total;
  },

  /**
   * 物理删除用户所有盈亏记录（删除账号 §8.8）
   * @param {string} botUserId
   */
  deleteByUser(botUserId) {
    const db = getConnection();
    db.prepare('DELETE FROM profit_logs WHERE bot_user_id = ?').run(botUserId);
  },

  /**
   * 删除用户指定日期的盈亏记录
   * @param {string} botUserId
   * @param {string} date - 'YYYY-MM-DD'
   */
  deleteByUserAndDate(botUserId, date) {
    const db = getConnection();
    db.prepare('DELETE FROM profit_logs WHERE bot_user_id = ? AND DATE(created_at) = ?').run(botUserId, date);
  },
};

module.exports = profitLogDao;
