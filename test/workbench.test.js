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

test("workbench server validates targets before opening them", () => {
  const source = fs.readFileSync("plugins/workbench/server.js", "utf8");
  assert.ok(source.indexOf("validateTarget") < source.indexOf("spawn("));
  assert.doesNotMatch(source, /readFileSync\(item\.target/);
  assert.doesNotMatch(source, /exec\(/);
});

test("workbench UI exposes workspace, favorites, search, and safe open states", () => {
  const card = fs.readFileSync("plugins/workbench/card.html", "utf8");
  const script = fs.readFileSync("plugins/workbench/workbench.js", "utf8");
  const server = fs.readFileSync("plugins/workbench/server.js", "utf8");
  assert.match(card, /id="wbSpaces"/);
  assert.match(card, /id="wbItems"/);
  assert.match(card, /id="wbDetail"/);
  assert.match(script, /function renderItems\(\)/);
  assert.match(script, /function openItem\(/);
  assert.match(script, /window\.workbenchPlugin/);
  assert.match(server, /items\/:id\/reveal/);
});
