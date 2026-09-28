# PM2 中控台 — 新环境部署指南

> 适用：把本仓库拉到一台新机器/新环境并运行（网页版 + 桌面软件版 + 知识库插件）。
> 环境要求：Windows 10/11，Node.js ≥ 18（建议 20/22/24 LTS），npm，Git。

---

## 一、克隆代码

```powershell
git clone git@gitee.com:zk836901721/pm2-console.git
cd pm2-console
```

> 若用 HTTPS：`git clone https://gitee.com/zk836901721/pm2-console.git`
> Gitee SSH 免密需要新机器配置公钥：`ssh-keygen -t ed25519` 后将 `~/.ssh/id_ed25519.pub` 加到 Gitee 账户 SSH 公钥。

---

## 二、安装依赖（网页版）

```powershell
npm install
```

安装内容：express / pm2 / @toast-ui/editor / highlight.js（运行）+ vite（构建用）。

---

## 三、配置环境变量（必须）

```powershell
# 中控台令牌 = 管理权限，务必设置强随机值，勿外传
setx CONSOLE_TOKEN "你的强随机令牌"
# 可选：端口（默认 3090）
setx CONSOLE_PORT "3090"
```

> 新开一个终端让 setx 生效，或重启登录。令牌保存在用户级环境变量，
> 桌面版会自动从注册表读取，无需重复录入。

---

## 四、构建知识库编辑器资源（可跳过）

`plugins/kb/vendor/kb-vendor.{js,css}` 已提交在仓库里，直接可用。
仅当需要修改编辑器 vendor 源码（`kb-vendor/main.js`）时才需重建：

```powershell
npm run build:kb
```

---

## 五、启动

### 方式 A：直接跑（前台）

```powershell
node server.js
# 浏览器打开 http://127.0.0.1:3090 ，首次输入 CONSOLE_TOKEN
```

### 方式 B：PM2 托管（推荐，开机自启）

```powershell
npm install -g pm2        # 全局安装 PM2
pm2 start server.js --name pm2-console
pm2 save                  # 保存进程列表与快照
```

常用管理：`pm2 ls` / `pm2 logs pm2-console` / `pm2 restart pm2-console` / `pm2 save`

> 注意：本机当前 PM2 家目录在 `D:\ai\dsh-workspace\.runtime\pm2`（`PM2_HOME` 环境变量）。
> 新环境若不设置 PM2_HOME，默认在用户目录 `~/.pm2`，功能一致。
>
> Windows 不会因为 `pm2 save` 自动在登录后恢复服务。请额外配置启动文件夹快捷方式或计划任务，在登录时执行 `pm2 resurrect`；并确保它使用同一个 `PM2_HOME`。`pm2 save` + `pm2 resurrect` 才是完整的重启恢复链路。

---

## 六、桌面软件版（Electron）

```powershell
cd desktop
npm install                # 下载 Electron（约 100MB，国内可设 ELECTRON_MIRROR 加速）
cd ..
```

启动桌面版：

```powershell
# 方式 1：命令行
desktop\node_modules\electron\dist\electron.exe desktop

# 方式 2：用仓库里的脚本（会自动装依赖/构建，缺失时）
.\start-desktop.cmd
```

桌面版行为：自动检测 3090 是否在运行 → 在跑直接加载；没跑则自动拉起 `server.js`；
关窗时若服务是本进程拉起的才退出（PM2 托管的实例不受影响）。

创建桌面快捷方式（可选）：

```powershell
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\PM2 中控台.lnk")
$lnk.TargetPath = "$pwd\start-desktop.cmd"
$lnk.WorkingDirectory = "$pwd"
$lnk.Save()
```

---

## 七、知识库独立运行（可选）

```powershell
.\plugins\kb\start-standalone.cmd
# 或浏览器访问 http://127.0.0.1:3090/plugins/kb/standalone.html
```

---

## 八、新环境初始化要点

| 项目 | 说明 |
|---|---|
| 知识库根目录 | 默认 `pm2-console/kb/`（仓库已带示例）。网页/桌面里点「📁 切换目录」可改到任意文件夹，设置存 `data/state.json` |
| 服务分类/备注/告警 | 存 `data/state.json`（**不入库**，新环境默认分类：AI 工具/Web 服务/Java 应用/数据库/工具） |
| 项目档案（部署流水线） | 存 `data/projects.json`（**不入库**，需重新添加） |
| 插件启停 | 存 `data/state.json` 的 `pluginEnabledIds`；「🧩 插件管理」界面可操作 |
| 令牌 | 环境变量 `CONSOLE_TOKEN`（见第三节） |
| 健康检查/告警 | 侧边栏「🔔 告警设置」配置 webhook（企业微信/钉钉/飞书） |
| 恢复保护 | 每次服务变更都会尝试保存 PM2 快照；网页“恢复保护”显示最近成功或失败状态 |
| 工作台 | 数据保存在 `data/workbench.json`；工作空间可选；本机路径通过 Windows 文件资源管理器打开；账号文件只保存路径，控制台不会读取文件内容 |
| 本机进程关注 | 数据保存在 `data/state.json`；普通进程关注只记录程序路径/命令行指纹，不会自动重启，也不属于 `pm2 save` 快照 |

本机进程页显示 Windows 当前可查询到的全部进程，包括系统行和 PM2 行。系统目录、服务会话或无法可靠识别的进程仍会显示，但不能结束或纳管。普通进程的“结束”会尝试结束其子进程；操作前需确认，服务端会再次校验 PID 对应的进程身份。

工作台“打开所在文件夹”对已有目录打开该目录、对文件定位文件，对已失效路径打开最近存在的上级目录。Windows 或权限策略拒绝打开时，界面会显示启动错误；中控台只请求系统打开，不读取账号文件内容。

> `data/` 目录被 .gitignore 排除 —— 它保存的是**本机运行时状态**，不会随仓库同步，这样不同环境配置互不干扰。

---

## 九、常见问题

- **`module is not defined in ES module scope`**：插件目录 `plugins/kb/package.json` 不要加 `"type":"module"`（保持 CommonJS）。
- **桌面版弹窗输入令牌**：先确认 `setx CONSOLE_TOKEN` 后重开终端/重启桌面版；仍不行就手动在弹窗里粘贴。
- **Electron 下载慢**：`$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; npm install`。
- **端口被占**：换 `setx CONSOLE_PORT "3091"` 并重启服务。

---

## 十、目录结构速览

```
pm2-console/
├─ server.js              # 主服务：PM2 管理 + 插件系统 + 令牌认证
├─ public/index.html      # 主界面（总览/服务/项目/进程/日志/插件管理）
├─ plugins/kb/            # 知识库插件（可插拔，可独立运行）
│  ├─ manifest.json / server.js / card.html / kb.js
│  ├─ vendor/             # 编辑器资源（build:kb 产物，已入库）
│  ├─ standalone.html / standalone-main.mjs / start-standalone.cmd
├─ desktop/               # Electron 桌面外壳（desktop/package.json 独立安装）
├─ kb-vendor/             # 编辑器 vendor 源码（改后需 npm run build:kb）
├─ vite.vendor.config.mjs # vendor 构建配置
├─ start-desktop.cmd      # 桌面版一键启动
├─ kb/                    # 默认知识库根目录（示例内容入库）
└─ data/                  # 运行时状态（不入库）：state.json / projects.json
```
