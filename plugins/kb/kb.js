/* ============================================================
 * kb 插件 — 知识库前端模块（📚）
 * - 层级目录树（文件夹/ Markdown 文件）
 * - 所见即所得 Markdown 编辑（Toast UI Editor WYSIWYG，类 Typora）
 * - 新建 / 重命名 / 删除 / 搜索
 * 模式：
 *  - embed：嵌入中控台卡片（依赖全局 api()/toast()，如存在则复用）
 *  - standalone：独立页面（自带 API 封装与顶栏，供 plugins/kb/standalone.html 使用）
 * 导出：window.kbPlugin = { init(), standalone() }
 * ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* ---------- API 封装：优先复用宿主全局，否则自建 ---------- */
  async function callApi(path, opts = {}) {
    if (typeof window.api === "function") return window.api(path, opts);
    const headers = { "Content-Type": "application/json" };
    const t = (window.desktopEnv && (await window.desktopEnv.getToken().catch(() => null))) || localStorage.getItem("consoleToken") || "admin";
    headers["X-Console-Token"] = t;
    const res = await fetch(path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  function toast(msg, isErr) {
    if (typeof window.toast === "function") return window.toast(msg, isErr);
    let el = $("kbToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "kbToast";
      el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1d2740;border:1px solid #4f8cff;color:#e6ebf5;padding:10px 18px;border-radius:8px;z-index:999;display:none;box-shadow:0 4px 20px rgba(0,0,0,.4);font-size:13px";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.borderColor = isErr ? "#f87171" : "#4f8cff";
    el.style.display = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.style.display = "none"), 3000);
  }

  /* 通用输入弹窗：优先用宿主的（index.html 的 askModal），否则内置简易版（standalone 用）
   * 返回 Promise<string|null> —— Electron 渲染进程不支持 prompt，必须用 DOM 弹窗 */
  function kbAsk(title, placeholder = "", defaultValue = "") {
    if (typeof window.askModal === "function") return window.askModal(title, placeholder, defaultValue);
    return new Promise((resolve) => {
      let bg = $("kbAskBg");
      if (!bg) {
        bg = document.createElement("div");
        bg.id = "kbAskBg";
        bg.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:999";
        bg.innerHTML = `<div style="background:#171e2e;border:1px solid #2a3550;border-radius:10px;padding:20px;width:440px;max-width:92vw">
          <h3 id="kbAskTitle" style="font-size:15px;margin-bottom:12px;color:#e6ebf5"></h3>
          <input id="kbAskInput" style="width:100%;background:#1d2740;border:1px solid #2a3550;color:#e6ebf5;border-radius:6px;padding:8px 10px;font-size:13px" autocomplete="off">
          <div style="display:flex;gap:8px;margin-top:12px">
            <button id="kbAskOk" style="background:#4f8cff;border:none;color:#fff;border-radius:6px;padding:6px 16px;cursor:pointer">确定</button>
            <button id="kbAskCancel" style="background:#1d2740;border:1px solid #2a3550;color:#e6ebf5;border-radius:6px;padding:6px 16px;cursor:pointer">取消</button>
          </div>
        </div>`;
        document.body.appendChild(bg);
      }
      $("kbAskTitle").textContent = title || "输入";
      const inp = $("kbAskInput");
      inp.value = defaultValue;
      inp.placeholder = placeholder;
      bg.style.display = "flex";
      const cleanup = () => { bg.style.display = "none"; inp.onkeydown = null; };
      inp.onkeydown = (e) => {
        if (e.key === "Enter") { const v = inp.value.trim(); cleanup(); resolve(v || null); }
        if (e.key === "Escape") { cleanup(); resolve(null); }
      };
      $("kbAskOk").onclick = () => { const v = inp.value.trim(); cleanup(); resolve(v || null); };
      $("kbAskCancel").onclick = () => { cleanup(); resolve(null); };
      setTimeout(() => inp.focus(), 50);
    });
  }

  let kbRoot = null;
  let kbTree = [];
  let currentFile = null;   // { path, name, rel }
  let editor = null;
  let dirty = false;
  const expanded = new Set();

  /* ---------- 初始化（embed 与 standalone 共用） ---------- */
  async function initKb() {
    try {
      const d = await callApi("/api/kb/root");
      kbRoot = d.root;
      const label = $("kbRootLabel");
      if (label) { label.textContent = kbRoot; label.title = kbRoot; }
      await refreshTree();
    } catch (e) {
      const label = $("kbRootLabel");
      if (label) label.textContent = "知识库不可用：" + e.message;
      toast(e.message, true);
    }
  }

  /* ---------- 目录树 ---------- */
  async function refreshTree() {
    try {
      const d = await callApi("/api/kb/tree");
      kbTree = d.tree;
      renderTree();
    } catch (e) { toast(e.message, true); }
  }

  function renderTree() {
    const el = $("kbTree");
    if (!el) return;
    el.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const node of kbTree) frag.appendChild(nodeEl(node, 0));
    el.appendChild(frag);
  }

  function nodeEl(node, depth) {
    const wrap = document.createElement("div");
    const isOpen = expanded.has(node.path);
    const item = document.createElement("div");
    item.className = "kb-item" + (currentFile && currentFile.path === node.path ? " active" : "");
    item.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 8px 5px ${8 + depth * 16}px;cursor:pointer;white-space:nowrap;border-radius:6px;margin:1px 4px;font-size:13px;`;
    item.dataset.path = node.path;
    item.dataset.type = node.type;

    const caret = document.createElement("span");
    caret.style.cssText = "width:12px;flex:none;text-align:center;font-size:10px;color:var(--muted, #8b97b3)";
    caret.textContent = node.type === "dir" ? (isOpen ? "▾" : "▸") : "·";

    const icon = document.createElement("span");
    icon.textContent = node.type === "dir" ? (isOpen ? "📂" : "📁") : "📄";

    const label = document.createElement("span");
    label.textContent = node.name;
    label.style.cssText = "overflow:hidden;text-overflow:ellipsis;flex:1";

    item.append(caret, icon, label);
    item.onmouseover = () => { item.style.background = "var(--panel2, #1d2740)"; };
    item.onmouseout = () => { if (!(currentFile && currentFile.path === node.path)) item.style.background = "transparent"; };
    item.onclick = async () => {
      if (node.type === "dir") {
        if (isOpen) expanded.delete(node.path); else expanded.add(node.path);
        renderTree();
      } else {
        await openFile(node.path);
      }
    };
    item.oncontextmenu = (e) => {
      e.preventDefault();
      if (node.type === "dir") { if (isOpen) expanded.delete(node.path); else expanded.add(node.path); renderTree(); }
      showCtx(e.clientX, e.clientY, node);
    };
    wrap.appendChild(item);

    if (node.type === "dir") {
      const children = document.createElement("div");
      children.style.display = isOpen ? "block" : "none";
      if (isOpen) {
        for (const child of node.children) children.appendChild(nodeEl(child, depth + 1));
      }
      wrap.appendChild(children);
    }
    return wrap;
  }

  /* ---------- 打开 / 保存 ---------- */
  async function openFile(path) {
    try {
      const d = await callApi(`/api/kb/read?path=${encodeURIComponent(path)}`);
      currentFile = { path, name: path.split(/[\\/]/).pop(), rel: path.replace(kbRoot, "").replace(/^[\\/]+/, "") };
      const fn = $("kbFileName"); if (fn) fn.textContent = currentFile.rel;
      const bar = $("kbFileBar"); if (bar) bar.style.display = "flex";
      const empty = $("kbEmpty"); if (empty) empty.style.display = "none";
      if (!editor) createEditor();
      editor.setMarkdown(d.content, false);
      dirty = false;
      setDirty();
      document.querySelectorAll("#kbTree .kb-item").forEach((el) => {
        const on = el.dataset.path === path;
        el.style.background = on ? "var(--accent, #4f8cff)" : "transparent";
        if (on) el.style.color = "#fff";
      });
    } catch (e) { toast(e.message, true); }
  }

  function createEditor() {
    if (typeof toastui === "undefined" || !toastui.Editor) {
      toast("编辑器组件未加载（请确认插件 vendor 已构建：npm run build:kb）", true);
      return;
    }
    editor = new toastui.Editor({
      el: $("kbEditor"),
      height: "100%",
      initialEditType: "wysiwyg",       // 所见即所得（类 Typora）
      previewStyle: "vertical",
      language: "zh-CN",
      theme: "dark",
      hideModeSwitch: false,
      placeholder: "开始记录你的学习与经验……\n支持 Markdown：标题、列表、表格、代码、图片链接等，所见即所得。",
      toolbarItems: [
        ["heading", "bold", "italic", "strike"],
        ["hr", "quote"],
        ["ul", "ol", "task", "indent", "outdent"],
        ["table", "image", "link"],
        ["code", "codeblock"],
        ["scrollSync"]
      ],
      hooks: {
        addImageBlobHook: async (blob, callback) => {
          const reader = new FileReader();
          reader.onload = () => callback(reader.result, "image");
          reader.readAsDataURL(blob);
        }
      }
    });
    editor.on("change", () => { if (currentFile) { dirty = true; setDirty(); } });
  }

  function setDirty() {
    const d = $("kbFileDirty"); if (d) d.textContent = dirty ? "● 未保存" : "";
    const b = $("btnKbSave"); if (b) b.style.opacity = dirty ? "1" : ".6";
  }

  async function saveFile() {
    if (!currentFile || !editor) return;
    try {
      await callApi("/api/kb/write", { method: "POST", body: { path: currentFile.path, content: editor.getMarkdown() } });
      dirty = false; setDirty(); toast("已保存 " + currentFile.name);
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- 新建 / 重命名 / 删除 ---------- */
  function currentDir() {
    if (!currentFile) return kbRoot;
    return currentFile.path.split(/[\\/]/).slice(0, -1).join("/");
  }

  async function createEntry(isDir) {
    const dir = currentDir();
    const name = await kbAsk(isDir ? "输入新文件夹名称：" : "输入新 Markdown 文件名（.md）：", isDir ? "新建文件夹" : "未命名.md", isDir ? "新建文件夹" : "未命名.md");
    if (!name) return;
    try {
      const d = await callApi("/api/kb/create", { method: "POST", body: { dir, name, isDir } });
      expanded.add(dir);
      await refreshTree();
      if (!isDir) await openFile(d.path);
      else toast("已创建文件夹");
    } catch (e) { toast(e.message, true); }
  }

  function showCtx(x, y, node) {
    hideCtx();
    const menu = document.createElement("div");
    menu.id = "kbCtx";
    menu.style.cssText = "position:fixed;z-index:200;background:var(--panel, #171e2e);border:1px solid var(--border, #2a3550);border-radius:8px;padding:4px;min-width:150px;box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:13px;color:var(--text, #e6ebf5)";
    const dirFor = node.type === "dir" ? node.path : node.path.split(/[\\/]/).slice(0, -1).join("/");
    const addItem = (label, fn, danger) => {
      const it = document.createElement("div");
      it.textContent = label;
      it.style.cssText = "padding:6px 12px;border-radius:5px;cursor:pointer;" + (danger ? "color:var(--red, #f87171);" : "");
      it.onmouseover = () => (it.style.background = "var(--panel2, #1d2740)");
      it.onmouseout = () => (it.style.background = "transparent");
      it.onclick = () => { hideCtx(); fn(); };
      menu.appendChild(it);
    };
    addItem("📄 新建 Markdown", () => newAt(dirFor, false));
    addItem("📁 新建文件夹", () => newAt(dirFor, true));
    if (node.type === "file" || node.type === "dir") {
      menu.appendChild(sep());
      addItem("✏️ 重命名", () => renameAt(node.path));
    }
    menu.appendChild(sep());
    addItem("🗑 删除", () => removeAt(node.path, node.type), true);
    document.body.appendChild(menu);
    menu.style.left = Math.min(x, innerWidth - 180) + "px";
    menu.style.top = Math.min(y, innerHeight - 220) + "px";
  }
  function sep() {
    const s = document.createElement("div");
    s.style.cssText = "height:1px;background:var(--border, #2a3550);margin:4px 6px;";
    return s;
  }
  function hideCtx() { const m = $("kbCtx"); if (m) m.remove(); }
  document.addEventListener("click", hideCtx);

  async function newAt(dir, isDir) {
    const name = await kbAsk(isDir ? "输入新文件夹名称：" : "输入新 Markdown 文件名（.md）：", isDir ? "新建文件夹" : "未命名.md", isDir ? "新建文件夹" : "未命名.md");
    if (!name) return;
    try {
      const d = await callApi("/api/kb/create", { method: "POST", body: { dir, name, isDir } });
      expanded.add(dir);
      await refreshTree();
      if (!isDir) await openFile(d.path);
    } catch (e) { toast(e.message, true); }
  }
  async function renameAt(path) {
    const oldName = path.split(/[\\/]/).pop();
    const newName = await kbAsk("输入新名称：", oldName, oldName);
    if (!newName || newName === oldName) return;
    try {
      const d = await callApi("/api/kb/rename", { method: "POST", body: { path, name: newName } });
      if (currentFile && currentFile.path === path) currentFile.path = d.path;
      await refreshTree();
      toast("已重命名");
    } catch (e) { toast(e.message, true); }
  }
  async function removeAt(path, type) {
    if (!confirm(`确定删除「${path.split(/[\\/]/).pop()}」？${type === "dir" ? "整个目录将一并删除！" : ""}`)) return;
    try {
      await callApi("/api/kb/delete", { method: "POST", body: { path } });
      if (currentFile && currentFile.path === path) { currentFile = null; const bar = $("kbFileBar"); if (bar) bar.style.display = "none"; const empty = $("kbEmpty"); if (empty) empty.style.display = "flex"; if (editor) editor.setMarkdown(""); }
      await refreshTree();
      toast("已删除");
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- 切换目录 ---------- */
  async function pickRoot() {
    const input = await kbAsk("输入知识库根目录（本地文件夹路径）：", "例如 D:\\ai\\dsh-workspace\\kb", kbRoot);
    if (!input) return;
    try {
      const d = await callApi("/api/kb/root", { method: "POST", body: { root: input.trim() } });
      kbRoot = d.root;
      const label = $("kbRootLabel"); if (label) { label.textContent = kbRoot; label.title = kbRoot; }
      currentFile = null;
      const bar = $("kbFileBar"); if (bar) bar.style.display = "none";
      const empty = $("kbEmpty"); if (empty) empty.style.display = "flex";
      if (editor) editor.setMarkdown("");
      await refreshTree();
      toast("知识库已切换");
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- 搜索 ---------- */
  let searchTimer = null;
  async function doSearch() {
    const inp = $("kbSearch");
    if (!inp) return;
    const q = inp.value.trim();
    clearTimeout(searchTimer);
    if (!q) return;
    searchTimer = setTimeout(async () => {
      try {
        const d = await callApi(`/api/kb/search?q=${encodeURIComponent(q)}`);
        if (!d.hits.length) { toast("没有匹配内容"); return; }
        const list = d.hits.slice(0, 20).map((h, i) => `${i + 1}. ${h.rel}${h.snippet ? " — " + h.snippet : ""}`).join("\n");
        const pick = await kbAsk("搜索结果（输入序号打开）：", list + (d.hits.length > 20 ? `\n… 共 ${d.hits.length} 条` : ""), "");
        const idx = Number(pick) - 1;
        if (pick !== null && !isNaN(idx) && d.hits[idx]) {
          const dirPart = d.hits[idx].path.split(/[\\/]/).slice(0, -1).join("/");
          expanded.add(dirPart);
          await refreshTree();
          await openFile(d.hits[idx].path);
        }
      } catch (e) { toast(e.message, true); }
    }, 300);
  }

  /* ---------- 绑定（embed：卡片内；standalone：独立页） ---------- */
  function bind() {
    const bindBtn = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    bindBtn("btnKbNewFile", () => createEntry(false));
    bindBtn("btnKbNewDir", () => createEntry(true));
    bindBtn("btnKbSave", saveFile);
    bindBtn("btnKbRoot", pickRoot);
    const si = $("kbSearch"); if (si) si.oninput = doSearch;
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveFile(); }
    });
  }

  /* ---------- 独立页面模式 ---------- */
  function standalone() {
    document.title = "知识库";
    const appEl = $("kbApp");
    if (appEl) {
      appEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--panel,#171e2e);border-bottom:1px solid var(--border,#2a3550);flex-wrap:wrap">
          <b style="font-size:15px">📚 知识库 <span class="muted" style="font-size:11px;color:var(--muted,#8b97b3)">（独立模式）</span></b>
          <span class="mono" id="kbRootLabel" style="font-size:12px;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted,#8b97b3)" title=""></span>
          <div style="flex:1"></div>
          <button class="small" id="btnKbRoot" style="background:var(--panel2,#1d2740);color:var(--text,#e6ebf5);border:1px solid var(--border,#2a3550);border-radius:6px;padding:4px 10px;cursor:pointer">📁 切换目录</button>
          <button class="small" id="btnKbNewFile" style="background:var(--panel2,#1d2740);color:var(--text,#e6ebf5);border:1px solid var(--border,#2a3550);border-radius:6px;padding:4px 10px;cursor:pointer">＋ 文件</button>
          <button class="small" id="btnKbNewDir" style="background:var(--panel2,#1d2740);color:var(--text,#e6ebf5);border:1px solid var(--border,#2a3550);border-radius:6px;padding:4px 10px;cursor:pointer">＋ 文件夹</button>
          <input type="text" id="kbSearch" placeholder="搜索…" style="background:var(--panel2,#1d2740);color:var(--text,#e6ebf5);border:1px solid var(--border,#2a3550);border-radius:6px;padding:6px 10px;flex:0 0 180px">
        </div>
        <div id="kbBody" style="display:flex;flex:1;min-height:0">
          <div id="kbTree" style="flex:0 0 250px;border-right:1px solid var(--border,#2a3550);overflow:auto;background:#0d1322;user-select:none"></div>
          <div id="kbEditorArea" style="flex:1;min-width:0;display:flex;flex-direction:column">
            <div id="kbFileBar" style="display:none;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--border,#2a3550);background:#0d1322">
              <b class="mono" id="kbFileName" style="font-size:12px"></b>
              <span class="muted" id="kbFileDirty" style="font-size:11px"></span>
              <div style="flex:1"></div>
              <button class="small" id="btnKbSave" style="background:#4f8cff;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer">💾 保存</button>
            </div>
            <div id="kbEditor" style="flex:1;min-height:0"></div>
            <div id="kbEmpty" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted,#8b97b3)">← 从左侧选择一篇 Markdown 笔记，或新建一篇开始记录</div>
          </div>
        </div>`;
    }
    bind();
    return initKb();
  }

  window.kbPlugin = { init: initKb, standalone, bind };
})();
