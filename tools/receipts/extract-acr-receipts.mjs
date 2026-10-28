#!/usr/bin/env node
// Writes pixel receipts from a tools/remote-acr/run.sh log.
//
// Remote ACR runs cannot egress files, so the receipt specs
// (tests/browser/*-receipts.spec.ts) print each receipt and its PNG frames to stdout
// between RECEIPT_JSON:: / RECEIPT_FRAME:: markers. This script reads
// tests/reports/remote-acr/<RUN_ID>/acr-run.log (or any log path) and writes
// evidence/receipts/<capability>/<version>.json plus frames/<version>-<name>.png,
// verifying each PNG hash against the receipt before writing.
//
// Usage: node tools/receipts/extract-acr-receipts.mjs <acr-run.log> [--git-sha <sha>]
// The run image has no git, so receipts arrive with gitSha "unknown-remote"; pass the
// commit the run was built from (default: HEAD of this checkout).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RECEIPT_MARKER = "RECEIPT_JSON::";
const FRAME_MARKER = "RECEIPT_FRAME::";

const args = process.argv.slice(2);
const logPath = args.find((arg) => !arg.startsWith("--"));
if (!logPath) {
  console.error("usage: extract-acr-receipts.mjs <acr-run.log> [--git-sha <sha>]");
  process.exit(2);
}
const shaFlag = args.indexOf("--git-sha");
const gitSha = shaFlag >= 0
  ? args[shaFlag + 1]
  : execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

const receipts = [];
const pngs = new Map();
for (const line of readFileSync(logPath, "utf8").split(/\r?\n/)) {
  const frameAt = line.indexOf(FRAME_MARKER);
  if (frameAt >= 0) {
    const rest = line.slice(frameAt + FRAME_MARKER.length);
    const split = rest.indexOf("::");
    if (split > 0) pngs.set(rest.slice(0, split), Buffer.from(rest.slice(split + 2).trim(), "base64"));
    continue;
  }
  const receiptAt = line.indexOf(RECEIPT_MARKER);
  if (receiptAt >= 0) receipts.push(JSON.parse(line.slice(receiptAt + RECEIPT_MARKER.length)));
}

if (receipts.length === 0) {
  console.error(`no ${RECEIPT_MARKER} lines in ${logPath}`);
  process.exit(1);
}

let failed = false;
for (const receipt of receipts) {
  for (const frame of receipt.frames) {
    const bytes = pngs.get(frame.file);
    if (!bytes) {
      console.error(`FAIL ${receipt.capability}: frame ${frame.file} is not in the log`);
      failed = true;
      continue;
    }
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== frame.sha256) {
      console.error(`FAIL ${receipt.capability}: ${frame.file} sha256 ${actual} != receipt ${frame.sha256}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);

for (const receipt of receipts) {
  receipt.gitSha = gitSha;
  for (const frame of receipt.frames) {
    const target = join(ROOT, frame.file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, pngs.get(frame.file));
  }
  const target = join(ROOT, "evidence", "receipts", receipt.capability, `${receipt.version}.json`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`wrote ${target.replace(`${ROOT}/`, "")} (${receipt.frames.length} frames)`);
}
