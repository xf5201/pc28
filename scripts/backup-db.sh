#!/bin/bash
# scripts/backup-db.sh
# 数据库备份脚本
#
# 文档参考：§11.5, §12.1, §12.2
#
# 用途：
#   - 使用 sqlite3 .backup 命令安全备份数据库
#   - 设置备份文件权限为 600
#   - 自动清理 7 天前的旧备份
#
# 使用方式：
#   ./scripts/backup-db.sh
#
# 建议通过 crontab 定时执行：
#   0 3 * * * /path/to/scripts/backup-db.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

DB_PATH="data/database.db"
BACKUP_DIR="data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/database_${TIMESTAMP}.db"
RETENTION_DAYS=7

echo "═══════════════════════════════════════"
echo "  PC28 多用户系统 - 数据库备份"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════"
echo ""

# 1. 检查数据库文件
if [ ! -f "$DB_PATH" ]; then
  echo "❌ 数据库文件不存在: $DB_PATH"
  exit 1
fi

# 2. 确保备份目录存在
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# 3. 执行备份（使用 sqlite3 .backup 命令，安全在线备份）
echo "[1/3] 备份数据库..."
DB_SIZE_BEFORE=$(du -h "$DB_PATH" | cut -f1)
echo "  源文件: $DB_PATH ($DB_SIZE_BEFORE)"

sqlite3 "$DB_PATH" ".backup '${BACKUP_FILE}'"

if [ -f "$BACKUP_FILE" ]; then
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "  ✓ 备份完成: $BACKUP_FILE ($BACKUP_SIZE)"
else
  echo "  ❌ 备份失败"
  exit 1
fi

# 4. 设置备份文件权限（§12.1, §12.2）
echo "[2/3] 设置文件权限..."
chmod 600 "$BACKUP_FILE"
echo "  ✓ $BACKUP_FILE → 600"

# 5. 清理旧备份
echo "[3/3] 清理 ${RETENTION_DAYS} 天前的旧备份..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "*.db" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
if [ "$DELETED_COUNT" -gt 0 ]; then
  echo "  ✓ 已删除 $DELETED_COUNT 个旧备份"
else
  echo "  ℹ️  无旧备份需要清理"
fi

# 6. 列出当前所有备份
echo ""
echo "当前备份列表:"
echo "─────────────────────────────────────"
ls -lh "$BACKUP_DIR"/*.db 2>/dev/null | awk '{printf "  %s %s %s\n", $6, $7, $8, $9}' || echo "  (无备份)"

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ 备份完成"
echo "═══════════════════════════════════════"