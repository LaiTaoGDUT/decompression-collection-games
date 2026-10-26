#!/bin/bash
set -euo pipefail
umask 077
BACKUP_DIR=/opt/decompression-api/backups
install -d -m 700 "$BACKUP_DIR"
BACKUP_PATH=$BACKUP_DIR/decompression-api-$(date -u +%Y%m%dT%H%M%SZ).dump
runuser -u postgres -- pg_dump --format=custom --dbname=decompression_api > "$BACKUP_PATH"
runuser -u postgres -- pg_restore --list < "$BACKUP_PATH" >/dev/null
echo "Verified database backup: $BACKUP_PATH"
# 只清理本服务生成、且已有新备份成功校验的 14 天前备份。
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'decompression-api-[0-9]*.dump' -mtime +14 -delete
