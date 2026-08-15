# 修复 dsh 在 Windows 上执行命令时弹控制台窗口的问题
# 原理：dsh-subprocess-local 的 spawn 没设 windowsHide，导致每个子进程闪一个黑窗口。
# dsh 升级或 npx 缓存重建后补丁会丢失，运行本脚本即可重新打上（幂等）。
# 打完补丁会自动重启 pm2 托管的 dsh-web，无需手动操作。
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

if ($patched -gt 0) {
  Write-Output "补丁已生效，正在自动重启 dsh-web ..."
  $procs = @()
  try { $procs = pm2 jlist 2>$null | ConvertFrom-Json } catch {}
  $dw = $procs | Where-Object { $_.name -eq 'dsh-web' }
  if ($dw) {
    pm2 restart dsh-web 2>&1 | Out-Null
    Write-Output "dsh-web 已自动重启，修复生效。"
  } else {
    Write-Output "未检测到 pm2 托管的 dsh-web，请手动重启你的 dsh 进程。"
  }
} else {
  Write-Output "补丁已是最新，无需重启。"
}