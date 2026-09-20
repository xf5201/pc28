// src/db/open-result.dao.js
const { getConnection } = require('./connection');

/**
 * open_results 表 DAO
 *
 * 文档参考：§4.5
 *
 * 独立公共表（不关联 bot_user_id）
 * UNIQUE(period) 防重 → 幂等插入
 */

const openResultDao = {
  /**
   * 插入开奖结果（UNIQUE period 防重）
   * @param {object} data
   * @returns {boolean} 是否插入成功（false = 已存在）
   */
  insert(data) {
    const db = getConnection();
    try {
      db.prepare(`
        INSERT INTO open_results (period, open_number, open_text, direction, open_time, next_period, next_open_time, source, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.period,
        data.open_number || null,
        data.open_text,
        data.direction,
        data.open_time,
        data.next_period || null,
        data.next_open_time || null,
        data.source || 'crawler',
        data.raw_payload || null
      );
      return true;
    } catch (error) {
      // UNIQUE constraint failed → 幂等，忽略
      if (error.message && error.message.includes('UNIQUE')) {
        return false;
      }
      throw error;
    }
  },

  /**
   * 根据期号查询
   * @param {string} period
   * @returns {object|undefined}
   */
  getByPeriod(period) {
    const db = getConnection();
    return db.prepare('SELECT * FROM open_results WHERE period = ?').get(period);
  },

  /**
   * 获取最新一条开奖结果
   * @returns {object|undefined}
   */
  getLatest() {
    const db = getConnection();
    return db.prepare('SELECT * FROM open_results ORDER BY open_time DESC LIMIT 1').get();
  },

  /**
   * 获取最近 N 条开奖结果
   * @param {number} limit
   * @returns {Array}
   */
  getRecent(limit = 10) {
    const db = getConnection();
    return db.prepare('SELECT * FROM open_results ORDER BY open_time DESC LIMIT ?').all(limit);
  },

  /**
   * 获取本地已记录的最大期号序号（跳期补录的基准）
   *
   * 期号格式 YYYYMMDD-N...，序号部分为全局递增整数。
   * 首次运行（表为空）时返回 0。
   *
   * @returns {number}
   */
  getMaxTerm() {
    const db = getConnection();
    const row = db.prepare(`
      SELECT MAX(CAST(substr(period, instr(period, '-') + 1) AS INTEGER)) AS max_term
      FROM open_results
    `).get();
    return row && row.max_term !== null ? Number(row.max_term) : 0;
  },

  /**
   * 根据下一期期号查询（用于判断是否需要结算）
   * @param {string} nextPeriod
   * @returns {object|undefined}
   */
  getByNextPeriod(nextPeriod) {
    const db = getConnection();
    return db.prepare('SELECT * FROM open_results WHERE next_period = ?').get(nextPeriod);
  },
};

module.exports = openResultDao;