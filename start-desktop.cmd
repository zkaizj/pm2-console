@echo off
rem PM2 中控台桌面版一键启动
cd /d "D:\ai\dsh-workspace\pm2-console"
if not exist "public\vendor\kb-vendor.js" (
  echo [桌面版] 首次运行，构建知识库编辑器资源...
  call npm run build:kb
)
if not exist "desktop\node_modules\electron\dist\electron.exe" (
  echo [桌面版] 首次运行，安装 Electron...
  cd /d "D:\ai\dsh-workspace\pm2-console\desktop"
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  call npm install
)
start "" "D:\ai\dsh-workspace\pm2-console\desktop\node_modules\electron\dist\electron.exe" "D:\ai\dsh-workspace\pm2-console\desktop"
