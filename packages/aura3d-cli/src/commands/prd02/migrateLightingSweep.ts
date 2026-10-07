/**
 * `migrate lighting` CLI command (PRD-02 Phase 7): runs
 * `migrateLightingCodemod` in report mode over a set of directories/globs and
 * writes per-tree JSON reports + a summary.
 *
 * The C-39 `registerCodemod` map has no dispatch in `cli.ts` (PRD-15 file),
 * so this lane command is the reachable surface for `aura3d migrate lighting`.
 *
 * Usage:
 *   aura3d migrate lighting [dir|glob...] [--report|--write] [--out <dir>]
 * Default targets (PRD-02 Phase 7 item): apps/showcase-*,
 * apps/aura-clash-showcase, templates/*, packages/create-aura3d/templates/*,
 * examples/*.
 */

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { globSync } from "node:fs";
import { migrateLightingCodemod } from "./migrateLighting.js";

type Row = { file: string; line: number; construct: string; mapping: "exact" | "approximate" | "none"; target?: string; note?: string };

const DEFAULT_TARGETS = [
  "apps/showcase-*",
  "apps/aura-clash-showcase",
  "templates/*",
  "packages/create-aura3d/templates/*",
  "examples/*"
];

function* tsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.name === "dist") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* tsFiles(p);
    else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) yield p;
  }
}

function resolveTargets(cwd: string, patterns: readonly string[]): string[] {
  const out = new Set<string>();
  for (const pat of patterns) {
    if (pat.includes("*")) {
      for (const p of globSync(pat, { cwd })) {
        try { if (statSync(join(cwd, p)).isDirectory()) out.add(p); } catch { /* race: gone */ }
      }
    } else if (existsSync(join(cwd, pat))) out.add(pat);
  }
  return [...out].sort();
}

export async function runMigrateLighting(
  argv: readonly string[],
  io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }
): Promise<number> {
  const outIdx = argv.indexOf("--out");
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : null;
  const write = argv.includes("--write");
  const patterns = argv.filter((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1));
  const roots = resolveTargets(io.cwd, patterns.length ? patterns : DEFAULT_TARGETS);
  if (roots.length === 0) { io.stderr("migrate lighting: no target directories matched"); return 1; }

  const all: { root: string; files: number; changed: number; rows: Row[] }[] = [];
  let totalRows = 0, totalChanged = 0;
  for (const root of roots) {
    const abs = join(io.cwd, root);
    if (!statSync(abs).isDirectory()) continue;
    const rows: Row[] = [];
    let files = 0, changed = 0;
    for (const file of tsFiles(abs)) {
      files += 1;
      const src = readFileSync(file, "utf8");
      const { code, rows: r } = migrateLightingCodemod.transform(src, relative(io.cwd, file));
      if (r.length) rows.push(...r);
      if (write && code !== src) { writeFileSync(file, code); changed += 1; }
    }
    totalRows += rows.length; totalChanged += changed;
    all.push({ root, files, changed, rows });
  }

  if (outDir) {
    const dest = join(io.cwd, outDir);
    mkdirSync(dest, { recursive: true });
    for (const r of all) {
      const name = basename(r.root).replace(/[^\w.-]/g, "_") + ".json";
      writeFileSync(join(dest, name), JSON.stringify(r, null, 2) + "\n");
    }
  }
  io.stdout(JSON.stringify({
    mode: write ? "write" : "report",
    roots: roots.length,
    files: all.reduce((n, r) => n + r.files, 0),
    changed: totalChanged,
    rows: totalRows,
    byRoot: all.map((r) => ({ root: r.root, files: r.files, changed: r.changed, rows: r.rows.length }))
  }, null, 2));
  return 0;
}
