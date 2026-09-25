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
