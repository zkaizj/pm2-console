/**
 * kb 插件独立运行 — Electron 入口
 * 直接打开知识库独立页面（不加载中控台外壳）。
 * 用法：electron.exe plugins/kb/standalone-main.js
 */
import { app, BrowserWindow, shell, ipcMain } from "electron";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.CONSOLE_PORT || 3090);
const HOST = process.env.CONSOLE_HOST || "127.0.0.1";
const TOKEN = process.env.CONSOLE_TOKEN || "admin";
const URL = `http://${HOST}:${PORT}/plugins/kb/standalone.html`;
let serverProc = null;
let spawnedByUs = false;

ipcMain.handle("desktop:token", () => TOKEN);
ipcMain.handle("desktop:is-desktop", () => true);

function probe(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: "/api/status", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function spawnServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    serverProc = child;
    child.stdout.on("data", (d) => console.log("[server]", String(d).trim()));
    child.stderr.on("data", (d) => console.error("[server]", String(d).trim()));
    const t0 = Date.now();
    const timer = setInterval(async () => {
      if (await probe(1000)) { clearInterval(timer); resolve(); }
      else if (Date.now() - t0 > 15000) { clearInterval(timer); reject(new Error("服务启动超时")); }
    }, 500);
  });
}

app.whenReady().then(async () => {
  try {
    if (await probe()) console.log("[kb-standalone] 检测到中控台运行中，直接加载");
    else { spawnedByUs = true; await spawnServer(); }
  } catch (e) { console.error("[kb-standalone] 启动失败:", e.message); }
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    title: "知识库",
    autoHideMenuBar: true,
    backgroundColor: "#0f1420",
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadURL(URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = new BrowserWindow({ width: 1200, height: 820, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, "..", "..", "desktop", "preload.cjs"), contextIsolation: true, sandbox: false } });
      w.loadURL(URL);
    }
  });
});

app.on("window-all-closed", () => {
  if (spawnedByUs && serverProc && !serverProc.killed) serverProc.kill();
  app.quit();
});
