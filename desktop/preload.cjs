/**
 * pm2-console 桌面版 — preload（CommonJS）
 * 注入桌面端标识与令牌，供前端免弹窗使用。
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopEnv", {
  isDesktop: () => ipcRenderer.invoke("desktop:is-desktop"),
  getToken: () => ipcRenderer.invoke("desktop:token")
});
