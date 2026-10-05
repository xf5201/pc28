-- 002_add_perf_indexes.sql
-- 性能优化索引
--
-- 期号序号(term)表达式索引:open_results 会随运行时间持续增长
-- (每约 210 秒一期,约 410 期/天),而爬虫每轮补录对账都要按 term
-- 查询(getMaxTerm / getAllTerms / getByTerm)。无索引时这些查询是
-- 全表扫描 + 逐行 CAST 计算,better-sqlite3 同步执行会阻塞事件循环。
-- 加表达式索引后均为索引扫描,耗时不随表增长。
--
-- bet_records 侧无需额外索引:待结算查询按 status 前缀走已有的
-- idx_bet_records_settle (status, period),运行中 CREATED/SENT/PENDING
-- 记录数极少;历史注单虽持续增长但不参与每轮扫描。

CREATE INDEX IF NOT EXISTS idx_open_results_term
  ON open_results(CAST(substr(period, instr(period, '-') + 1) AS INTEGER));
