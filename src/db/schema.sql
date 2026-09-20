-- src/db/schema.sql
-- PC28 多用户系统 - 数据库表结构
-- 文档参考：§4 数据库设计

-- ═══════════════════════════════════════════
-- 4.2 bot_users（Bot 用户）
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bot_users (
    bot_user_id TEXT PRIMARY KEY,
    username    TEXT,
    first_name  TEXT,
    role        TEXT NOT NULL DEFAULT 'USER'
                CHECK(role IN ('USER','ADMIN')),
    is_allowed  INTEGER NOT NULL DEFAULT 1
                CHECK(is_allowed IN (0,1)),
    created_at  DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- ═══════════════════════════════════════════
-- 4.3 accounts（TG 执行账号）
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS accounts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_user_id       TEXT NOT NULL UNIQUE,
    phone             TEXT NOT NULL,
    proxy             TEXT NULL,
    session_string    TEXT NOT NULL,
    target_chat_id    TEXT NULL,
    target_chat_title TEXT NULL,
    status            TEXT NOT NULL DEFAULT 'PENDING_SETUP'
                      CHECK(status IN ('PENDING_SETUP','ACTIVE','ERROR','DELETED')),
    last_error        TEXT NULL,
    created_at        DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
    updated_at        DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (bot_user_id) REFERENCES bot_users(bot_user_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

-- ═══════════════════════════════════════════
-- 4.4 strategy_config（策略配置）
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS strategy_config (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_user_id        TEXT NOT NULL UNIQUE,
    mode               TEXT NOT NULL
                       CHECK(mode IN ('2.17','2.84')),
    play_type          TEXT NOT NULL
                       CHECK(play_type IN ('顺龙','反龙','顺2反龙','反2顺龙')), -- 【已更新】删除小刚，新增顺2反龙/反2顺龙
    base_bet           INTEGER NOT NULL CHECK(base_bet > 0),
    martingale_ratio   REAL NOT NULL CHECK(martingale_ratio >= 1.0),
    cut_off_seconds    INTEGER NOT NULL CHECK(cut_off_seconds >= 0),
    is_running         INTEGER NOT NULL DEFAULT 0
                       CHECK(is_running IN (0,1)),
    current_direction  TEXT NULL,
    consecutive_losses INTEGER NOT NULL DEFAULT 0,
    updated_at         DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (bot_user_id) REFERENCES bot_users(bot_user_id)
);

-- ═══════════════════════════════════════════
-- 4.5 open_results（开奖结果 - 独立公共表）
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS open_results (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    period         TEXT NOT NULL UNIQUE,
    open_number    TEXT NULL,
    open_text      TEXT NOT NULL,
    direction      TEXT NOT NULL,
    open_time      DATETIME NOT NULL,
    next_period    TEXT NULL,
    next_open_time DATETIME NULL,
    source         TEXT NOT NULL DEFAULT 'crawler',
    raw_payload    TEXT NULL,
    created_at     DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_open_results_open_time ON open_results(open_time);
CREATE INDEX IF NOT EXISTS idx_open_results_period ON open_results(period);

-- ═══════════════════════════════════════════
-- 4.6 bet_records（下注记录）
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bet_records (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_user_id        TEXT NOT NULL,
    strategy_config_id INTEGER NOT NULL,
    period             TEXT NOT NULL,
    direction          TEXT NOT NULL,
    bet_amount         INTEGER NOT NULL CHECK(bet_amount > 0),
    mode               TEXT NOT NULL,
    odds               REAL NOT NULL,
    status             TEXT NOT NULL DEFAULT 'CREATED'
                       CHECK(status IN ('CREATED','SENT','PENDING','SETTLED','FAILED','CANCELED')),
    is_rebate          INTEGER NOT NULL DEFAULT 0 CHECK(is_rebate IN (0,1)),
    is_win             INTEGER NULL,
    profit_loss        INTEGER NULL,
    target_chat_id     TEXT NULL,
    message_id         INTEGER NULL,
    bet_time           DATETIME NULL,
    settled_at         DATETIME NULL,
    fail_reason        TEXT NULL,
    raw_response       TEXT NULL,
    created_at         DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (bot_user_id) REFERENCES bot_users(bot_user_id),
    UNIQUE(bot_user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_bet_records_user_status ON bet_records(bot_user_id, status);
CREATE INDEX IF NOT EXISTS idx_bet_records_period ON bet_records(period);
CREATE INDEX IF NOT EXISTS idx_bet_records_settle ON bet_records(status, period);

-- ═══════════════════════════════════════════
-- 4.7 profit_logs（盈亏日志）
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profit_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_user_id   TEXT NOT NULL,
    bet_record_id INTEGER NOT NULL,
    period        TEXT NOT NULL,
    bet_amount    INTEGER NOT NULL,
    profit_loss   INTEGER NOT NULL,
    is_win        INTEGER NOT NULL,
    is_rebate     INTEGER NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (bot_user_id) REFERENCES bot_users(bot_user_id),
    FOREIGN KEY (bet_record_id) REFERENCES bet_records(id),
    UNIQUE(bet_record_id)
);

CREATE INDEX IF NOT EXISTS idx_profit_logs_user_created ON profit_logs(bot_user_id, created_at);

-- ═══════════════════════════════════════════
-- 4.8 operation_logs（操作日志）
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS operation_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_user_id TEXT NOT NULL,
    action      TEXT NOT NULL,
    detail      TEXT NULL,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (bot_user_id) REFERENCES bot_users(bot_user_id)
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_user_created ON operation_logs(bot_user_id, created_at);

-- ═══════════════════════════════════════════
-- 4.9 panel_context（面板上下文）
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS panel_context (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_user_id   TEXT NOT NULL UNIQUE,
    chat_id       INTEGER NOT NULL,
    message_id    INTEGER NOT NULL,
    current_panel TEXT NOT NULL DEFAULT 'dashboard',
    wizard_state  TEXT NULL,
    updated_at    DATETIME NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (bot_user_id) REFERENCES bot_users(bot_user_id)
);