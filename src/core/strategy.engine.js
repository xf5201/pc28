// src/core/strategy.engine.js
const logger = require('../utils/logger');
const { analyzeNumber, isRebateNumber } = require('./number.attributes');
const { getOdds, calcProfitLoss } = require('./odds.engine');

const DIRECTIONS = { BIG: 'BIG', SMALL: 'SMALL', ODD: 'ODD', EVEN: 'EVEN' };
const OPPOSITE = { BIG: 'SMALL', SMALL: 'BIG', ODD: 'EVEN', EVEN: 'ODD' };
const MODES = { FOLLOW: 'FOLLOW', REVERSE: 'REVERSE' };
const SWITCH_THRESHOLD = 2;

/**
 * 玩法说明（面板展示用）
 *
 * short: 配置主面板里跟在玩法名后的一句话提示
 * detail: 玩法选择面板里的完整说明
 *
 * 顺2反龙 / 反2顺龙 规则：
 *   - 方向参照物 = 上期开奖方向（不是自己上把买的方向）
 *   - 顺模式：买上期开奖方向
 *   - 反模式：买上期开奖反方向
 *   - 连输满2把：翻转模式（顺↔反）
 *   - 赢了：连输清零，模式不变
 *   - 回本（特殊号）：不算赢不算输，连输冻结，模式冻结
 */
const PLAY_TYPE_INFO = {
  顺龙: {
    short: '跟着上期买',
    detail: '上期开大→买大，上期开小→买小',
  },
  反龙: {
    short: '反着上期买',
    detail: '上期开大→买小，上期开小→买大',
  },
  顺2反龙: {
    short: '先顺后反·连输2把翻转',
    detail: '开局顺模式（跟上期买），连输满2把翻转为反模式，反模式连输满2把再翻回顺模式，循环往复',
  },
  反2顺龙: {
    short: '先反后顺·连输2把翻转',
    detail: '开局反模式（买上期反方向），连输满2把翻转为顺模式，顺模式连输满2把再翻回反模式，循环往复',
  },
};

/**
 * 计算下注方向
 *
 * @param {string} lastOpenDir - 上期开奖方向（BIG/SMALL/ODD/EVEN）
 * @param {string} playType - 玩法类型（顺龙/反龙/顺2反龙/反2顺龙）
 * @param {string} currMode - 当前模式（FOLLOW/REVERSE），仅顺2反龙/反2顺龙使用
 * @returns {string} 下注方向
 *
 * 核心逻辑：
 *   方向参照物 = 上期开奖方向（lastOpenDir）
 *   顺模式 → 跟上期开奖方向买
 *   反模式 → 买上期开奖反方向
 */
function calcDirection(lastOpenDir, playType, currMode) {
  switch (playType) {
    case '顺龙':
      return calcShunLong(lastOpenDir);

    case '反龙':
      return calcFanLong(lastOpenDir);

    case '顺2反龙':
      return calcSwitchLong(lastOpenDir, MODES.FOLLOW, currMode);

    case '反2顺龙':
      return calcSwitchLong(lastOpenDir, MODES.REVERSE, currMode);

    default:
      throw new Error(`未知玩法: ${playType}`);
  }
}

/**
 * 顺龙：跟上期开奖方向买
 */
function calcShunLong(lastOpenDir) {
  return lastOpenDir || DIRECTIONS.BIG;
}

/**
 * 反龙：买上期开奖反方向
 */
function calcFanLong(lastOpenDir) {
  return lastOpenDir ? (OPPOSITE[lastOpenDir] || DIRECTIONS.SMALL) : DIRECTIONS.SMALL;
}

/**
 * 顺2反龙 / 反2顺龙：根据当前模式决定方向
 *
 * @param {string} lastOpenDir - 上期开奖方向
 * @param {string} initialMode - 初始模式（顺2反龙=FOLLOW，反2顺龙=REVERSE）
 * @param {string} currMode - 当前模式
 * @returns {string} 下注方向
 */
function calcSwitchLong(lastOpenDir, initialMode, currMode) {
  const validModes = [MODES.FOLLOW, MODES.REVERSE];
  const mode = validModes.includes(currMode) ? currMode : initialMode;

  if (!lastOpenDir) return DIRECTIONS.BIG;

  // 顺模式：跟上期开奖方向买
  if (mode === MODES.FOLLOW) {
    return lastOpenDir;
  }

  // 反模式：买上期开奖反方向
  return OPPOSITE[lastOpenDir] || lastOpenDir;
}

/**
 * 获取玩法对应的初始模式
 *   顺2反龙 → 顺（FOLLOW）
 *   反2顺龙 → 反（REVERSE）
 *   传统玩法返回 null
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
 *   1. 回本（特殊号）→ 连挂数与模式都不变，这期白过
 *   2. 赢            → 连挂数清零，模式保持不变
 *   3. 输            → 连挂数 +1，每满 2 次翻转一次模式（顺↔反）
 *
 * ⚠️ 注意：losses 必须持续累加，不能清零！
 *    因为 consecutive_losses 同时驱动倍投金额 calcAmount(base, ratio, losses)
 *    一旦清零，倍投指数就永远停在 0/1，连输后不会加倍
 */
function calcNextState(playType, isWin, isRebate, currentLosses, currentMode) {
  if (playType !== '顺2反龙' && playType !== '反2顺龙') return null;

  const initialMode = playType === '顺2反龙' ? MODES.FOLLOW : MODES.REVERSE;
  const validModes = [MODES.FOLLOW, MODES.REVERSE];
  const mode = validModes.includes(currentMode) ? currentMode : initialMode;

  // 1️⃣ 回本：连挂数与模式都保持不变
  if (isRebate) {
    return { newLosses: currentLosses, newMode: mode };
  }

  // 2️⃣ 赢：连挂数清零，模式保持不变
  if (isWin) {
    return { newLosses: 0, newMode: mode };
  }

  // 3️⃣ 输：连挂数 +1
  //    每满 2 次翻转一次模式（第2、4、6、8...次连输时翻转）
  const newLosses = currentLosses + 1;
  const newMode = (newLosses % SWITCH_THRESHOLD === 0)
    ? (mode === MODES.FOLLOW ? MODES.REVERSE : MODES.FOLLOW)
    : mode;

  return { newLosses, newMode };
}

/**
 * 计算下注金额（无上限倍投模式）
 * 严格按照 base * (ratio ^ losses) 计算，不设天花板
 */
function calcAmount(base, ratio, losses) {
  if (base <= 0) throw new Error('基础下注金额必须 > 0');
  if (ratio < 1.0) throw new Error('倍投比例必须 >= 1.0');

  const multiplier = Math.pow(ratio, losses);
  return Math.round(base * multiplier);
}

/**
 * 判定开奖结果
 *
 * @param {string} direction - 下注方向
 * @param {string} period - 期号
 * @param {string} openText - 开奖文本
 * @param {number} amount - 下注金额
 * @param {string} mode - 当前模式（用于判断特殊号回本）
 * @returns {object} 判定结果
 */
function checkWin(direction, period, openText, amount, mode) {
  const result = analyzeNumber(openText);
  if (!result) throw new Error(`无法解析开奖文本: ${openText}`);

  const isSpecial = isRebateNumber(openText, mode);
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
    isWin = false; // 回本时不算赢
  }

  const profitLoss = calcProfitLoss(amount, mode, isWin, isRebate);

  let newLossesDesc;
  if (isRebate) newLossesDesc = 'UNCHANGED';
  else if (isWin) newLossesDesc = 0;
  else newLossesDesc = '+1';

  logger.info(`[STRATEGY] 判定: period=${period}, dir=${direction}, actual=${actualDirection}, win=${isWin}, rebate=${isRebate}, pl=${profitLoss}, losses=${newLossesDesc}`);

  return { isWin, isRebate, profitLoss, newLosses: newLossesDesc, direction: actualDirection };
}

function getDirectionLabel(direction) {
  return { BIG: '大', SMALL: '小', ODD: '单', EVEN: '双' }[direction] || direction;
}

function isValidDirection(direction) {
  return Object.values(DIRECTIONS).includes(direction);
}

function isValidPlayType(playType) {
  return ['顺龙', '反龙', '顺2反龙', '反2顺龙'].includes(playType);
}

module.exports = {
  DIRECTIONS,
  OPPOSITE,
  MODES,
  PLAY_TYPE_INFO,
  calcDirection,
  calcNextState,
  calcAmount,
  checkWin,
  initialModeFor,
  getDirectionLabel,
  isValidDirection,
  isValidPlayType,
};
