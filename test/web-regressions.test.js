const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const frontend = fs.readFileSync("public/index.html", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const desktopMain = fs.readFileSync("desktop/main.js", "utf8");

test("web rendering does not interpolate escaped values into inline handlers", () => {
  assert.doesNotMatch(frontend, /onclick="[^"]*esc\(/i);
});

test("log tail implementation does not read the entire log file", () => {
  assert.doesNotMatch(server, /fs\.readFileSync\(file, ["']utf8["']\)\.split/);
});

test("deployment endpoints return a task before the pipeline finishes", () => {
  assert.match(server, /runPipeline\(p, "deploy"\)/);
  assert.match(server, /runPipeline\(p, "rollback"\)/);
  assert.doesNotMatch(server, /const dep = await runPipeline\(p, "deploy"\)/);
  assert.doesNotMatch(server, /const dep = await runPipeline\(p, "rollback"\)/);
});

test("health probes cap response bodies", () => {
  assert.match(server, /MAX_PROBE_BODY_BYTES/);
  assert.match(server, /reader\.read\(\)/);
});

test("failed deployments persist their history", () => {
  assert.match(server, /finish\("fail", "异常"\);[\s\S]*saveProjects\(\);/);
});

test("desktop token resolver reads the registry without CommonJS require", () => {
  assert.match(desktopMain, /import \{[^}]*execFileSync[^}]*\} from "node:child_process";/);
  assert.doesNotMatch(desktopMain, /require\("node:child_process"\)/);
});

test("managed process changes save a PM2 recovery snapshot", () => {
  assert.match(server, /function dumpPm2\(\)/);
  assert.match(server, /async function persistManagedChange\(\)/);
  assert.match(server, /app\.get\("\/api\/recovery"/);
  assert.match(server, /app\.post\("\/api\/recovery\/save"/);
});

test("operations UI provides attention, recovery, and a safe service detail flow", () => {
  assert.match(frontend, /id="attentionList"/);
  assert.match(frontend, /id="recoveryStatus"/);
  assert.match(frontend, /id="serviceDetailModalBg"/);
  assert.match(frontend, /function confirmServiceAction\(/);
  assert.match(frontend, /function runBusy\(/);
});
