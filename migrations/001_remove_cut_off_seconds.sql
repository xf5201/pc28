-- 001_remove_cut_off_seconds.sql
-- 移除策略配置中的封盘秒数(cut_off_seconds)字段
--
-- 背景:封盘秒数不再对用户开放配置,统一使用固定值(10 秒,
-- 见 src/services/strategy-executor.service.js 的 CUT_OFF_SECONDS)。
-- 面板入口、配置处理器、DAO 可更新字段同步移除。
--
-- 注:SQLite 3.35+ 支持 DROP COLUMN(better-sqlite3 v13 内置版本满足)。

ALTER TABLE strategy_config DROP COLUMN cut_off_seconds;
