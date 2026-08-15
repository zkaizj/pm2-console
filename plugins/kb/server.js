/**
 * kb 插件 — 服务端模块
 * 由 server.js 插件系统加载：module.exports.register(app, ctx)
 * 提供 /api/kb/* 接口：根目录、目录树、读写、新建、重命名、删除、搜索
 */
"use strict";

const KB_SKIP_DIRS = new Set(["node_modules", ".git", ".svn", ".hg", "dist", ".next", ".vite", ".runtime", "out", "build", "data"]);

module.exports.register = function register(app, ctx) {
  const { path, fs, state, saveState } = ctx;
  const KB_DEFAULT_ROOT = path.join(__dirname, "..", "..", "kb");

  function kbRoot() {
    return process.env.KB_ROOT || (state.settings && state.settings.kbRoot) || KB_DEFAULT_ROOT;
  }
  function kbInside(root, p) {
    const rel = path.relative(path.resolve(root), path.resolve(p));
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  }
  function kbTree(dir, depth = 0) {
    if (depth > 14) return { children: [] };
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return { children: [] }; }
    const children = [];
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (KB_SKIP_DIRS.has(ent.name)) continue;
        const sub = kbTree(full, depth + 1);
        children.push({ type: "dir", name: ent.name, path: full, children: sub.children });
      } else if (ent.isFile() && /\.(md|markdown|txt)$/i.test(ent.name)) {
        children.push({ type: "file", name: ent.name, path: full });
      }
    }
    children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "zh-Hans-CN") : a.type === "dir" ? -1 : 1));
    return { children };
  }

  app.get("/api/kb/root", (req, res) => {
    const root = kbRoot();
    if (!fs.existsSync(root)) { try { fs.mkdirSync(root, { recursive: true }); } catch {} }
    res.json({ ok: true, root });
  });
  app.post("/api/kb/root", (req, res) => {
    const b = req.body || {};
    const dir = String(b.root || "").trim();
    if (!dir) return res.status(400).json({ error: "缺少目录" });
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return res.status(400).json({ error: "目录不存在或不是文件夹" });
    if (!state.settings) state.settings = {};
    state.settings.kbRoot = dir;
    saveState();
    res.json({ ok: true, root: dir });
  });
  app.get("/api/kb/tree", (req, res) => {
    const root = kbRoot();
    if (!fs.existsSync(root)) { try { fs.mkdirSync(root, { recursive: true }); } catch {} }
    res.json({ ok: true, root, tree: kbTree(root).children });
  });
  app.get("/api/kb/read", (req, res) => {
    const root = kbRoot();
    const p = String(req.query.path || "");
    if (!kbInside(root, p)) return res.status(400).json({ error: "路径越界" });
    try { res.json({ ok: true, content: fs.readFileSync(p, "utf8") }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/kb/write", (req, res) => {
    const root = kbRoot();
    const b = req.body || {};
    const p = String(b.path || "");
    if (!kbInside(root, p)) return res.status(400).json({ error: "路径越界" });
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, String(b.content ?? ""), "utf8");
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/kb/create", (req, res) => {
    const root = kbRoot();
    const b = req.body || {};
    const dir = String(b.dir || "");
    const name = String(b.name || "").trim();
    const isDir = !!b.isDir;
    if (!kbInside(root, dir)) return res.status(400).json({ error: "路径越界" });
    if (!name || /[\\/:*?"<>|]/.test(name)) return res.status(400).json({ error: "名称含非法字符" });
    let target = path.join(dir, name), i = 1;
    while (fs.existsSync(target)) {
      const ext = path.extname(name), base = ext && !isDir ? name.slice(0, -ext.length) : name;
      target = path.join(dir, `${base} (${i})${ext}`); i++;
    }
    try {
      if (isDir) fs.mkdirSync(target, { recursive: true });
      else fs.writeFileSync(target, "", "utf8");
      res.json({ ok: true, path: target });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/kb/rename", (req, res) => {
    const root = kbRoot();
    const b = req.body || {};
    const oldP = String(b.path || "");
    const newName = String(b.name || "").trim();
    if (!kbInside(root, oldP)) return res.status(400).json({ error: "路径越界" });
    if (!newName || /[\\/:*?"<>|]/.test(newName)) return res.status(400).json({ error: "名称含非法字符" });
    const target = path.join(path.dirname(oldP), newName);
    if (fs.existsSync(target)) return res.status(400).json({ error: "同名项已存在" });
    try { fs.renameSync(oldP, target); res.json({ ok: true, path: target }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/kb/delete", (req, res) => {
    const root = kbRoot();
    const b = req.body || {};
    const p = String(b.path || "");
    if (!kbInside(root, p)) return res.status(400).json({ error: "路径越界" });
    try { fs.rmSync(p, { recursive: true, force: true }); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/kb/search", (req, res) => {
    const root = kbRoot();
    const q = String(req.query.q || "").trim().toLowerCase();
    if (!q) return res.json({ ok: true, hits: [] });
    if (!fs.existsSync(root)) return res.json({ ok: true, hits: [] });
    const hits = [];
    const walk = (dir, depth) => {
      if (depth > 14) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (KB_SKIP_DIRS.has(ent.name)) continue;
          walk(full, depth + 1);
        } else if (ent.isFile() && /\.(md|markdown|txt)$/i.test(ent.name)) {
          let content = "";
          try { content = fs.readFileSync(full, "utf8"); } catch { continue; }
          const inName = ent.name.toLowerCase().includes(q);
          const inContent = content.toLowerCase().includes(q);
          if (inName || inContent) {
            let snippet = "";
            const idx = inContent ? content.toLowerCase().indexOf(q) : -1;
            if (idx >= 0) {
              const start = Math.max(0, idx - 60), end = Math.min(content.length, idx + q.length + 80);
              snippet = (start > 0 ? "…" : "") + content.slice(start, end).replace(/\s+/g, " ").trim() + (end < content.length ? "…" : "");
            }
            hits.push({ path: full, rel: path.relative(root, full), inName, inContent, snippet });
          }
        }
      }
    };
    walk(root, 0);
    hits.sort((a, b) => (a.inName === b.inName ? a.rel.localeCompare(b.rel, "zh-Hans-CN") : a.inName ? -1 : 1));
    res.json({ ok: true, hits });
  });
};
