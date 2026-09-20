// src/utils/mask.util.js

/**
 * 脱敏工具
 *
 * 文档参考：§12.3 日志脱敏
 *
 * 禁止记录：
 *   - 完整手机号（必须脱敏）
 *   - Session 字符串
 *   - Bot Token
 *   - API Hash / API ID 组合
 *   - 2FA 密码
 *   - 用户发来的验证码原文
 */

/**
 * 手机号脱敏
 *
 * 规则：保留前 3 位 + 后 4 位，中间用 **** 替换
 *
 * 示例：
 *   +8613812341234 → +86138****1234
 *   13812341234    → 138****1234
 *   +1234567890    → +12****7890
 *
 * @param {string} phone - 手机号
 * @returns {string} 脱敏后的手机号
 */
function maskPhone(phone) {
  if (!phone) return '***';

  const str = String(phone);

  // 长度不足 7 位 → 全部替换
  if (str.length < 7) {
    return '*'.repeat(str.length);
  }

  // 找到数字部分
  const hasPlus = str.startsWith('+');
  const digits = hasPlus ? str.substring(1) : str;

  if (digits.length < 7) {
    return '*'.repeat(str.length);
  }

  // 保留前 3 后 4
  const prefix = hasPlus ? '+' : '';
  const visiblePrefix = digits.substring(0, 3);
  const visibleSuffix = digits.substring(digits.length - 4);
  const masked = '*'.repeat(digits.length - 7);

  return `${prefix}${visiblePrefix}${masked}${visibleSuffix}`;
}

/**
 * Session 字符串脱敏
 *
 * 规则：全部替换为 ****
 *
 * @param {string} session - Session 字符串
 * @returns {string} 固定返回 '****'
 */
function maskSession(session) {
  return '****';
}

/**
 * 验证码 / 2FA 密码脱敏
 *
 * 规则：全部替换为 ****
 *
 * @param {string} code - 验证码或密码
 * @returns {string} 固定返回 '****'
 */
function maskCode(code) {
  return '****';
}

/**
 * Bot Token 脱敏
 *
 * 规则：保留前 5 位 + 后 5 位，中间用 **** 替换
 *
 * 示例：
 *   123456789:ABCdefGHIjklMNOpqrSTU → 12345****qrSTU
 *
 * @param {string} token - Bot Token
 * @returns {string} 脱敏后的 Token
 */
function maskToken(token) {
  if (!token) return '***';

  const str = String(token);

  if (str.length < 10) {
    return '*'.repeat(str.length);
  }

  const prefix = str.substring(0, 5);
  const suffix = str.substring(str.length - 5);
  const masked = '*'.repeat(Math.max(4, str.length - 10));

  return `${prefix}${masked}${suffix}`;
}

/**
 * API Hash 脱敏
 *
 * 规则：全部替换为 ****
 *
 * @param {string} hash
 * @returns {string}
 */
function maskApiHash(hash) {
  return '****';
}

/**
 * 通用字符串脱敏（保留首尾各 N 位）
 *
 * @param {string} str - 原始字符串
 * @param {number} [keepStart=3] - 保留开头位数
 * @param {number} [keepEnd=3] - 保留结尾位数
 * @returns {string}
 */
function maskGeneric(str, keepStart = 3, keepEnd = 3) {
  if (!str) return '***';

  const s = String(str);
  const totalKeep = keepStart + keepEnd;

  if (s.length <= totalKeep) {
    return '*'.repeat(s.length);
  }

  const prefix = s.substring(0, keepStart);
  const suffix = s.substring(s.length - keepEnd);
  const masked = '*'.repeat(s.length - totalKeep);

  return `${prefix}${masked}${suffix}`;
}

module.exports = {
  maskPhone,
  maskSession,
  maskCode,
  maskToken,
  maskApiHash,
  maskGeneric,
};