#!/bin/bash
# scripts/migrate.sh
# 数据库迁移脚本
#
# 文档参考：§8.1, §4.1
#
# 用途：
#   - 执行数据库迁移（schema.sql + migrations/*.sql）
#   - 通常在首次启动或升级时执行
#   - 启动时 src/index.js 也会自动执行迁移
#
# 使用方式：
#   ./scripts/migrate.sh
#
# 注意：
#   - 迁移是幂等的，已执行的迁移会自动跳过
#   - 迁移通过 migration_history 表追踪

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

DB_PATH="data/database.db"

echo "═══════════════════════════════════════"
echo "  PC28 多用户系统 - 数据库迁移"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════"
echo ""

# 1. 确保 data 目录存在
mkdir -p data
mkdir -p data/backups

# 2. 备份当前数据库（迁移前）
if [ -f "$DB_PATH" ]; then
  BACKUP_DIR="data/backups"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="${BACKUP_DIR}/pre_migrate_${TIMESTAMP}.db"

  echo "[1/3] 迁移前备份..."
  sqlite3 "$DB_PATH" ".backup '${BACKUP_FILE}'"
  chmod 600 "$BACKUP_FILE"
  echo "  ✓ 已备份到: $BACKUP_FILE"
else
  echo "[1/3] 数据库不存在，将创建新数据库"
fi

# 3. 执行迁移（通过 Node.js 脚本）
echo "[2/3] 执行迁移..."
node -e "
const { runMigrations } = require('./src/db/migrate');
try {
  runMigrations();
  console.log('  ✓ 迁移执行完成');
} catch (error) {
  console.error('  ❌ 迁移失败:', error.message);
  process.exit(1);
}
"

# 4. 验证数据库
echo "[3/3] 验证数据库..."
if [ -f "$DB_PATH" ]; then
  echo "  数据库表:"
  sqlite3 "$DB_PATH" ".tables" | tr ' ' '\n' | grep -v '^$' | awk '{print "    - " $0}'

  echo ""
  echo "  迁移历史:"
  sqlite3 "$DB_PATH" "SELECT name, executed_at FROM migration_history ORDER BY id;" 2>/dev/null | \
    awk -F'|' '{printf "    ✓ %-25s @ %s\n", $1, $2}' || echo "    (无迁移记录)"
else
  echo "  ❌ 数据库文件未创建"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ 迁移完成"
echo "═══════════════════════════════════════"
echo ""
echo "提示：启动服务时 (src/index.js) 也会自动执行迁移"