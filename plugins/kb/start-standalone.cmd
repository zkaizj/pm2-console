@echo off
rem 知识库插件独立运行（不加载中控台外壳）
cd /d "D:\ai\dsh-workspace\pm2-console"
if not exist "plugins\kb\vendor\kb-vendor.js" (
  echo [kb] 首次运行，构建编辑器资源...
  call npm run build:kb
)
start "" "desktop\node_modules\electron\dist\electron.exe" "plugins\kb\standalone-main.mjs"
