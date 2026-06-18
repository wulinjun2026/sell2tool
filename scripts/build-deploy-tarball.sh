#!/bin/bash
# 打包完整部署 tar 包（含 Linux x64 生产依赖 node_modules）
# 用法: bash scripts/build-deploy-tarball.sh
# 输出: dist/used-car-assistant-<version>-linux-x64.tar.gz

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version" 2>/dev/null || echo 1.0.0)"
STAMP="$(date +%Y%m%d)"
PKG_NAME="used-car-assistant-${VERSION}-linux-x64-${STAMP}"
STAGE="$ROOT/dist/.pack-staging/$PKG_NAME"
OUT_DIR="$ROOT/dist"
TARBALL="$OUT_DIR/${PKG_NAME}.tar.gz"

echo "==> 清理并创建 staging: $STAGE"
rm -rf "$ROOT/dist/.pack-staging"
mkdir -p "$STAGE"/{assets/fonts,assets/fixtures,data/uploads/vehicles,scripts}

echo "==> 复制应用代码"
rsync -a \
  --exclude '.DS_Store' \
  "$ROOT/public/" "$STAGE/public/"
rsync -a \
  --exclude '.DS_Store' \
  "$ROOT/server/" "$STAGE/server/"
rsync -a "$ROOT/assets/templates/" "$STAGE/assets/templates/"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$STAGE/"
cp "$ROOT/.env.example" "$STAGE/"
cp "$ROOT/scripts/deploy-remote.sh" "$ROOT/scripts/install-from-tarball.sh" "$STAGE/scripts/"
[ -f "$ROOT/scripts/finish-deploy-106.12.86.64.sh" ] && \
  cp "$ROOT/scripts/finish-deploy-106.12.86.64.sh" "$STAGE/scripts/" || true

echo "==> 复制字体与 fixtures"
if [ -f "$ROOT/assets/fonts/STHeiti-Medium.ttc" ]; then
  rsync -a "$ROOT/assets/fonts/" "$STAGE/assets/fonts/"
elif [ -d /tmp/used-car-fonts ] && [ -f /tmp/used-car-fonts/STHeiti-Medium.ttc ]; then
  rsync -a /tmp/used-car-fonts/ "$STAGE/assets/fonts/"
else
  for HOST in root@106.12.86.64 root@106.12.40.212; do
    if SSHPASS='Wulinjun@2' sshpass -e rsync -az -e "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8" \
      "${HOST}:/opt/used-car-assistant/assets/fonts/" "$STAGE/assets/fonts/" 2>/dev/null; then
      echo "    已从 $HOST 同步字体"
      break
    fi
  done
fi

if [ -f "$ROOT/assets/fixtures/sample_qrcode.png" ]; then
  rsync -a "$ROOT/assets/fixtures/" "$STAGE/assets/fixtures/"
else
  for HOST in root@106.12.86.64 root@106.12.40.212; do
    if SSHPASS='Wulinjun@2' sshpass -e rsync -az -e "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8" \
      "${HOST}:/opt/used-car-assistant/assets/fixtures/" "$STAGE/assets/fixtures/" 2>/dev/null; then
      break
    fi
  done
fi

if [ ! -f "$STAGE/assets/fonts/STHeiti-Medium.ttc" ]; then
  echo "WARN: 缺少 assets/fonts/STHeiti-Medium.ttc，长图中文可能异常"
fi

echo "==> 在 Docker (linux/amd64) 中安装生产依赖"
install_linux_deps() {
  local dir="$1"
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker run --rm --platform linux/amd64 \
      -v "$dir:/app" -w /app \
      node:20-bookworm-slim \
      bash -c "apt-get update -qq && apt-get install -y -qq python3 make g++ >/dev/null && npm ci --omit=dev"
    return 0
  fi

  local host="${REMOTE_BUILD_HOST:-root@106.12.86.64}"
  echo "    Docker 不可用，改用远程 Linux 构建: $host"
  local remote="/tmp/used-car-pack-build-$$"
  local rsync_ssh=(ssh -o StrictHostKeyChecking=no)
  local run_ssh=(ssh -o StrictHostKeyChecking=no)
  if [ -n "${SSHPASS:-}" ] && command -v sshpass >/dev/null 2>&1; then
    rsync_ssh=(sshpass -e ssh -o StrictHostKeyChecking=no)
    run_ssh=(sshpass -e ssh -o StrictHostKeyChecking=no)
  fi
  rsync -az --delete -e "${rsync_ssh[*]}" "$dir/" "${host}:${remote}/"
  "${run_ssh[@]}" "$host" \
    "cd '$remote' && export CC=gcc CXX=g++ && npm ci --omit=dev && rm -rf node_modules/.cache"
  rsync -az -e "${rsync_ssh[*]}" "${host}:${remote}/node_modules/" "$dir/node_modules/"
  "${run_ssh[@]}" "$host" "rm -rf '$remote'"
}

install_linux_deps "$STAGE"

echo "==> 写入部署说明"
cat > "$STAGE/DEPLOY.md" << MD
# 通用产品销售助手 - 全功能离线部署包

版本: ${VERSION} · 构建: ${STAMP} · 平台: Linux x86_64

## 包含内容

- \`public/\` 前端（登录、多用户、产品管理、长图客户端渲染）
- \`server/\` Node.js 后端 + MySQL/SQLite 迁移
- \`assets/templates/\` 长图模板；\`assets/fonts/\` 中文字体
- \`node_modules/\` Linux x64 生产依赖（含 sharp、better-sqlite3 预编译）
- \`scripts/install-from-tarball.sh\` 一键部署入口

## 环境要求

- Linux x86_64（Ubuntu 20.04+ / Debian / CentOS 8+ / RHEL 9+）
- root 或 sudo
- 端口 80（Nginx）、3000（Node 内网）、3306（MariaDB 本机）

## 快速部署（新服务器）

\`\`\`bash
# 1. 上传 tar 包到服务器
scp dist/used-car-assistant-*-linux-x64-*.tar.gz root@YOUR_SERVER:/tmp/

# 2. 解压
mkdir -p /opt/used-car-assistant
tar -xzf /tmp/used-car-assistant-*-linux-x64-*.tar.gz -C /opt/used-car-assistant --strip-components=1

# 3. 配置环境变量
cd /opt/used-car-assistant
cp .env.example .env
vi .env
# 必改: PUBLIC_BASE_URL、AUTH_SECRET、MYSQL_PASSWORD
# 可选: VISION_API_KEY（AI 卖点/润色）

# 4. 一键安装（MariaDB + Nginx + systemd + 启动）
bash scripts/install-from-tarball.sh
\`\`\`

安装完成后访问: \`http://服务器IP/\`

## .env 关键项

| 变量 | 说明 |
|------|------|
| PUBLIC_BASE_URL | 对外 URL，如 http://1.2.3.4 |
| AUTH_SECRET | JWT 密钥，生产环境必须修改 |
| AUTH_DEV_MODE=true | 开发模式：验证码在接口返回 devCode（生产关闭） |
| MYSQL_* | 数据库连接 |
| VISION_API_KEY | DeepSeek 等文本 API（无 Key 时走本地模板兜底） |

## 数据目录

| 路径 | 说明 |
|------|------|
| data/uploads/vehicles/ | 产品照片 |
| data/uploads/dealer/ | 用户微信二维码 |
| MySQL used_car_assistant | 用户、产品、卖点、分享、生成记录 |

备份时请同时备份 **MySQL 全库** 与 **data/uploads/**。

## 仅更新代码（保留数据）

\`\`\`bash
cd /opt/used-car-assistant
tar -xzf /tmp/used-car-assistant-*-linux-x64-*.tar.gz -C /tmp/uca-new --strip-components=1
rsync -a /tmp/uca-new/public/ /tmp/uca-new/server/ /tmp/uca-new/assets/ ./ 
# 可选覆盖 node_modules: rsync -a /tmp/uca-new/node_modules/ ./node_modules/
systemctl restart used-car-assistant
curl -sf http://127.0.0.1/api/health
\`\`\`

## 常用命令

\`\`\`bash
systemctl status used-car-assistant
journalctl -u used-car-assistant -f
curl http://127.0.0.1/api/health
\`\`\`
MD

echo "==> 生成 tar.gz"
mkdir -p "$OUT_DIR"
tar -czf "$TARBALL" -C "$ROOT/dist/.pack-staging" "$PKG_NAME"

BYTES=$(wc -c < "$TARBALL" | tr -d ' ')
MB=$(awk "BEGIN {printf \"%.1f\", $BYTES/1024/1024}")
echo "==> 完成: $TARBALL (${MB} MB)"
echo "    解压: mkdir -p /opt/used-car-assistant && tar -xzf $(basename "$TARBALL") -C /opt/used-car-assistant --strip-components=1"
