# 修复 dsh 在 Windows 上执行命令时弹控制台窗口的问题
# 原理：dsh-subprocess-local 的 spawn 没设 windowsHide，导致每个子进程闪一个黑窗口。
# dsh 升级或 npx 缓存重建后补丁会丢失，运行本脚本即可重新打上（幂等）。
$ErrorActionPreference = 'Stop'
$target = 'node_modules\@deepseek-ai\dsh-subprocess-local\lib\index.js'
$cacheRoot = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'
$patched = 0
if (Test-Path $cacheRoot) {
  Get-ChildItem $cacheRoot -Directory | ForEach-Object {
    $file = Join-Path $_.FullName $target
    if (Test-Path $file) {
      $txt = [System.IO.File]::ReadAllText($file)
      $changed = $false
      # 1) 主 spawn 加 windowsHide
      if ($txt -notmatch 'windowsHide:\s*true') {
        $txt = $txt.Replace("detached: platform !== `"win32`"`n`t});", "detached: platform !== `"win32`",`n`t`twindowsHide: true`n`t});")
        $changed = $true
      }
      # 2) taskkill spawnSync 加 windowsHide
      if ($txt -notmatch 'spawnSync\("taskkill"[\s\S]*?stdio: "ignore", windowsHide: true') {
        $txt = $txt.Replace('], { stdio: "ignore" });', '], { stdio: "ignore", windowsHide: true });')
        $changed = $true
      }
      if ($changed) {
        [System.IO.File]::WriteAllText($file, $txt, [System.Text.UTF8Encoding]::new($false))
        $patched++
        Write-Output "已打补丁: $file"
      } else {
        Write-Output "无需修改(已打过): $file"
      }
    }
  }
} else {
  Write-Output "未找到 npx 缓存: $cacheRoot"
}
Write-Output "完成，共处理 $patched 个文件。重启 dsh-web 后生效（pm2 restart dsh-web）。"
