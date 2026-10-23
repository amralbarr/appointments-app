module.exports = {
  apps: [
    {
      name: 'appointments-backend',
      cwd: './backend',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=256',
      env: { NODE_ENV: 'production', PORT: 6410 },
      max_memory_restart: '500M',
      autorestart: true,
      restart_delay: 3000,
    },
    {
      name: 'appointments-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 6411',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        BACKEND_INTERNAL_URL: 'http://localhost:6410/api/v1',
      },
      max_memory_restart: '512M',
      autorestart: true,
      restart_delay: 3000,
    },
  ],
};
