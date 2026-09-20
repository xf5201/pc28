#!/bin/bash
# scripts/setup-termux.sh
# Termux 环境初始化脚本
#
# 文档参考：§11.1, §11.2
#
# 用途：
#   - 安装系统依赖（nodejs, git, openssl, sqlite, termux-api）
#   - 安装全局工具（pm2）
#   - 创建项目目录结构
#   - 初始化 .env 文件
#   - 设置文件权限
#
# 使用方式：
#   chmod +x scripts/setup-termux.sh
#   ./scripts/setup-termux.sh

set -e

echo "═══════════════════════════════════════"
echo "  PC28 多用户系统 - Termux 环境初始化"
echo "═══════════════════════════════════════"

# 项目根目录（脚本所在目录的上一级）
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "[1/6] 更新系统包..."
pkg update -y && pkg upgrade -y

echo "[2/6] 安装系统依赖..."
pkg install -y nodejs git openssl sqlite screen termux-api

echo "[3/6] 安装全局工具（pm2）..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
  echo "  ✓ pm2 已安装"
else
  echo "  ✓ pm2 已存在"
fi

echo "[4/6] 创建项目目录结构..."
mkdir -p data/backups
mkdir -p logs
mkdir -p scripts

echo "[5/6] 安装 Node.js 依赖..."
if [ ! -d "node_modules" ]; then
  npm install
  echo "  ✓ npm install 完成"
else
  echo "  ✓ node_modules 已存在"
fi

echo "[6/6] 初始化配置文件..."
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "  ✓ .env 已从 .env.example 复制"
    echo ""
    echo "  ⚠️  请编辑 .env 文件填入实际配置："
    echo "     nano .env"
    echo ""
  else
    echo "  ⚠️  .env.example 不存在，请手动创建 .env"
  fi
else
  echo "  ✓ .env 已存在"
fi

# 设置文件权限（§12.1）
echo ""
echo "[权限设置]"
chmod 600 .env 2>/dev/null && echo "  ✓ .env → 600" || true
chmod 600 data/database.db 2>/dev/null && echo "  ✓ database.db → 600" || true
chmod 700 data/backups && echo "  ✓ data/backups → 700"
chmod 700 logs && echo "  ✓ logs → 700"
chmod +x scripts/*.sh && echo "  ✓ scripts/*.sh → +x"

# 启用 termux 保活
echo ""
echo "[保活设置]"
echo "  建议执行以下命令防止系统杀后台："
echo "    termux-wake-lock"
echo ""

# PM2 开机自启
echo "[PM2 自启动]"
echo "  建议执行以下命令设置开机自启："
echo "    pm2 startup"
echo "    pm2 save"
echo ""

echo "═══════════════════════════════════════"
echo "  ✓ 环境初始化完成"
echo "═══════════════════════════════════════"
echo ""
echo "下一步："
echo "  1. 编辑 .env 文件填入 BOT_TOKEN / TG_API_ID / TG_API_HASH"
echo "  2. 执行 ./scripts/start.sh 启动服务"
echo ""