// src/services/crawler.service.js
const openResultDao = require('../db/open-result.dao');
const betRecordDao = require('../db/bet-record.dao');
const strategyConfigDao = require('../db/strategy-config.dao');
const logger = require('../utils/logger');
const { toBeijingTime } = require('../utils/format.util');

/**
 * 开奖数据爬虫服务 (适配 pc20.net 真实 API)
 *
 * ── 跳期补录 ──
 * 服务停机 / 网络中断期间可能跨越多个期次。
 * 本服务以 open_results 中已记录的最大期号序号为基准，
 * 将 API 返回列表中所有更新的期次按序号升序逐条补录，并对每一期执行结算；
 * 仅对「最新一期」触发下一期下注，中间补录的期次不再生成新注。
 */
class CrawlerService {
  constructor(deps) {
    this.settlementService = deps.settlementService;
    this.strategyExecutor = deps.strategyExecutor;
    this.periodService = deps.periodService;
    this.intervalMs = deps.intervalMs || 5000;
    this._timer = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    logger.info(`[CRAWLER] 爬虫已启动，轮询间隔 ${this.intervalMs}ms`);

    this.fetchAndDispatch().catch((err) => logger.error(`[CRAWLER] 首次抓取失败: ${err.message}`));

    this._timer = setInterval(() => {
      this.fetchAndDispatch().catch((err) => logger.error(`[CRAWLER] 抓取失败: ${err.message}`));
    }, this.intervalMs);

    if (this._timer.unref) this._timer.unref();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._running = false;
    logger.info('[CRAWLER] 爬虫已停止');
  }

  /**
   * 抓取 → 解析 → 补录 → 结算 → 触发下注
   */
  async fetchAndDispatch() {
    // 1. 抓取真实 API
    const rawData = await this._fetch();
    if (!rawData) return;

    // 2. 解析全部期次（按序号升序）
    const list = this._parseAll(rawData);
    if (!list || list.length === 0) return;

    // 3. 以本地最大期号为基准，筛出需要补录的期次
    const maxTerm = openResultDao.getMaxTerm();
    const missing = list
      .filter((p) => p.term > maxTerm)
      .sort((a, b) => a.term - b.term);

    if (missing.length === 0) {
      logger.debug(`[CRAWLER] 无新开奖（本地最新序号: ${maxTerm}）`);
      return;
    }

    const firstTerm = missing[0].term;
    const lastTerm = missing[missing.length - 1].term;

    // 4. 跳期检测与告警
    if (missing.length > 1) {
      logger.warn(
        `[CRAWLER] 检测到跳期，开始补录 ${missing.length} 期: ${firstTerm} → ${lastTerm}`
      );
    }
    // API 返回条数有限，可能有更早的期次拿不到
    if (maxTerm > 0 && firstTerm > maxTerm + 1) {
      logger.warn(
        `[CRAWLER] 仍有 ${firstTerm - maxTerm - 1} 期无法补录` +
        ` (本地最新 ${maxTerm}，可补录起点 ${firstTerm})，受 API 返回条数限制`
      );
    }

    // 5. 清理过期未发出的下注（CREATED），避免永久悬挂
    try {
      const canceled = betRecordDao.cancelStaleCreated(lastTerm);
      if (canceled > 0) {
        logger.warn(`[CRAWLER] 已取消 ${canceled} 条过期未发送的下注 (CREATED)`);
      }
    } catch (err) {
      logger.error(`[CRAWLER] 清理过期下注失败: ${err.message}`);
    }

    // 6. 按序号升序逐条补录 + 结算
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

      // 每期都尝试结算：补录的历史期次同样可能有对应下注
      try {
        await this.settlementService.settleAll(p.period);
      } catch (error) {
        logger.error(`[CRAWLER] 结算异常: 期号=${p.period} → ${error.message}`, error);
      }

      // 7. 仅对最新一期触发下一期下注
      if (i === missing.length - 1) {
        await this._triggerAllRunning(p.nextPeriod);
      }
    }
  }

  /**
   * 触发所有 RUNNING 用户的下一期下注
   * @param {string} nextPeriod
   */
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

  /**
   * 解析 API 返回的全部期次（按序号升序）
   * @returns {Array}
   */
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

  /**
   * 解析单条开奖记录
   * @returns {object|null}
   */
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

      // 将 openTime 转为北京时间日期（用于期号）
      const beijingOpenDate = new Date(openTime + 8 * 3600 * 1000); // 假设 openTime 是 UTC 毫秒
      const dateStr = this._formatDate(beijingOpenDate);
      const period = `${dateStr}-${term}`;

      // 推导下一期
      const nextTerm = Number(term) + 1;
      const nextOpenTimeMs = closeTime;
      const nextDateStr = this._formatDate(new Date(nextOpenTimeMs + 8 * 3600 * 1000)); // 北京时间
      const nextPeriod = `${nextDateStr}-${nextTerm}`;
      const nextOpenTime = toBeijingTime(nextOpenTimeMs); // 北京时间字符串

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
        openTime: toBeijingTime(openTime),
        nextPeriod,
        nextOpenTime,
        rawPayload: item,
      };
    } catch (error) {
      logger.error(`[CRAWLER] 解析失败: ${error.message}`);
      return null;
    }
  }

  _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
}

module.exports = CrawlerService;
