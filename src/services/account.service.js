// src/services/account.service.js
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');

const accountDao = require('../db/account.dao');
const strategyConfigDao = require('../db/strategy-config.dao');
const betRecordDao = require('../db/bet-record.dao');
const profitLogDao = require('../db/profit-log.dao');
const operationLogDao = require('../db/operation-log.dao');
const panelContextDao = require('../db/panel-context.dao');
const { transaction } = require('../db/connection');
const { maskPhone } = require('../utils/mask.util');
const logger = require('../utils/logger');

// ↓↓↓ 动态判断代理 ↓↓↓
function getProxyConfig() {
  if (!process.env.http_proxy && !process.env.HTTP_PROXY) {
    return null; // 没开代理，直连
  }
  return {
    ip: '127.0.0.1',
    port: 7890,
    socksType: 5,
    timeout: 10000,
  };
}

class AccountService {
  constructor(sessionManager, config) {
    this.sessionManager = sessionManager;
    this.apiId = config.apiId;
    this.apiHash = config.apiHash;
    this._tempClients = new Map();
    
    this._clientOptions = {
      connectionRetries: 3,
      deviceModel: 'Android',
      systemVersion: '13',
      appVersion: '10.15.0',
      langCode: 'zh',
    };
  }

  async initiateLogin(botUserId, phone) {
    logger.info(`[ACCOUNT] 用户 ${botUserId} 发起登录: ${maskPhone(phone)}`);

    if (this._tempClients.has(botUserId)) {
      try { await this._tempClients.get(botUserId).client.disconnect(); } catch (_) {}
      this._tempClients.delete(botUserId);
    }

    const session = new StringSession('');
    const proxy = getProxyConfig();

    const client = new TelegramClient(session, this.apiId, this.apiHash, {
      ...this._clientOptions,
      ...(proxy ? { proxy } : {}),
    });

    await client.connect();

    const result = await client.sendCode(
      { 
        apiId: this.apiId, 
        apiHash: this.apiHash,
        deviceModel: this._clientOptions.deviceModel,
        systemVersion: this._clientOptions.systemVersion,
        appVersion: this._clientOptions.appVersion,
        langCode: this._clientOptions.langCode,
      },
      phone
    );

    this._tempClients.set(botUserId, {
      client,
      phone,
      phoneCodeHash: result.phoneCodeHash,
    });

    logger.info(`[ACCOUNT] 用户 ${botUserId} 验证码已发送`);
  }

  async submitCode(botUserId, code) {
    const temp = this._tempClients.get(botUserId);
    if (!temp) throw new Error('登录会话已过期，请重新开始');

    const { client, phone, phoneCodeHash } = temp;
    logger.info(`[ACCOUNT] 用户 ${botUserId} 提交验证码`);

    const formattedCode = String(code).replace(/\s+/g, '').split('').join(' ');

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: formattedCode,
        })
      );
      return await this._finalizeLogin(botUserId, client, phone);
    } catch (error) {
      if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        logger.info(`[ACCOUNT] 用户 ${botUserId} 需要 2FA 验证`);
        return { need2FA: true, phone };
      }
      if (error.errorMessage === 'PHONE_CODE_INVALID') {
        throw new Error('验证码错误');
      }
      throw error;
    }
  }

  async submit2FA(botUserId, password) {
    const temp = this._tempClients.get(botUserId);
    if (!temp) throw new Error('登录会话已过期，请重新开始');

    const { client, phone } = temp;
    logger.info(`[ACCOUNT] 用户 ${botUserId} 提交 2FA`);

    try {
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      const passwordSrp = await computeCheck(passwordInfo, password);

      await client.invoke(
        new Api.auth.CheckPassword({ password: passwordSrp })
      );
      
      return await this._finalizeLogin(botUserId, client, phone);
    } catch (error) {
      // ★★★ 新增：打印完整堆栈，定位真实错误源 ★★★
      console.error('[SUBMIT_2FA_ERROR]', error.stack);

      if (error.errorMessage === 'PASSWORD_HASH_INVALID') {
        throw new Error('2FA 密码错误');
      }
      if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        try { await client.disconnect(); } catch (_) {}
        this._tempClients.delete(botUserId);
        throw new Error('2FA 会话已失效，请重新开始登录流程');
      }
      throw error;
    }
  }

  async _finalizeLogin(botUserId, client, phone) {
    const sessionString = client.session.save();

    try { await client.disconnect(); } catch (_) {}
    this._tempClients.delete(botUserId);

    transaction(() => {
      const existing = accountDao.getActive(botUserId);
      if (existing) {
        accountDao.updateSession(botUserId, sessionString);
      } else {
        accountDao.insert({
          bot_user_id: botUserId,
          phone,
          session_string: sessionString,
          status: 'PENDING_SETUP',
        });
        strategyConfigDao.insert({
          bot_user_id: botUserId,
          mode: '2.84',
          play_type: '顺龙',
          base_bet: 100,
          martingale_ratio: 2.0,
          cut_off_seconds: 10,
        });
      }
      operationLogDao.insert({
        bot_user_id: botUserId,
        action: 'LOGIN',
        detail: `登录成功: ${maskPhone(phone)}`,
      });
    });

    await this.sessionManager.initClient(botUserId, sessionString);
    logger.info(`[ACCOUNT] 用户 ${botUserId} 登录完成: ${maskPhone(phone)}`);
    return { need2FA: false, phone };
  }

  async deleteAccount(botUserId) {
    logger.info(`[ACCOUNT] 用户 ${botUserId} 开始删除账号`);
    const strategy = strategyConfigDao.getById(botUserId);
    if (strategy && strategy.is_running === 1) {
      strategyConfigDao.setStopped(botUserId);
    }
    await this.sessionManager.destroyClient(botUserId);

    transaction(() => {
      profitLogDao.deleteByUser(botUserId);   // 先删 profit_logs（解除外键引用）
      betRecordDao.deleteByUser(botUserId);   // 再删 bet_records
      strategyConfigDao.deleteByUser(botUserId);
      operationLogDao.deleteByUser(botUserId);
      accountDao.deleteByUser(botUserId);
      panelContextDao.delete(botUserId);
    });
    logger.info(`[ACCOUNT] 用户 ${botUserId} 账号已删除`);
  }

  async updateTargetChat(botUserId, chatId, chatTitle) {
    const account = accountDao.getActive(botUserId);
    if (!account) throw new Error('请先登录执行账号');

    accountDao.updateTargetChat(botUserId, chatId, chatTitle);
    operationLogDao.insert({
      bot_user_id: botUserId,
      action: 'UPDATE_TARGET_CHAT',
      detail: `下注群: ${chatTitle} (${chatId})`,
    });
    logger.info(`[ACCOUNT] 用户 ${botUserId} 下注群已配置: ${chatTitle} (${chatId})`);
  }

  getAccount(botUserId) {
    return accountDao.getActive(botUserId);
  }
}

module.exports = AccountService;
