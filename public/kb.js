/* ============================================================
 * pm2-console 知识库模块（📚）
 * - 层级目录树（文件夹/ Markdown 文件）
 * - 所见即所得 Markdown 编辑（Toast UI Editor WYSIWYG，类 Typora）
 * - 新建 / 重命名 / 删除 / 搜索
 * 依赖：index.html 中全局的 api() / toast() / $() / esc()
 * ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let kbRoot = null;
  let kbTree = [];
  let currentFile = null;   // { path, name, rel }
  let editor = null;
  let dirty = false;
  const expanded = new Set();

  /* ---------- 初始化 ---------- */
  async function initKb() {
    try {
      const d = await api("/api/kb/root");
      kbRoot = d.root;
      $("kbRootLabel").textContent = kbRoot;
      $("kbRootLabel").title = kbRoot;
      await refreshTree();
    } catch (e) {
      $("kbRootLabel").textContent = "知识库不可用：" + e.message;
    }
  }

  /* ---------- 目录树 ---------- */
  async function refreshTree() {
    try {
      const d = await api("/api/kb/tree");
      kbTree = d.tree;
      renderTree();
    } catch (e) { toast(e.message, true); }
  }

  function renderTree() {
    const el = $("kbTree");
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
    caret.style.cssText = "width:12px;flex:none;text-align:center;font-size:10px;color:var(--muted)";
    caret.textContent = node.type === "dir" ? (isOpen ? "▾" : "▸") : "·";

    const icon = document.createElement("span");
    icon.textContent = node.type === "dir" ? (isOpen ? "📂" : "📁") : "📄";

    const label = document.createElement("span");
    label.textContent = node.name;
    label.style.cssText = "overflow:hidden;text-overflow:ellipsis;flex:1";

    item.append(caret, icon, label);
    item.onmouseover = () => { item.style.background = "var(--panel2)"; };
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
      const d = await api(`/api/kb/read?path=${encodeURIComponent(path)}`);
      currentFile = { path, name: path.split(/[\\/]/).pop(), rel: path.replace(kbRoot, "").replace(/^[\\/]+/, "") };
      $("kbFileName").textContent = currentFile.rel;
      $("kbFileBar").style.display = "flex";
      $("kbEmpty").style.display = "none";
      if (!editor) createEditor();
      editor.setMarkdown(d.content, false);
      dirty = false;
      setDirty();
      // 高亮当前树节点
      document.querySelectorAll("#kbTree .kb-item").forEach((el) => {
        const on = el.dataset.path === path;
        el.style.background = on ? "var(--accent)" : "transparent";
        if (on) el.style.color = "#fff";
      });
    } catch (e) { toast(e.message, true); }
  }

  function createEditor() {
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
          // 图片转 base64 内嵌（本地知识库无需静态资源目录）
          const reader = new FileReader();
          reader.onload = () => callback(reader.result, "image");
          reader.readAsDataURL(blob);
        }
      }
    });
    editor.on("change", () => { if (currentFile) { dirty = true; setDirty(); } });
  }

  function setDirty() {
    $("kbFileDirty").textContent = dirty ? "● 未保存" : "";
    $("btnKbSave").style.opacity = dirty ? "1" : ".6";
  }

  async function saveFile() {
    if (!currentFile || !editor) return;
    try {
      await api("/api/kb/write", { method: "POST", body: { path: currentFile.path, content: editor.getMarkdown() } });
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
    const name = prompt(isDir ? "输入新文件夹名称：" : "输入新 Markdown 文件名（.md）：", isDir ? "新建文件夹" : "未命名.md");
    if (!name) return;
    try {
      const d = await api("/api/kb/create", { method: "POST", body: { dir, name, isDir } });
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
    menu.style.cssText = `position:fixed;z-index:200;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:150px;box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:13px;`;
    const dirFor = node.type === "dir" ? node.path : node.path.split(/[\\/]/).slice(0, -1).join("/");
    const addItem = (label, fn, danger) => {
      const it = document.createElement("div");
      it.textContent = label;
      it.style.cssText = `padding:6px 12px;border-radius:5px;cursor:pointer;` + (danger ? "color:var(--red);" : "");
      it.onmouseover = () => (it.style.background = "var(--panel2)");
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
    s.style.cssText = "height:1px;background:var(--border);margin:4px 6px;";
    return s;
  }
  function hideCtx() { const m = $("kbCtx"); if (m) m.remove(); }
  document.addEventListener("click", hideCtx);

  async function newAt(dir, isDir) {
    const name = prompt(isDir ? "输入新文件夹名称：" : "输入新 Markdown 文件名（.md）：", isDir ? "新建文件夹" : "未命名.md");
    if (!name) return;
    try {
      const d = await api("/api/kb/create", { method: "POST", body: { dir, name, isDir } });
      expanded.add(dir);
      await refreshTree();
      if (!isDir) await openFile(d.path);
    } catch (e) { toast(e.message, true); }
  }
  async function renameAt(path) {
    const oldName = path.split(/[\\/]/).pop();
    const newName = prompt("输入新名称：", oldName);
    if (!newName || newName === oldName) return;
    try {
      const d = await api("/api/kb/rename", { method: "POST", body: { path, name: newName } });
      if (currentFile && currentFile.path === path) currentFile.path = d.path;
      await refreshTree();
      toast("已重命名");
    } catch (e) { toast(e.message, true); }
  }
  async function removeAt(path, type) {
    if (!confirm(`确定删除「${path.split(/[\\/]/).pop()}」？${type === "dir" ? "整个目录将一并删除！" : ""}`)) return;
    try {
      await api("/api/kb/delete", { method: "POST", body: { path } });
      if (currentFile && currentFile.path === path) { currentFile = null; $("kbFileBar").style.display = "none"; $("kbEmpty").style.display = "flex"; if (editor) editor.setMarkdown(""); }
      await refreshTree();
      toast("已删除");
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- 切换目录 ---------- */
  async function pickRoot() {
    const input = prompt(
      "输入知识库根目录（本地文件夹路径）：\n例如 D:\\ai\\dsh-workspace\\kb",
      kbRoot
    );
    if (!input) return;
    try {
      const d = await api("/api/kb/root", { method: "POST", body: { root: input.trim() } });
      kbRoot = d.root;
      $("kbRootLabel").textContent = kbRoot;
      $("kbRootLabel").title = kbRoot;
      currentFile = null;
      $("kbFileBar").style.display = "none";
      $("kbEmpty").style.display = "flex";
      if (editor) editor.setMarkdown("");
      await refreshTree();
      toast("知识库已切换");
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- 搜索 ---------- */
  let searchTimer = null;
  async function doSearch() {
    const q = $("kbSearch").value.trim();
    clearTimeout(searchTimer);
    if (!q) return;
    searchTimer = setTimeout(async () => {
      try {
        const d = await api(`/api/kb/search?q=${encodeURIComponent(q)}`);
        if (!d.hits.length) { toast("没有匹配内容"); return; }
        const pick = prompt(
          "搜索结果（输入序号打开）：\n\n" +
          d.hits.slice(0, 20).map((h, i) => `${i + 1}. ${h.rel}${h.snippet ? " — " + h.snippet : ""}`).join("\n") +
          (d.hits.length > 20 ? `\n… 共 ${d.hits.length} 条` : "")
        );
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

  /* ---------- 绑定 ---------- */
  $("btnKbNewFile").onclick = () => createEntry(false);
  $("btnKbNewDir").onclick = () => createEntry(true);
  $("btnKbSave").onclick = saveFile;
  $("btnKbRoot").onclick = pickRoot;
  $("kbSearch").oninput = doSearch;
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveFile(); }
  });

  window.kbInit = initKb;
})();
