#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const noAudit = process.argv.includes("--no-audit");
const artifactRoots = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (artifactRoots.length === 0) {
  throw new Error("Usage: node fixtures/external-engine-baselines/v4/ingest-external-baseline-artifacts.mjs [--dry-run] [--no-audit] <artifact-dir>...");
}

const allowedPrefixes = ["tests/reports/", "fixtures/external-engine-baselines/v4/"];
const reportFileNames = new Set([
  "v4-unity-editor-cli-smoke.json",
  "v4-unity-baseline-render.json",
  "v4-unity-product-visual-baseline.json",
  "v4-unity-pbr-visual-baseline.json",
  "v4-unity-shadow-visual-baseline.json",
  "v4-unity-hdr-render-target-baseline.json",
  "v4-unity-postprocess-suite-baseline.json",
  "v4-unity-asset-import-workflow.json",
  "v4-unity-asset-import-workflow.evidence.json",
  "v4-unreal-editor-cli-smoke.json",
  "v4-unreal-baseline-render.json",
  "v4-unreal-product-visual-baseline.json",
  "v4-unreal-pbr-visual-baseline.json",
  "v4-unreal-shadow-visual-baseline.json",
  "v4-unreal-hdr-render-target-baseline.json",
  "v4-unreal-postprocess-suite-baseline.json",
  "v4-unreal-asset-import-workflow.json",
  "v4-unreal-asset-import-workflow.evidence.json",
  "v4-unity-unreal-parity.json",
  "v4-external-evidence-readiness.json",
  "v4-external-evidence-missing-artifacts.md",
  "v4-completion-audit.json",
  "v4-completion-audit-runbook.md",
  "v4-product-visual-parity.json",
  "v4-pbr-gltf-readiness.json",
  "v4-production-readiness.json",
  "v4-broad-parity-readiness.json",
  "v4-report-freshness.json",
]);
const reportDirectories = [
  "v4-product-visual/",
  "v4-pbr-visual/",
  "v4-shadow-visual/",
  "v4-hdr-render-target/",
  "v4-postprocess-suite/",
];
const copied = [];
const skipped = [];
for (const artifactRoot of artifactRoots) {
  const absoluteArtifactRoot = resolve(root, artifactRoot);
  if (!existsSync(absoluteArtifactRoot)) {
    skipped.push({ artifactRoot, reason: "artifact directory missing" });
    continue;
  }
  for (const filePath of listFiles(absoluteArtifactRoot)) {
    const relativePath = normalizePath(relative(absoluteArtifactRoot, filePath));
    const targetRelativePath = targetPathForArtifact(relativePath);
    if (!targetRelativePath) {
      skipped.push({ artifactRoot, path: relativePath, reason: "outside allowed evidence prefixes" });
      continue;
    }
    const targetPath = join(root, targetRelativePath);
    copied.push({ artifactRoot, path: targetRelativePath, sourcePath: relativePath, targetPath });
    if (!dryRun) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(filePath, targetPath);
    }
  }
}

const auditCommands = [
  ["pnpm", ["audit:v4-external-evidence-readiness"]],
  ["pnpm", ["audit:v4-product-visual-parity"]],
  ["pnpm", ["audit:v4-pbr-gltf-readiness"]],
  ["pnpm", ["audit:v4-unity-unreal-parity"]],
  ["pnpm", ["audit:v4-production-readiness"]],
  ["pnpm", ["audit:v4-broad-parity"]],
  ["pnpm", ["audit:v4-completion"]],
  ["pnpm", ["verify:v4-report-freshness"]],
];
const auditResults = [];
if (!dryRun && !noAudit) {
  for (const [command, args] of auditCommands) {
    const child = spawnSync(command, args, { cwd: root, stdio: "pipe", encoding: "utf8" });
    auditResults.push({
      command: [command, ...args].join(" "),
      ok: child.status === 0,
      exitCode: child.status,
      stdout: child.stdout.trim(),
      stderr: child.stderr.trim(),
    });
  }
}

const result = {
  ok: skipped.every((entry) => entry.reason !== "artifact directory missing") && copied.length > 0,
  dryRun,
  noAudit,
  artifactRoots,
  copiedFiles: copied.length,
  skippedFiles: skipped.length,
  copied: copied.map(({ artifactRoot, path }) => ({ artifactRoot, path })),
  skipped,
  auditResults,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function listFiles(directory) {
  const entries = readdirSync(directory);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...listFiles(path));
    } else if (stats.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function normalizePath(path) {
  return path.split("\\").join("/");
}

function targetPathForArtifact(relativePath) {
  if (allowedPrefixes.some((prefix) => relativePath.startsWith(prefix))) return relativePath;
  if (reportFileNames.has(relativePath)) return "tests/reports/" + relativePath;
  for (const directory of reportDirectories) {
    if (relativePath.startsWith(directory)) return "tests/reports/" + relativePath;
  }
  return null;
}
