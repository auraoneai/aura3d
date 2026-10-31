#!/usr/bin/env node
// Reassembles `@@FILE <path> i/n <base64>` lines (emitted by tests/browser/receipts-lib.ts) from an
// ACR run log into the repo, because ad-hoc `az acr run` has no artifact egress. Usage:
//   node tools/receipts/extract-from-acr-log.mjs <acr-run.log> --git-sha <sha>
// Only paths under evidence/receipts/ are written. `gitSha` inside receipt JSON is patched to --git-sha.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const logPath = args[0];
const shaIndex = args.indexOf("--git-sha");
const gitSha = shaIndex >= 0 ? args[shaIndex + 1] : undefined;
if (!logPath || !gitSha) {
  console.error("usage: extract-from-acr-log.mjs <acr-run.log> --git-sha <sha>");
  process.exit(2);
}

const files = new Map();
for (const line of readFileSync(logPath, "utf8").split(/\r?\n/)) {
  const at = line.indexOf("@@FILE ");
  if (at < 0) continue;
  const [, path, part, chunk] = line.slice(at).split(" ");
  if (!path || !part || chunk === undefined) continue;
  const [index, total] = part.split("/").map(Number);
  if (!path.startsWith("evidence/receipts/") || path.includes("..")) continue;
  const entry = files.get(path) ?? { total, parts: new Map() };
  // The json reporter repeats each stdout line JSON-escaped (trailing `\n",`): keep the first copy, base64 run only.
  const clean = /^[A-Za-z0-9+/=]*/.exec(chunk)[0];
  if (!entry.parts.has(index)) entry.parts.set(index, clean);
  files.set(path, entry);
}

let written = 0;
const incomplete = [];
for (const [path, { total, parts }] of files) {
  if (parts.size !== total) {
    incomplete.push(`${path} (${parts.size}/${total})`);
    continue;
  }
  let bytes = Buffer.from([...Array(total).keys()].map((i) => parts.get(i + 1)).join(""), "base64");
  if (path.endsWith(".json")) {
    const receipt = JSON.parse(bytes.toString("utf8"));
    receipt.gitSha = gitSha;
    bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  }
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  written += 1;
  console.log(`wrote ${path}`);
}
if (incomplete.length) {
  console.error(`incomplete files: ${incomplete.join(", ")}`);
  process.exit(1);
}
console.log(`${written} files written`);
