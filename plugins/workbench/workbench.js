(() => {
  const TYPES = [
    ["project", "工程"], ["directory", "目录"], ["file", "文件"], ["link", "在线链接"],
    ["account-file", "账号文件"], ["service", "托管服务"], ["software", "本机软件"], ["other", "其他"]
  ];
  const state = {
    workspaces: [], items: [], selectedWorkspaceId: localStorage.getItem("pm2-console.workbench.workspace") || "",
    selectedItemId: "", quickFilter: "all", query: "", detail: null
  };

  function byId(id) { return document.getElementById(id); }
  function element(tag, options = {}) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.type) node.type = options.type;
    if (options.placeholder) node.placeholder = options.placeholder;
    if (options.value !== undefined) node.value = options.value;
    if (options.checked !== undefined) node.checked = options.checked;
    if (options.disabled !== undefined) node.disabled = options.disabled;
    if (options.title) node.title = options.title;
    return node;
  }
  function clear(node) { node.replaceChildren(); }
  function notify(message, isError = false) { if (typeof toast === "function") toast(message, isError); }
  function request(path, options) {
    if (typeof api !== "function") return Promise.reject(new Error("中控台接口尚未就绪"));
    return api(path, options);
  }
  function typeLabel(type) { return (TYPES.find(([value]) => value === type) || [type, type])[1]; }
  function formatDate(value) { return value ? new Date(value).toLocaleString() : "从未打开"; }
  function workspaceFor(item) { return state.workspaces.find((workspace) => workspace.id === item.workspaceId); }
  function selectedWorkspace() { return state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId); }
  function selectedItem() { return state.items.find((item) => item.id === state.selectedItemId); }
  function integrationPlugins() {
    const plugins = typeof PLUGIN_LIST === "undefined" ? [] : PLUGIN_LIST;
    return plugins.filter((plugin) => {
      const adapter = window[`${plugin.id}Plugin`];
      return plugin.enabled && adapter && typeof adapter.openWorkbenchItem === "function";
    });
  }

  function actionButton(text, handler, primary = false, danger = false) {
    const button = element("button", { className: `small${primary ? " primary" : ""}${danger ? " danger" : ""}`, text });
    button.onclick = handler;
    return button;
  }
  function formField(labelText, control) {
    const wrapper = element("div", { className: "wb-form-field" });
    wrapper.append(element("label", { text: labelText }), control);
    return wrapper;
  }
  function statusMessage(text, error = false) {
    const node = element("div", { className: `wb-status${error ? " error" : ""}`, text });
    return node;
  }

  async function refresh() {
    const result = await request("/api/workbench");
    state.workspaces = result.workspaces || [];
    state.items = result.items || [];
    if (!state.workspaces.some((workspace) => workspace.id === state.selectedWorkspaceId)) {
      state.selectedWorkspaceId = state.workspaces[0] ? state.workspaces[0].id : "";
    }
    if (!state.items.some((item) => item.id === state.selectedItemId)) state.selectedItemId = "";
    localStorage.setItem("pm2-console.workbench.workspace", state.selectedWorkspaceId);
    renderAll();
  }

  function renderAll() {
    renderSpaces();
    renderItems();
    if (state.detail && state.detail.kind === "workspace") showWorkspaceForm(selectedWorkspace());
    else if (state.detail && state.detail.kind === "item") showItemDetails(selectedItem());
    else showWelcome();
  }

  function renderSpaces() {
    const pane = byId("wbSpaces");
    clear(pane);
    pane.append(element("div", { className: "wb-pane-title", text: "工作空间" }));
    const quick = element("div", { className: "wb-filter-row" });
    [["all", "全部"], ["unassigned", "未归类"], ["starred", "收藏"], ["recent", "最近"]].forEach(([value, label]) => {
      const button = actionButton(label, () => {
        state.quickFilter = value;
        state.selectedWorkspaceId = "";
        renderSpaces(); renderItems();
      });
      button.classList.toggle("active", state.quickFilter === value);
      quick.append(button);
    });
    pane.append(quick);
    state.workspaces.forEach((workspace) => {
      const button = element("button", { className: "wb-space-button" });
      button.classList.toggle("active", state.quickFilter === "workspace" && state.selectedWorkspaceId === workspace.id);
      const name = element("div", { className: "wb-space-name", text: workspace.name });
      const root = element("div", { className: "wb-space-root", text: workspace.root || "未设置根目录" });
      button.append(name, root);
      button.onclick = () => {
        state.quickFilter = "workspace";
        state.selectedWorkspaceId = workspace.id;
        state.selectedItemId = "";
        state.detail = { kind: "workspace" };
        localStorage.setItem("pm2-console.workbench.workspace", workspace.id);
        renderAll();
      };
      pane.append(button);
    });
    if (!state.workspaces.length) pane.append(element("div", { className: "wb-empty", text: "工作空间可选；也可以先直接添加常用入口。" }));
  }

  function visibleItems() {
    const needle = state.query.trim().toLowerCase();
    return state.items.filter((item) => {
      if (state.quickFilter === "workspace" && item.workspaceId !== state.selectedWorkspaceId) return false;
      if (state.quickFilter === "unassigned" && item.workspaceId) return false;
      if (state.quickFilter === "starred" && !item.starred) return false;
      if (state.quickFilter === "recent" && !item.lastOpenedAt) return false;
      if (!needle) return true;
      return [item.title, item.description, item.target, item.serviceName, ...(item.tags || [])]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    }).sort((left, right) => {
      if (state.quickFilter === "recent") return String(right.lastOpenedAt || "").localeCompare(String(left.lastOpenedAt || ""));
      return Number(right.starred) - Number(left.starred) || String(right.updatedAt).localeCompare(String(left.updatedAt));
    });
  }

  function renderItems() {
    const pane = byId("wbItems");
    clear(pane);
    const list = visibleItems();
    const title = element("div", { className: "wb-pane-title" });
    title.append(element("strong", { text: state.quickFilter === "workspace" && selectedWorkspace() ? selectedWorkspace().name : "收纳条目" }), element("span", { className: "muted", text: `${list.length} 项` }));
    pane.append(title);
    if (!list.length) {
      pane.append(element("div", { className: "wb-empty", text: "没有匹配条目，可以添加一个。" }));
      return;
    }
    list.forEach((item) => {
      const button = element("button", { className: "wb-item" });
      button.classList.toggle("active", item.id === state.selectedItemId);
      const heading = element("div", { className: "wb-item-title", text: `${item.starred ? "★ " : ""}${item.title}` });
      const meta = element("div", { className: "wb-item-meta", text: `${typeLabel(item.type)} · ${(workspaceFor(item) || {}).name || "未归类"}` });
      const target = element("div", { className: "wb-item-description", text: item.serviceName || item.target || "" });
      button.append(heading, meta, target);
      button.onclick = () => { state.selectedItemId = item.id; state.detail = { kind: "item" }; renderItems(); showItemDetails(item); };
      pane.append(button);
    });
  }

  function showWelcome() {
    const pane = byId("wbDetail");
    clear(pane);
    pane.append(element("div", { className: "wb-pane-title", text: "工作台说明" }));
    pane.append(statusMessage("按工作空间收纳工程、目录、文件、链接和服务入口。账号文件只记录路径，不读取内容。"));
    pane.append(actionButton("＋ 创建工作空间", () => showWorkspaceForm(null), true));
  }

  function showWorkspaceForm(workspace) {
    const pane = byId("wbDetail");
    clear(pane);
    pane.append(element("div", { className: "wb-pane-title", text: workspace ? "编辑工作空间" : "新建工作空间" }));
    const name = element("input", { type: "text", value: workspace ? workspace.name : "", placeholder: "例如：客户 A / 个人项目" });
    const root = element("input", { type: "text", value: workspace && workspace.root ? workspace.root : "", placeholder: "根目录（可选）" });
    const description = element("textarea", { value: workspace && workspace.description ? workspace.description : "", placeholder: "说明（可选）" });
    pane.append(formField("名称", name), formField("根目录", root), formField("说明", description));
    const actions = element("div", { className: "wb-form-actions" });
    if (workspace) actions.append(actionButton("打开根目录", async () => {
      try { await request(`/api/workbench/workspaces/${workspace.id}/open-root`, { method: "POST", body: {} }); notify("已请求打开工作空间根目录"); }
      catch (error) { notify(error.message, true); }
    }));
    actions.append(actionButton("保存", async () => {
      try {
        await request(workspace ? `/api/workbench/workspaces/${workspace.id}` : "/api/workbench/workspaces", {
          method: workspace ? "PATCH" : "POST", body: { name: name.value, root: root.value, description: description.value }
        });
        state.detail = null;
        await refresh(); notify("工作空间已保存");
      } catch (error) { notify(error.message, true); }
    }, true));
    if (workspace) actions.append(actionButton("删除", async () => {
      try {
        await request(`/api/workbench/workspaces/${workspace.id}`, { method: "DELETE" });
        state.detail = null; await refresh(); notify("工作空间已删除");
      } catch (error) { notify(error.message, true); }
    }, false, true));
    actions.append(actionButton("取消", () => { state.detail = null; showWelcome(); }));
    pane.append(actions);
  }

  function showItemForm(item) {
    const pane = byId("wbDetail");
    clear(pane);
    pane.append(element("div", { className: "wb-pane-title", text: item ? "编辑收纳条目" : "新建收纳条目" }));
    const workspace = element("select");
    workspace.append(element("option", { value: "", text: "未归类（不选择工作空间）" }));
    state.workspaces.forEach((entry) => {
      const option = element("option", { value: entry.id, text: entry.name });
      option.selected = (item && item.workspaceId === entry.id) || (!item && entry.id === state.selectedWorkspaceId);
      workspace.append(option);
    });
    const title = element("input", { type: "text", value: item ? item.title : "", placeholder: "显示名称" });
    const type = element("select");
    TYPES.forEach(([value, label]) => {
      const option = element("option", { value, text: label });
      option.selected = (item ? item.type : "project") === value;
      type.append(option);
    });
    const target = element("input", { type: "text", value: item && item.target ? item.target : "", placeholder: "文件夹/文件/程序完整路径，或 https:// 链接" });
    const service = element("select");
    service.append(element("option", { value: "", text: "选择当前 PM2 服务" }));
    const managed = typeof window.getManagedServices === "function" ? window.getManagedServices() : [];
    managed.forEach((entry) => {
      const option = element("option", { value: entry.name, text: entry.name });
      option.selected = item && item.serviceName === entry.name;
      service.append(option);
    });
    const integration = element("select");
    integration.append(element("option", { value: "", text: "快速打开（不通过插件）" }));
    const providers = integrationPlugins();
    providers.forEach((plugin) => {
      const option = element("option", { value: plugin.id, text: `插件集成：${plugin.name}` });
      option.selected = item && item.integrationPluginId === plugin.id;
      integration.append(option);
    });
    if (item && item.integrationPluginId && !providers.some((plugin) => plugin.id === item.integrationPluginId)) {
      const unavailable = element("option", { value: item.integrationPluginId, text: `插件未加载：${item.integrationPluginId}` });
      unavailable.selected = true;
      integration.append(unavailable);
    }
    const description = element("textarea", { value: item && item.description ? item.description : "", placeholder: "说明（可选）" });
    const tags = element("input", { type: "text", value: item ? (item.tags || []).join(", ") : "", placeholder: "标签，用逗号分隔" });
    const starred = element("input", { type: "checkbox", checked: Boolean(item && item.starred) });
    const targetField = formField("地址", target);
    const serviceField = formField("关联服务", service);
    const integrationField = formField("集成方式", integration);
    const accountNotice = statusMessage("账号文件只记录路径，不读取内容");
    const syncType = () => {
      const isService = type.value === "service";
      targetField.style.display = isService ? "none" : "grid";
      serviceField.style.display = isService ? "grid" : "none";
      integrationField.style.display = type.value === "software" ? "grid" : "none";
      accountNotice.style.display = type.value === "account-file" ? "block" : "none";
    };
    type.onchange = syncType;
    pane.append(formField("工作空间（可选）", workspace), formField("名称", title), formField("类型", type), targetField, serviceField, integrationField, accountNotice, formField("说明", description), formField("标签", tags));
    const favorite = element("label", { text: "收藏" });
    favorite.append(starred);
    pane.append(favorite);
    syncType();
    const actions = element("div", { className: "wb-form-actions" });
    actions.append(actionButton("保存", async () => {
      try {
        await request(item ? `/api/workbench/items/${item.id}` : "/api/workbench/items", {
          method: item ? "PATCH" : "POST",
          body: { workspaceId: workspace.value, title: title.value, type: type.value, target: target.value, serviceName: service.value, integrationPluginId: integration.value, description: description.value, tags: tags.value, starred: starred.checked }
        });
        state.detail = null; await refresh(); notify("条目已保存");
      } catch (error) { notify(error.message, true); }
    }, true));
    actions.append(actionButton("取消", () => { state.detail = null; showWelcome(); }));
    pane.append(actions);
  }

  function showItemDetails(item) {
    if (!item) return showWelcome();
    const pane = byId("wbDetail");
    clear(pane);
    pane.append(element("div", { className: "wb-pane-title", text: item.title }));
    pane.append(statusMessage(`${typeLabel(item.type)} · ${(workspaceFor(item) || {}).name || "未归类"}`));
    if (item.description) pane.append(statusMessage(item.description));
    if (item.integrationPluginId) pane.append(statusMessage(`插件集成：${item.integrationPluginId}`));
    const target = item.serviceName || item.target || "";
    pane.append(statusMessage(target));
    const status = item.targetStatus || { exists: true, kind: item.type };
    if (!status.exists) pane.append(statusMessage(status.error || "目标已不存在", true));
    const tags = element("div", { className: "wb-tags" });
    (item.tags || []).forEach((tag) => tags.append(element("span", { className: "wb-tag", text: tag })));
    pane.append(tags, statusMessage(`最近打开：${formatDate(item.lastOpenedAt)}`));
    const actions = element("div", { className: "wb-detail-actions" });
    if (status.exists) actions.append(actionButton(item.type === "service" ? "打开服务详情" : "打开", () => openItem(item), true));
    if (status.path && item.type !== "link" && item.type !== "service") actions.append(actionButton("打开所在文件夹", () => revealItem(item)));
    if (item.target) actions.append(actionButton("复制地址", async () => {
      try { await navigator.clipboard.writeText(item.target); notify("地址已复制"); }
      catch { notify("复制失败，请检查浏览器剪贴板权限", true); }
    }));
    actions.append(actionButton("编辑", () => showItemForm(item)));
    actions.append(actionButton("删除", async () => {
      try {
        await request(`/api/workbench/items/${item.id}`, { method: "DELETE" });
        state.selectedItemId = ""; state.detail = null; await refresh(); notify("条目已删除");
      } catch (error) { notify(error.message, true); }
    }, false, true));
    pane.append(actions);
  }

  async function openItem(item) {
    try {
      if (item.integrationPluginId) {
        const adapter = window[`${item.integrationPluginId}Plugin`];
        if (!adapter || typeof adapter.openWorkbenchItem !== "function") throw new Error(`集成插件「${item.integrationPluginId}」未启用或未提供 openWorkbenchItem 接口`);
        const result = await adapter.openWorkbenchItem(item);
        if (result === false || (result && result.ok === false)) throw new Error(result && result.error || "插件未能打开该条目");
        notify("已通过插件打开工作台条目");
        return;
      }
      const result = await request(`/api/workbench/items/${item.id}/open`, { method: "POST", body: {} });
      await refresh();
      if (result.action === "service") return window.workbenchPlugin.openService(result.serviceName);
      notify("已请求打开目标");
    } catch (error) { notify(error.message, true); }
  }

  async function revealItem(item) {
    try {
      await request(`/api/workbench/items/${item.id}/reveal`, { method: "POST", body: {} });
      notify("已打开所在文件夹");
    } catch (error) { notify(error.message, true); }
  }

  function bind() {
    byId("btnWbNewSpace").onclick = () => showWorkspaceForm(null);
    byId("btnWbNewItem").onclick = () => showItemForm(null);
    byId("wbSearch").oninput = (event) => { state.query = event.target.value; renderItems(); };
  }

  window.workbenchPlugin = {
    async init() {
      bind();
      try { await refresh(); }
      catch (error) { byId("wbItems").replaceChildren(element("div", { className: "wb-empty", text: `工作台加载失败：${error.message}` })); }
    },
    openService(name) {
      const services = typeof window.getManagedServices === "function" ? window.getManagedServices() : [];
      const service = services.find((entry) => entry.name === name);
      if (!service || typeof window.openServiceDetail !== "function") return notify("关联服务已不存在或尚未加载", true);
      if (typeof showModule === "function") showModule("card-overview");
      window.openServiceDetail(service.id);
    },
    searchEntries(query) {
      const needle = String(query || "").trim().toLowerCase();
      if (!needle) return [];
      return state.items.filter((item) => [item.title, item.description, item.target, item.serviceName, ...(item.tags || [])]
        .filter(Boolean).join(" ").toLowerCase().includes(needle))
        .slice(0, 8).map((item) => ({ id: item.id, title: item.title, type: item.type, target: item.target, workspaceName: (workspaceFor(item) || {}).name || null, starred: item.starred, targetStatus: item.targetStatus, detail: `${typeLabel(item.type)} · ${(workspaceFor(item) || {}).name || "未归类"}` }));
    },
    async openEntry(id, action) {
      const item = state.items.find((entry) => entry.id === id);
      if (!item) { notify("工作台条目不存在", true); return false; }
      if (action === "open") { await openItem(item); return true; }
      if (action === "reveal") { await revealItem(item); return true; }
      if (typeof showModule === "function") showModule("card-workbench");
      state.selectedItemId = item.id;
      state.detail = { kind: "item" };
      renderItems();
      showItemDetails(item);
      return true;
    }
  };
})();
