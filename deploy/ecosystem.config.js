// PM2 Ecosystem Configuration
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name: 'gamecreator',
    script: 'server/index.js',
    cwd: '/opt/gamecreator',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_file: '/opt/gamecreator/.env'
  }]
};
