#!/bin/bash
# scripts/stop.sh
# 停止服务脚本
#
# 文档参考：§11.5
#
# 用途：
#   - 通过 PM2 停止服务
#   - 释放 termux-wake-lock
#
# 使用方式：
#   ./scripts/stop.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "═══════════════════════════════════════"
echo "  PC28 多用户系统 - 停止"
echo "═══════════════════════════════════════"

# 1. 停止 PM2 服务
echo "[1/2] 停止服务..."
if pm2 describe pc28-bot &> /dev/null; then
  pm2 stop pc28-bot
  echo "  ✓ 服务已停止"
else
  echo "  ℹ️  服务未运行"
fi

# 2. 释放 termux 保活锁
echo "[2/2] 释放 termux-wake-lock..."
termux-wake-unlock 2>/dev/null && echo "  ✓ 已释放" || echo "  ⚠️  无 wake-lock 可释放"

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ 服务已停止"
echo "═══════════════════════════════════════"
echo ""
echo "重新启动: ./scripts/start.sh"