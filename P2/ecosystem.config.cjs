// PM2 — sert le build statique du FRONT (équivalent au comportement Vercel : SPA fallback sur index.html)
module.exports = {
  apps: [
    {
      name: 'btm-front',
      script: 'npx',
      args: 'serve -s dist -l 3000 --no-clipboard',
      cwd: '/home/user/webapp/FRONT',
      env: { NODE_ENV: 'production' },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
