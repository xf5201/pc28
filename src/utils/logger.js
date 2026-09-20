// src/utils/logger.js
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config.loader');
const { getBeijingNowString } = require('./format.util');

/**
 * 获取北京时间字符串 (YYYY-MM-DD HH:mm:ss)
 */
function getLocalTime() {
  return getBeijingNowString('YYYY-MM-DD HH:mm:ss');
}

// ── 日志级别 ──
const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ── 日志级别颜色（控制台） ──
const LEVEL_COLORS = {
  debug: '\x1b[36m', // 青色
  info: '\x1b[32m',  // 绿色
  warn: '\x1b[33m',  // 黄色
  error: '\x1b[31m', // 红色
};
const RESET = '\x1b[0m';

/**
 * Logger 类
 */
class Logger {
  constructor() {
    this._initialized = false;
    this._streams = {};
    this._level = LEVELS.info;
  }

  /**
   * 初始化日志系统
   */
  init() {
    if (this._initialized) return;

    try {
      const config = getConfig();
      const logDir = path.resolve(config.logDir);

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      this._level = LEVELS[config.logLevel] ?? LEVELS.info;

      this._streams = {
        app: fs.createWriteStream(path.join(logDir, 'app.log'), { flags: 'a' }),
        error: fs.createWriteStream(path.join(logDir, 'error.log'), { flags: 'a' }),
        audit: fs.createWriteStream(path.join(logDir, 'audit.log'), { flags: 'a' }),
      };

      this._initialized = true;
    } catch (error) {
      console.error('[LOGGER] 初始化失败，降级为控制台输出:', error.message);
      this._initialized = true;
    }
  }

  /**
   * 格式化日志行
   * @private
   */
  _format(level, message, meta) {
    const timestamp = getLocalTime();
    const metaStr = meta ? ` ${this._stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  /**
   * 安全序列化对象
   * @private
   */
  _stringify(obj) {
    if (obj instanceof Error) {
      return `${obj.message}\n${obj.stack}`;
    }
    try {
      return JSON.stringify(obj);
    } catch (_) {
      return String(obj);
    }
  }

  /**
   * 写入日志
   * @private
   */
  _write(level, message, meta) {
    if (!this._initialized) this.init();

    if (LEVELS[level] < this._level) return;

    const line = this._format(level, message, meta);

    if (this._streams.app) {
      this._streams.app.write(line + '\n');
    }

    if (level === 'error' && this._streams.error) {
      this._streams.error.write(line + '\n');
    }

    const color = LEVEL_COLORS[level] || '';
    if (level === 'error') {
      console.error(`${color}${line}${RESET}`);
    } else if (level === 'warn') {
      console.warn(`${color}${line}${RESET}`);
    } else {
      console.log(`${color}${line}${RESET}`);
    }
  }

  debug(message, meta) { this._write('debug', message, meta); }
  info(message, meta) { this._write('info', message, meta); }
  warn(message, meta) { this._write('warn', message, meta); }
  error(message, meta) { this._write('error', message, meta); }

  /**
   * 审计日志
   */
  audit(action, detail = {}) {
    if (!this._initialized) this.init();

    const timestamp = getLocalTime();
    const detailStr = this._stringify(detail);
    const line = `[${timestamp}] [AUDIT] ${action} ${detailStr}`;

    if (this._streams.audit) {
      this._streams.audit.write(line + '\n');
    }

    if (this._streams.app) {
      this._streams.app.write(line + '\n');
    }

    console.log(`\x1b[35m${line}${RESET}`); // 紫色
  }

  close() {
    for (const key of Object.keys(this._streams)) {
      if (this._streams[key]) {
        this._streams[key].end();
      }
    }
    this._streams = {};
    this._initialized = false;
  }
}

const logger = new Logger();
module.exports = logger;
