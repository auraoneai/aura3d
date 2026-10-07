/**
 * Codemod `prd09-evidence-globals` (PRD-09 §10 step 10): rewrites
 * `window.__FOO__ = expr` evidence writes into the pull-model channel
 * `game.evidence.legacyGlobals.set("__FOO__", expr)`.
 */
import type { AuraCodemod } from "../../../contracts/commands.js";

const GLOBAL_WRITE = /^(\s*)(?:window\s*\.\s*)?(__[A-Z][A-Z0-9_]+__)\s*=\s*(.+);?\s*$/;

export const evidenceGlobalsCodemod: AuraCodemod = {
  name: "prd09-evidence-globals",
  owner: "prd09",
  description: "Move `__FOO__` window globals onto `game.evidence.legacyGlobals` (PRD-09 step 10).",
  transform(source, fileName) {
    const rows: { file: string; line: number; construct: string; mapping: "exact" | "approximate" | "none"; target?: string }[] = [];
    const out = source.split("\n").map((line, i) => {
      const m = line.match(GLOBAL_WRITE);
      if (!m) return line;
      const [, indent, name, expr] = m;
      rows.push({ file: fileName, line: i + 1, construct: `${name} = ...`, mapping: "exact", target: `legacyGlobals.set("${name}", ...)` });
      return `${indent}game.evidence.legacyGlobals.set("${name}", ${expr.replace(/;+\s*$/, "")});`;
    });
    return { code: out.join("\n"), rows };
  }
};
