#!/usr/bin/env node
// PRD-16 07 T0-34 — vfx attribution over the macos-14 all-flags arms.
// Compares two capture reports scene by scene: `$ALL` (every lane flag) and
// `$ALL,-vfx` (the same set without vfx). A scene is **vfx-attributed** when
// it is broken with vfx on (non-ready, aura3d drawCalls=0, or aura3d errors)
// and healthy with vfx removed. Failures present in both arms belong to
// another lane and are listed, not attributed. Writes vfx-attribution.json
// next to the arms and exits 1 when any scene is vfx-attributed, or when an
// arm produced no report (a missing arm proves nothing).
//
// Usage: node tests/qr/prd07/ci/vfx-attribution.mjs <all-dir> <all-minus-vfx-dir> [out.json]
import fs from "node:fs";
import path from "node:path";

const [, , allDir, minusDir, outArg] = process.argv;
if (!allDir || !minusDir) {
  console.error("::error::usage: vfx-attribution.mjs <all-dir> <all-minus-vfx-dir> [out.json]");
  process.exit(2);
}

/** scene → { broken: string | null } for the aura3d engine of one arm. */
function readArm(dir) {
  const reportPath = path.join(dir, "report.json");
  if (!fs.existsSync(reportPath)) return null;
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const out = new Map();
  for (const entry of report.scenes ?? []) {
    const res = entry.engines?.aura3d;
    if (!res) continue;
    const p = res.payload ?? {};
    let broken = null;
    if (res.status !== "ready") broken = `status=${res.status}${res.error ? ` (${String(res.error).slice(0, 160)})` : ""}`;
    else if ((p.drawCalls ?? 0) === 0) broken = "drawCalls=0";
    else if ((p.errors ?? []).length > 0) broken = `errors=${String(p.errors[0]).slice(0, 160)}`;
    out.set(entry.scene, { broken });
  }
  return out;
}

const all = readArm(allDir);
const minus = readArm(minusDir);
const problems = [];
if (!all) problems.push(`${allDir}: no report.json ($ALL arm)`);
if (!minus) problems.push(`${minusDir}: no report.json ($ALL,-vfx arm)`);

const rows = [];
if (all && minus) {
  for (const scene of new Set([...all.keys(), ...minus.keys()])) {
    const a = all.get(scene)?.broken ?? (all.has(scene) ? null : "missing");
    const m = minus.get(scene)?.broken ?? (minus.has(scene) ? null : "missing");
    const verdict = a && !m ? "vfx-attributed" : a && m ? "other-lane" : !a && m ? "vfx-masks-other" : "ok";
    rows.push({ scene, all: a, allMinusVfx: m, verdict });
  }
}

const attributed = rows.filter((r) => r.verdict === "vfx-attributed");
const summary = {
  generatedAt: new Date().toISOString(),
  arms: { all: allDir, allMinusVfx: minusDir },
  counts: Object.fromEntries(["ok", "vfx-attributed", "other-lane", "vfx-masks-other"].map((v) => [v, rows.filter((r) => r.verdict === v).length])),
  rows,
  problems
};
const outPath = outArg ?? path.join(path.dirname(path.resolve(allDir)), "vfx-attribution.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

for (const r of rows) console.log(`${r.verdict.padEnd(16)} ${r.scene}  $ALL: ${r.all ?? "ok"}  $ALL,-vfx: ${r.allMinusVfx ?? "ok"}`);
for (const p of problems) console.error(`::error::${p}`);
for (const r of attributed) console.error(`::error::vfx-attributed: ${r.scene} — $ALL ${r.all}; healthy without vfx`);
console.log(`vfx-attribution: ${JSON.stringify(summary.counts)} → ${outPath}`);
process.exit(problems.length > 0 || attributed.length > 0 ? 1 : 0);
