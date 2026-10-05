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
   * 按期号序号（term）查询
   *
   * term 是期次的稳定标识：旧版时区 bug 曾导致同一期的 period 字符串
   * 在 bet_records 与 open_results 间不一致，跨表对账必须用 term。
   * 若历史数据存在同 term 多行（日期前缀不同），取最新一条。
   *
   * @param {number} term
   * @returns {object|undefined}
   */
  getByTerm(term) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM open_results
      WHERE CAST(substr(period, instr(period, '-') + 1) AS INTEGER) = ?
      ORDER BY id DESC LIMIT 1
    `).get(term);
  },

  /**
   * 获取本地已记录的期号序号集合（补录对账用）
   *
   * 有 term 表达式索引(migrations/002),走索引扫描不随表增长变慢。
   * 传入 minTerm 时只返回 >= minTerm 的 term(爬虫只关心数据源窗口内的缺失),
   * 结果集大小受控于窗口而非全表。
   *
   * @param {number} [minTerm] - 只返回 >= 该序号的 term
   * @returns {Set<number>}
   */
  getAllTerms(minTerm) {
    const db = getConnection();
    const rows = Number.isFinite(minTerm)
      ? db.prepare(`
          SELECT DISTINCT CAST(substr(period, instr(period, '-') + 1) AS INTEGER) AS term
          FROM open_results
          WHERE CAST(substr(period, instr(period, '-') + 1) AS INTEGER) >= ?
        `).all(minTerm)
      : db.prepare(`
          SELECT DISTINCT CAST(substr(period, instr(period, '-') + 1) AS INTEGER) AS term
          FROM open_results
        `).all();
    return new Set(rows.map((r) => Number(r.term)));
  },

  /**
   * 清理过早的开奖记录（保留策略）
   *
   * open_results 每约 210 秒增长一期(约 410 期/天),不清理会无限膨胀。
   * 保留天数必须大于数据源可回溯的补录窗口(实测 10000 期 ≈ 24 天),
   * 否则会误删仍可补录的数据。历史注单/盈亏(bet_records/profit_logs)不清理。
   *
   * @param {number} days - 保留最近 N 天
   * @returns {number} 删除行数
   */
  pruneBeforeDays(days) {
    const db = getConnection();
    return db.prepare(`
      DELETE FROM open_results
      WHERE open_time < datetime('now', '+8 hours', ?)
    `).run(`-${days} days`).changes;
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