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

function calcNextState(playType, isWin, isRebate, currentLosses, currentMode) {
  if (playType !== '顺2反龙' && playType !== '反2顺龙') return null;

  const initialMode = playType === '顺2反龙' ? MODES.FOLLOW : MODES.REVERSE;
  const validModes = [MODES.FOLLOW, MODES.REVERSE];
  const mode = validModes.includes(currentMode) ? currentMode : initialMode;

  if (isRebate) return { newLosses: currentLosses, newMode: mode };
  if (isWin) return { newLosses: 0, newMode: mode };

  let newLosses = currentLosses + 1;
  let newMode = mode;
  if (newLosses >= SWITCH_THRESHOLD) {
    newMode = (mode === MODES.FOLLOW) ? MODES.REVERSE : MODES.FOLLOW;
    // newLosses 保持 currentLosses + 1，不重置
  }
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
  calcDirection, calcNextState, calcAmount, checkWin,
  getDirectionLabel, isValidDirection, isValidPlayType,
};
