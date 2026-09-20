#!/bin/bash
# scripts/restart.sh
# 重启服务脚本
#
# 文档参考：§11.5, §8.9 重启恢复
#
# 用途：
#   - 通过 PM2 重启服务
#   - 重启后会自动执行 loadActiveSessions() 恢复 Session
#   - 重启后会自动恢复 is_running=1 的策略
#   - 重启后会自动检查 PENDING/SENT 下注
#
# 使用方式：
#   ./scripts/restart.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "═══════════════════════════════════════"
echo "  PC28 多用户系统 - 重启"
echo "═══════════════════════════════════════"

# 1. 启用 termux 保活
echo "[1/3] 启用 termux-wake-lock..."
termux-wake-lock 2>/dev/null && echo "  ✓ 已启用" || true

# 2. 重启服务
echo "[2/3] 重启服务..."
if pm2 describe pc28-bot &> /dev/null; then
  pm2 restart pc28-bot
else
  echo "  ℹ️  服务未运行，将启动服务"
  if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
  else
    pm2 start src/index.js --name pc28-bot
  fi
fi

# 3. 保存 PM2 状态
echo "[3/3] 保存 PM2 状态..."
pm2 save 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ 服务已重启"
echo "═══════════════════════════════════════"
echo ""
echo "重启后会自动执行："
echo "  • loadActiveSessions() 恢复 Session"
echo "  • 恢复 is_running=1 的策略"
echo "  • 检查 PENDING/SENT 下注"
echo ""
pm2 status pc28-bot
echo ""
echo "查看日志: pm2 logs pc28-bot"