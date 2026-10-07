// Shared module-graph helpers for agent-api architecture rules (PRD-15
// §6.12). Scans packages/engine/src/agent-api/**.ts, keeps only VALUE edges
// (`import type`/`export type` statements and `{ type X }`-only clauses are
// type-only and do not count), resolves `./x.js` specifiers to `.ts` files.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

export interface ModuleEdge {
  readonly from: string; // repo-relative importer path
  readonly to: string;   // repo-relative resolved file path
  readonly spec: string; // raw specifier
}

const STMT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/gs;

/** Replace comments with spaces (same length, keeps indices stable). */
function stripComments(text: string): string {
  const out = text.split("");
  let i = 0;
  let inS: string | null = null; // ' " `
  while (i < out.length) {
    const ch = out[i];
    if (inS) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inS) inS = null;
      i++; continue;
    }
    if (ch === "/" && out[i + 1] === "/") {
      while (i < out.length && out[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (ch === "/" && out[i + 1] === "*") {
      out[i] = " "; out[i + 1] = " "; i += 2;
      while (i < out.length - 1 && !(out[i] === "*" && out[i + 1] === "/")) {
        if (out[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < out.length - 1) { out[i] = " "; out[i + 1] = " "; i += 2; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") inS = ch;
    i++;
  }
  return out.join("");
}

function isTypeOnlyStatement(stmt: string): boolean {
  const s = stmt.trim();
  if (s.startsWith("import type") || s.startsWith("export type")) return true;
  const m = /\{([\s\S]*)\}\s*from/.exec(s);
  if (!m) return false; // default/namespace/bare import → value
  const parts = m[1].split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => p.startsWith("type "));
}

export function agentApiFiles(root: string): string[] {
  const dir = join(root, "packages/engine/src/agent-api");
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith(".")) stack.push(p); continue; }
      if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(p);
    }
  }
  return out.sort();
}

/** All import/export specifiers in a file with their raw statements. */
export function specifierHits(file: string): { stmt: string; spec: string; valueEdge: boolean }[] {
  const text = stripComments(readFileSync(file, "utf8"));
  const hits: { stmt: string; spec: string; valueEdge: boolean }[] = [];
  for (const m of text.matchAll(STMT_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    let valueEdge = !isTypeOnlyStatement(m[0]);
    if (m[2] !== undefined) {
      // import("spec") — type positions look like `import("x").Type`,
      // `typeof import("x")`, `Partial<import("x")>`; runtime edges are
      // `await import("x")` or `import("x").then(...)`.
      const before = text.slice(Math.max(0, (m.index ?? 0) - 12), m.index);
      const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40);
      valueEdge = /\bawait\s*$/.test(before) || /^\s*\)\s*\.\s*(?:then|catch|finally)\b/.test(after);
    }
    hits.push({ stmt: m[0], spec, valueEdge });
  }
  return hits;
}

/** Resolve a relative specifier to an absolute .ts path inside `root`, or null. */
export function resolveSpecifier(fromFile: string, spec: string, root: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = normalize(join(dirname(fromFile), spec));
  const candidates = [
    base.replace(/\.js$/, ".ts"),
    `${base}.ts`,
    join(base.replace(/\.js$/, ""), "index.ts")
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return resolve(c);
    } catch { /* ignore */ }
  }
  return null;
}

/** Value-only edges among agent-api files (both ends inside agent-api/). */
export function agentApiGraph(root: string): ModuleEdge[] {
  const dir = resolve(root, "packages/engine/src/agent-api");
  const edges: ModuleEdge[] = [];
  for (const f of agentApiFiles(root)) {
    for (const h of specifierHits(f)) {
      if (!h.valueEdge) continue;
      const to = resolveSpecifier(f, h.spec, root);
      if (to && to.startsWith(dir)) {
        edges.push({ from: relative(root, f), to: relative(root, to), spec: h.spec });
      }
    }
  }
  return edges;
}
