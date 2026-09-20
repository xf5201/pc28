// src/utils/config.loader.js
const path = require('path');
const fs = require('fs');

/**
 * 配置加载器
 *
 * 文档参考：§11.3 .env 配置
 *
 * 必填项：
 *   BOT_TOKEN      - Telegram Bot Token
 *   TG_API_ID      - Telegram API ID
 *   TG_API_HASH    - Telegram API Hash
 *
 * 可选项（有默认值）：
 *   DATABASE_PATH  - 数据库路径（默认 ./data/database.db）
 *   LOG_LEVEL      - 日志级别（默认 info）
 *   LOG_DIR        - 日志目录（默认 ./logs）
 *   TZ             - 时区（默认 Asia/Shanghai）
 *   NODE_ENV       - 运行环境（默认 production）
 */

// 加载 .env（如果存在）
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

/**
 * 必填配置项
 */
const REQUIRED_KEYS = ['BOT_TOKEN', 'TG_API_ID', 'TG_API_HASH'];

/**
 * 配置默认值
 */
const DEFAULTS = {
  DATABASE_PATH: './data/database.db',
  LOG_LEVEL: 'info',
  LOG_DIR: './logs',
  TZ: 'Asia/Shanghai',
  NODE_ENV: 'production',
  CRAWLER_INTERVAL_MS: '5000',
};

/**
 * 加载并校验配置
 *
 * @returns {object} 配置对象
 * @throws {Error} 缺少必填配置时抛出
 */
function loadConfig() {
  const missing = [];

  // 校验必填项
  for (const key of REQUIRED_KEYS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `缺少必填环境变量: ${missing.join(', ')}\n` +
      `请在 .env 文件中配置`
    );
  }

  // 合并默认值
  const config = {
    // 必填
    botToken: process.env.BOT_TOKEN,
    tgApiId: parseInt(process.env.TG_API_ID, 10),
    tgApiHash: process.env.TG_API_HASH,

    // 可选（带默认值）
    databasePath: process.env.DATABASE_PATH || DEFAULTS.DATABASE_PATH,
    logLevel: process.env.LOG_LEVEL || DEFAULTS.LOG_LEVEL,
    logDir: process.env.LOG_DIR || DEFAULTS.LOG_DIR,
    timezone: process.env.TZ || DEFAULTS.TZ,
    nodeEnv: process.env.NODE_ENV || DEFAULTS.NODE_ENV,
    crawlerIntervalMs: parseInt(
      process.env.CRAWLER_INTERVAL_MS || DEFAULTS.CRAWLER_INTERVAL_MS,
      10
    ),
  };

  // 校验 TG_API_ID 为数字
  if (isNaN(config.tgApiId)) {
    throw new Error('TG_API_ID 必须为数字');
  }

  return config;
}

/**
 * 获取配置（单例缓存）
 * @returns {object}
 */
let _cachedConfig = null;
function getConfig() {
  if (!_cachedConfig) {
    _cachedConfig = loadConfig();
  }
  return _cachedConfig;
}

/**
 * 获取单个配置项
 * @param {string} key
 * @returns {*}
 */
function get(key) {
  return getConfig()[key];
}

/**
 * 判断是否为生产环境
 * @returns {boolean}
 */
function isProduction() {
  return getConfig().nodeEnv === 'production';
}

/**
 * 判断是否为开发环境
 * @returns {boolean}
 */
function isDevelopment() {
  return getConfig().nodeEnv === 'development';
}

module.exports = {
  loadConfig,
  getConfig,
  get,
  isProduction,
  isDevelopment,
};