// src/utils/format.util.js

/**
 * 格式化工具
 *
 * 用途：
 *   - 日期格式化（用于报表、日志等）
 *   - 金额格式化（带正负号、千分位）
 *   - 时长格式化
 */

/**
 * 日期格式化
 *
 * 支持的占位符：
 *   YYYY - 四位年份
 *   MM   - 两位月份
 *   DD   - 两位日期
 *   HH   - 两位小时（24 小时制）
 *   mm   - 两位分钟
 *   ss   - 两位秒
 *
 * @param {Date|string|number} date - 日期
 * @param {string} [format='YYYY-MM-DD HH:mm:ss'] - 格式字符串
 * @returns {string}
 */
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '';

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const replacements = {
    YYYY: String(d.getFullYear()),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    DD: String(d.getDate()).padStart(2, '0'),
    HH: String(d.getHours()).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0'),
  };

  let result = format;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(key, value);
  }

  return result;
}

/**
 * 格式化盈亏金额
 *
 * 规则：
 *   正数 → +1,250
 *   负数 → -500
 *   零   → 0
 *
 * @param {number} amount - 金额
 * @returns {string}
 */
function formatProfit(amount) {
  if (amount === null || amount === undefined) return '0';

  const num = Number(amount);
  if (isNaN(num)) return '0';

  if (num === 0) return '0';

  const absStr = Math.abs(num).toLocaleString('en-US');
  return num > 0 ? `+${absStr}` : `-${absStr}`;
}

/**
 * 格式化金额（不带正负号）
 *
 * @param {number} amount
 * @returns {string}
 */
function formatAmount(amount) {
  if (amount === null || amount === undefined) return '0';

  const num = Number(amount);
  if (isNaN(num)) return '0';

  return num.toLocaleString('en-US');
}

/**
 * 格式化时长
 *
 * @param {number} ms - 毫秒数
 * @returns {string} 例如 "2h 15m 30s"
 */
function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours % 24 > 0) parts.push(`${hours % 24}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

  return parts.join(' ');
}

/**
 * 格式化百分比
 *
 * @param {number} value - 小数（0.625）或整数（62.5）
 * @param {number} [decimals=1] - 小数位数
 * @param {boolean} [isDecimal=true] - 是否为小数形式
 * @returns {string} 例如 "62.5%"
 */
function formatPercent(value, decimals = 1, isDecimal = true) {
  if (value === null || value === undefined) return '0%';

  const num = Number(value);
  if (isNaN(num)) return '0%';

  const percent = isDecimal ? num * 100 : num;
  return `${percent.toFixed(decimals)}%`;
}

/**
 * 格式化胜率
 *
 * @param {number} winCount - 胜利次数
 * @param {number} totalCount - 总次数
 * @returns {string} 例如 "62.5%"
 */
function formatWinRate(winCount, totalCount) {
  if (!totalCount || totalCount === 0) return '0%';

  const rate = winCount / totalCount;
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * 截断字符串
 *
 * @param {string} str - 原始字符串
 * @param {number} maxLength - 最大长度
 * @param {string} [suffix='...'] - 截断后缀
 * @returns {string}
 */
function truncate(str, maxLength, suffix = '...') {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

// ═══════════════════════════════════════════
// 北京时间工具函数
// ═══════════════════════════════════════════

/**
 * 获取当前北京时间（Date 对象）
 * 无论服务器在哪个时区，都返回 UTC+8 的时间
 * @returns {Date}
 */
function getBeijingNow() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 3600000 * 8);
}

/**
 * 获取当前北京时间的格式化字符串
 * @param {string} [format='YYYY-MM-DD HH:mm:ss'] - 格式
 * @returns {string}
 */
function getBeijingNowString(format = 'YYYY-MM-DD HH:mm:ss') {
  return formatDate(getBeijingNow(), format);
}

/**
 * 将任意时间转为北京时间字符串
 * @param {Date|string} date - 源时间
 * @param {string} [format='YYYY-MM-DD HH:mm:ss'] - 格式
 * @returns {string}
 */
function toBeijingTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  const d = date instanceof Date ? date : new Date(date);
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  return formatDate(new Date(utcMs + 3600000 * 8), format);
}

module.exports = {
  formatDate,
  formatProfit,
  formatAmount,
  formatDuration,
  formatPercent,
  formatWinRate,
  truncate,
  getBeijingNow,
  getBeijingNowString,
  toBeijingTime,
};
