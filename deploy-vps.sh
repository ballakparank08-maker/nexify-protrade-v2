#!/bin/bash
set -e

echo "=== Nexify ProTrade Automated VPS Installer ==="

# 1. System packages & Node.js 20 installation
echo "--> Installing Node.js 20, NGINX, Git..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update
apt-get install -y nodejs nginx git certbot python3-certbot-nginx
npm install -g pm2

# 2. Clone repository & install dependencies
echo "--> Cloning repository from GitHub..."
rm -rf /var/www/nexify-protrade
git clone https://github.com/ballakparank08-maker/nexify-protrade-v2.git /var/www/nexify-protrade
cd /var/www/nexify-protrade

echo "--> Installing npm dependencies and building production assets..."
npm install
npm run build:all

# 3. Create production .env file
echo "--> Creating production environment file..."
cat << 'EOF' > .env
NODE_ENV="production"
PORT="3000"
DATABASE_PATH="./server/data/nexify-protrade.json"
AUTH_SECRET="nexify-protrade-production-auth-secret-key-9988"
FRONTEND_ORIGIN="https://nexifyprotrade.com,https://www.nexifyprotrade.com"
SESSION_TTL_HOURS="168"
AUTH_COOKIE_NAME="nexify_session"
AUTH_COOKIE_SECURE="true"
AUTH_COOKIE_SAME_SITE="none"

ADMIN_BOOTSTRAP_NAME="System Administrator"
ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="ChangeMe123!"
EOF

# 4. Start PM2 process
echo "--> Launching backend service via PM2..."
pm2 delete nexify-protrade-backend 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup | tail -n 1 | bash || true

# 5. Configure NGINX reverse proxy
echo "--> Configuring NGINX for nexifyprotrade.online and nexifyprotrade.com..."
cat << 'EOF' > /etc/nginx/sites-available/nexify-protrade
# Backend Domain: nexifyprotrade.online
server {
    listen 80;
    server_name nexifyprotrade.online www.nexifyprotrade.online;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend Domain: nexifyprotrade.com
server {
    listen 80;
    server_name nexifyprotrade.com www.nexifyprotrade.com;
    root /var/www/nexify-protrade/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/nexify-protrade /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo "=== Deployment Completed Successfully ==="
echo "Frontend: http://nexifyprotrade.com"
echo "Backend:  http://nexifyprotrade.online"
