// pm2 ecosystem: agentmemory (engine + worker)
// 中控台/进程列表自动读取 pm2，无需额外配置。
module.exports = {
  apps: [
    {
      name: 'agentmemory-engine',
      script: 'C:\\Users\\83690\\.local\\bin\\iii.exe',
      args: ['--config', 'C:\\Users\\83690\\.agentmemory\\iii-config.yaml'],
      interpreter: 'none',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '2s',
      kill_timeout: 10000,
      windowsHide: true,
    },
    {
      name: 'agentmemory-worker',
      script: 'C:\\Program Files\\nodejs\\node.exe',
      args: [
        'C:\\Users\\83690\\AppData\\Roaming\\npm\\node_modules\\@agentmemory\\agentmemory\\dist\\cli.mjs',
        '--no-engine',
        '--verbose',
      ],
      interpreter: 'none',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '2s',
      kill_timeout: 10000,
      windowsHide: true,
      // 等引擎先起来再连（pm2 并行启动时 worker 可能比 engine 早）
      start_delay: 3000,
    },
  ],
};
