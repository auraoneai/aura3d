/**
 * C-39 codemod `prd11-batch-optout` (PRD-11 §12.3, Q-14-11 / #121). Report mode only.
 *
 * Static batching (`planBatches`) merges render items whose material is stable.
 * A node whose material is swapped (`setMaterial(`) or whose non-colour
 * material state is mutated at runtime (`material.roughness =`) breaks that
 * assumption: such nodes should opt out with `batch: false`. This codemod never
 * rewrites source — `transform` returns the input unchanged and one row per
 * mutation site, so lane 14 can review the list and add `batch: false` by hand.
 *
 * Runnable without the CLI codemod verb via
 * `node scripts/migrations/prd11-batch-optout.mjs [apps] [--json <out>] [--md <out>]`
 * (Node ≥22.18 type stripping, same pattern as tools/camera-cast-codemod).
 * Keep this module free of runtime imports other than `node:` built-ins.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { AuraCodemod } from "../../contracts/commands.js";

export type BatchOptoutKind = "setMaterial" | "material.roughness";

export interface BatchOptoutRow {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly mapping: "none";
  readonly target: "batch: false";
  readonly note: string;
  /** Mutation kind that triggered the row. */
  readonly kind: BatchOptoutKind;
  /** Receiver expression before `.setMaterial(` / `.material.roughness`, when one is present. */
  readonly node: string | null;
}

const SET_MATERIAL = /(?:([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]\n]*\]|\([^()\n]*\)|!)*)\??\.)?setMaterial\s*\(/g;
const ROUGHNESS = /(?:([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]\n]*\]|\([^()\n]*\)|!)*)\??\.)?material\??\.roughness\s*(?:[-+*/]?=)(?!=)/g;

const NOTE: Record<BatchOptoutKind, string> = {
  setMaterial: "runtime material swap: add `batch: false` to this node (PRD-11 §12.3)",
  "material.roughness": "runtime non-colour material mutation: add `batch: false` to this node (PRD-11 §12.3)"
};

/** Removes `//` line comments and the bodies of string literals so neither can match. */
function codeOnly(line: string, state: { inBlock: boolean }): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf("*/", i);
      if (end < 0) return out;
      state.inBlock = false;
      i = end + 2;
      continue;
    }
    const ch = line[i];
    if (ch === "/" && line[i + 1] === "*") { state.inBlock = true; i += 2; continue; }
    if (ch === "/" && line[i + 1] === "/") return out;
    if (ch === "\"" || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      out += ch + " ".repeat(Math.max(0, Math.min(j, line.length) - i - 1)) + (j < line.length ? ch : "");
      i = j + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** `function setMaterial(…) {`, a method `setMaterial(…): T {` or a signature `setMaterial(…): T;` — a definition, not a mutation site. */
function isDeclaration(before: string, from: string): boolean {
  const declarationPrefix = /(?:\bfunction\s*\*?\s*|^\s*(?:(?:public|private|protected|static|async|override)\s+)*)$/;
  // Body (`{`) or an interface / abstract signature (`: T;`).
  return declarationPrefix.test(before) && /^setMaterial\s*\([^)]*\)\s*(?:(?::[^={;]*)?\{|:[^={;]*;)/.test(from);
}

/** Scans one source file; rows are ordered by line then column. */
export function scanBatchOptout(source: string, fileName: string): BatchOptoutRow[] {
  const rows: BatchOptoutRow[] = [];
  const state = { inBlock: false };
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const code = codeOnly(lines[index], state);
    const hits: { col: number; kind: BatchOptoutKind; node: string | null }[] = [];
    for (const [pattern, kind] of [[SET_MATERIAL, "setMaterial"], [ROUGHNESS, "material.roughness"]] as const) {
      pattern.lastIndex = 0;
      for (let m = pattern.exec(code); m; m = pattern.exec(code)) {
        // `function setMaterial(` / `setMaterial(...) {` method declarations are not mutations.
        if (kind === "setMaterial" && !m[1] && isDeclaration(code.slice(0, m.index), code.slice(m.index))) continue;
        hits.push({ col: m.index, kind, node: m[1] ?? null });
      }
    }
    hits.sort((a, b) => a.col - b.col);
    for (const hit of hits) {
      rows.push({
        file: fileName,
        line: index + 1,
        construct: lines[index].trim(),
        mapping: "none",
        target: "batch: false",
        note: NOTE[hit.kind],
        kind: hit.kind,
        node: hit.node
      });
    }
  }
  return rows;
}

export const batchOptoutCodemod: AuraCodemod = {
  name: "prd11-batch-optout",
  owner: "prd11",
  description: "Report-only: list nodes with runtime setMaterial( / material.roughness = mutations that need `batch: false` (PRD-11 §12.3).",
  transform(source, fileName) {
    return { code: source, rows: scanBatchOptout(source, fileName) };
  }
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "out", "coverage", ".turbo", ".vite"]);

/** Recursively lists scannable source files under `root`, sorted for a stable report. */
export function listSourceFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(path);
      } else if (SOURCE_EXTENSIONS.has(extname(entry)) && !/\.d\.[cm]?ts$/.test(entry)) {
        files.push(path);
      }
    }
  };
  if (statSync(root).isDirectory()) walk(root);
  else files.push(root);
  return files;
}

export interface BatchOptoutReport {
  readonly schema: "prd11-batch-optout/1.0";
  readonly codemod: "prd11-batch-optout";
  readonly mode: "report";
  readonly roots: readonly string[];
  readonly filesScanned: number;
  readonly rows: readonly BatchOptoutRow[];
  readonly summary: { readonly sites: number; readonly files: number; readonly apps: Readonly<Record<string, number>> };
}

/** Scans `roots` (paths relative to `cwd`) and builds the report; file paths are cwd-relative with `/`. */
export function buildBatchOptoutReport(roots: readonly string[], cwd: string): BatchOptoutReport {
  const rows: BatchOptoutRow[] = [];
  let filesScanned = 0;
  for (const root of roots) {
    for (const file of listSourceFiles(join(cwd, root))) {
      filesScanned++;
      const name = relative(cwd, file).split(sep).join("/");
      rows.push(...scanBatchOptout(readFileSync(file, "utf8"), name));
    }
  }
  const apps: Record<string, number> = {};
  for (const row of rows) {
    const key = /^apps\/([^/]+)\//.exec(row.file)?.[1] ?? row.file.split("/")[0];
    apps[key] = (apps[key] ?? 0) + 1;
  }
  return {
    schema: "prd11-batch-optout/1.0",
    codemod: "prd11-batch-optout",
    mode: "report",
    roots: [...roots],
    filesScanned,
    rows,
    summary: { sites: rows.length, files: new Set(rows.map((row) => row.file)).size, apps }
  };
}
