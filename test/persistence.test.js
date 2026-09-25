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
