# Local Operations Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the local PM2 console into a safe daily-operations cockpit with durable PM2 recovery and a local personal-work index.

**Architecture:** Keep Express and the single-page host as the operational core. Add a small persistence module used by the host and plugins, add the personal workbench as an independent plugin, and evolve the host API/UI around service metadata, recovery status, actionable attention items, and safe handoff flows.

**Tech Stack:** Node.js CommonJS, Express, PM2 Node API, native `node:test`, browser-native HTML/CSS/JavaScript, plugin manifests.

**Spec:** `docs/superpowers/specs/2026-09-25-local-operations-console-design.md`

## Global Constraints

- Remain local-only: bind the host to `127.0.0.1` and retain `X-Console-Token` authentication for every API route.
- Do not expose, read, index, copy, or persist account-password file contents.
- Do not execute target paths as shell commands; direct-open supports existing local folders, safe document files, and HTTP/HTTPS URLs only.
- Preserve the existing project deployment API and knowledge-base plugin while moving their UI entry points out of the primary daily workflow.
- Use atomic local writes with one adjacent backup for console, project, and workbench metadata.
- Call `pm2.dump` only after a successful PM2 process mutation, and surface any dump failure as durable recovery state.
- Make browser UI work in current Chromium/Electron without adding a frontend framework or runtime dependency.

## Review Focus

- A PM2 dump failure after a successful service action must leave the service result accurate while visibly marking recovery protection as failed; Task 1 tests and renders this independent state.
- A nonexistent, executable, `file:` URL, or non-HTTP(S) workbench target must never be opened; Task 3 exercises target validation before spawning an opener.
- A service intentionally stopped by the user must not be presented as an unexpected outage; Task 4 tests the desired-state predicate.
- An imported process that cannot coexist with its original port owner must not terminate the original PID; Task 6 tests the wait failure path and requires manual resolution.
- A failed refresh or action must retain the last useful service data and re-enable controls; Task 5 tests the busy-action cleanup path and module-level error behavior.

---

### Task 1: Durable Runtime Persistence and PM2 Recovery API

**Files:**
- Create: `lib/persistence.js`
- Create: `test/persistence.test.js`
- Modify: `server.js`
- Modify: `test/web-regressions.test.js`

**Interfaces:**
- Produces `readJson(file, fallback)`, `writeJsonAtomically(file, value)`, and `backupPath(file)` from `lib/persistence.js`.
- Produces `persistManagedChange()` and `recoveryStatus()` inside `server.js`.
- Adds `GET /api/recovery` and `POST /api/recovery/save`, both returning `{ ok, recovery: { lastSnapshotAt, lastSnapshotError } }`.
- Extends `state.serviceMeta[name]` with `desiredState`, `watched`, and `ignoreUntil` without invalidating existing metadata.

- [ ] **Step 1: Write failing persistence tests**

Create `test/persistence.test.js` with a temporary directory test for atomic writes and backups:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readJson, writeJsonAtomically, backupPath } = require("../lib/persistence");

test("atomic write replaces JSON and keeps the previous version as a backup", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm2-console-"));
  const file = path.join(dir, "state.json");
  writeJsonAtomically(file, { version: 1 });
  writeJsonAtomically(file, { version: 2 });
  assert.deepEqual(readJson(file, {}), { version: 2 });
  assert.deepEqual(readJson(backupPath(file), {}), { version: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("readJson returns the fallback for malformed content", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm2-console-"));
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, "{bad json", "utf8");
  assert.deepEqual(readJson(file, { safe: true }), { safe: true });
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test test/persistence.test.js`

Expected: FAIL with `Cannot find module '../lib/persistence'`.

- [ ] **Step 3: Implement the persistence module**

Create `lib/persistence.js`:

```js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function backupPath(file) {
  return `${file}.bak`;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomically(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(file)) fs.copyFileSync(file, backupPath(file));
  fs.writeFileSync(temporary, serialized, "utf8");
  fs.renameSync(temporary, file);
}

module.exports = { backupPath, readJson, writeJsonAtomically };
```

- [ ] **Step 4: Make host state use atomic persistence**

In `server.js`, import the module, initialize a `recovery` object when state loads, and replace direct `writeFileSync` calls in `saveState` and `saveProjects` with `writeJsonAtomically`. Preserve their boolean return values so routes can report a write failure:

```js
const { readJson, writeJsonAtomically } = require("./lib/persistence");

function saveState() {
  try {
    writeJsonAtomically(STATE_FILE, state);
    return { ok: true };
  } catch (error) {
    console.error("[pm2-console] 保存状态失败:", error.message);
    return { ok: false, error: error.message };
  }
}

function dumpPm2() {
  return new Promise((resolve) => {
    pm2.dump((error) => resolve(error ? { ok: false, error: error.message } : { ok: true }));
  });
}

async function persistManagedChange() {
  const saved = saveState();
  if (!saved.ok) return saved;
  const dumped = await dumpPm2();
  state.recovery = dumped.ok
    ? { lastSnapshotAt: new Date().toISOString(), lastSnapshotError: null }
    : { lastSnapshotAt: state.recovery?.lastSnapshotAt || null, lastSnapshotError: dumped.error };
  const recoverySaved = saveState();
  return dumped.ok && recoverySaved.ok ? { ok: true, recovery: state.recovery } : { ok: false, error: dumped.error || recoverySaved.error, recovery: state.recovery };
}
```

Implement `GET /api/recovery` with `state.recovery` and `POST /api/recovery/save` with `persistManagedChange`. Call `persistManagedChange` after successful PM2 start, stop, restart, delete, preset creation, and later safe import. Do not change the result of a successful PM2 operation to an HTTP error solely because its snapshot failed; return `recovery` alongside the successful process result.

- [ ] **Step 5: Add a recovery source contract test**

Append this test to `test/web-regressions.test.js`:

```js
test("managed process changes save a PM2 recovery snapshot", () => {
  assert.match(server, /function dumpPm2\(\)/);
  assert.match(server, /async function persistManagedChange\(\)/);
  assert.match(server, /app\.get\("\/api\/recovery"/);
  assert.match(server, /app\.post\("\/api\/recovery\/save"/);
});
```

- [ ] **Step 6: Run focused and full tests**

Run: `node --test test/persistence.test.js && npm test -- --test-reporter=spec && node --check server.js`

Expected: all tests pass and `server.js` has no syntax error.

- [ ] **Step 7: Commit the persistence foundation**

```powershell
git add lib/persistence.js test/persistence.test.js test/web-regressions.test.js server.js
git commit -m "feat: persist console state and PM2 recovery snapshots"
```

### Task 2: Workbench Domain Model and Safe Open API

**Files:**
- Create: `lib/workbench.js`
- Create: `test/workbench.test.js`
- Create: `plugins/workbench/manifest.json`
- Create: `plugins/workbench/server.js`
- Modify: `server.js`

**Interfaces:**
- Produces `WORKBENCH_TYPES`, `normalizeWorkspace`, `normalizeItem`, `validateTarget`, and `targetStatus` from `lib/workbench.js`.
- Adds plugin routes `GET /api/workbench`, `POST/PATCH/DELETE /api/workbench/workspaces/:id?`, `POST/PATCH/DELETE /api/workbench/items/:id?`, and `POST /api/workbench/items/:id/open`.
- Persists `{ version: 1, workspaces: [], items: [] }` to `<CONSOLE_STATE_DIR>/workbench.json`.
- Extends the plugin registration context with `stateDir` and `writeJsonAtomically`.

- [ ] **Step 1: Write failing target-validation tests**

Create `test/workbench.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeItem, validateTarget } = require("../lib/workbench");

test("normalizes a local account-file reference without reading its content", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-"));
  const file = path.join(dir, "accounts.txt");
  fs.writeFileSync(file, "private", "utf8");
  const item = normalizeItem({ workspaceId: "ws-1", title: "账号文件", type: "account-file", target: file });
  assert.equal(item.target, file);
  assert.equal(validateTarget(item).kind, "file");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("rejects unsupported links and executable local targets", () => {
  assert.throws(() => normalizeItem({ workspaceId: "ws-1", title: "bad", type: "link", target: "file:///C:/secret.txt" }));
  assert.throws(() => normalizeItem({ workspaceId: "ws-1", title: "bad", type: "file", target: "C:\\tool.cmd" }));
});
```

- [ ] **Step 2: Run the target-validation test to verify it fails**

Run: `node --test test/workbench.test.js`

Expected: FAIL with `Cannot find module '../lib/workbench'`.

- [ ] **Step 3: Implement the pure workbench model**

Create `lib/workbench.js`. Define the fixed types `project`, `directory`, `file`, `link`, `account-file`, `service`, and `other`. Generate IDs with `crypto.randomUUID()`. Permit only `http:` and `https:` for links. For local file-like entries reject extensions `.bat`, `.cmd`, `.com`, `.exe`, `.js`, `.jse`, `.lnk`, `.msi`, `.ps1`, `.reg`, `.scr`, `.vbs`; return a missing status instead of throwing for a deleted path.

```js
const BLOCKED_EXTENSIONS = new Set([".bat", ".cmd", ".com", ".exe", ".js", ".jse", ".lnk", ".msi", ".ps1", ".reg", ".scr", ".vbs"]);

function validateTarget(item) {
  if (item.type === "link") {
    const url = new URL(item.target);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("链接只支持 HTTP/HTTPS");
    return { kind: "url", exists: true };
  }
  if (item.type === "service") return { kind: "service", exists: true };
  const resolved = path.resolve(item.target);
  const extension = path.extname(resolved).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(extension)) throw new Error("此类文件不能直接打开，请打开所在文件夹");
  if (!fs.existsSync(resolved)) return { kind: "missing", exists: false, path: resolved };
  return { kind: fs.statSync(resolved).isDirectory() ? "directory" : "file", exists: true, path: resolved };
}
```

`normalizeItem` must copy only title, type, target, description, tags, `starred`, `workspaceId`, `serviceName`, timestamps, and `lastOpenedAt`; it must never call `readFileSync`.

- [ ] **Step 4: Implement the plugin server and host context**

Create `plugins/workbench/manifest.json` with `id: "workbench"`, `apiPrefix: "/api/workbench"`, `cardHtml: "card.html"`, `script: "workbench.js"`, and `css: ["workbench.css"]`.

In `plugins/workbench/server.js`, load `workbench.json` through `readJson`, validate workspace ownership on every item mutation, and save through `writeJsonAtomically`. Implement the open route as follows:

```js
const child = spawn("explorer.exe", [target.path || item.target], {
  detached: true,
  stdio: "ignore",
  windowsHide: true
});
child.unref();
item.lastOpenedAt = new Date().toISOString();
saveWorkbench();
res.json({ ok: true, opened: target.kind, item });
```

For `service` items, return `{ action: "service", serviceName }` without launching a process; the browser selects the matching service detail. Pass `spawn`, `stateDir`, `readJson`, and `writeJsonAtomically` to plugin registration from `server.js`.

- [ ] **Step 5: Add server boundary tests**

Extend `test/workbench.test.js` to assert that `plugins/workbench/server.js` calls `validateTarget` before `spawn`, and that its source does not contain `readFileSync(item.target` or `exec(`.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test test/workbench.test.js && npm test -- --test-reporter=spec && node --check plugins/workbench/server.js`

Expected: valid account-file references pass without content reads; unsafe targets fail; all existing tests remain green.

- [ ] **Step 7: Commit the workbench data layer**

```powershell
git add lib/workbench.js test/workbench.test.js plugins/workbench/manifest.json plugins/workbench/server.js server.js
git commit -m "feat: add safe local workbench data API"
```

### Task 3: Workbench Plugin Interface

**Files:**
- Create: `plugins/workbench/card.html`
- Create: `plugins/workbench/workbench.css`
- Create: `plugins/workbench/workbench.js`
- Modify: `test/workbench.test.js`

**Interfaces:**
- Consumes `GET /api/workbench` and the workbench mutation/open routes from Task 2.
- Produces `window.workbenchPlugin.init()` and `window.workbenchPlugin.openService(name)`.
- Uses host `api`, `toast`, `askModal`, `showModule`, and `ALL` when available.

- [ ] **Step 1: Write a failing UI contract test**

Append to `test/workbench.test.js`:

```js
test("workbench UI exposes workspace, favorites, search, and safe open states", () => {
  const card = fs.readFileSync("plugins/workbench/card.html", "utf8");
  const script = fs.readFileSync("plugins/workbench/workbench.js", "utf8");
  assert.match(card, /id="wbSpaces"/);
  assert.match(card, /id="wbItems"/);
  assert.match(card, /id="wbDetail"/);
  assert.match(script, /function renderItems\(\)/);
  assert.match(script, /function openItem\(/);
  assert.match(script, /window\.workbenchPlugin/);
});
```

- [ ] **Step 2: Run the UI contract test to verify it fails**

Run: `node --test test/workbench.test.js`

Expected: FAIL because the card and browser script do not exist.

- [ ] **Step 3: Build the three-column workbench card**

Create `card.html` with toolbar controls for workspace creation, new entry, global search, favorites, and recent items. Include the required three panes:

```html
<div class="card wb-card" id="card-workbench" data-module="1" data-plugin="workbench">
  <div class="wb-toolbar">
    <h2>🗂 工作台</h2>
    <button class="small" id="btnWbNewSpace">＋ 工作空间</button>
    <button class="small primary" id="btnWbNewItem">＋ 收纳条目</button>
    <input id="wbSearch" type="text" placeholder="搜索全部工作空间…">
  </div>
  <div class="wb-layout">
    <aside id="wbSpaces"></aside>
    <section id="wbItems"></section>
    <aside id="wbDetail"></aside>
  </div>
</div>
```

In `workbench.css`, use host theme variables, allow the middle list to shrink, and switch to a single-column layout below `900px` without hiding the current item’s open control.

- [ ] **Step 4: Implement workbench interaction**

In `workbench.js`, fetch data once in `init`, render workspace filters and item type filters, and preserve the last workspace in `localStorage` under `pm2-console.workbench.workspace`. Implement forms in the detail pane rather than native prompts: workspace fields are `name`, `root`, `description`; item fields are `title`, `type`, `target`, `description`, comma-separated tags, and favorite checkbox. Show the static text `账号文件只记录路径，不读取内容` when type is `account-file`.

`openItem(item)` calls `/api/workbench/items/${item.id}/open`; when the response has `action: "service"`, call `window.workbenchPlugin.openService(response.serviceName)`. For missing paths show an inline error and an `在文件夹中显示` action that sends the containing directory only. Do not inject data through `innerHTML`; assign user-provided text with `textContent`.

- [ ] **Step 5: Connect service links and check UI contracts**

Implement `openService(name)` to locate the PM2 service in host `ALL`, invoke the service detail opener from Task 5, and show a toast if it no longer exists. Re-run the Task 3 test plus a browser script compilation check:

```powershell
node --test test/workbench.test.js
node -e "new Function(require('fs').readFileSync('plugins/workbench/workbench.js','utf8'))"
```

Expected: all assertions pass and the plugin script compiles.

- [ ] **Step 6: Commit the workbench interface**

```powershell
git add plugins/workbench/card.html plugins/workbench/workbench.css plugins/workbench/workbench.js test/workbench.test.js
git commit -m "feat: add personal workbench interface"
```

### Task 4: Operational Attention Model and Health Diagnostics

**Files:**
- Modify: `server.js`
- Modify: `test/web-regressions.test.js`

**Interfaces:**
- Extends `/api/processes` entries with `watched`, `desiredState`, and `ignoreUntil`.
- Extends `/api/health` entries with `health.error`, `health.checkedAt`, and an `attention` array.
- Adds `POST /api/processes/:id/attention` accepting `{ ignored: boolean }`.
- Adds `POST /api/processes/:id/health-check` returning an immediate probe result.

- [ ] **Step 1: Write failing attention-model tests**

Add pure helpers to `server.js` before route registration and test them by source contract plus a small exported helper module if extraction is needed. The minimum behavioral cases are:

```js
assert.equal(isAttentionRequired({ status: "stopped", desiredState: "stopped" }), false);
assert.equal(isAttentionRequired({ status: "errored", desiredState: "running" }), true);
assert.equal(isAttentionRequired({ status: "stopped", desiredState: "running" }), true);
```

Place these in a new `test/operations.test.js` importing `isAttentionRequired` from `lib/operations.js`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/operations.test.js`

Expected: FAIL because `lib/operations.js` does not exist.

- [ ] **Step 3: Implement attention classification and health reasons**

Create `lib/operations.js`:

```js
function isAttentionRequired(service, now = Date.now()) {
  if (service.ignoreUntil && Date.parse(service.ignoreUntil) > now) return false;
  if (service.status === "errored") return true;
  return service.desiredState === "running" && service.status !== "online";
}

module.exports = { isAttentionRequired };
```

In `server.js`, update explicit start/restart actions to set `desiredState: "running"`; update explicit stop to `desiredState: "stopped"`; remove metadata only after a successful delete. Preserve `err` from `probeUrl` in `healthCache`, then compute attention entries from service state and failed health checks. The immediate health route calls the existing `probeUrl`, applies the configured keyword, updates `healthCache`, and returns `{ ok, health }`.

- [ ] **Step 4: Add and run API contracts**

Add tests asserting the health route and attention endpoint exist and that the health cache retains `error`. Run: `node --test test/operations.test.js test/web-regressions.test.js && node --check server.js`

Expected: desired stop is not an outage; errored and unexpectedly stopped services are attention items.

- [ ] **Step 5: Commit the operations model**

```powershell
git add lib/operations.js test/operations.test.js test/web-regressions.test.js server.js
git commit -m "feat: expose actionable service attention and health diagnostics"
```

### Task 5: Daily Operations UI and Safe Service Controls

**Files:**
- Modify: `public/index.html`
- Modify: `test/web-regressions.test.js`

**Interfaces:**
- Consumes enhanced `/api/processes`, `/api/health`, `/api/recovery`, attention, and health-check routes.
- Produces `renderAttention()`, `openServiceDetail(id)`, `confirmServiceAction(service, action)`, `runBusy(button, action)`, and `openLogForService(id, query)` in the host page.
- Keeps `showModule`, `loadList`, and plugin loading public to existing plugins.

- [ ] **Step 1: Write failing UI contract tests**

Add tests for the new operational elements:

```js
test("operations UI provides attention, recovery, and a safe service detail flow", () => {
  assert.match(frontend, /id="attentionList"/);
  assert.match(frontend, /id="recoveryStatus"/);
  assert.match(frontend, /id="serviceDetailModalBg"/);
  assert.match(frontend, /function confirmServiceAction\(/);
  assert.match(frontend, /function runBusy\(/);
});
```

- [ ] **Step 2: Run the UI contract test to verify it fails**

Run: `node --test test/web-regressions.test.js`

Expected: FAIL because the dashboard and unified detail functions are absent.

- [ ] **Step 3: Restructure primary navigation and dashboard markup**

Change the primary navigation to `工作台`, `运维总览`, `服务`, and `日志`; leave project, alerts, and plugin controls behind a `更多工具` menu. Keep `运维总览` as the first visit default.

Replace the existing overview body with counters, attention list, watched services, and recovery status:

```html
<div class="ops-summary" id="opsSummary"></div>
<section class="ops-section"><h2>待处理</h2><div id="attentionList"></div></section>
<section class="ops-section"><h2>关注服务</h2><div id="watchedList"></div></section>
<section class="ops-section"><h2>恢复保护</h2><div id="recoveryStatus"></div></section>
```

Use a responsive CSS grid for summary cards and service rows; at widths below `900px`, hide nonessential metrics and render service entries as stacked rows rather than requiring a horizontal table scroll.

- [ ] **Step 4: Add the unified service detail and confirmation modal**

Add a `serviceDetailModalBg` containing tabs for status/actions, logs, monitoring, and configuration. Add a separate confirmation modal that receives title, impact copy, and an optional exact service-name input. `delete` requires the exact name; stop/restart require an explicit confirmation click.

Implement `runBusy(button, action)` with `try/finally` so buttons are restored even after an API failure:

```js
async function runBusy(button, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "处理中…";
  try { return await action(); }
  finally { button.disabled = false; button.textContent = original; }
}
```

After every action, wait for `loadList()` and `loadHealth()`, then render the actual returned status in the open detail rather than displaying only a toast.

- [ ] **Step 5: Implement attention, watched services, logs, and health checks**

Render each attention item with status reason, restart count, last check, `查看日志`, `重启`, and `忽略本次` actions. The logs action populates the existing service filter and a useful error query before showing the logs module. The detail configuration tab provides a watched checkbox and an immediate health-check button with inline latest result. Preserve last successfully loaded `ALL` data if a refresh fails; show the error only in the affected module plus the global connection banner.

- [ ] **Step 6: Run client and regression validation**

Run:

```powershell
npm test -- --test-reporter=spec
node -e "const fs=require('fs');const html=fs.readFileSync('public/index.html','utf8');const js=html.match(/<script>([\s\S]*)<\/script>/)[1];new Function(js)"
```

Expected: all tests pass and the browser script compiles.

- [ ] **Step 7: Commit the daily operations interface**

```powershell
git add public/index.html test/web-regressions.test.js
git commit -m "feat: redesign console around daily operations"
```

### Task 6: Safe Process Discovery and Import Handoff

**Files:**
- Modify: `server.js`
- Modify: `public/index.html`
- Modify: `test/operations.test.js`

**Interfaces:**
- Changes `POST /api/discover/:pid/import` to return `{ ok, serviceId, serviceName, verification }` and never kill the original PID.
- Adds `POST /api/discover/:pid/handoff` accepting `{ serviceId }`, which only attempts to stop the original process when its PM2 replacement is confirmed online and healthy when a health URL exists.
- Produces `waitForPm2Online(id, timeoutMs)` in `server.js`.

- [ ] **Step 1: Write failing safe-handoff tests**

Add a unit test around an extracted `canCompleteHandoff(verification)` helper:

```js
assert.equal(canCompleteHandoff({ online: true, health: { ok: true } }), true);
assert.equal(canCompleteHandoff({ online: false, health: null }), false);
assert.equal(canCompleteHandoff({ online: true, health: { ok: false } }), false);
```

Run: `node --test test/operations.test.js`

Expected: FAIL because `canCompleteHandoff` is not exported.

- [ ] **Step 2: Implement online verification before handoff**

Add `waitForPm2Online` that polls `pm2.describe` every 500 ms until an `online` status or a 10-second timeout. The import route must call `pm2.start`, wait for its managed ID, persist the successful process snapshot, and return verification data. It must not call `killProcess`.

Create `canCompleteHandoff` in `lib/operations.js` and require an online replacement plus successful configured health check. In the handoff route, refuse with HTTP 409 and a diagnostic response if verification is incomplete. Only after verification returns true does the route call `killProcess(originalPid)` and return the outcome.

- [ ] **Step 3: Change discovery UI to the two-step flow**

Replace the current `拉入并停原` immediate-action label with `安全交接`. The import form gathers category, remark, page URL, health check, and watched status. After import, display verification outcome; only a verified replacement enables `确认关闭原进程`. If the replacement cannot coexist because the original owns its port, explain that the original remains running and offer log/diagnostic actions instead of force-killing it.

- [ ] **Step 4: Run focused and full checks**

Run: `node --test test/operations.test.js && npm test -- --test-reporter=spec && node --check server.js`

Expected: no code path stops an original PID before replacement verification, and all tests pass.

- [ ] **Step 5: Commit the safe handoff flow**

```powershell
git add lib/operations.js test/operations.test.js server.js public/index.html
git commit -m "feat: make process import a verified handoff"
```

### Task 7: Secondary Tools, Documentation, and End-to-End Validation

**Files:**
- Modify: `public/index.html`
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Modify: `docs/superpowers/specs/2026-09-25-local-operations-console-design.md`
- Modify: `test/web-regressions.test.js`

**Interfaces:**
- Keeps projects, alerts, plugins, and knowledge base reachable through the `更多工具` menu.
- Adds `POST /api/settings/test-alert` only when a webhook is configured and masks the configured endpoint in all UI responses.

- [ ] **Step 1: Write failing secondary-tool and documentation tests**

Add a source test that asserts `更多工具`, project access, alert test button, and plugin access all remain present. Use documentation checks that look for the phrases `恢复保护` and `工作台` in `README.md`.

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test test/web-regressions.test.js`

Expected: FAIL until the new navigation, alert test, and docs are added.

- [ ] **Step 3: Implement secondary navigation and alert test action**

Move the project card out of the primary navigation without changing its CRUD or deployment handlers. Add a `更多工具` dialog/menu with entries for project release, alert settings, and plugin management. Add a test-alert button that calls a dedicated endpoint; the endpoint sends the existing notification payload only when alerting and a webhook are configured, and returns a generic success/failure message without echoing the URL.

- [ ] **Step 4: Update user documentation**

Update `README.md` and `DEPLOY.md` to explain:

1. The first screen is operational overview and how attention items work.
2. Every successful managed-service change saves PM2’s snapshot; the recovery module reports the last success or failure.
3. Workbench entries are local indexes; account-password files remain unopened by the console and only their paths are stored.
4. Windows startup requires a configured PM2 resurrect mechanism in addition to `pm2 save`.

- [ ] **Step 5: Run full automated and runtime verification**

Run:

```powershell
npm test -- --test-reporter=spec
node --check server.js
node --check plugins/workbench/server.js
node -e "const fs=require('fs');const html=fs.readFileSync('public/index.html','utf8');new Function(html.match(/<script>([\s\S]*)<\/script>/)[1])"
git diff --check
```

Then restart `pm2-console` with the existing `PM2_HOME` and user `CONSOLE_TOKEN`, verify `/` returns 200, the unauthenticated `/api/status` returns 401, and authenticated `/api/status`, `/api/health`, `/api/recovery`, and `/api/workbench` return 200. Create a temporary workspace and a temporary account-file reference through the API; verify its returned item never contains file contents. Remove the temporary workspace after verification.

- [ ] **Step 6: Commit documentation and final integration**

```powershell
git add public/index.html README.md DEPLOY.md docs/superpowers/specs/2026-09-25-local-operations-console-design.md test/web-regressions.test.js server.js
git commit -m "docs: explain local operations workflow"
```

## Self-Review

- **Spec coverage:** Task 1 covers atomic metadata and PM2 snapshots; Tasks 4–6 cover operational attention, service recovery, monitoring, and safe process import; Tasks 2–3 cover the workspace-first workbench; Task 7 preserves and demotes secondary tools and documents recovery.
- **Placeholder scan:** The plan contains concrete route names, field names, tests, commands, and commit scopes for every task.
- **Type consistency:** Workbench uses `workspaceId`, `serviceName`, `target`, `watched`, `desiredState`, `ignoreUntil`, and `recovery.lastSnapshotAt/lastSnapshotError` consistently across backend, frontend, and tests.
- **Review focus:** Each listed high-risk input or failure condition is pinned to an owning task and a specific test or runtime verification step.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-25-local-operations-console.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — a fresh implementer and reviewer for each task; most thorough but higher cost.
- **Native** — I implement each task in this session and perform a full final review; faster and lower cost.

For this plan I recommend **Native**, because the tasks share `server.js`, `public/index.html`, and the same local PM2 process model; direct continuity reduces integration errors. Does the plan capture what you want, and which approach should we use?
