#!/bin/bash
# scripts/health-check.sh
# 健康检查脚本
#
# 文档参考：§11.5
#
# 用途：
#   - 检查 PM2 服务状态
#   - 检查数据库文件权限
#   - 检查账号状态分布
#   - 检查下注记录状态分布
#   - 检查策略运行状态
#   - 检查待结算下注
#   - 检查日志文件大小
#
# 使用方式：
#   ./scripts/health-check.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

DB_PATH="data/database.db"

echo "═══════════════════════════════════════"
echo "  PC28 多用户系统 - 健康检查"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════"
echo ""

# ── 1. PM2 服务状态 ──
echo "[1/7] PM2 服务状态"
echo "─────────────────────────────────────"
if pm2 describe pc28-bot &> /dev/null; then
  pm2 status pc28-bot
else
  echo "  ❌ 服务未注册到 PM2"
fi
echo ""

# ── 2. 数据库文件检查 ──
echo "[2/7] 数据库文件"
echo "─────────────────────────────────────"
if [ -f "$DB_PATH" ]; then
  DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
  DB_PERM=$(stat -c %a "$DB_PATH" 2>/dev/null || stat -f %Lp "$DB_PATH" 2>/dev/null)
  echo "  路径: $DB_PATH"
  echo "  大小: $DB_SIZE"
  echo "  权限: $DB_PERM"
  if [ "$DB_PERM" = "600" ]; then
    echo "  ✓ 权限正确 (600)"
  else
    echo "  ⚠️  权限异常，建议: chmod 600 $DB_PATH"
  fi

  # WAL 文件
  if [ -f "${DB_PATH}-wal" ]; then
    WAL_SIZE=$(du -h "${DB_PATH}-wal" | cut -f1)
    echo "  WAL 大小: $WAL_SIZE"
  fi
else
  echo "  ❌ 数据库文件不存在: $DB_PATH"
fi
echo ""

# ── 3. 账号状态分布 ──
echo "[3/7] 账号状态分布"
echo "─────────────────────────────────────"
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" "SELECT status, COUNT(*) as count FROM accounts GROUP BY status;" 2>/dev/null | \
    awk -F'|' '{printf "  %-15s %d 个\n", $1, $2}' || echo "  (无数据)"
else
  echo "  (数据库不存在)"
fi
echo ""

# ── 4. 策略运行状态 ──
echo "[4/7] 策略运行状态"
echo "─────────────────────────────────────"
if [ -f "$DB_PATH" ]; then
  RUNNING=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM strategy_config WHERE is_running = 1;" 2>/dev/null || echo "0")
  STOPPED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM strategy_config WHERE is_running = 0;" 2>/dev/null || echo "0")
  echo "  🟢 运行中: $RUNNING 个"
  echo "  🔴 已停止: $STOPPED 个"
else
  echo "  (数据库不存在)"
fi
echo ""

# ── 5. 下注记录状态分布 ──
echo "[5/7] 下注记录状态分布"
echo "─────────────────────────────────────"
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" "SELECT status, COUNT(*) as count FROM bet_records GROUP BY status;" 2>/dev/null | \
    awk -F'|' '{printf "  %-15s %d 条\n", $1, $2}' || echo "  (无数据)"
else
  echo "  (数据库不存在)"
fi
echo ""

# ── 6. 待结算下注检查 ──
echo "[6/7] 待结算下注"
echo "─────────────────────────────────────"
if [ -f "$DB_PATH" ]; then
  PENDING_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM bet_records WHERE status IN ('SENT','PENDING');" 2>/dev/null || echo "0")
  if [ "$PENDING_COUNT" -gt 0 ]; then
    echo "  ⚠️  发现 $PENDING_COUNT 条待结算下注"
    echo ""
    echo "  按用户分布:"
    sqlite3 "$DB_PATH" "SELECT bot_user_id, COUNT(*) as count FROM bet_records WHERE status IN ('SENT','PENDING') GROUP BY bot_user_id;" 2>/dev/null | \
      awk -F'|' '{printf "    用户 %-15s %d 条\n", $1, $2}'
  else
    echo "  ✓ 无待结算下注"
  fi
else
  echo "  (数据库不存在)"
fi
echo ""

# ── 7. 日志文件检查 ──
echo "[7/7] 日志文件"
echo "─────────────────────────────────────"
for log in app.log error.log audit.log; do
  if [ -f "logs/$log" ]; then
    SIZE=$(du -h "logs/$log" | cut -f1)
    LINES=$(wc -l < "logs/$log")
    echo "  $log: $SIZE ($LINES 行)"
  else
    echo "  $log: (不存在)"
  fi
done
echo ""

# ── 汇总 ──
echo "═══════════════════════════════════════"
echo "  健康检查完成"
echo "═══════════════════════════════════════"