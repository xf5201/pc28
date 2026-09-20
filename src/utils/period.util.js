// src/utils/period.util.js
const logger = require('./logger');
const { getBeijingNow } = require('./format.util');

/**
 * 期号工具
 *
 * 文档参考：§14.5 期号格式
 *
 * 期号格式：YYYYMMDD-NNN
 * 示例：20260813-100
 *
 * 规则：
 *   - 日期部分：YYYYMMDD（8 位数字）
 *   - 序号部分：NNN（3 位数字，001-999）
 *   - 分隔符：-
 */

// 期号正则
const PERIOD_REGEX = /^(\d{4})(\d{2})(\d{2})-(\d{3})$/;

// 每天最大期数（根据实际平台调整）
const MAX_PERIODS_PER_DAY = 999;

/**
 * 校验期号格式
 *
 * @param {string} period - 期号字符串
 * @returns {boolean}
 */
function isValidPeriod(period) {
  if (!period || typeof period !== 'string') return false;
  return PERIOD_REGEX.test(period.trim());
}

/**
 * 解析期号
 *
 * @param {string} period - 期号字符串（如 20260813-100）
 * @returns {{
 *   date: string,        // 日期部分 '20260813'
 *   dateFormatted: string, // 格式化日期 '2026-08-13'
 *   seq: number,         // 序号 100
 *   year: number,        // 年 2026
 *   month: number,       // 月 8
 *   day: number          // 日 13
 * }|null}
 */
function parsePeriod(period) {
  if (!isValidPeriod(period)) {
    logger.warn(`[PERIOD_UTIL] 无效期号格式: ${period}`);
    return null;
  }

  const match = period.trim().match(PERIOD_REGEX);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const seq = parseInt(match[4], 10);
  const date = `${match[1]}${match[2]}${match[3]}`;
  const dateFormatted = `${match[1]}-${match[2]}-${match[3]}`;

  return {
    date,
    dateFormatted,
    seq,
    year,
    month,
    day,
  };
}

/**
 * 推导下一期期号
 *
 * 规则：
 *   - 序号递增
 *   - 达到 MAX_PERIODS_PER_DAY 时跨天（日期+1，序号重置为 001）
 *
 * @param {string} currentPeriod - 当前期号
 * @param {number} [maxPerDay=MAX_PERIODS_PER_DAY] - 每天最大期数
 * @returns {string} 下一期期号
 */
function getNextPeriod(currentPeriod, maxPerDay = MAX_PERIODS_PER_DAY) {
  const parsed = parsePeriod(currentPeriod);
  if (!parsed) {
    throw new Error(`无效期号格式: ${currentPeriod}`);
  }

  const { year, month, day, seq } = parsed;

  if (seq >= maxPerDay) {
    // 跨天
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + 1);

    const nextYear = date.getFullYear();
    const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
    const nextDay = String(date.getDate()).padStart(2, '0');

    return `${nextYear}${nextMonth}${nextDay}-001`;
  }

  // 同期递增
  const nextSeq = String(seq + 1).padStart(3, '0');
  return `${parsed.date}-${nextSeq}`;
}

/**
 * 推导上一期期号
 *
 * @param {string} currentPeriod
 * @returns {string}
 */
function getPrevPeriod(currentPeriod) {
  const parsed = parsePeriod(currentPeriod);
  if (!parsed) {
    throw new Error(`无效期号格式: ${currentPeriod}`);
  }

  const { year, month, day, seq } = parsed;

  if (seq <= 1) {
    // 跨天回退
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - 1);

    const prevYear = date.getFullYear();
    const prevMonth = String(date.getMonth() + 1).padStart(2, '0');
    const prevDay = String(date.getDate()).padStart(2, '0');

    return `${prevYear}${prevMonth}${prevDay}-${String(MAX_PERIODS_PER_DAY).padStart(3, '0')}`;
  }

  const prevSeq = String(seq - 1).padStart(3, '0');
  return `${parsed.date}-${prevSeq}`;
}

/**
 * 从期号中提取日期
 *
 * @param {string} period
 * @returns {string|null} YYYY-MM-DD 格式
 */
function extractDate(period) {
  const parsed = parsePeriod(period);
  return parsed ? parsed.dateFormatted : null;
}

/**
 * 从期号中提取序号
 *
 * @param {string} period
 * @returns {number|null}
 */
function extractSeq(period) {
  const parsed = parsePeriod(period);
  return parsed ? parsed.seq : null;
}

/**
 * 比较两个期号
 *
 * @param {string} periodA
 * @param {string} periodB
 * @returns {number} -1 / 0 / 1
 */
function comparePeriods(periodA, periodB) {
  if (periodA === periodB) return 0;
  return periodA < periodB ? -1 : 1;
}

/**
 * 判断 periodA 是否在 periodB 之前
 *
 * @param {string} periodA
 * @param {string} periodB
 * @returns {boolean}
 */
function isBefore(periodA, periodB) {
  return comparePeriods(periodA, periodB) < 0;
}

/**
 * 判断 periodA 是否在 periodB 之后
 *
 * @param {string} periodA
 * @param {string} periodB
 * @returns {boolean}
 */
function isAfter(periodA, periodB) {
  return comparePeriods(periodA, periodB) > 0;
}

/**
 * 生成当前时间对应的期号（用于测试）
 *
 * @param {Date} [date=getBeijingNow()]
 * @param {number} [seq=1]
 * @returns {string}
 */
function generatePeriod(date = getBeijingNow(), seq = 1) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seqStr = String(seq).padStart(3, '0');

  return `${year}${month}${day}-${seqStr}`;
}

module.exports = {
  isValidPeriod,
  parsePeriod,
  getNextPeriod,
  getPrevPeriod,
  extractDate,
  extractSeq,
  comparePeriods,
  isBefore,
  isAfter,
  generatePeriod,
  MAX_PERIODS_PER_DAY,
};
