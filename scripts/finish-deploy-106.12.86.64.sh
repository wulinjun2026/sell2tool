#!/bin/bash
# 在新服务器 106.12.86.64 上执行，完成剩余部署步骤
# 用法（云控制台或 SSH 登录后）:
#   bash /opt/used-car-assistant/scripts/finish-deploy-106.12.86.64.sh

set -euo pipefail
APP_DIR=/opt/used-car-assistant
cd "$APP_DIR"

echo "==> 检查目录"
test -f server/index.js
test -f public/index.html
test -f .env

echo "==> 完成 MariaDB + npm + 服务启动"
bash "$APP_DIR/scripts/deploy-remote.sh"

echo "==> 外网健康检查"
curl -sf http://127.0.0.1:3000/api/health && echo
curl -sf http://106.12.86.64/api/health && echo
echo "==> 部署完成: http://106.12.86.64"
