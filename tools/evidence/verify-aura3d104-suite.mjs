#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();

const requiredReports = [
  "tests/reports/aura3d104/typecheck.json",
  "tests/reports/aura3d104/build.json",
  "tests/reports/aura3d104/dist-agent-api-types.json",
  "tests/reports/game-runtime/unit.json",
  "tests/reports/game-runtime/browser.json",
  "tests/reports/game-runtime/template.json",
  "tests/reports/game-runtime/docs.json",
  "tests/reports/game-runtime/game-runtime-evidence.json",
  "tests/reports/game-runtime/package-smoke.json",
  "tests/reports/game-runtime/release.json",
  "tests/reports/prompt-animation/unit.json",
  "tests/reports/prompt-animation/browser.json",
  "tests/reports/prompt-animation/template.json",
  "tests/reports/prompt-animation/docs.json",
  "tests/reports/prompt-animation/auravoice-contract-proof.json",
  "tests/reports/prompt-animation/auravoice-sample-render-gates.json",
  "tests/reports/prompt-animation/auravoice-sample-render-package-gates.json",
  "tests/reports/prompt-animation/validate-cartoon.json",
  "tests/reports/prompt-animation/viseme-sync-proof.json",
  "tests/reports/prompt-animation/dub-sync-proof.json",
  "tests/reports/prompt-animation/prompt-animation-evidence.json",
  "tests/reports/prompt-animation/package-smoke.json",
  "tests/reports/prompt-animation/release.json"
];

const requiredLogs = [
  "tests/reports/game-runtime/typecheck.log",
  "tests/reports/game-runtime/unit.log",
  "tests/reports/game-runtime/browser.log",
  "tests/reports/game-runtime/template.log",
  "tests/reports/game-runtime/docs.log",
  "tests/reports/game-runtime/evidence.log",
  "tests/reports/game-runtime/package.log",
  "tests/reports/game-runtime/release.log",
  "tests/reports/game-runtime/build.log",
  "tests/reports/prompt-animation/unit.log",
  "tests/reports/prompt-animation/browser.log",
  "tests/reports/prompt-animation/template.log",
  "tests/reports/prompt-animation/docs.log",
  "tests/reports/prompt-animation/auravoice-contract.log",
  "tests/reports/prompt-animation/auravoice-render.log",
  "tests/reports/prompt-animation/validate-cartoon.log",
  "tests/reports/prompt-animation/viseme-sync.log",
  "tests/reports/prompt-animation/dub-sync.log",
  "tests/reports/prompt-animation/evidence.log",
  "tests/reports/prompt-animation/package.log",
  "tests/reports/prompt-animation/release.log"
];

const reports = requiredReports.map((relativePath) => inspectReport(relativePath));
const missing = reports.filter((report) => !report.exists);
const failing = reports.filter((report) => report.exists && !report.ok);
const logs = requiredLogs.map((relativePath) => inspectLog(relativePath));
const missingLogs = logs.filter((log) => !log.exists || log.sizeBytes === 0);

const result = {
  ok: missing.length === 0 && failing.length === 0 && missingLogs.length === 0,
  generatedAt: new Date().toISOString(),
  requiredReports,
  requiredLogs,
  reports,
  logs,
  missing: missing.map((report) => report.relativePath),
  failing: failing.map((report) => report.relativePath),
  missingLogs: missingLogs.map((log) => log.relativePath)
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

function inspectReport(relativePath) {
  const path = resolve(repoRoot, relativePath);
  const report = {
    relativePath,
    path,
    exists: existsSync(path),
    ok: false,
    sizeBytes: 0
  };

  if (!report.exists) {
    return report;
  }

  const text = readFileSync(path, "utf8");
  report.sizeBytes = Buffer.byteLength(text);

  try {
    const json = JSON.parse(text);
    report.ok = json?.ok === true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  return report;
}

function inspectLog(relativePath) {
  const path = resolve(repoRoot, relativePath);
  const report = {
    relativePath,
    path,
    exists: existsSync(path),
    sizeBytes: 0
  };

  if (!report.exists) {
    return report;
  }

  const text = readFileSync(path, "utf8");
  report.sizeBytes = Buffer.byteLength(text);
  return report;
}
