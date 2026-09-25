"use strict";

const { normalizeWorkspace, normalizeItem, targetStatus, validateTarget } = require("../../lib/workbench");

module.exports.register = function register(app, ctx) {
  const { path, fs, stateDir, readJson, writeJsonAtomically, spawn } = ctx;
  const file = path.join(stateDir, "workbench.json");
  let workbench = readJson(file, { version: 1, workspaces: [], items: [] });
  if (!Array.isArray(workbench.workspaces)) workbench.workspaces = [];
  if (!Array.isArray(workbench.items)) workbench.items = [];
  workbench.version = 1;

  function saveWorkbench() {
    writeJsonAtomically(file, workbench);
  }

  function workspaceById(id) {
    return workbench.workspaces.find((workspace) => workspace.id === id);
  }

  function itemById(id) {
    return workbench.items.find((item) => item.id === id);
  }

  function publicItem(item) {
    return Object.assign({}, item, { targetStatus: targetStatus(item) });
  }

  app.get("/api/workbench", (req, res) => {
    res.json({
      ok: true,
      workspaces: workbench.workspaces,
      items: workbench.items.map(publicItem)
    });
  });

  app.post("/api/workbench/workspaces", (req, res) => {
    let workspace;
    try {
      workspace = normalizeWorkspace(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (workbench.workspaces.some((entry) => entry.name === workspace.name)) {
      return res.status(409).json({ error: "工作空间名称已存在" });
    }
    workbench.workspaces.push(workspace);
    try {
      saveWorkbench();
      res.status(201).json({ ok: true, workspace });
    } catch (error) {
      res.status(500).json({ error: "保存工作空间失败: " + error.message });
    }
  });

  app.patch("/api/workbench/workspaces/:id", (req, res) => {
    const existing = workspaceById(req.params.id);
    if (!existing) return res.status(404).json({ error: "工作空间不存在" });
    let workspace;
    try {
      workspace = normalizeWorkspace(Object.assign({}, existing, req.body || {}), existing);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (workbench.workspaces.some((entry) => entry.id !== workspace.id && entry.name === workspace.name)) {
      return res.status(409).json({ error: "工作空间名称已存在" });
    }
    Object.assign(existing, workspace);
    try {
      saveWorkbench();
      res.json({ ok: true, workspace: existing });
    } catch (error) {
      res.status(500).json({ error: "保存工作空间失败: " + error.message });
    }
  });

  app.delete("/api/workbench/workspaces/:id", (req, res) => {
    const itemCount = workbench.items.filter((item) => item.workspaceId === req.params.id).length;
    if (itemCount) return res.status(409).json({ error: "请先删除或移动该工作空间中的条目" });
    const index = workbench.workspaces.findIndex((workspace) => workspace.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: "工作空间不存在" });
    workbench.workspaces.splice(index, 1);
    try {
      saveWorkbench();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "删除工作空间失败: " + error.message });
    }
  });

  app.post("/api/workbench/items", (req, res) => {
    let item;
    try {
      item = normalizeItem(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!workspaceById(item.workspaceId)) return res.status(400).json({ error: "工作空间不存在" });
    workbench.items.push(item);
    try {
      saveWorkbench();
      res.status(201).json({ ok: true, item: publicItem(item) });
    } catch (error) {
      res.status(500).json({ error: "保存条目失败: " + error.message });
    }
  });

  app.patch("/api/workbench/items/:id", (req, res) => {
    const existing = itemById(req.params.id);
    if (!existing) return res.status(404).json({ error: "条目不存在" });
    let item;
    try {
      item = normalizeItem(Object.assign({}, existing, req.body || {}), existing);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!workspaceById(item.workspaceId)) return res.status(400).json({ error: "工作空间不存在" });
    Object.assign(existing, item);
    try {
      saveWorkbench();
      res.json({ ok: true, item: publicItem(existing) });
    } catch (error) {
      res.status(500).json({ error: "保存条目失败: " + error.message });
    }
  });

  app.delete("/api/workbench/items/:id", (req, res) => {
    const index = workbench.items.findIndex((item) => item.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: "条目不存在" });
    workbench.items.splice(index, 1);
    try {
      saveWorkbench();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "删除条目失败: " + error.message });
    }
  });

  app.post("/api/workbench/items/:id/open", (req, res) => {
    const item = itemById(req.params.id);
    if (!item) return res.status(404).json({ error: "条目不存在" });
    let target;
    try {
      target = validateTarget(item);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!target.exists) return res.status(409).json({ error: "目标已不存在，请编辑地址", target });
    item.lastOpenedAt = new Date().toISOString();
    if (target.kind === "service") {
      try {
        saveWorkbench();
        return res.json({ ok: true, action: "service", serviceName: item.serviceName, item: publicItem(item) });
      } catch (error) {
        return res.status(500).json({ error: "保存最近打开时间失败: " + error.message });
      }
    }
    try {
      const child = spawn("explorer.exe", [target.path || item.target], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
      saveWorkbench();
      res.json({ ok: true, opened: target.kind, item: publicItem(item) });
    } catch (error) {
      res.status(500).json({ error: "打开目标失败: " + error.message });
    }
  });

  app.post("/api/workbench/items/:id/reveal", (req, res) => {
    const item = itemById(req.params.id);
    if (!item) return res.status(404).json({ error: "条目不存在" });
    const target = targetStatus(item);
    if (target.kind !== "missing" || !target.path) return res.status(400).json({ error: "仅可显示已失效的本地目标所在文件夹" });
    const directory = path.dirname(target.path);
    if (!fs.existsSync(directory)) return res.status(409).json({ error: "所在文件夹也已不存在" });
    try {
      const child = spawn("explorer.exe", [directory], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
      res.json({ ok: true, opened: "directory" });
    } catch (error) {
      res.status(500).json({ error: "打开所在文件夹失败: " + error.message });
    }
  });
};
