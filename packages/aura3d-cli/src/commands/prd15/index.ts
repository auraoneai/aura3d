/**
 * C-39 lane command registrations — PRD 15.
 *
 * Registers the `aura3d codemod <name> <glob> [--write|--dry-run|--report]`
 * dispatcher and this lane's codemods (`renderer-imports`, T2.11).
 */

import { globSync } from "node:fs";
import { readFileSync, writeFileSync } from "node:fs";
import { registerCliCommand, registerCodemod, codemodFor } from "../../contracts/commands.js";
import { createRendererImportsCodemod } from "../../codemods/renderer-imports.js";
import { createRendererModeCodemod } from "../../codemods/renderer-mode.js";
import { createLeanImportsCodemod } from "../../codemods/lean-imports.js";
import { createDevtoolsImportsCodemod, createEngineEntryImportsCodemod } from "../../codemods/engine-entry-imports.js";

registerCodemod(createRendererImportsCodemod());
registerCodemod(createRendererModeCodemod());
registerCodemod(createLeanImportsCodemod());
registerCodemod(createDevtoolsImportsCodemod());
registerCodemod(createEngineEntryImportsCodemod());

/**
 * Minimal unified-style diff for `--dry-run`: context-free -/+ lines around
 * changed runs (3 unchanged context lines collapses into `…` markers).
 * PRD-03's `post-v2` is the first `--dry-run` consumer.
 */
function unifiedDiff(file: string, before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  // LCS over lines — files here are small mains, O(n·m) is fine.
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const lines: string[] = [`--- ${file}`, `+++ ${file} (post-v2)`];
  let i = 0, j = 0, skipped = 0;
  const flushSkip = () => { if (skipped > 0) { lines.push(`… ${skipped} unchanged`); skipped = 0; } };
  while (i < n && j < m) {
    if (a[i] === b[j]) { skipped++; i++; j++; continue; }
    flushSkip();
    if (dp[i + 1][j] >= dp[i][j + 1]) { lines.push(`- ${a[i]}`); i++; }
    else { lines.push(`+ ${b[j]}`); j++; }
  }
  while (i < n) { flushSkip(); lines.push(`- ${a[i]}`); i++; }
  while (j < m) { flushSkip(); lines.push(`+ ${b[j]}`); j++; }
  flushSkip();
  return lines.join("\n");
}

registerCliCommand({
  name: "codemod",
  owner: "prd15",
  summary: "Run a registered codemod over a file glob (renderer-imports, …).",
  usage: "aura3d codemod <name> <glob> [--write] [--dry-run] [--report]",
  async run(argv, io) {
    const name = argv[0];
    const glob = argv[1];
    if (!name || !glob) {
      io.stderr("usage: aura3d codemod <name> <glob> [--write] [--dry-run] [--report]");
      return 2;
    }
    const mod = codemodFor(name);
    if (!mod) {
      io.stderr(`unknown codemod: ${name}`);
      return 2;
    }
    const write = argv.includes("--write");
    const report = argv.includes("--report");
    const dryRun = argv.includes("--dry-run");
    const files = globSync(glob, { cwd: io.cwd, exclude: (p) => p.includes("node_modules") }).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".html"));
    const allRows: unknown[] = [];
    const reports: unknown[] = [];
    const diffs: { file: string; diff: string }[] = [];
    let changed = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const result = mod.transform(source, file) as { code: string; rows: unknown[]; report?: unknown };
      allRows.push(...result.rows);
      if (result.report !== undefined) reports.push({ file, report: result.report });
      if (result.code !== source) {
        changed++;
        if (dryRun) diffs.push({ file, diff: unifiedDiff(file, source, result.code) });
        if (write) writeFileSync(file, result.code);
      }
    }
    io.stdout(JSON.stringify({
      codemod: name, files: files.length, changed, written: write ? changed : 0,
      rows: report || dryRun ? allRows : allRows.filter((r) => (r as { mapping?: string }).mapping !== "exact"),
      ...(reports.length ? { reports } : {}),
      ...(dryRun ? { diffs } : {})
    }, null, 2));
    return 0;
  }
});

import { globSync as globSyncMigrate } from "node:fs";
import { readFileSync as readMigrateFile, writeFileSync as writeMigrateFile } from "node:fs";
import { emitMigratedSource } from "../../migrate-three/emit.js";
import { buildMigrateReport, formatMigrateReport } from "../../migrate-three/report.js";

registerCliCommand({
  name: "migrate three",
  owner: "prd15",
  summary: "Rewrite Three.js source to @aura3d/engine constructs via the T6.1 mapping table.",
  usage: "aura3d migrate three <glob> [--write] [--report]",
  async run(argv, io) {
    const glob = argv[0];
    if (!glob) {
      io.stderr("usage: aura3d migrate three <glob> [--write] [--report]");
      return 2;
    }
    const write = argv.includes("--write");
    const files = globSyncMigrate(glob, { cwd: io.cwd, exclude: (p) => p.includes("node_modules") }).filter((f) => f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".tsx") || f.endsWith(".jsx"));
    const allRows: import("../../migrate-three/emit.js").MigrateRow[] = [];
    let changed = 0;
    for (const file of files) {
      const source = readMigrateFile(file, "utf8");
      const { code, rows } = emitMigratedSource(source);
      allRows.push(...rows.map((r) => ({ ...r })));
      if (code !== source) {
        changed++;
        if (write) writeMigrateFile(file, code);
      }
    }
    const report = buildMigrateReport(allRows);
    io.stdout(formatMigrateReport(report));
    io.stderr(`migrate-three: ${files.length} files, ${changed} changed, ${report.counts.approximate} approximate, ${report.counts.none} unmapped`);
    return 0;
  }
});
