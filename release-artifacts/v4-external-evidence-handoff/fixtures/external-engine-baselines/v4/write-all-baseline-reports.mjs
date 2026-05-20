#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const kitRoot = dirname(fileURLToPath(import.meta.url));
const writerPath = join(kitRoot, "write-baseline-report.mjs");
const args = new Set(process.argv.slice(2));
const engineArg = valueAfter("--engine") || "all";
const dryRun = args.has("--dry-run");
const allowMissing = args.has("--allow-missing") || dryRun;
if (!["unity", "unreal", "all"].includes(engineArg)) {
  throw new Error("--engine must be unity, unreal, or all.");
}

const slots = [
  {
    "engine": "unity",
    "baselineKind": "product-visual",
    "screenshotPath": "tests/reports/v4-product-visual/unity-product-visual-baseline.png",
    "targetReportPath": "tests/reports/v4-unity-product-visual-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "product-visual",
    "screenshotPath": "tests/reports/v4-product-visual/unreal-product-visual-baseline.png",
    "targetReportPath": "tests/reports/v4-unreal-product-visual-baseline.json"
  },
  {
    "engine": "unity",
    "baselineKind": "pbr-visual",
    "screenshotPath": "tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png",
    "targetReportPath": "tests/reports/v4-unity-pbr-visual-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "pbr-visual",
    "screenshotPath": "tests/reports/v4-pbr-visual/unreal-pbr-visual-baseline.png",
    "targetReportPath": "tests/reports/v4-unreal-pbr-visual-baseline.json"
  },
  {
    "engine": "unity",
    "baselineKind": "shadow-visual",
    "screenshotPath": "tests/reports/v4-shadow-visual/unity-shadow-visual-baseline.png",
    "targetReportPath": "tests/reports/v4-unity-shadow-visual-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "shadow-visual",
    "screenshotPath": "tests/reports/v4-shadow-visual/unreal-shadow-visual-baseline.png",
    "targetReportPath": "tests/reports/v4-unreal-shadow-visual-baseline.json"
  },
  {
    "engine": "unity",
    "baselineKind": "hdr-render-target",
    "screenshotPath": "tests/reports/v4-hdr-render-target/unity-hdr-render-target-baseline.png",
    "targetReportPath": "tests/reports/v4-unity-hdr-render-target-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "hdr-render-target",
    "screenshotPath": "tests/reports/v4-hdr-render-target/unreal-hdr-render-target-baseline.png",
    "targetReportPath": "tests/reports/v4-unreal-hdr-render-target-baseline.json"
  },
  {
    "engine": "unity",
    "baselineKind": "postprocess-suite",
    "screenshotPath": "tests/reports/v4-postprocess-suite/unity-postprocess-suite-baseline.png",
    "targetReportPath": "tests/reports/v4-unity-postprocess-suite-baseline.json"
  },
  {
    "engine": "unreal",
    "baselineKind": "postprocess-suite",
    "screenshotPath": "tests/reports/v4-postprocess-suite/unreal-postprocess-suite-baseline.png",
    "targetReportPath": "tests/reports/v4-unreal-postprocess-suite-baseline.json"
  }
];
const selected = slots.filter((slot) => engineArg === "all" || slot.engine === engineArg);
const results = [];
for (const slot of selected) {
  const screenshotFullPath = join(root, slot.screenshotPath);
  const command = [
    process.execPath,
    writerPath,
    slot.engine,
    slot.baselineKind,
    slot.screenshotPath,
    slot.targetReportPath,
  ];
  if (!existsSync(screenshotFullPath)) {
    results.push({
      ...slot,
      ok: false,
      skipped: true,
      reason: "missing screenshot",
      command: command.map(shellQuote).join(" "),
    });
    if (!allowMissing) continue;
    continue;
  }
  if (dryRun) {
    results.push({ ...slot, ok: true, dryRun: true, command: command.map(shellQuote).join(" ") });
    continue;
  }
  const child = spawnSync(command[0], command.slice(1), {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
  results.push({
    ...slot,
    ok: child.status === 0,
    command: command.map(shellQuote).join(" "),
    stdout: child.stdout.trim(),
    stderr: child.stderr.trim(),
    exitCode: child.status,
  });
}

const missing = results.filter((result) => result.skipped);
const failed = results.filter((result) => result.ok !== true && !result.skipped);
const ok = failed.length === 0 && (allowMissing || missing.length === 0);
console.log(JSON.stringify({
  ok,
  dryRun,
  engine: engineArg,
  selectedSlots: selected.length,
  writtenReports: results.filter((result) => result.ok === true && !result.dryRun).length,
  missingScreenshots: missing.length,
  failedReports: failed.length,
  results,
}, null, 2));
if (!ok) process.exitCode = 1;

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function shellQuote(value) {
  return /[^A-Za-z0-9_/:=.,+-]/.test(value) ? JSON.stringify(value) : value;
}
