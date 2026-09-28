"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const WORKBENCH_TYPES = ["project", "directory", "file", "link", "account-file", "service", "software", "other"];
const BLOCKED_EXTENSIONS = new Set([".bat", ".cmd", ".com", ".exe", ".js", ".jse", ".lnk", ".msi", ".ps1", ".reg", ".scr", ".vbs"]);

function text(value) {
  return String(value || "").trim();
}

function normalizeTags(value) {
  const tags = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(tags.map((tag) => text(tag)).filter(Boolean))];
}

function normalizeWorkspace(input = {}, existing = {}) {
  const name = text(input.name);
  if (!name) throw new Error("工作空间名称不能为空");
  const now = new Date().toISOString();
  return {
    id: existing.id || crypto.randomUUID(),
    name,
    root: text(input.root) || null,
    description: text(input.description) || null,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function validateTarget(item) {
  if (item.type === "link") {
    let url;
    try {
      url = new URL(item.target);
    } catch {
      throw new Error("链接地址无效");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("链接只支持 HTTP/HTTPS");
    return { kind: "url", exists: true, target: url.toString() };
  }
  if (item.type === "service") return { kind: "service", exists: true, serviceName: item.serviceName };
  if (!path.isAbsolute(item.target)) throw new Error("本地目标必须使用完整路径");
  const resolved = path.resolve(item.target);
  const extension = path.extname(resolved).toLowerCase();
  if (item.type === "software") {
    if (![".exe", ".lnk"].includes(extension)) throw new Error("软件入口请选择 .exe 程序或 .lnk 快捷方式");
    if (!fs.existsSync(resolved)) return { kind: "missing", exists: false, path: resolved };
    return { kind: "software", exists: true, path: resolved };
  }
  if (BLOCKED_EXTENSIONS.has(extension)) throw new Error("此类文件不能直接打开，请打开所在文件夹");
  if (!fs.existsSync(resolved)) return { kind: "missing", exists: false, path: resolved };
  return { kind: fs.statSync(resolved).isDirectory() ? "directory" : "file", exists: true, path: resolved };
}

function targetStatus(item) {
  try {
    return validateTarget(item);
  } catch (error) {
    return { kind: "invalid", exists: false, error: error.message };
  }
}

function normalizeItem(input = {}, existing = {}) {
  const type = text(input.type || existing.type);
  if (!WORKBENCH_TYPES.includes(type)) throw new Error("不支持的条目类型");
  const title = text(input.title);
  const workspaceId = text(input.workspaceId) || null;
  const target = text(input.target);
  const serviceName = text(input.serviceName);
  const integrationPluginId = type === "software" ? text(input.integrationPluginId) || null : null;
  if (!title) throw new Error("条目名称不能为空");
  if (type === "service") {
    if (!serviceName) throw new Error("请选择关联服务");
  } else if (!target) {
    throw new Error("目标地址不能为空");
  }
  const now = new Date().toISOString();
  const item = {
    id: existing.id || crypto.randomUUID(),
    workspaceId,
    title,
    type,
    target: type === "service" ? null : target,
    serviceName: type === "service" ? serviceName : null,
    integrationPluginId,
    description: text(input.description) || null,
    tags: normalizeTags(input.tags),
    starred: Boolean(input.starred),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    lastOpenedAt: existing.lastOpenedAt || null
  };
  validateTarget(item);
  return item;
}

module.exports = { WORKBENCH_TYPES, normalizeWorkspace, normalizeItem, targetStatus, validateTarget };
