# PM2 中控台 · pm2-console

> 把 PM2 托管的所有后台程序集中到一个中文网页控制台：分类管理、一键启停、实时监控、日志查看。
> 任何程序（Node / Java / 任意 exe / 脚本）填一条启动命令即可"拉进来"接管。

![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933) ![License](https://img.shields.io/badge/License-MIT-blue) ![PM2](https://img.shields.io/badge/PM2-7.x-2B037A) ![Platform](https://img.shields.io/badge/Platform-Windows-0078D6)

---

## ✨ 特性

- **分类管理**：内置「AI 工具 / Web 服务 / Java 应用 / 数据库 / 工具」分类，可新增、重命名、删除；
  每个服务在列表里下拉即改分类，持久化保存
- **拉入任意程序**：填「名称 + 启动命令」即可托管，支持
  `node 脚本`、`java -jar`、任意 `.exe`、`.cmd`、`.bat`、`.ps1`，
  可携带参数、工作目录、环境变量（`KEY=VALUE`，多行）
- **实时监控**：列表 3 秒自动刷新（状态 / CPU / 内存 / 重启次数 / 运行时长 / 启动时间）；
  每个进程有监控面板：近 90 秒 **CPU / 内存趋势曲线** + **实时日志尾部**
- **一键掌控**：启动 / 停止 / 重启 / 删除，全部网页上完成
- **项目管理（P0）**：登记开发项目（git 地址/目录/框架/安装/构建命令）→ 一键部署流水线
  （git 检查 → pull → 装依赖 → 构建 → 重启服务）→ 发布历史 → 一键回滚到上次成功版本
- **进程发现与拉入**：扫描本机正在运行的非系统进程，一键把任意程序"拉入" pm2 托管
  （自动读取启动命令重建托管，可选"拉入并停原进程"避免端口冲突）
- **DSH 预设**：一键拉入 `dsh-web`（DeepSeek Harness Web）
- **自举托管**：中控台本身也由 PM2 管理，`pm2 save` 后随 PM2 生命周期恢复

## 🖥 快速开始

```sh
# 1. 安装依赖
cd pm2-console
npm install

# 2. 启动（本地调试）
node server.js

# 3. 或交给 PM2 托管（推荐）
pm2 start server.js --name pm2-console --cwd %cd%
pm2 save
```

浏览器打开 **http://127.0.0.1:3090**，首次访问输入令牌（默认 `admin`）。

> 开机自启（可选）：管理员终端执行一次 `pm2 startup`。

## 🧩 如何拉入一个程序

以 Java 项目为例：

| 名称 | 启动命令 | 工作目录（可选） |
|---|---|---|
| `my-java-api` | `java -Xmx512m -jar D:\app\app.jar --server.port=8080` | `D:\app` |

环境变量按行填写：

```text
JAVA_HOME=C:\Program Files\Java\jdk-21
SPRING_PROFILES_ACTIVE=prod
```

其他类型同理：`node D:\app\server.js --port 3000`、`python D:\app\main.py`、
`D:\tools\myapp\myapp.exe --flag`、`my-cron.cmd`。

## ⚙️ 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CONSOLE_PORT` | `3090` | 中控台端口 |
| `CONSOLE_HOST` | `127.0.0.1` | 监听地址（不建议对外开放） |
| `CONSOLE_TOKEN` | `admin` | 访问令牌，**上线前请务必修改** |
| `CONSOLE_STATE_DIR` | `<项目>/data` | 分类状态持久化目录 |
| `DSH_WORKSPACE` | `D:\ai\dsh-workspace` | 「一键拉入 DSH Web」的工作目录 |

修改后重启：`pm2 restart pm2-console --update-env`

## 🔑 修改访问令牌（上线前必做）

默认令牌是 `admin`，等同本机管理员权限，**正式使用前必须改成强随机值**。完整流程（三步）：

```powershell
# 1. 持久化新令牌（写入用户环境变量，重启电脑后仍在）
setx CONSOLE_TOKEN "你的强随机令牌"

# 2. 新开一个终端，让 pm2 重新读取环境变量并重启
pm2 restart pm2-console --update-env

# 3. 保存进程列表（保证重启电脑 resurrect 恢复后令牌不变）
pm2 save
```

> - 令牌在**启动时**从环境变量 `CONSOLE_TOKEN` 读取，改完必须重启（`--update-env` 让 pm2 注入新环境）
> - 改完后浏览器首次访问会重新弹窗输入新令牌（旧令牌已失效）
> - **令牌 = 电脑控制权**：中控台可执行任意命令，令牌泄露等于电脑失守，切勿外传
> - **切勿把中控台端口映射/暴露到公网**；需要远程访问请走 VPN（如 Tailscale）或 Cloudflare Tunnel + Access

## 🚀 Windows 开机自启（PM2）

PM2 的 `pm2 startup` **不支持 Windows**，用以下方式之一在登录时自动恢复所有服务（`pm2 resurrect`）：

**方式 A：启动文件夹快捷方式（无需管理员，推荐）**

把 `pm2-resurrect.cmd`（或任意执行 `pm2 resurrect` 的脚本）建一个**最小化运行**的快捷方式放进启动文件夹：

```powershell
$startup = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut("$startup\pm2-resurrect.lnk")
$sc.TargetPath = "D:\path\to\pm2-resurrect.cmd"
$sc.WindowStyle = 7   # 最小化，登录时不弹窗
$sc.Save()
```

**方式 B：计划任务（需要管理员）**

```sh
schtasks /Create /SC ONLOGON /TN "pm2-resurrect" /TR "D:\path\to\pm2-resurrect.cmd" /F
```

> 前提：已执行过 `pm2 save`（保存进程清单），且 `PM2_HOME` 环境变量已正确设置（迁移过 PM2 家目录的机器必须显式指定）。

## 🔌 API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/status` | 服务状态 |
| GET | `/api/categories` | 分类列表 + 服务归属 |
| POST | `/api/categories` | 新增分类 `{name}` |
| PATCH | `/api/categories/:old` | 重命名分类 `{name}` |
| DELETE | `/api/categories/:name` | 删除分类 |
| GET | `/api/processes` | 进程列表（含分类/CPU/内存/状态） |
| POST | `/api/processes` | 拉入新程序 `{name, command, cwd?, env?, category?}` |
| POST | `/api/processes/:id/action` | `{action: start\|stop\|restart\|delete}` |
| POST | `/api/processes/:id/category` | 修改服务分类 `{category}` |
| GET | `/api/processes/:id/logs?lines=200` | 日志尾部 |
| GET | `/api/discover` | 扫描本机非系统进程（排除已托管） |
| POST | `/api/discover/:pid/import` | 拉入进程 `{name?, category?, stopOriginal?, cwd?}` |
| GET | `/api/projects` | 项目列表（含关联服务状态） |
| POST | `/api/projects` | 新建项目 |
| PATCH | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目档案 |
| POST | `/api/projects/:id/deploy` | 一键部署（git pull→安装→构建→重启） |
| POST | `/api/projects/:id/rollback` | 回滚到上次成功版本 |
| GET | `/api/projects/:id/deploys/:deployId` | 部署进度/日志 |
| POST | `/api/presets/dsh` | 一键拉入 DSH Web |

所有 `/api` 请求需携带请求头：`X-Console-Token: <你的令牌>`

## 🏗 技术栈

- **后端**：Node.js + Express + [PM2 Node API](https://pm2.keymetrics.io/docs/usage/pm2-api/)
- **前端**：原生 HTML / CSS / JavaScript（单页，无构建步骤，零前端依赖）
- **存储**：分类与归属持久化在 `<项目>/data/state.json`（`data/` 不入库，可用 `CONSOLE_STATE_DIR` 覆盖）；
  进程日志由 PM2 托管在 `$PM2_HOME/logs`（本机部署示例：`D:\ai\dsh-workspace\.runtime\pm2\logs`）

## 🔒 安全说明

- 默认只监听 `127.0.0.1`，不暴露到局域网/公网
- 所有 `/api` 请求必须携带 `X-Console-Token` 头（与服务端 `CONSOLE_TOKEN` 一致）
- 中控台可对 PM2 内进程做任意启停，令牌等同本机管理员权限，**切勿泄露**
- 建议修改默认令牌后再对外展示或长期使用

## ⚠️ 已知问题与修复：Windows 下 dsh 反复弹控制台窗口

**现象**：在 Windows 上用 PM2 / 服务 / CI 等**无控制台后台方式**运行 dsh 时，agent 每次执行命令都会闪现一个黑窗口（子进程 `pwsh` / `taskkill` 被拉起）。cmd 窗口直接运行时不会出现。

**根因**：`@deepseek-ai/dsh-subprocess-local` 的 `child_process.spawn/spawnSync` 未设置 `windowsHide: true`。无控制台父进程 spawn 控制台子进程时，Windows 会为子进程新建可见控制台。（官方仓库已有人提过该 issue）

**修复**：运行本项目的补丁脚本（幂等，可重复执行）。脚本默认使用 **PowerShell 7（pwsh）**，未安装时自动回退 PowerShell 5.1；打上补丁后**自动重启 pm2 托管的 dsh-web**，无需手动操作：

```sh
npm run patch:windowshide
```

（也可以直接运行：`powershell -ExecutionPolicy Bypass -File scripts\patch-dsh-windowshide.ps1`）

**注意**：dsh **升级**或 **npx 缓存被清理**后补丁会丢失，重新运行上面的脚本即可（会自动重打并重启）。

## 📁 目录结构

```
pm2-console/
├── server.js          # 后端：REST API + PM2 封装 + 命令解析
├── package.json
├── public/
│   └── index.html     # 前端：单页控制台
├── scripts/
│   └── patch-dsh-windowshide.ps1   # 修复 dsh Windows 弹窗补丁（可重复执行）
└── data/              # 运行时状态（不入库）
    └── state.json     # 分类与服务归属
```

## ❓ 常见问题

- **拉入的服务反复重启（errored）**：多为命令写错或端口被占用，打开该服务日志查看报错。
- **当前手动运行的 dsh 要交给中控台**：先关闭手动启动的 dsh（释放 3080 端口），
  再在中控台点「一键拉入 DSH Web」。
- **网页上中文乱码**：请使用现代浏览器（Edge / Chrome），页面为 UTF-8 编码。

## 📄 License

[MIT](LICENSE)
