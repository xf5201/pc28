// src/db/bet-record.dao.js
const { getConnection } = require('./connection');

/**
 * bet_records 表 DAO
 *
 * 文档参考：§4.6
 *
 * 状态：CREATED | SENT | PENDING | SETTLED | FAILED | CANCELED
 * 终态：SETTLED / FAILED / CANCELED
 *
 * UNIQUE(bot_user_id, period) → 一期一注
 * 结算入口状态：SENT 或 PENDING
 */

const betRecordDao = {
  /**
   * 创建下注记录（status = CREATED）
   * @param {object} data
   * @returns {number} 插入的 ID
   */
  insert(data) {
    const db = getConnection();
    const result = db.prepare(`
      INSERT INTO bet_records
        (bot_user_id, strategy_config_id, period, direction, bet_amount, mode, odds, status, target_chat_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', ?)
    `).run(
      data.bot_user_id,
      data.strategy_config_id,
      data.period,
      data.direction,
      data.bet_amount,
      data.mode,
      data.odds,
      data.target_chat_id || null
    );
    return result.lastInsertRowid;
  },

  /**
   * 根据 ID 查询
   * @param {number} id
   * @returns {object|undefined}
   */
  getById(id) {
    const db = getConnection();
    return db.prepare('SELECT * FROM bet_records WHERE id = ?').get(id);
  },

  /**
   * 根据用户和期号查询（一期一注校验）
   * @param {string} botUserId
   * @param {string} period
   * @returns {object|undefined}
   */
  getByUserAndPeriod(botUserId, period) {
    const db = getConnection();
    return db.prepare('SELECT * FROM bet_records WHERE bot_user_id = ? AND period = ?')
      .get(botUserId, period);
  },

  /**
   * 更新状态为 SENT（发送成功）
   * @param {number} id
   * @param {number} messageId
   */
  markSent(id, messageId) {
    const db = getConnection();
    db.prepare(`
      UPDATE bet_records
      SET status = 'SENT', message_id = ?, bet_time = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(messageId, id);
  },

  /**
   * 更新状态为 PENDING（等待回执）
   * @param {number} id
   */
  markPending(id) {
    const db = getConnection();
    db.prepare(`
      UPDATE bet_records SET status = 'PENDING' WHERE id = ?
    `).run(id);
  },

  /**
   * 结算（§14.3 结算公式）
   * @param {number} id
   * @param {{ isWin: boolean, isRebate: boolean, profitLoss: number }} result
   */
  settle(id, result) {
    const db = getConnection();
    db.prepare(`
      UPDATE bet_records
      SET status = 'SETTLED',
          is_win = ?,
          is_rebate = ?,
          profit_loss = ?,
          settled_at = datetime('now', '+8 hours')
      WHERE id = ? AND status IN ('SENT', 'PENDING')
    `).run(
      result.isWin ? 1 : 0,
      result.isRebate ? 1 : 0,
      result.profitLoss,
      id
    );
  },

  /**
   * 标记失败（发送失败 → FAILED，不进 PENDING）
   * @param {number} id
   * @param {string} failReason
   */
  markFailed(id, failReason) {
    const db = getConnection();
    db.prepare(`
      UPDATE bet_records
      SET status = 'FAILED', fail_reason = ?
      WHERE id = ?
    `).run(failReason, id);
  },

  /**
   * 标记取消
   * @param {number} id
   * @param {string} reason
   */
  markCanceled(id, reason) {
    const db = getConnection();
    db.prepare(`
      UPDATE bet_records
      SET status = 'CANCELED', fail_reason = ?
      WHERE id = ? AND status NOT IN ('SETTLED', 'FAILED', 'CANCELED')
    `).run(reason || null, id);
  },

  /**
   * 获取某期所有待结算的下注（结算入口）
   * @param {string} period
   * @returns {Array}
   */
  listPendingByPeriod(period) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM bet_records
      WHERE status IN ('SENT', 'PENDING') AND period = ?
    `).all(period);
  },

  /**
   * 获取用户的所有待结算下注（重启恢复 §8.9）
   * @param {string} botUserId
   * @returns {Array}
   */
  listPendingByUser(botUserId) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM bet_records
      WHERE bot_user_id = ? AND status IN ('SENT', 'PENDING')
    `).all(botUserId);
  },

  /**
   * 获取用户最近的 N 条下注记录
   * @param {string} botUserId
   * @param {number} limit
   * @returns {Array}
   */
  listRecentByUser(botUserId, limit = 20) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM bet_records
      WHERE bot_user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(botUserId, limit);
  },

  /**
   * 获取用户某日期的已结算记录（报表用）
   * @param {string} botUserId
   * @param {string} startDate
   * @param {string} endDate
   * @param {number} limit
   * @param {number} offset
   * @returns {Array}
   */
  listSettledByDateRange(botUserId, startDate, endDate, limit, offset) {
    const db = getConnection();
    let sql = `
      SELECT * FROM bet_records
      WHERE bot_user_id = ? AND status = 'SETTLED'
    `;
    const params = [botUserId];

    if (startDate) {
      sql += ' AND settled_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND settled_at < ?';
      params.push(endDate);
    }

    sql += ' ORDER BY settled_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(sql).all(...params);
  },

  /**
   * 统计用户某日期的已结算记录数
   * @param {string} botUserId
   * @param {string} startDate
   * @param {string} endDate
   * @returns {number}
   */
  countSettledByDateRange(botUserId, startDate, endDate) {
    const db = getConnection();
    let sql = `
      SELECT COUNT(*) as count FROM bet_records
      WHERE bot_user_id = ? AND status = 'SETTLED'
    `;
    const params = [botUserId];

    if (startDate) {
      sql += ' AND settled_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND settled_at < ?';
      params.push(endDate);
    }

    return db.prepare(sql).get(...params).count;
  },

  /**
   * 获取用户最近一条下注记录（不限状态）
   *
   * 按「期号序号」降序排序（而非 created_at），
   * 确保跳期判断拿到的是期号上真正最近的一注。
   *
   * @param {string} botUserId
   * @returns {object|undefined}
   */
  getLatestByUser(botUserId) {
    const db = getConnection();
    return db.prepare(`
      SELECT * FROM bet_records
      WHERE bot_user_id = ?
      ORDER BY CAST(substr(period, instr(period, '-') + 1) AS INTEGER) DESC, id DESC
      LIMIT 1
    `).get(botUserId);
  },

  /**
   * 取消所有过期未发出的下注（status = CREATED 且期号已开奖）
   *
   * 用于跳期补录场景：停机期间停留在 CREATED 的下注已不可能发出，
   * 若不清理会永久悬挂（既不发送也不结算）。
   *
   * 边界说明：使用「<=」而非「<」。
   * 传入的 openedTerm 是「已开奖的最新期号」，该期及更早的所有 CREATED
   * 记录都对应已开奖的期次，必须一并取消；而下一期（openedTerm + 1）的
   * CREATED 记录正处于 15 秒延迟发送窗口内，必须保留。
   *
   * @param {number} openedTerm - 已开奖的最新期号序号
   * @returns {number} 受影响行数
   */
  cancelStaleCreated(openedTerm) {
    const db = getConnection();
    return db.prepare(`
      UPDATE bet_records
      SET status = 'CANCELED', fail_reason = ?
      WHERE status = 'CREATED'
        AND CAST(substr(period, instr(period, '-') + 1) AS INTEGER) <= ?
    `).run('跳期补录：期号已开奖，未发送', openedTerm).changes;
  },

  /**
   * 物理删除用户所有下注记录（删除账号 §8.8）
   * @param {string} botUserId
   */
  deleteByUser(botUserId) {
    const db = getConnection();
    db.prepare('DELETE FROM bet_records WHERE bot_user_id = ?').run(botUserId);
  },
};

module.exports = betRecordDao;