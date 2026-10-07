/**
 * F-7a C-39 doctor rule `feel/evidence-only` — wraps the lane-08 source scan
 * (`agent-api/feel/lint/feelSourceScan.ts`) plus the capture-gate and
 * Math.random heuristics from the original rule. Registered from
 * `commands/prd08/index.ts`; hosted by `aura3d doctor --look` (PRD 13).
 */
import { scanFeelSource } from "../../../../engine/src/agent-api/feel/lint/feelSourceScan.js";

export const feelLintRule: {
  readonly code: string;
  readonly owner: string;
  check(file: { readonly path: string; readonly text: string }): readonly { readonly line: number; readonly severity: "error" | "warning"; readonly message: string }[];
} = {
  code: "feel/evidence-only",
  owner: "prd08",
  check(file: { readonly path: string; readonly text: string }) {
    const rows = [...scanFeelSource(file.text)];
    const src = file.text;
    const gated = /(capture|evidence|VISUAL_CAPTURE|screenshot|diagnostic)/i;
    let m: RegExpExecArray | null;
    const lineOf = (i: number) => src.slice(0, i).split("\n").length;
    const gateRe = /if\s*\(([^)]{0,160})\)\s*\{[^}]{0,900}?\b(shake|punch|fovKick|trauma|hitStop)\b/g;
    while ((m = gateRe.exec(src))) {
      if (!gated.test(m[1]!)) continue;
      rows.push({ line: lineOf(m.index), severity: "warning", message: "feel call gated behind a capture/evidence branch — feel must reach pixels every frame, not only during captures (PRD-08 §9.5)" });
    }
    if (/\b(shake|trauma|punch|juice)\b/.test(src)) {
      const rndRe = /Math\.random\(\)/g;
      while ((m = rndRe.exec(src))) {
        rows.push({ line: lineOf(m.index), severity: "error", message: "Math.random() in a file applying camera feel — use seeded feel/Noise (determinism, repo rule)" });
      }
    }
    return rows;
  }
} as const;
