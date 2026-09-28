# PM2 中控台 · pm2-console

> 把 PM2 托管的所有后台程序集中到一个中文网页控制台：分类管理、一键启停、实时监控、日志查看。
> 任何程序（Node / Java / 任意 exe / 脚本）都可用启动命令登记为 PM2 服务；现有进程另走安全替代流程，不会把旧 PID 直接变成 PM2 服务。

![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933) ![License](https://img.shields.io/badge/License-MIT-blue) ![PM2](https://img.shields.io/badge/PM2-7.x-2B037A) ![Platform](https://img.shields.io/badge/Platform-Windows-0078D6)

---

## 🤔 先认识 PM2（本项目的执行引擎）

**PM2**（Process Manager 2）是 Node.js 生态最流行的**进程管理器**，作用类似一个"程序管家"：

| PM2 能力 | 说明 |
|---|---|
| **后台运行** | 程序交给 PM2 后常驻后台，**关掉终端/窗口也不退出**（传统 cmd 启动做不到） |
| **崩溃自动重启** | 程序挂了自动拉起，避免服务悄悄死掉 |
| **开机自启** | `pm2 save` + 登录自启后，重启电脑自动恢复全部服务 |
| **统一日志** | 自动收集每个程序的 stdout/stderr 到独立日志文件 |
| **集群/负载** | 支持多实例、负载均衡（企业场景） |

**它怎么用**：命令行 `pm2 start <命令> --name <名称>`、`pm2 stop/restart/logs` 等。
**它缺什么**：只有命令行界面，**没有图形化 Web 界面**、没有分类、没有部署流水线、没有健康监控、没有告警。

> 本项目（pm2-console）就是给 PM2 补上这块拼图：**一个网页控制台，让 PM2 的一切可视化、可点击、可自动化**。

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
- **运维总览 + 恢复保护**：打开页面先看待处理异常、关注服务和 PM2 快照状态；
  每次受管服务变更后自动 `pm2 save`，失败会持续显示并可重试
- **个人工作台**：可按空间或“未归类”保存工程、目录、文件、软件（本机程序/快捷方式）、在线链接和 PM2 服务入口；可直接打开目标、打开所在文件夹、复制地址；账号文件仅保存路径与说明，**不读取、不复制、不预览其内容**
- **项目管理（更多工具）**：登记开发项目（git 地址/目录/框架/安装/构建命令）→ 一键部署流水线
  （git 检查 → pull → 装依赖 → 构建 → 重启服务）→ 发布历史 → 一键回滚到上次成功版本；
  **部署后自动健康探活，失败自动回滚**
- **健康检查 + 服务总览**：给服务配置探活地址，一屏看所有服务健康状态与延迟
  （可在「🔔 告警设置」中**关闭健康巡检**，不需要时不再周期性探测）
- **日志搜索**：跨全部服务日志按关键字搜索（每文件最近 1MB）
- **Webhook 告警**：服务状态异常 / 健康检查失败 → 推送企业微信 / 钉钉 / 飞书（带冷却防刷屏）
- **本机全部进程**：列出 Windows 进程（包含系统行及 PM2 托管行），可按名称/路径/PID 和归属筛选；普通进程可加入持久关注、结束或启动 PM2 替代实例，系统/身份不明进程不可执行危险操作
- **统一快速查找**：顶部搜索框或 `Ctrl+K` 查找 PM2 服务、已登记工作台条目、插件和最近扫描到的进程；不扫描磁盘
- **软件集成插口**：软件条目可直接启动本机 `.exe`/`.lnk`、关联为 PM2 服务，或委托给已启用插件的 `openWorkbenchItem(item)` 适配接口；不会自动下载或执行 GitHub 项目
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

> Windows 开机恢复（可选）：执行 `pm2 save` 后，再配置登录时运行 `pm2 resurrect`（见下方说明）。

## 🧭 日常使用

1. **运维总览**是默认首页：先看 PM2 连接、待处理服务、关注服务和恢复快照。未配置健康检查时只显示运行状态，不会标为健康。
2. **服务 → 本机全部进程**列出可见的 Windows 进程；PM2 行使用 PM2 启停/重启，普通行可关注、结束或启动一个新的 PM2 替代实例。系统/身份不明进程保持可见但禁止危险操作。安全交接会在替代实例验证通过且再次确认后才结束原进程。
3. **工作台**无需先建空间即可收纳入口；需要整理时再指定空间。选择空间可打开其根目录，条目支持打开、显示所在文件夹与复制地址。软件只有登记为“快速打开”或关联为 PM2 服务后，才具有对应能力。
4. **快速查找**可从任意页面使用 `Ctrl+K`；本机进程仅搜索已扫描的清单。账号密码文件请继续保存在你自己的文件中，工作台只记录该文件的路径。
5. 项目发布、告警和插件属于**更多工具**，仍可使用，但不会干扰每日故障处理主流程。

新软件默认登记为“本机软件”快速打开；若要纳入 PM2，请单独选择托管服务。第三方插件如需在工作台处理某软件，可暴露 `window.<插件 id>Plugin.openWorkbenchItem(item)`，启用后该插件会出现在软件条目的“集成方式”中。先检查项目的维护状态、许可证、Windows 兼容性与实际权限，再决定是否接入；不会从网页直接安装 GitHub 代码。

### 恢复保护与 Windows 重启

中控台的元数据保存在本机 `data/`（或 `CONSOLE_STATE_DIR`）中，服务清单由 PM2 管理。每次成功的受管服务变更都会保存中控台状态并尝试保存 PM2 快照；“恢复保护”会显示最近成功时间或失败原因。

在 Windows 上，`pm2 save` 只保存快照，仍需配置登录时执行 `pm2 resurrect` 的启动文件夹快捷方式或计划任务。两者都完成后，电脑重启才会自动恢复 PM2 服务。

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
| POST | `/api/processes/:id/meta` | 设置备注/页面/健康检查 `{webUrl?, remark?, healthUrl?, healthKeyword?}` |
| GET | `/api/health` | 服务总览（健康状态缓存，20 秒巡检） |
| GET | `/api/logs/search?q=&service=` | 日志关键字搜索 |
| GET/POST | `/api/settings` | 告警设置（Webhook 地址不会由接口回显） |
| POST | `/api/settings/test-alert` | 发送测试告警（仅在已启用且已配置 Webhook 时） |
| GET | `/api/discover` | 列出本机全部进程、PM2 归属和保护状态 |
| POST | `/api/discover/:pid/watch` | 添加/取消普通进程关注（提交扫描到的身份信息） |
| GET | `/api/discover/watches` | 读取本机普通进程关注状态 |
| DELETE | `/api/discover/watches/:id` | 移除普通进程关注 |
| POST | `/api/discover/:pid/kill` | 经身份复核后结束普通进程 `{pid,name,exe,createdAt,...}` |
| POST | `/api/discover/:pid/import` | 启动 PM2 替代实例并返回验证状态（提交 `identity`） |
| POST | `/api/discover/:pid/handoff` | 替代服务验证通过后确认关闭原始进程 `{serviceId,identity}` |
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
