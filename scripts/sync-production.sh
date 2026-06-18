#!/bin/bash
# 同步 frontend + server 到生产并重启服务
# 用法: bash scripts/sync-production.sh
# 首次建议: ssh-copy-id root@106.12.40.212  配置免密后再执行

set -euo pipefail

HOST="${DEPLOY_HOST:-root@106.12.40.212}"
APP_DIR="${DEPLOY_DIR:-/opt/used-car-assistant}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 同步 public/ -> ${HOST}:${APP_DIR}/public/"
rsync -avz --delete "$ROOT/public/" "${HOST}:${APP_DIR}/public/"

echo "==> 同步 server/ -> ${HOST}:${APP_DIR}/server/"
rsync -avz \
  --exclude node_modules \
  --exclude '*.db' \
  "$ROOT/server/" "${HOST}:${APP_DIR}/server/"

echo "==> 同步 assets/templates/ -> ${HOST}:${APP_DIR}/assets/templates/"
rsync -avz "$ROOT/assets/templates/" "${HOST}:${APP_DIR}/assets/templates/"

echo "==> 重启 used-car-assistant"
ssh "$HOST" "systemctl restart used-car-assistant && sleep 2 && systemctl is-active used-car-assistant"

echo "==> 健康检查"
ssh "$HOST" "curl -sf http://127.0.0.1:3000/api/health && echo && curl -sf http://127.0.0.1/api/health && echo"

echo "==> 部署完成: http://106.12.40.212"
