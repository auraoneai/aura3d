#!/usr/bin/env node
/**
 * PRD-11 §12.3 migration report (Q-14-11 / #121): lists `apps/` nodes with
 * runtime `setMaterial(` / `material.roughness =` mutations that should opt
 * out of static batching with `batch: false`. Report mode only — never writes
 * source. Implementation: packages/aura3d-cli/src/commands/prd11/batchOptout.ts
 * (registered as C-39 codemod `prd11-batch-optout`); Node ≥22.18 runs it via
 * type stripping.
 *
 *   node scripts/migrations/prd11-batch-optout.mjs [root…] [--json <out.json>] [--md <out.md>]
 *
 * Default root: `apps`. Paths are relative to the current directory.
 * Exit 0 always on a completed scan (it is a report, not a gate); 2 on bad argv.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBatchOptoutReport } from "../../packages/aura3d-cli/src/commands/prd11/batchOptout.ts";

/** Renders the report as the markdown table attached to #121. */
export function reportMarkdown(report) {
  const lines = [
    "## prd11-batch-optout report (PRD-11 §12.3, report mode)",
    "",
    `Scanned ${report.filesScanned} files under ${report.roots.map((root) => `\`${root}/\``).join(", ")}: ` +
      `${report.summary.sites} mutation sites in ${report.summary.files} files.`,
    "Each row is a node that mutates its material at runtime; review and add `batch: false` where the mutation is not colour-only.",
    "",
    "| App | Sites |",
    "|---|---|",
    ...Object.entries(report.summary.apps).sort(([a], [b]) => a.localeCompare(b)).map(([app, n]) => `| ${app} | ${n} |`),
    "",
    "| File:line | Kind | Node | Construct |",
    "|---|---|---|---|",
    ...report.rows.map((row) =>
      `| \`${row.file}:${row.line}\` | ${row.kind} | ${row.node ? `\`${row.node}\`` : "—"} | \`${row.construct.replace(/\|/g, "\\|").replace(/`/g, "'").slice(0, 120)}\` |`)
  ];
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  const roots = [];
  let json;
  let md;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--json" || token === "--md") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        console.error(`[prd11-batch-optout] ${token} needs a path`);
        return 2;
      }
      if (token === "--json") json = value;
      else md = value;
    } else if (token.startsWith("--")) {
      console.error(`[prd11-batch-optout] unknown flag ${token}`);
      return 2;
    } else {
      roots.push(token);
    }
  }
  const report = buildBatchOptoutReport(roots.length ? roots : ["apps"], process.cwd());
  for (const [out, body] of [[json, `${JSON.stringify(report, null, 2)}\n`], [md, reportMarkdown(report)]]) {
    if (!out) continue;
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, body);
  }
  if (!json && !md) process.stdout.write(reportMarkdown(report));
  console.error(`[prd11-batch-optout] ${report.summary.sites} sites in ${report.summary.files} files (${report.filesScanned} scanned)`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
