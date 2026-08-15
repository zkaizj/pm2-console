/**
 * pm2-console 桌面版 — Electron 主进程
 * 行为：
 *  - 启动时检测 3090 端口（PM2 托管的中控台是否在跑）
 *  - 若在跑：直接加载 http://127.0.0.1:3090
 *  - 若未跑：自动以子进程拉起 server.js，就绪后加载；窗口关闭时若该服务是本进程拉起的则一并退出
 *  - preload 注入桌面端令牌（避免首次使用弹窗输令牌）
 */
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "server.js");
const PORT = Number(process.env.CONSOLE_PORT || 3090);
const HOST = process.env.CONSOLE_HOST || "127.0.0.1";

/* 令牌解析：进程环境变量 → 用户级环境变量（注册表）→ 默认 admin
 * 桌面版由 .cmd 启动，可能拿不到 PM2 进程里的 CONSOLE_TOKEN，需回退读取用户级变量 */
function resolveToken() {
  if (process.env.CONSOLE_TOKEN && process.env.CONSOLE_TOKEN !== "admin") return process.env.CONSOLE_TOKEN;
  try {
    const { execSync } = require("node:child_process");
    const v = execSync(`reg query "HKCU\\Environment" /v CONSOLE_TOKEN`, { encoding: "utf8", windowsHide: true, timeout: 3000 });
    const m = /CONSOLE_TOKEN\s+REG_\w+\s+(.+)/.exec(v);
    if (m && m[1] && m[1].trim() && m[1].trim() !== "admin") return m[1].trim();
  } catch { /* 未设置用户级变量 */ }
  return process.env.CONSOLE_TOKEN || "admin";
}
const TOKEN = resolveToken();
const URL = `http://${HOST}:${PORT}`;

let serverProc = null;   // 本进程拉起的 server（若有）
let spawnedByUs = false;

/* ---------- 探测服务是否存活 ---------- */
function probe(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: "/api/status", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500); // 401 也算活着
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

/* ---------- 拉起 server.js（本进程持有） ---------- */
function spawnServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    serverProc = child;
    child.stdout.on("data", (d) => console.log("[server]", String(d).trim()));
    child.stderr.on("data", (d) => console.error("[server]", String(d).trim()));
    child.on("exit", (code) => { if (spawnedByUs) console.log(`[desktop] 自拉起服务已退出 (${code})`); });
    // 轮询等待就绪（最多 15s）
    const t0 = Date.now();
    const timer = setInterval(async () => {
      if (await probe(1000)) { clearInterval(timer); resolve(); }
      else if (Date.now() - t0 > 15000) { clearInterval(timer); reject(new Error("服务启动超时")); }
    }, 500);
  });
}

/* ---------- 窗口 ---------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "PM2 中控台（桌面版）",
    autoHideMenuBar: true,
    backgroundColor: "#0f1420",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadURL(URL);
  // 外链用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  return win;
}

ipcMain.handle("desktop:token", () => TOKEN);
ipcMain.handle("desktop:is-desktop", () => true);

app.whenReady().then(async () => {
  try {
    if (await probe()) {
      console.log("[desktop] 检测到中控台已在运行，直接加载 " + URL);
    } else {
      console.log("[desktop] 中控台未运行，自动拉起 server.js …");
      spawnedByUs = true;
      await spawnServer();
    }
  } catch (e) {
    console.error("[desktop] 启动失败:", e.message);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (spawnedByUs && serverProc && !serverProc.killed) {
    console.log("[desktop] 关闭窗口，同时退出本进程拉起的服务");
    serverProc.kill();
  }
  app.quit();
});
