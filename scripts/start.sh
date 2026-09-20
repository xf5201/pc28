#!/bin/bash
# scripts/start.sh
# 启动服务脚本
#
# 文档参考：§11.4, §11.5
#
# 用途：
#   - 启用 termux-wake-lock 防止锁屏冻结
#   - 通过 PM2 启动服务
#   - 检查服务状态
#
# 使用方式：
#   ./scripts/start.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "═══════════════════════════════════════"
echo "  PC28 多用户系统 - 启动"
echo "═══════════════════════════════════════"

# 1. 启用 termux 保活
echo "[1/4] 启用 termux-wake-lock..."
termux-wake-lock 2>/dev/null && echo "  ✓ 已启用" || echo "  ⚠️  termux-wake-lock 不可用（非 Termux 环境？）"

# 2. 检查 .env 配置
echo "[2/4] 检查配置文件..."
if [ ! -f ".env" ]; then
  echo "  ❌ .env 不存在，请先执行 ./scripts/setup-termux.sh"
  exit 1
fi

if ! grep -q "BOT_TOKEN=.*[a-zA-Z0-9]" .env 2>/dev/null; then
  echo "  ❌ BOT_TOKEN 未配置，请编辑 .env"
  exit 1
fi

echo "  ✓ 配置文件已就绪"

# 3. 检查 PM2 是否已在运行
echo "[3/4] 检查服务状态..."
if pm2 describe pc28-bot &> /dev/null; then
  STATUS=$(pm2 jlist 2>/dev/null | grep -o '"name":"pc28-bot"[^}]*"status":"[^"]*"' | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  if [ "$STATUS" = "online" ]; then
    echo "  ⚠️  服务已在运行中"
    pm2 status pc28-bot
    echo ""
    echo "  如需重启，请执行: ./scripts/restart.sh"
    exit 0
  else
    echo "  ℹ️  服务存在但未运行（状态: $STATUS），将重新启动"
  fi
else
  echo "  ℹ️  服务未启动"
fi

# 4. 启动服务
echo "[4/4] 启动服务..."
if [ -f "ecosystem.config.js" ]; then
  pm2 start ecosystem.config.js
else
  pm2 start src/index.js --name pc28-bot
fi

# 保存 PM2 状态（用于重启恢复）
pm2 save 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ 服务已启动"
echo "═══════════════════════════════════════"
echo ""
pm2 status pc28-bot
echo ""
echo "查看日志: pm2 logs pc28-bot"
echo "停止服务: ./scripts/stop.sh"
echo "健康检查: ./scripts/health-check.sh"