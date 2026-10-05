// src/services/crawler.service.js
const openResultDao = require('../db/open-result.dao');
const betRecordDao = require('../db/bet-record.dao');
const strategyConfigDao = require('../db/strategy-config.dao');
const operationLogDao = require('../db/operation-log.dao');
const logger = require('../utils/logger');
const { termOf } = require('../utils/period.util');
const { toBeijingTime } = require('../utils/format.util');

/**
 * 开奖数据爬虫服务 (适配 pc20.net 真实 API) —— 定点动态调度版
 *
 * ── 调度策略 ──
 * 下期预计开奖时刻 = 本期 openTime + 动态间隔 + bufferMs
 * 动态间隔取最近 20 期 openTime 差值的中位数，抵抗单期抖动与异常延迟。
 * 封盘时长会随时间变化（实测 198 → 206 秒），因此间隔必须动态算，绝不写死。
 *
 * ── 兜底保障 ──
 * 1. 60 秒慢轮询：仅在定点定时器明显超时时补抓
 * 2. 指数退避：预约时刻已过但无新数据时，5s → 10s → ... → 最多 60s
 * 3. _busy 闸门：防止上一轮未结束时重叠执行
 *
 * ── 跳期补录 ──
 * 以本地已记录的期号序号（term）集合为基准，API 返回范围内所有缺失期
 * （含停机造成的中间空洞）按序号升序逐条补录；
 * 每轮补录后统一按 term 对账结算所有 SENT/PENDING 下注，仅对最新一期触发下一期下注。
 */
class CrawlerService {
  constructor(deps) {
    this.settlementService = deps.settlementService;
    this.strategyExecutor = deps.strategyExecutor;
    this.periodService = deps.periodService;

    this.intervalMs = deps.intervalMs || 5000;
    this.bufferMs = deps.bufferMs || 10000;                  // 开奖后缓冲 10 秒
    this.fallbackMs = deps.fallbackMs || 60000;              // 兜底轮询 60 秒
    this.defaultIntervalMs = deps.defaultIntervalMs || 210000; // 首次启动间隔兜底

    this._timer = null;
    this._fallbackTimer = null;
    this._running = false;
    this._busy = false;
    this._lastInterval = null;
    this._nextWakeAt = 0;
    this._missCount = 0;
  }

  start() {
    if (this._running) return;
    this._running = true;
    logger.info(
      `[CRAWLER] 爬虫已启动（定点模式：动态间隔 + ${this.bufferMs}ms 缓冲，兜底 ${this.fallbackMs}ms）`
    );

    this.fetchAndDispatch().catch((err) => logger.error(`[CRAWLER] 首次抓取失败: ${err.message}`));

    this._fallbackTimer = setInterval(() => {
      if (!this._running || this._busy) return;
      if (this._nextWakeAt > 0 && Date.now() >= this._nextWakeAt + 5000) {
        logger.warn('[CRAWLER] 定点唤醒超时，兜底补抓');
        this.fetchAndDispatch().catch((err) => logger.error(`[CRAWLER] 兜底抓取失败: ${err.message}`));
      }
    }, this.fallbackMs);

    if (this._fallbackTimer.unref) this._fallbackTimer.unref();
  }

  stop() {
    if (this._timer) clearTimeout(this._timer);
    if (this._fallbackTimer) clearInterval(this._fallbackTimer);
    this._timer = null;
    this._fallbackTimer = null;
    this._running = false;
    logger.info('[CRAWLER] 爬虫已停止');
  }

  async fetchAndDispatch() {
    if (this._busy) {
      logger.debug('[CRAWLER] 上一轮仍在执行，跳过本次');
      return;
    }
    this._busy = true;
    try {
      await this._doFetchAndDispatch();
    } finally {
      this._busy = false;
    }
  }

  async _doFetchAndDispatch() {
    const rawData = await this._fetch();
    if (!rawData) {
      this._scheduleRetry('抓取失败');
      return;
    }

    const list = this._parseAll(rawData);
    if (!list || list.length === 0) {
      this._scheduleRetry('解析结果为空');
      return;
    }

    const dynInterval = this._calcDynamicInterval(list);
    if (dynInterval) {
      if (this._lastInterval !== dynInterval) {
        logger.info(`[CRAWLER] 动态间隔更新: ${Math.round(dynInterval / 1000)} 秒`);
      }
      this._lastInterval = dynInterval;
    }
    const interval = this._lastInterval || this.defaultIntervalMs;

    const maxTerm = openResultDao.getMaxTerm();
    // 用 term 集合判断缺失，而不是只看 maxTerm：
    // 停机重启后本地数据可能出现中间空洞，只补 "> maxTerm" 永远填不上
    const localTerms = openResultDao.getAllTerms();
    const missing = list
      .filter((p) => !localTerms.has(p.term))
      .sort((a, b) => a.term - b.term);

    if (missing.length === 0) {
      logger.debug(`[CRAWLER] 无新开奖（本地最新序号: ${maxTerm}）`);
      this._scheduleRetry('无新开奖');
      return;
    }

    this._missCount = 0;

    const firstTerm = missing[0].term;
    const lastTerm = missing[missing.length - 1].term;

    if (missing.length > 1) {
      logger.warn(
        `[CRAWLER] 检测到跳期，开始补录 ${missing.length} 期: ${firstTerm} → ${lastTerm}`
      );
    }
    if (maxTerm > 0 && firstTerm > maxTerm + 1) {
      logger.warn(
        `[CRAWLER] 仍有 ${firstTerm - maxTerm - 1} 期无法补录` +
        ` (本地最新 ${maxTerm}，可补录起点 ${firstTerm})，受 API 返回条数限制`
      );
    }

    try {
      const canceled = betRecordDao.cancelStaleCreated(lastTerm);
      if (canceled > 0) {
        logger.warn(`[CRAWLER] 已取消 ${canceled} 条过期未发送的下注 (CREATED)`);
      }
    } catch (err) {
      logger.error(`[CRAWLER] 清理过期下注失败: ${err.message}`);
    }

    for (let i = 0; i < missing.length; i++) {
      const p = missing[i];

      const inserted = openResultDao.insert({
        period: p.period,
        open_number: p.openNumber,
        open_text: p.openText,
        direction: p.direction,
        open_time: p.openTime,
        next_period: p.nextPeriod,
        next_open_time: p.nextOpenTime,
        source: 'pc20_api',
        raw_payload: JSON.stringify(p.rawPayload),
      });

      if (inserted) {
        logger.info(
          `[CRAWLER] ${missing.length > 1 ? '[补录] ' : '🎉 '}新开奖: ` +
          `期号=${p.period}, 号码=${p.openNumber}, 方向=${p.direction}`
        );
      } else {
        logger.debug(`[CRAWLER] 期号 ${p.period} 已存在，跳过插入`);
      }

      if (i === missing.length - 1) {
        await this._triggerAllRunning(p.nextPeriod);
      }
    }

    // 统一补录对账结算：按 term 匹配所有 SENT/PENDING 下注
    // （涵盖刚补录的期次、本地已有结果但漏结算的期次、以及
    //   期号字符串不一致的历史遗留注单）
    try {
      const { settled, unresolved } = await this.settlementService.settleBacklog();
      if (settled > 0) {
        logger.info(`[CRAWLER] 补录结算: 本轮共结算 ${settled} 条`);
      }
      if (unresolved.length > 0) {
        logger.warn(
          `[CRAWLER] 仍有 ${unresolved.length} 条下注无开奖结果，等待后续补录` +
          `（期号: ${unresolved.slice(0, 3).map((b) => b.period).join(', ')}${unresolved.length > 3 ? ' ...' : ''}）`
        );
      }
    } catch (error) {
      logger.error(`[CRAWLER] 补录对账结算异常: ${error.message}`, error);
    }

    // 兜底撤单：期号早于数据源最早可补录期的未结算注单，
    // 其开奖结果已永远拿不到，继续悬挂只会永久占用"待结算"状态
    this._cancelUnsettleableBets(list[0].term);

    const latest = list[list.length - 1];
    this._scheduleNext(latest.openTimeMs, interval);
  }

  /**
   * 撤单无法补录结算的未结算注单（SENT/PENDING 且早于数据源最早可补录期）
   *
   * @private
   * @param {number} earliestFetchableTerm - 数据源 API 返回的最早一期序号
   */
  _cancelUnsettleableBets(earliestFetchableTerm) {
    if (!Number.isFinite(earliestFetchableTerm)) return;

    try {
      const stale = betRecordDao
        .listAllPending()
        .filter((b) => {
          const t = termOf(b.period);
          return t !== null && t < earliestFetchableTerm;
        });

      for (const bet of stale) {
        const reason = `停机过久：期号早于数据源最早可补录期（${earliestFetchableTerm}），开奖结果无法获取，已撤单`;
        betRecordDao.markCanceled(bet.id, reason);
        operationLogDao.insert({
          bot_user_id: bet.bot_user_id,
          action: 'BET_CANCELED',
          detail: `期号=${bet.period}, 原因=超出补录范围撤单`,
        });
        logger.warn(
          `[CRAWLER] 已撤单无法补录的未结算下注: bet_id=${bet.id}, 用户=${bet.bot_user_id}, 期号=${bet.period}`
        );
      }
    } catch (error) {
      logger.error(`[CRAWLER] 超范围注单撤单失败: ${error.message}`, error);
    }
  }

  async _triggerAllRunning(nextPeriod) {
    try {
      const runningStrategies = strategyConfigDao.getAllRunning();
      if (!runningStrategies || runningStrategies.length === 0) return;

      logger.info(
        `[CRAWLER] 触发 ${runningStrategies.length} 个运行中用户的下注 (期号: ${nextPeriod})`
      );

      for (const strategy of runningStrategies) {
        try {
          await this.strategyExecutor.triggerBet(strategy.bot_user_id, nextPeriod);
        } catch (err) {
          logger.error(`[CRAWLER] 触发下注失败: 用户=${strategy.bot_user_id} → ${err.message}`);
        }
      }
    } catch (error) {
      logger.error(`[CRAWLER] 获取运行中策略失败: ${error.message}`);
    }
  }

  async _fetch() {
    try {
      const response = await fetch('http://pc20.net/api/history', {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'http://pc20.net/' },
        signal: AbortSignal.timeout(50000),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      logger.error(`[CRAWLER] HTTP 请求失败: ${error.message}`);
      return null;
    }
  }

  _parseAll(rawData) {
    const list = rawData?.data;
    if (!Array.isArray(list) || list.length === 0) return [];

    const out = [];
    for (const item of list) {
      const parsed = this._parseItem(item);
      if (parsed) out.push(parsed);
    }

    return out.sort((a, b) => a.term - b.term);
  }

  _parseItem(item) {
    try {
      const { sum1, sum2, sum3, r1, r2, term, openTime, closeTime } = item;

      if (term === undefined || term === null) return null;

      const n1 = Number(sum1);
      const n2 = Number(sum2);
      const n3 = Number(sum3);

      if ([n1, n2, n3].some((n) => !Number.isInteger(n) || n < 0 || n > 9)) {
        logger.warn(`[CRAWLER] 期号 ${term} 号码非法: ${sum1},${sum2},${sum3}`);
        return null;
      }

      const openTimeMs = Number(openTime);
      const closeTimeMs = Number(closeTime);

      // 【修复】统一用 toBeijingTime 换算北京时间日期
      // 原写法 new Date(openTime + 8*3600*1000) 再按本地时区 getFullYear()，
      // 在 TZ=Asia/Shanghai 下等于 UTC+16，导致北京时间 16:00-24:00 的期号多一天
      const dateStr = toBeijingTime(openTimeMs, 'YYYYMMDD');
      const period = `${dateStr}-${term}`;

      const nextTerm = Number(term) + 1;
      const nextOpenTimeMs = closeTimeMs;
      const nextDateStr = toBeijingTime(nextOpenTimeMs, 'YYYYMMDD');
      const nextPeriod = `${nextDateStr}-${nextTerm}`;
      const nextOpenTime = toBeijingTime(nextOpenTimeMs);

      const openNumber = `${n1},${n2},${n3}`;
      const openText = `${n1}+${n2}+${n3}=${n1 + n2 + n3}`;

      const sizeDir = r1 === '大' ? 'BIG' : 'SMALL';
      const parityDir = r2 === '单' ? 'ODD' : 'EVEN';
      const direction = `${sizeDir},${parityDir}`;

      return {
        term: Number(term),
        period,
        openNumber,
        openText,
        direction,
        openTime: toBeijingTime(openTimeMs),
        openTimeMs,
        closeTimeMs,
        nextPeriod,
        nextOpenTime,
        rawPayload: item,
      };
    } catch (error) {
      logger.error(`[CRAWLER] 解析失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 动态计算开奖间隔：最近 20 期 openTime 差值的中位数
   * 用中位数抵抗单期抖动（209/210 混排）与异常延迟
   */
  _calcDynamicInterval(list) {
    const times = list
      .filter((p) => Number.isFinite(p.openTimeMs))
      .map((p) => p.openTimeMs)
      .sort((a, b) => a - b);

    if (times.length < 2) return null;

    const recent = times.slice(-20);

    const gaps = [];
    for (let i = 1; i < recent.length; i++) {
      const gap = recent[i] - recent[i - 1];
      if (gap >= 30000 && gap <= 600000) gaps.push(gap);
    }
    if (gaps.length === 0) return null;

    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)];
  }

  /**
   * 预约下一次抓取
   * wakeAt = 本期 openTime + 动态间隔 + bufferMs
   */
  _scheduleNext(latestOpenMs, intervalMs) {
    if (!Number.isFinite(latestOpenMs)) return;

    const wakeAt = latestOpenMs + intervalMs + this.bufferMs;
    let delay = wakeAt - Date.now();

    if (delay >= 1000) {
      this._missCount = 0;
    } else {
      this._missCount += 1;
      delay = Math.min(5000 * this._missCount, this.fallbackMs);
      logger.debug(`[CRAWLER] 预约时刻已过，${Math.round(delay / 1000)} 秒后重试（第 ${this._missCount} 次）`);
    }

    this._nextWakeAt = wakeAt;

    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this.fetchAndDispatch().catch((err) => logger.error(`[CRAWLER] 抓取失败: ${err.message}`));
    }, delay);

    if (this._timer.unref) this._timer.unref();

    logger.info(
      `[CRAWLER] 下次抓取预约: ${new Date(wakeAt).toLocaleString('zh-CN')}` +
      `（${Math.round(delay / 1000)} 秒后，动态间隔=${Math.round(intervalMs / 1000)} 秒）`
    );
  }

  _scheduleRetry(reason) {
    this._missCount += 1;
    const delay = Math.min(5000 * this._missCount, this.fallbackMs);

    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this.fetchAndDispatch().catch((err) => logger.error(`[CRAWLER] 抓取失败: ${err.message}`));
    }, delay);

    if (this._timer.unref) this._timer.unref();

    this._nextWakeAt = Date.now() + delay;
    logger.debug(`[CRAWLER] ${reason}，${Math.round(delay / 1000)} 秒后重试（第 ${this._missCount} 次）`);
  }

  _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
}

module.exports = CrawlerService;
