/**
 * pm2-console — 自建 PM2 中控台（通用版）
 *
 * 功能：
 *  - 分类管理：服务按分类组织（可增删改，持久化到 ~/.pm2-console/state.json）
 *  - 任意程序拉入：填一条启动命令即可接管（node / java / .exe / .cmd / .bat / .ps1），
 *    支持环境变量与工作目录
 *  - 网页上一键 启动 / 停止 / 重启 / 删除
 *  - 实时状态（CPU / 内存 / 重启次数 / 运行时长 / 启动时间）+ 日志尾部
 *
 * 安全：默认只监听 127.0.0.1；所有 /api 请求需要 X-Console-Token 头，
 *       令牌用环境变量 CONSOLE_TOKEN 修改（默认 admin，请务必改掉）。
 */
"use strict";

const express = require("express");
const pm2 = require("pm2");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOST = process.env.CONSOLE_HOST || "127.0.0.1";
const PORT = Number(process.env.CONSOLE_PORT || 3090);
const TOKEN = process.env.CONSOLE_TOKEN || "admin";
const PM2_HOME = process.env.PM2_HOME || path.join(os.homedir(), ".pm2");
const DSH_WORKSPACE = process.env.DSH_WORKSPACE || "D:\\ai\\dsh-workspace";
const STATE_DIR = process.env.CONSOLE_STATE_DIR || path.join(__dirname, "data");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const DEFAULT_CATEGORIES = ["AI 工具", "Web 服务", "Java 应用", "数据库", "工具"];

/* ---------- 分类状态（持久化） ---------- */
let state = { categories: [...DEFAULT_CATEGORIES], serviceCategory: {} };
function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    state.categories = Array.isArray(raw.categories) ? raw.categories : [...DEFAULT_CATEGORIES];
    state.serviceCategory = raw.serviceCategory && typeof raw.serviceCategory === "object" ? raw.serviceCategory : {};
  } catch { /* 首次运行或文件损坏，用默认 */ }
}
function saveState() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) { console.error("[pm2-console] 保存状态失败:", e.message); }
}
loadState();

/* ---------- 应用与认证 ---------- */
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let pm2Connected = false;
pm2.connect((err) => {
  if (err) console.error("[pm2-console] pm2 connect failed:", err.message);
  else { pm2Connected = true; console.log("[pm2-console] pm2 daemon connected"); }
});
function withPm2(res, fn) {
  if (!pm2Connected) return res.status(503).json({ error: "pm2 daemon 未连接" });
  fn();
}
function auth(req, res, next) {
  if (req.get("x-console-token") === TOKEN) return next();
  res.status(401).json({ error: "未授权：请在界面输入令牌（CONSOLE_TOKEN，默认 admin）" });
}
app.use("/api", auth);

/* ---------- 工具函数 ---------- */
function humanBytes(b) {
  if (!b && b !== 0) return "-";
  const u = ["B", "KB", "MB", "GB"]; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function mapProcess(p) {
  const monit = p.monit || {};
  const env = p.pm2_env || {};
  return {
    id: p.pm_id,
    name: p.name,
    status: env.status || p.status || "unknown",
    restartCount: env.restart_time ?? 0,
    unstableRestarts: env.unstable_restarts ?? 0,
    uptimeMs: env.pm_uptime ? Date.now() - env.pm_uptime : null,
    cpu: monit.cpu,
    memory: monit.memory,
    script: env.pm_exec_path || null,
    args: env.args || [],
    cwd: env.pm_cwd || null,
    createdAt: env.created_at || null,
    category: state.serviceCategory[p.name] || "未分类"
  };
}

function tokenizeCommand(line) {
  const tokens = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if ((ch === " " || ch === "\t") && !inQ) { if (cur) { tokens.push(cur); cur = ""; } continue; }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens.map((t) => t.replace(/%([^%]+)%/g, (_, k) => process.env[k] || `%${k}%`));
}

function findOnPath(exe) {
  if (exe.includes("/") || exe.includes("\\")) return fs.existsSync(exe) ? exe : null;
  const dirs = (process.env.PATH || "").split(";").filter(Boolean);
  const exts = (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM;.PS1;.JS;.MJS").split(";").filter(Boolean);
  for (const dir of dirs) {
    const base = path.join(dir, exe);
    if (fs.existsSync(base)) return base;
    for (const ext of exts) { const cand = base + ext; if (fs.existsSync(cand)) return cand; }
  }
  return null;
}

/** 把一条启动命令解析为 pm2.start 选项；支持 node/java/任意 exe/cmd/bat/ps1 */
function parseLaunchCommand(command) {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) throw new Error("启动命令不能为空");
  const exe = tokens[0], args = tokens.slice(1);
  const resolved = findOnPath(exe);
  if (!resolved) throw new Error(`找不到可执行文件: ${exe}（已按 PATH 查找）`);
  const ext = path.extname(resolved).toLowerCase();
  const opts = { interpreter: "none", autorestart: true, max_restarts: 20, min_uptime: "2s", kill_timeout: 5000 };
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    opts.script = process.execPath; opts.args = [resolved, ...args];
  } else if (ext === ".cmd" || ext === ".bat") {
    opts.script = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
    opts.args = ["/c", resolved, ...args];
  } else if (ext === ".ps1") {
    opts.script = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    opts.args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved, ...args];
  } else {
    opts.script = resolved; opts.args = args;   // java.exe / 任意 exe 等直接执行
  }
  return opts;
}

/** "KEY=VALUE" 多行文本 → 环境变量对象 */
function parseEnvText(text) {
  const env = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function resolveDshEntry() {
  const cacheRoot = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  if (!fs.existsSync(cacheRoot)) return null;
  let best = null, bestTime = 0;
  for (const d of fs.readdirSync(cacheRoot)) {
    const cand = path.join(cacheRoot, d, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    if (fs.existsSync(cand)) { const t = fs.statSync(cand).mtimeMs; if (t > bestTime) { best = cand; bestTime = t; } }
  }
  return best;
}

function readLogTail(name, lines) {
  const out = path.join(PM2_HOME, "logs", `${name}-out.log`);
  const err = path.join(PM2_HOME, "logs", `${name}-error.log`);
  const tail = (file) => {
    if (!fs.existsSync(file)) return "";
    const arr = fs.readFileSync(file, "utf8").split(/\r?\n/);
    return arr.slice(-lines).join("\n");
  };
  return { stdout: tail(out), stderr: tail(err) };
}

/* ---------- REST 接口 ---------- */

app.get("/api/status", (req, res) => {
  res.json({ ok: true, pm2Connected, port: PORT, serverTime: new Date().toISOString() });
});

// 分类列表 + 服务归属
app.get("/api/categories", (req, res) => {
  res.json({ categories: state.categories, serviceCategory: state.serviceCategory });
});
app.post("/api/categories", (req, res) => {
  const name = String((req.body || {}).name || "").trim();
  if (!name) return res.status(400).json({ error: "分类名不能为空" });
  if (name === "未分类") return res.status(400).json({ error: "未分类为内置分类" });
  if (!state.categories.includes(name)) { state.categories.push(name); saveState(); }
  res.json({ ok: true, categories: state.categories });
});
app.patch("/api/categories/:old", (req, res) => {
  const old = req.params.old;
  const name = String((req.body || {}).name || "").trim();
  if (!name) return res.status(400).json({ error: "分类名不能为空" });
  const i = state.categories.indexOf(old);
  if (i < 0) return res.status(404).json({ error: "分类不存在" });
  if (state.categories.includes(name) && name !== old) return res.status(400).json({ error: "分类已存在" });
  state.categories[i] = name;
  for (const k of Object.keys(state.serviceCategory)) if (state.serviceCategory[k] === old) state.serviceCategory[k] = name;
  saveState();
  res.json({ ok: true, categories: state.categories });
});
app.delete("/api/categories/:name", (req, res) => {
  const name = req.params.name;
  if (name === "未分类") return res.status(400).json({ error: "不能删除内置分类" });
  state.categories = state.categories.filter((c) => c !== name);
  for (const k of Object.keys(state.serviceCategory)) if (state.serviceCategory[k] === name) delete state.serviceCategory[k];
  saveState();
  res.json({ ok: true, categories: state.categories });
});

// 进程列表（带分类）
app.get("/api/processes", (req, res) => {
  withPm2(res, () => {
    pm2.list((err, list) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ processes: (list || []).map(mapProcess) });
    });
  });
});

// 拉入新程序: { name, command, cwd?, env?, category? }
app.post("/api/processes", (req, res) => {
  const { name, command, cwd, env, category } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "缺少名称 name" });
  if (!command || !String(command).trim()) return res.status(400).json({ error: "缺少启动命令 command" });
  let opts;
  try { opts = parseLaunchCommand(String(command).trim()); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  opts.name = String(name).trim();
  if (cwd && String(cwd).trim()) opts.cwd = String(cwd).trim();
  const envObj = parseEnvText(env);
  if (Object.keys(envObj).length) opts.env = Object.assign({}, process.env, envObj);
  if (category && String(category).trim()) state.serviceCategory[opts.name] = String(category).trim();
  saveState();
  pm2.start(opts, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, message: `已拉入并启动 ${opts.name}`, name: opts.name });
  });
});

// 进程操作（pm2 方法必须带 this 调用，故用箭头包装；数字 pm_id 直接可用）
app.post("/api/processes/:id/action", (req, res) => {
  const pid = Number(req.params.id);
  const action = req.body && req.body.action;
  const fn = {
    start: (id, cb) => pm2.restart(id, cb),     // 对已停止进程"启动"= restart
    stop: (id, cb) => pm2.stop(id, cb),
    restart: (id, cb) => pm2.restart(id, cb),
    delete: (id, cb) => pm2.delete(id, cb)
  }[action];
  if (!fn) return res.status(400).json({ error: `未知操作: ${action}` });
  withPm2(res, () => {
    fn(pid, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, action, id: pid });
    });
  });
});

// 修改服务的分类
app.post("/api/processes/:id/category", (req, res) => {
  const category = String((req.body || {}).category || "").trim();
  if (!category) return res.status(400).json({ error: "缺少分类" });
  withPm2(res, () => {
    pm2.describe(Number(req.params.id), (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      const proc = Array.isArray(data) ? data[0] : data;
      if (!proc) return res.status(404).json({ error: "进程不存在" });
      state.serviceCategory[proc.name] = category;
      saveState();
      res.json({ ok: true, name: proc.name, category });
    });
  });
});

// 日志尾部
app.get("/api/processes/:id/logs", (req, res) => {
  const lines = Math.min(Number(req.query.lines) || 200, 2000);
  withPm2(res, () => {
    pm2.describe(Number(req.params.id), (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      const proc = Array.isArray(data) ? data[0] : data;
      if (!proc) return res.status(404).json({ error: "进程不存在" });
      res.json(readLogTail(proc.name, lines));
    });
  });
});

// 预设：一键拉入 DSH Web（AI 工具分类）
app.post("/api/presets/dsh", (req, res) => {
  const bin = resolveDshEntry();
  if (!bin) return res.status(500).json({ error: "未找到 dsh 入口（npm 缓存里没有 @deepseek-ai/dsh），请先用 npx 运行过一次" });
  state.serviceCategory["dsh-web"] = "AI 工具";
  saveState();
  pm2.start({
    name: "dsh-web", script: process.execPath, args: [bin, "web"], cwd: DSH_WORKSPACE,
    interpreter: "none", autorestart: true, max_restarts: 20, min_uptime: "2s", kill_timeout: 10000
  }, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, message: "dsh-web 已拉入（分类：AI 工具）", note: "浏览器访问 http://127.0.0.1:3080" });
  });
});

/* ---------- 启动 ---------- */
app.listen(PORT, HOST, () => {
  console.log(`[pm2-console] 中控台已启动: http://${HOST}:${PORT}`);
  console.log(`[pm2-console] 令牌: ${TOKEN === "admin" ? "admin（默认，建议设置 CONSOLE_TOKEN 修改）" : "已自定义"}`);
  console.log(`[pm2-console] 状态文件: ${STATE_FILE}`);
});
