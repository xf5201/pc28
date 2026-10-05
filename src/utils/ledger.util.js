// src/utils/ledger.util.js

/**
 * 等宽账本排版工具
 *
 * 面板文案统一采用 Telegram <pre> 等宽块的"账本"风格:
 *
 *   ┌ 账号 · 策略 ─────────────
 *   │ 用户   @xf5201
 *   │ 手机   +86 150****1339
 *   └─────────────────────
 *
 * <pre> 使用等宽字体,中文约为 ASCII 的两倍宽,因此标签对齐
 * 必须按"显示宽度"补空格,不能按字符数。本工具负责:
 *   - esc()          HTML 转义(<pre> 内必须转义 & < >)
 *   - displayWidth() 显示宽度计算(CJK/全角/emoji 记 2,其余记 1)
 *   - box()          生成整块账本
 *
 * 约定:框线字符(─ │ ┌ └)与标签列只使用宽度确定的字符;
 * emoji 仅出现在值里(不入标签列),避免跨设备对齐漂移。
 */

/** HTML 转义 */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 显示宽度:CJK/全角/emoji 记 2,其余记 1 */
function displayWidth(s) {
  let w = 0;
  for (const ch of String(s ?? '')) {
    const code = ch.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0x303e) || // CJK 部首·符号
      (code >= 0x3041 && code <= 0x33ff) || // 假名~CJK 符号
      (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 基本区
      (code >= 0xa000 && code <= 0xa4cf) || // 彝文
      (code >= 0xac00 && code <= 0xd7a3) || // 谚文
      (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容
      (code >= 0xfe30 && code <= 0xfe4f) || // CJK 兼容形式
      (code >= 0xff00 && code <= 0xff60) || // 全角
      (code >= 0xffe0 && code <= 0xffe6) || // 全角符号
      (code >= 0x1f300 && code <= 0x1faff); // emoji(按 2 计)
    w += wide ? 2 : 1;
  }
  return w;
}

/** 按显示宽度右侧补空格 */
function padEnd(s, width) {
  const pad = width - displayWidth(s);
  return String(s ?? '') + (pad > 0 ? ' '.repeat(pad) : '');
}

/**
 * 生成账本块(<pre>)
 *
 * @param {string} title 框顶标题(可为空)
 * @param {Array<object>} rows 行数组:
 *   { label, value }  标签值行(标签列按块内最宽标签对齐;value 会被转义)
 *   { text }          自由文本行(转义)
 *   { blank: true }   空行
 * @returns {string} <pre>...</pre>
 */
function box(title, rows = []) {
  // 1. 先组装原始行,求内容区最大宽度
  const labelWidth = Math.max(
    0,
    ...rows.map((r) => (r.label !== undefined ? displayWidth(r.label) : 0))
  );

  const lines = rows.map((r) => {
    if (r.blank) return { w: 0, body: '' };
    if (r.text !== undefined) return { w: displayWidth(r.text), body: r.text };
    return {
      w: labelWidth + 2 + displayWidth(r.value ?? ''),
      body: padEnd(r.label ?? '', labelWidth) + ' ' + (r.value ?? ''),
    };
  });

  const contentWidth = Math.max(
    displayWidth(title ?? '') + 2, // 标题行含「 」两侧空格
    ...lines.map((l) => l.w),
    12 // 最小宽度,避免空块太窄
  );

  // 2. 输出
  const head = title
    ? `┌ ${title} ` + '─'.repeat(Math.max(3, contentWidth - displayWidth(title) - 2))
    : '┌' + '─'.repeat(contentWidth + 1);
  const foot = '└' + '─'.repeat(contentWidth + 1);

  const body = lines
    .map((l) => (l.body === '' ? '│' : '│ ' + l.body))
    .join('\n');

  return `<pre>${esc(head)}\n${esc(body)}\n${esc(foot)}</pre>`;
}

/**
 * 可折叠说明块(点击展开)
 *
 * 长文案(玩法说明/回本规则等)收进 expandable blockquote,
 * 保持面板主体短小。
 *
 * @param {string} summary 折叠条标题(HTML)
 * @param {string} html 展开后的内容(HTML,调用方自行拼 <b> 等)
 */
function details(summary, html) {
  return `\n▶ ${summary}\n<blockquote expandable>${html}</blockquote>`;
}

module.exports = { esc, displayWidth, padEnd, box, details };
