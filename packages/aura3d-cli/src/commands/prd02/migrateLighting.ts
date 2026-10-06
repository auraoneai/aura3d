/**
 * `migrate lighting` codemod (C-39 consumer for lane 02, PRD-02 §6.3).
 * Pure `source → code + rows` transform over scene files using the
 * `lights.*` builders:
 *  - `lights.point({ intensity })` / `lights.spot({ intensity })` in legacy
 *    mode → row noting the unit change (legacy: half-lambert scale;
 *    physical: candela). Mapping "approximate" — the codemod moves the
 *    value to `power` in lumens (cd = lm/4π point, lm/π spot) which is
 *    close but not exact for non-uniform emitters.
 *  - `lights.ambient({ intensity })` > 1 with an `environments.*` node →
 *    row "none" pointing at the `look/ambient-flattens` lint instead.
 * Exact rows: `distance`/`decay` additions (physical defaults are
 *    already distance=0/decay=2, so an explicit row is informational).
 */
import type { AuraCodemod } from "../../contracts/commands.js";

const LIGHT_CALL = /lights\.(point|spot|rect|directional|ambient|hemisphere|studio|softbox)\s*\(/g;

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

function extractInt(source: string, from: number, key: string): number | undefined {
  const slice = source.slice(from, from + 400);
  const m = new RegExp(`\\b${key}\\s*:\\s*(-?[0-9.]+)`).exec(slice);
  return m ? Number(m[1]) : undefined;
}

export const migrateLightingCodemod: AuraCodemod = {
  name: "migrate lighting",
  owner: "prd02",
  description: "Adopt PRD-02 physical light units: point/spot intensity → power (lumens), notes ambient>1 + environment conflicts.",
  transform(source, fileName) {
    const rows: { file: string; line: number; construct: string; mapping: "exact" | "approximate" | "none"; target?: string; note?: string }[] = [];
    let code = source;
    let cursor = 0;
    LIGHT_CALL.lastIndex = 0;
    let m: RegExpExecArray | null;
    const edits: { start: number; end: number; text: string }[] = [];
    while ((m = LIGHT_CALL.exec(source)) !== null) {
      const kind = m[1]!;
      const line = lineOf(source, m.index);
      const intensity = extractInt(source, m.index, "intensity");
      const hasEnvironment = /environments?\./.test(source) || /kind:\s*["']environment["']/.test(source);
      if ((kind === "point" || kind === "spot") && intensity !== undefined) {
        // Suggest power = intensity·(4π|π) as an approximate physical move.
        const factor = kind === "point" ? 4 * Math.PI : Math.PI;
        const power = Math.round(intensity * factor);
        rows.push({
          file: fileName, line,
          construct: `lights.${kind}({ intensity: ${intensity} })`,
          mapping: "approximate",
          target: `lights.${kind}({ power: ${power} })`,
          note: `physical units: cd=${kind === "point" ? "lm/4π" : "lm/π"}; verify against a render`
        });
        // Replace `intensity: N` with `power: round(N × factor)` (approximate).
        const callSlice = source.slice(m.index, m.index + 400);
        const intMatch = /intensity\s*:\s*(-?[0-9.]+)/.exec(callSlice);
        if (intMatch) {
          const absStart = m.index + intMatch.index;
          edits.push({ start: absStart, end: absStart + intMatch[0].length, text: `power: ${power}` });
        }
      }
      if (kind === "ambient" && intensity !== undefined && intensity > 1 && hasEnvironment) {
        rows.push({
          file: fileName, line,
          construct: `lights.ambient({ intensity: ${intensity} })`,
          mapping: "none",
          note: "ambient intensity > 1 flattens IBL (look/ambient-flattens); remove or drop below 1"
        });
      }
      if ((kind === "point" || kind === "spot") && extractInt(source, m.index, "decay") === undefined) {
        rows.push({
          file: fileName, line,
          construct: `lights.${kind}(…)`,
          mapping: "exact",
          note: "decay defaults to 2 (physical inverse-square); distance defaults to 0 (infinite)"
        });
      }
      cursor = m.index;
    }
    void cursor;
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);
    return { code, rows };
  }
};
