#!/bin/bash
# 从 tar 包解压后，在目标服务器执行完整部署
# 用法: cd /opt/used-car-assistant && bash scripts/install-from-tarball.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f "$APP_DIR/server/index.js" ]; then
  echo "ERROR: 请在解压后的应用根目录运行（需包含 server/index.js）"
  exit 1
fi

if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "ERROR: 缺少 node_modules，请使用完整 tar 包或执行 npm ci --omit=dev"
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "==> 已从 .env.example 创建 .env，请编辑后重新运行"
  echo "    vi $APP_DIR/.env"
  exit 1
fi

bash "$APP_DIR/scripts/deploy-remote.sh"
