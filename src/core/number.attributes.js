// src/core/number.attributes.js
const logger = require('../utils/logger');

/**
 * 号码属性分析引擎
 *
 * 文档参考：§9.5
 *
 * 职责：
 *   - 解析开奖文本 → 提取三个数字
 *   - 计算总和
 *   - 判定大小 / 单双
 *   - 判定特殊号码：顺子 / 对子 / 豹子 / 13-14
 *   - 判定回本（区分 2.17 / 2.84 赔率模式）
 *
 * 方向枚举（§14.1）：
 *   BIG   → 总和 >= 14
 *   SMALL → 总和 <= 13
 *   ODD   → 总和为奇数
 *   EVEN  → 总和为偶数
 *
 * 回本规则：
 *   2.84 模式 → 豹子、对子、顺子、13、14 全部回本
 *   2.17 模式 → 仅和值为 13 或 14 时回本
 */

/**
 * 分析开奖号码
 *
 * @param {string|number[]} openText - 原始开奖文本或数字数组
 *   支持格式：
 *     - "3,5,8"
 *     - "3+5+8=16"
 *     - "第 100 期：3+5+8=16"
 *     - [3, 5, 8]
 * @returns {{
 *   digits: number[],
 *   sum: number,
 *   size: string,
 *   parity: string,
 *   isShunzi: boolean,
 *   isDuizi: boolean,
 *   isBaozi: boolean,
 *   is1314: boolean,
 *   direction: string,
 *   raw: string
 * }|null}
 */
function analyzeNumber(openText) {
  const digits = extractDigits(openText);

  if (!digits || digits.length !== 3) {
    logger.error(`[NUMBER_ATTR] 无法解析开奖号码: ${openText}`);
    return null;
  }

  const [a, b, c] = digits;
  const sum = a + b + c;

  // 大小判定：总和 >= 14 为大，<= 13 为小
  const size = sum >= 14 ? 'BIG' : 'SMALL';

  // 单双判定：总和为偶数为双，奇数为单
  const parity = sum % 2 === 0 ? 'EVEN' : 'ODD';

  // 排序后用于顺子判断
  const sorted = [...digits].sort((x, y) => x - y);

  // 豹子：三个数字完全相同（如 1,1,1 / 2,2,2 / 9,9,9）
  const isBaozi = (a === b && b === c);

  // 对子：有两个数字相同，但不是豹子（如 0,0,1 / 0,1,1 / 3,0,3）
  const isDuizi = !isBaozi && (a === b || b === c || a === c);

  // 顺子：三个数字连续且不重复（如 0,1,2 / 1,2,3 / 3,2,4 → 排序后 2,3,4）
  const isShunzi = !isBaozi && !isDuizi &&
    (sorted[1] - sorted[0] === 1) &&
    (sorted[2] - sorted[1] === 1);

  // 13/14：总和为 13 或 14
  const is1314 = (sum === 13 || sum === 14);

  // 综合方向码（默认使用大小）
  const direction = size;

  return {
    digits,
    sum,
    size,
    parity,
    isShunzi,
    isDuizi,
    isBaozi,
    is1314,
    direction,
    raw: String(openText),
  };
}

/**
 * 从开奖文本中提取三个数字
 *
 * @param {string|number[]} input
 * @returns {number[]|null}
 */
function extractDigits(input) {
  // 数组输入
  if (Array.isArray(input)) {
    const nums = input.map(Number);
    if (nums.length === 3 && nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 9)) {
      return nums;
    }
    return null;
  }

  if (typeof input !== 'string') return null;

  const text = input.trim();

  // 格式 1："3,5,8" 或 "3，5，8"
  const commaMatch = text.match(/(\d+)\s*[,，]\s*(\d+)\s*[,，]\s*(\d+)/);
  if (commaMatch) {
    return [parseInt(commaMatch[1], 10), parseInt(commaMatch[2], 10), parseInt(commaMatch[3], 10)];
  }

  // 格式 2："3+5+8=16" 或 "3 + 5 + 8 = 16"
  const plusMatch = text.match(/(\d+)\s*\+\s*(\d+)\s*\+\s*(\d+)/);
  if (plusMatch) {
    return [parseInt(plusMatch[1], 10), parseInt(plusMatch[2], 10), parseInt(plusMatch[3], 10)];
  }

  // 格式 3：从完整文本中提取 "X+Y+Z=W" 模式
  const fullMatch = text.match(/(\d)\s*\+\s*(\d)\s*\+\s*(\d)\s*=\s*(\d+)/);
  if (fullMatch) {
    return [parseInt(fullMatch[1], 10), parseInt(fullMatch[2], 10), parseInt(fullMatch[3], 10)];
  }

  // 格式 4：纯数字文本 "358"（三个独立数字）
  const pureMatch = text.match(/^(\d)(\d)(\d)$/);
  if (pureMatch) {
    return [parseInt(pureMatch[1], 10), parseInt(pureMatch[2], 10), parseInt(pureMatch[3], 10)];
  }

  return null;
}

/**
 * 判定开奖方向（用于策略引擎）
 *
 * @param {string} openText - 开奖文本
 * @returns {{ size: string, parity: string }|null}
 */
function getDirection(openText) {
  const result = analyzeNumber(openText);
  if (!result) return null;

  return {
    size: result.size,     // 'BIG' | 'SMALL'
    parity: result.parity, // 'ODD' | 'EVEN'
  };
}

/**
 * 判断是否回本号码
 *
 * PC28 回本规则（根据赔率模式区分）：
 *   2.84 模式（高赔率）：豹子、对子、顺子、13、14 全部回本
 *   2.17 模式（低赔率）：仅和值为 13 或 14 时回本
 *
 * 判断逻辑：
 *   豹子 → 三个数字全相同（111, 222, 999）
 *   对子 → 有两个数字相同但不是豹子（011, 303, 001）
 *   顺子 → 三个数字连续且不重复（012, 123, 324, 201, 576）
 *   13/14 → 和值为 13 或 14
 *
 * @param {string} openText - 开奖文本
 * @param {string} mode - 赔率模式 ('2.17' | '2.84')
 * @returns {boolean}
 */
function isRebateNumber(openText, mode) {
  const result = analyzeNumber(openText);
  if (!result) return false;

  // 2.84 模式：豹子、对子、顺子、13、14 全部回本
  if (mode === '2.84') {
    return result.isBaozi || result.isDuizi || result.isShunzi || result.is1314;
  }

  // 2.17 模式：仅和值为 13 或 14 时回本
  return result.is1314;
}

module.exports = {
  analyzeNumber,
  extractDigits,
  getDirection,
  isRebateNumber,
};