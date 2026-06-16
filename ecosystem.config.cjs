module.exports = {
  apps: [
    {
      name: "stockeasy",
      script: "npx",
      args: "tsx server/src/index.ts",
      cwd: "/app/working/workspaces/default/stockeasy",
      interpreter: "none", // use script (npx) directly
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      // Log rotation: keep last 10 files, max 5MB each
      max_size: "5M",
      retain: 10,
      // Auto restart on crash
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      // Watch for file changes (dev mode — disable in production)
      watch: false,
    },
  ],
};
