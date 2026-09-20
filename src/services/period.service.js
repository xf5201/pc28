// src/services/period.service.js
const logger = require('../utils/logger');
const { getBeijingNow } = require('../utils/format.util');

class PeriodService {
  shouldBet(nextPeriod, nextOpenTime, cutOffSeconds) {
    if (!nextOpenTime) return { should: true };
    const openTime = new Date(nextOpenTime);
    if (isNaN(openTime.getTime())) return { should: true };

    const now = getBeijingNow(); // ← 改为北京时间
    const cutOffTime = new Date(openTime.getTime() - cutOffSeconds * 1000);

    if (now > cutOffTime) {
      return { should: false, reason: `已封盘（距开奖 ${Math.round((openTime - now) / 1000)}秒 < ${cutOffSeconds}秒）` };
    }
    return { should: true };
  }

  deriveNextPeriod(currentPeriod) {
    // 【修改】支持任意位数的 term，不再限制为 3 位
    const match = currentPeriod.match(/^(\d{8})-(\d+)$/);
    if (!match) throw new Error(`无效期号格式: ${currentPeriod}`);

    const dateStr = match[1];
    const term = parseInt(match[2], 10);
    
    // term 是全局递增的，直接 +1
    return `${dateStr}-${term + 1}`;
  }

  deriveNextOpenTime(currentOpenTime, intervalSeconds = 180) {
    const current = new Date(currentOpenTime);
    if (isNaN(current.getTime())) return null;
    return new Date(current.getTime() + intervalSeconds * 1000).toISOString();
  }

  _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  extractDate(period) {
    const match = period.match(/^(\d{4})(\d{2})(\d{2})-/);
    if (!match) return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
}

module.exports = PeriodService;
