#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

OS_ID=""
if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  OS_ID="${ID:-}"
fi

echo "==> Install Node.js, MariaDB and build tools ($OS_ID)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null || echo v0)" != v20* ]]; then
  if [ "$OS_ID" = "ubuntu" ] || [ "$OS_ID" = "debian" ]; then
    export DEBIAN_FRONTEND=noninteractive
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  fi
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y nodejs nginx mariadb-server build-essential python3 git curl
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y nodejs gcc-c++ make python3 git nginx gcc-toolset-11 mariadb-server 2>/dev/null || \
    dnf install -y nodejs gcc-c++ make python3 git nginx mariadb-server
else
  yum install -y nodejs gcc-c++ make python3 git nginx mariadb-server
fi

if [ -d /opt/rh/gcc-toolset-11/root/usr/bin ]; then
  export PATH=/opt/rh/gcc-toolset-11/root/usr/bin:$PATH
  export LD_LIBRARY_PATH=/opt/rh/gcc-toolset-11/root/usr/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
fi

echo "==> Node $(node -v), npm $(npm -v)"

echo "==> Configure MariaDB"
systemctl enable mariadb
systemctl start mariadb
sleep 2

MYSQL_DB="${MYSQL_DATABASE:-used_car_assistant}"
MYSQL_USER="${MYSQL_USER:-used_car}"
MYSQL_PASS="${MYSQL_PASSWORD:-UsedCar@2026!}"

if [ ! -f "$APP_DIR/.env" ]; then
  AUTH_SECRET=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  cat > "$APP_DIR/.env" << ENV
DB_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=$MYSQL_USER
MYSQL_PASSWORD='$MYSQL_PASS'
MYSQL_DATABASE=$MYSQL_DB
AUTH_SECRET=$AUTH_SECRET
PUBLIC_BASE_URL=http://127.0.0.1
ENV
fi

if [ -f "$APP_DIR/.env" ]; then
  while IFS='=' read -r k v; do
    [[ "$k" =~ ^MYSQL_(DATABASE|USER|PASSWORD)$ ]] || continue
    v="${v#\'}"; v="${v%\'}"
    case "$k" in
      MYSQL_DATABASE) MYSQL_DB="$v" ;;
      MYSQL_USER) MYSQL_USER="$v" ;;
      MYSQL_PASSWORD) MYSQL_PASS="$v" ;;
    esac
  done < <(grep -E '^MYSQL_(DATABASE|USER|PASSWORD)=' "$APP_DIR/.env")
fi

# source .env 后 mariadb 客户端会误读 MYSQL_USER，需临时 unset
mysql_admin() {
  if command -v mariadb >/dev/null 2>&1 && env -u MYSQL_USER -u MYSQL_PASSWORD -u MYSQL_DATABASE mariadb -e "SELECT 1" >/dev/null 2>&1; then
    env -u MYSQL_USER -u MYSQL_PASSWORD -u MYSQL_DATABASE -u MYSQL_HOST -u MYSQL_PORT mariadb "$@"
  elif env -u MYSQL_USER -u MYSQL_PASSWORD -u MYSQL_DATABASE mysql --protocol=SOCKET -e "SELECT 1" >/dev/null 2>&1; then
    env -u MYSQL_USER -u MYSQL_PASSWORD -u MYSQL_DATABASE -u MYSQL_HOST -u MYSQL_PORT mysql --protocol=SOCKET "$@"
  elif env -u MYSQL_USER -u MYSQL_PASSWORD -u MYSQL_DATABASE mysql -e "SELECT 1" >/dev/null 2>&1; then
    env -u MYSQL_USER -u MYSQL_PASSWORD -u MYSQL_DATABASE -u MYSQL_HOST -u MYSQL_PORT mysql "$@"
  else
    echo "ERROR: 无法以系统 root 连接 MariaDB，请手动执行: mariadb -e \"SELECT 1\""
    exit 1
  fi
}

mysql_admin << SQL
CREATE DATABASE IF NOT EXISTS \`$MYSQL_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$MYSQL_USER'@'localhost' IDENTIFIED BY '$MYSQL_PASS';
GRANT ALL PRIVILEGES ON \`$MYSQL_DB\`.* TO '$MYSQL_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> Install dependencies"
export CC="${CC:-gcc}"
export CXX="${CXX:-g++}"
if [ ! -d "$APP_DIR/node_modules/express" ]; then
  npm ci --omit=dev
else
  echo "    已包含预编译 node_modules，跳过 npm ci"
fi

echo "==> Ensure data directories"
mkdir -p "$APP_DIR/data/uploads/vehicles"

echo "==> systemd service"
cat > /etc/systemd/system/used-car-assistant.service << UNIT
[Unit]
Description=Used Car Assistant
After=network.target mariadb.service
Requires=mariadb.service

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

echo "==> nginx config"
if [ "$OS_ID" = "ubuntu" ] || [ "$OS_ID" = "debian" ]; then
  cat > /etc/nginx/sites-available/used-car-assistant << 'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/used-car-assistant /etc/nginx/sites-enabled/used-car-assistant
  rm -f /etc/nginx/sites-enabled/default
else
  cat > /etc/nginx/conf.d/used-car-assistant.conf << 'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
  if [ -f /etc/nginx/nginx.conf ] && grep -q 'listen.*80' /etc/nginx/nginx.conf 2>/dev/null; then
    sed -i 's/^[[:space:]]*listen.*80.*default_server;/    # &/' /etc/nginx/nginx.conf || true
  fi
fi

echo "==> Start services"
systemctl daemon-reload
systemctl enable used-car-assistant nginx mariadb
systemctl restart mariadb
systemctl restart used-car-assistant
nginx -t
systemctl restart nginx

if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http || true
  firewall-cmd --reload || true
fi

sleep 3
echo "==> Health check"
curl -sf http://127.0.0.1:3000/api/health
echo
curl -sf http://127.0.0.1/api/health
echo
systemctl is-active used-car-assistant nginx mariadb
echo "==> Deploy done (MySQL: $MYSQL_DB / $MYSQL_USER)"
