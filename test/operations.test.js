const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { isAttentionRequired, shouldAlertHealth } = require("../lib/operations");
const server = fs.readFileSync("server.js", "utf8");

test("an intentionally stopped service is not an attention item", () => {
  assert.equal(isAttentionRequired({ status: "stopped", desiredState: "stopped" }), false);
});

test("errored and unexpectedly stopped services require attention", () => {
  assert.equal(isAttentionRequired({ status: "errored", desiredState: "running" }), true);
  assert.equal(isAttentionRequired({ status: "stopped", desiredState: "running" }), true);
});

test("a failed health check requires attention unless the user temporarily ignores it", () => {
  assert.equal(isAttentionRequired({ status: "online", desiredState: "running", health: { ok: false } }), true);
  assert.equal(isAttentionRequired({ status: "online", desiredState: "running", health: { ok: false }, ignoreUntil: new Date(Date.now() + 60000).toISOString() }), false);
});

test("a newly failed health check is alertable exactly once", () => {
  assert.equal(shouldAlertHealth(undefined, { ok: false }), true);
  assert.equal(shouldAlertHealth({ ok: false }, { ok: false }), false);
  assert.equal(shouldAlertHealth({ ok: true }, { ok: false }), true);
});

test("operations API exposes attention and immediate health diagnostics", () => {
  assert.match(server, /app\.post\("\/api\/processes\/:id\/attention"/);
  assert.match(server, /app\.post\("\/api\/processes\/:id\/health-check"/);
  assert.match(server, /error: r\.err \|\| \(!r\.ok/);
  assert.match(server, /services, attention/);
});
