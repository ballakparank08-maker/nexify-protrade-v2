module.exports = {
  apps: [
    {
      name: 'nexify-protrade-backend',
      script: './server/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DATABASE_PATH: './server/data/nexify-protrade.json',
        AUTH_SECRET: 'nexify-protrade-production-auth-secret-key-9988',
        FRONTEND_ORIGIN: 'https://nexifyprotrade.com,https://www.nexifyprotrade.com',
        AUTH_COOKIE_SECURE: 'true',
        AUTH_COOKIE_SAME_SITE: 'none',
        ADMIN_BOOTSTRAP_NAME: 'System Administrator',
        ADMIN_BOOTSTRAP_EMAIL: 'admin@example.com',
        ADMIN_BOOTSTRAP_PASSWORD: 'ChangeMe123!',
      },
    },
  ],
};
