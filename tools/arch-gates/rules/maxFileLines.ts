// max-file-lines (PRD-15 §6.12, T3.9) — ≤ 2,500 lines per .ts in
// packages/*/src, with dated allowlist entries for the named hot files.
// T3.9 override: agent-api/index.ts must hold ≤ 300 lines EXCLUDING the
// pending Q-01-5 range, which is listed by line in this config.
// Fail mode applies to 15-owned files under packages/engine/src/agent-api/**.

import type { GateFinding } from "../index";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileAllowed, isExpired, loadAllowlist, ownerOf } from "./shared";

const CAP = 2500;
const AGENT_API = "packages/engine/src/agent-api";

interface FileOverride {
  readonly path: string;
  readonly max: number;
  /** [startLine, endLine] inclusive ranges excluded from the effective count. */
  readonly excludeRanges?: readonly (readonly [number, number])[];
  readonly reason: string;
}

const OVERRIDES: readonly FileOverride[] = [
  {
    path: `${AGENT_API}/index.ts`,
    max: 300,
    // Q-01-5 scenegraph range: lines 28–162 hold the pre-split declarations
    // (transformNormals … flattenSceneSnapshot) awaiting lane-01's
    // compiler/sceneGraph.ts. Listed by line per T3.9.
    excludeRanges: [[28, 162]],
    reason: "Q-01-5 pending scenegraph range"
  }
];

function effectiveLines(path: string, ov?: FileOverride): { total: number; effective: number } {
  const total = readFileSync(path, "utf8").split("\n").length;
  let effective = total;
  if (ov?.excludeRanges) {
    for (const [s, e] of ov.excludeRanges) effective -= Math.min(e, total) - s + 1;
  }
  return { total, effective };
}

export function checkMaxFileLines(root: string): GateFinding[] {
  const allowlist = loadAllowlist(root);
  const findings: GateFinding[] = [];
  const packagesDir = join(root, "packages");
  if (!existsSync(packagesDir)) return findings;
  const stack: string[] = [];
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    const src = join(packagesDir, pkg.name, "src");
    if (pkg.isDirectory() && !pkg.name.startsWith(".") && existsSync(src)) stack.push(src);
  }
  const overrides = new Map(OVERRIDES.map((o) => [o.path, o]));
  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith(".") && e.name !== "node_modules") stack.push(p); continue; }
      if (!e.name.endsWith(".ts") || e.name.endsWith(".d.ts")) continue;
      const rel = relative(root, p);
      const ov = overrides.get(rel);
      const cap = ov?.max ?? CAP;
      const { total, effective } = effectiveLines(p, ov);
      if (effective <= cap) continue;
      const entry = fileAllowed(allowlist, "max-file-lines", rel);
      const scope = `effective ${effective} lines (raw ${total}) > ${cap}`;
      const enforced = rel.startsWith(`${AGENT_API}/`) && ownerOf(root, rel) === "15";
      if (entry && !isExpired(entry)) {
        findings.push({ rule: "max-file-lines", file: rel, detail: `${scope} (allowlisted until ${entry.expires}: ${entry.reason})`, enforced: false });
      } else {
        findings.push({ rule: "max-file-lines", file: rel, detail: `${scope}${ov ? ` (excluding lines ${ov.excludeRanges?.map(([s, e2]) => `${s}-${e2}`).join(", ")} — ${ov.reason})` : ""}${entry ? " (ALLOWLIST EXPIRED)" : ""}`, enforced });
      }
    }
  }
  return findings;
}
