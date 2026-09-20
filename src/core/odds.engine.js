// src/core/odds.engine.js
const logger = require('../utils/logger');

/**
 * 赔率计算引擎
 *
 * 文档参考：§9.4, §14.3
 *
 * 赔率模式：
 *   - 2.17 → 赔率 2.17（净赔率 1.17）
 *   - 2.84 → 赔率 2.84（净赔率 1.84）
 *
 * 结算公式（§14.3）：
 *   is_win = true  → profit_loss = bet_amount × (odds - 1)
 *   is_win = false → profit_loss = -bet_amount
 *   is_rebate = true → profit_loss = 0
 */

// 赔率配置表
const ODDS_TABLE = {
  '2.17': {
    // 大小单双基础赔率
    base: 2.17,
    // 净赔率
    net: 1.17,
    // 特殊号码赔率（豹子/顺子/13-14 不参与正常结算）
    special: {
      baozi: 0,     // 豹子 → 回本
      shunzi: 0,    // 顺子 → 回本（部分平台）
      is1314: 0,    // 13/14 → 回本
    },
  },
  '2.84': {
    base: 2.84,
    net: 1.84,
    special: {
      baozi: 0,
      shunzi: 0,
      is1314: 0,
    },
  },
};

/**
 * 获取赔率
 *
 * @param {string} mode - 赔率模式：'2.17' | '2.84'
 * @param {string} playType - 玩法：'顺龙' | '反龙' | '小刚'
 * @param {string} [digit] - 具体方向：'BIG' | 'SMALL' | 'ODD' | 'EVEN'（可选）
 * @returns {number} 赔率值
 */
function getOdds(mode, playType, digit) {
  const modeConfig = ODDS_TABLE[mode];

  if (!modeConfig) {
    logger.error(`[ODDS] 未知赔率模式: ${mode}`);
    throw new Error(`无效赔率模式: ${mode}`);
  }

  // 所有玩法、所有方向使用统一基础赔率
  return modeConfig.base;
}

/**
 * 获取净赔率（用于盈亏计算）
 *
 * @param {string} mode - 赔率模式
 * @returns {number} 净赔率
 */
function getNetOdds(mode) {
  const modeConfig = ODDS_TABLE[mode];
  if (!modeConfig) {
    throw new Error(`无效赔率模式: ${mode}`);
  }
  return modeConfig.net;
}

/**
 * 计算赢利金额
 *
 * @param {number} betAmount - 下注金额
 * @param {string} mode - 赔率模式
 * @param {boolean} isWin - 是否赢
 * @param {boolean} isRebate - 是否回本
 * @returns {number} 盈亏金额（正数=盈利，负数=亏损，0=回本）
 */
function calcProfitLoss(betAmount, mode, isWin, isRebate) {
  // 回本 → 盈亏为 0
  if (isRebate) {
    return 0;
  }

  const odds = getOdds(mode);

  if (isWin) {
    // 赢：profit_loss = bet_amount × (odds - 1)
    return Math.round(betAmount * (odds - 1));
  } else {
    // 输：profit_loss = -bet_amount
    return -betAmount;
  }
}

/**
 * 校验赔率模式是否合法
 *
 * @param {string} mode
 * @returns {boolean}
 */
function isValidMode(mode) {
  return ['2.17', '2.84'].includes(mode);
}

module.exports = {
  getOdds,
  getNetOdds,
  calcProfitLoss,
  isValidMode,
  ODDS_TABLE,
};