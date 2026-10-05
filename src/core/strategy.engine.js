// src/core/strategy.engine.js
const logger = require('../utils/logger');
const { analyzeNumber, isRebateNumber } = require('./number.attributes');
const { getOdds, calcProfitLoss } = require('./odds.engine');

const DIRECTIONS = { BIG: 'BIG', SMALL: 'SMALL', ODD: 'ODD', EVEN: 'EVEN' };
const OPPOSITE = { BIG: 'SMALL', SMALL: 'BIG', ODD: 'EVEN', EVEN: 'ODD' };
const MODES = { FOLLOW: 'FOLLOW', REVERSE: 'REVERSE' };
const SWITCH_THRESHOLD = 2;

function calcDirection(lastDir, playType, losses, currDir) {
  switch (playType) {
    case '顺龙': return calcShunLong(lastDir);
    case '反龙': return calcFanLong(lastDir);
    case '顺2反龙': return calcSwitchLong(lastDir, MODES.FOLLOW, currDir);
    case '反2顺龙': return calcSwitchLong(lastDir, MODES.REVERSE, currDir);
    default: throw new Error(`未知玩法: ${playType}`);
  }
}

function calcShunLong(lastDir) { return lastDir || DIRECTIONS.BIG; }
function calcFanLong(lastDir) { return lastDir ? (OPPOSITE[lastDir] || DIRECTIONS.SMALL) : DIRECTIONS.SMALL; }

function calcSwitchLong(lastDir, initialMode, currDir) {
  const validModes = [MODES.FOLLOW, MODES.REVERSE];
  const mode = validModes.includes(currDir) ? currDir : initialMode;
  if (!lastDir) return DIRECTIONS.BIG;
  return mode === MODES.FOLLOW ? lastDir : (OPPOSITE[lastDir] || lastDir);
}

/**
 * 获取玩法对应的初始模式
 *   顺2反龙 → 顺（FOLLOW）；反2顺龙 → 反（REVERSE）；传统玩法返回 null
 *
 * 用途：选择玩法 / 启动策略时把 current_direction 重置回初始值，
 * 避免上一局残留的 FOLLOW/REVERSE 导致首注方向不符预期。
 */
function initialModeFor(playType) {
  if (playType === '顺2反龙') return MODES.FOLLOW;
  if (playType === '反2顺龙') return MODES.REVERSE;
  return null;
}

/**
 * 计算下一期的连挂数与当前模式（仅顺2反龙 / 反2顺龙使用）
 *
 * 规则：
 *   1. 回本（豹子/对子/顺子/13-14）→ 连挂数与模式都不变，等于这期白打
 *   2. 赢            → 连挂数清零，模式保持不变
 *   3. 输            → 连挂数 +1，且每满 2 次翻转一次模式（顺↔反）
 *
 * ⚠️ 关键：newLosses 必须持续累加，不能清零！
 *    因为 consecutive_losses 同时驱动倍投金额 calcAmount(base, ratio, losses)，
 *    一旦清零，倍投指数就永远停在 0/1，连输后不会加倍。
 *
 * 【本次修复】切换条件从 (newLosses >= 2) 改为 (newLosses % 2 === 0)
 *    旧写法：losses 到了 2 之后就永远 >= 2，导致从第 3 期开始每输一把翻一次方向
 *    新写法：只在第 2、4、6、8... 次连输时翻转，即"每连输两把翻一次"
 */
function calcNextState(playType, isWin, isRebate, currentLosses, currentMode) {
  if (playType !== '顺2反龙' && playType !== '反2顺龙') return null;

  const initialMode = playType === '顺2反龙' ? MODES.FOLLOW : MODES.REVERSE;
  const validModes = [MODES.FOLLOW, MODES.REVERSE];
  const mode = validModes.includes(currentMode) ? currentMode : initialMode;

  // 1️⃣ 回本：连挂数与模式都保持不变
  if (isRebate) return { newLosses: currentLosses, newMode: mode };

  // 2️⃣ 赢：连挂数清零，模式保持不变
  if (isWin) return { newLosses: 0, newMode: mode };

  // 3️⃣ 输：连挂数 +1（持续累加，供倍投使用）
  //    每满 2 次翻转一次模式
  const newLosses = currentLosses + 1;
  const newMode = (newLosses % SWITCH_THRESHOLD === 0)
    ? (mode === MODES.FOLLOW ? MODES.REVERSE : MODES.FOLLOW)
    : mode;

  return { newLosses, newMode };
}

/**
 * 计算下注金额（无上限倍投模式）
 * 无论连挂多少次，严格按照 base * (ratio ^ losses) 计算，不设天花板
 */
function calcAmount(base, ratio, losses) {
  if (base <= 0) throw new Error('基础下注金额必须 > 0');
  if (ratio < 1.0) throw new Error('倍投比例必须 >= 1.0');

  const multiplier = Math.pow(ratio, losses);
  return Math.round(base * multiplier);
}

function checkWin(direction, period, openText, amount, mode) {
  const result = analyzeNumber(openText);
  if (!result) throw new Error(`无法解析开奖文本: ${openText}`);

  const isSpecial = isRebateNumber(openText, mode); // 仅判断是否为特殊号码
  let isWin = false;
  let actualDirection = '';

  // 1️⃣ 先判断方向是否正确
  switch (direction) {
    case DIRECTIONS.BIG: actualDirection = result.size; isWin = result.size === 'BIG'; break;
    case DIRECTIONS.SMALL: actualDirection = result.size; isWin = result.size === 'SMALL'; break;
    case DIRECTIONS.ODD: actualDirection = result.parity; isWin = result.parity === 'ODD'; break;
    case DIRECTIONS.EVEN: actualDirection = result.parity; isWin = result.parity === 'EVEN'; break;
    default: throw new Error(`未知下注方向: ${direction}`);
  }

  // 2️⃣ 方向正确时，再判断是否触发回本（特殊号码）
  let isRebate = false;
  if (isWin && isSpecial) {
    isRebate = true;
    isWin = false;  // 回本时不算赢（不产生利润）
  }

  const profitLoss = calcProfitLoss(amount, mode, isWin, isRebate);

  // ★★★ 修复：恢复完整的 if-else if-else 结构 ★★★
  let newLosses;
  if (isRebate) newLosses = 'UNCHANGED';
  else if (isWin) newLosses = 0;
  else newLosses = '+1';

  logger.info(`[STRATEGY] 判定: period=${period}, dir=${direction}, actual=${actualDirection}, win=${isWin}, rebate=${isRebate}, pl=${profitLoss}, losses=${newLosses}`);
  return { isWin, isRebate, profitLoss, newLosses, direction: actualDirection };
}

function getDirectionLabel(direction) {
  return { BIG: '大', SMALL: '小', ODD: '单', EVEN: '双' }[direction] || direction;
}
function isValidDirection(direction) { return Object.values(DIRECTIONS).includes(direction); }
function isValidPlayType(playType) { return ['顺龙', '反龙', '顺2反龙', '反2顺龙'].includes(playType); }

module.exports = {
  DIRECTIONS, OPPOSITE, MODES,
  calcDirection, calcNextState, calcAmount, checkWin, initialModeFor,
  getDirectionLabel, isValidDirection, isValidPlayType,
};
