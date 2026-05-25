module.exports = {
  apps: [
    {
      name: "hudd-dashboard",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 8765",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_OPTIONS: "--max-http-header-size=65536",
      },
    },
    {
      name: "hudd-dashboard-test",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 8766",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        DATABASE_URL: "postgresql://hudd_user:hudd_password@localhost:5432/hudd_test",
        DIRECT_URL: "postgresql://hudd_user:hudd_password@localhost:5432/hudd_test",
        // Auth.js must use the test origin so Keycloak callbacks return here,
        // not to the production server. Must be set in the pm2 env block so
        // it takes precedence over what Next.js loads from .env at startup.
        AUTH_URL: "http://13.203.18.97:8766/hudd-dashboard/api/auth",
        KEYCLOAK_POST_LOGOUT_REDIRECT_URI: "http://13.203.18.97:8766/hudd-dashboard/login",
      },
    },
    {
      name: "webhook-server",
      cwd: __dirname,
      script: "webhook-server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "256M",
      env: {
        WEBHOOK_PORT: 9000,
        WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || "CHANGE_THIS_SECRET",
        NODE_ENV: "production",
      },
    },
  ],
};
