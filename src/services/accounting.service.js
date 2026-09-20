// src/services/accounting.service.js
const profitLogDao = require('../db/profit-log.dao');
const betRecordDao = require('../db/bet-record.dao');
const logger = require('../utils/logger');

/**
 * 盈亏统计服务
 *
 * 文档参考：§9.12, §7.8
 *
 * 接口：
 *   getDailyProfit(botUserId, date)
 *   getPeriodProfit(botUserId, start, end, options?)
 *   getTotalProfit(botUserId)
 */
class AccountingService {
  /**
   * 获取日报数据
   *
   * @param {string} botUserId
   * @param {string} date - 格式 'YYYY-MM-DD'
   * @returns {{
   *   totalProfit: number,
   *   winCount: number,
   *   loseCount: number,
   *   rebateCount: number,
   *   winRate: string
   * }}
   */
  async getDailyProfit(botUserId, date) {
    const startDate = `${date} 00:00:00`;
    const endDate = this._nextDay(date);

    const summary = profitLogDao.summarizeByDateRange(botUserId, startDate, endDate);

    const totalBets = summary.winCount + summary.loseCount;
    const winRate = totalBets > 0
      ? `${((summary.winCount / totalBets) * 100).toFixed(1)}%`
      : '0%';

    return {
      totalProfit: summary.totalProfit,
      winCount: summary.winCount,
      loseCount: summary.loseCount,
      rebateCount: summary.rebateCount,
      winRate,
    };
  }

  /**
   * 获取周期盈亏数据（周报/月报/明细）
   *
   * @param {string} botUserId
   * @param {string|null} startDate - 'YYYY-MM-DD'
   * @param {string|null} endDate - 'YYYY-MM-DD'
   * @param {{ page?: number, pageSize?: number }} [options] - 分页选项（明细用）
   * @returns {object}
   */
  async getPeriodProfit(botUserId, startDate, endDate, options = {}) {
    const start = startDate ? `${startDate} 00:00:00` : '2000-01-01 00:00:00';
    const end = endDate ? `${endDate} 23:59:59` : '2099-12-31 23:59:59';

    // 如果有分页参数 → 返回明细
    if (options.page && options.pageSize) {
      return this._getDetail(botUserId, startDate, endDate, options);
    }

    // 否则返回汇总
    const summary = profitLogDao.summarizeByDateRange(botUserId, start, end);

    const totalBets = summary.winCount + summary.loseCount;
    const winRate = totalBets > 0
      ? `${((summary.winCount / totalBets) * 100).toFixed(1)}%`
      : '0%';

    return {
      totalProfit: summary.totalProfit,
      winCount: summary.winCount,
      loseCount: summary.loseCount,
      rebateCount: summary.rebateCount,
      winRate,
    };
  }

  /**
   * 获取总盈亏
   *
   * @param {string} botUserId
   * @returns {number}
   */
  async getTotalProfit(botUserId) {
    return profitLogDao.getTotalProfit(botUserId);
  }

  /**
   * 获取盈亏明细（分页）
   *
   * @private
   */
  async _getDetail(botUserId, startDate, endDate, { page, pageSize }) {
    const start = startDate ? `${startDate} 00:00:00` : '2000-01-01 00:00:00';
    const end = endDate ? `${endDate} 23:59:59` : '2099-12-31 23:59:59';

    const offset = (page - 1) * pageSize;

    const records = betRecordDao.listSettledByDateRange(
      botUserId,
      start,
      end,
      pageSize,
      offset
    );

    const totalCount = betRecordDao.countSettledByDateRange(
      botUserId,
      start,
      end
    );

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      records: records.map((r) => ({
        period: r.period,
        direction: r.direction,
        betAmount: r.bet_amount,
        profitLoss: r.profit_loss,
        isWin: r.is_win === 1,
        isRebate: r.is_rebate === 1,
        settledAt: r.settled_at,
      })),
      page,
      pageSize,
      totalCount,
      totalPages,
    };
  }

  /**
   * 计算下一天的日期字符串
   * @private
   */
  _nextDay(dateStr) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day} 00:00:00`;
  }
}

module.exports = AccountingService;