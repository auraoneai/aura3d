#!/usr/bin/env node
// Turn results/diagnosis/raw/*.result.json into the markdown tables embedded in DIAGNOSIS.md.   node diagnosis-tables.mjs [rawDir]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const raw = resolve(here, process.argv[2] ?? "results/diagnosis/raw");
const recs = new Map(readdirSync(raw).filter((f) => f.endsWith(".result.json")).map((f) => [f.replace(".result.json", ""), JSON.parse(readFileSync(join(raw, f), "utf8"))]));
const f1 = (x) => (x === undefined || x === null || Number.isNaN(x) ? "-" : x.toFixed(1));
const f2 = (x) => (x === undefined || x === null || Number.isNaN(x) ? "-" : x.toFixed(2));
let md = "";

md += "#### Per-phase JS ms (mean per applied tick / per frame)\n\n| run | load1 | fps | pack | updateAttribute(position) | updateAttribute(color) | tick total | render on tick frame | render on no-tick frame | gpu p50 | bufferSubData calls/frame | bufferData | createBuffer |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
for (const [tag, r] of recs) {
  const m = r.result?.measure;
  if (!m || !m.phases || tag.startsWith("ab.")) continue;
  const g = m.glCallsPerFrame ?? {};
  md += `| ${tag} | ${f1(r.loadavg[0])} | ${f1(m.effectiveFps)} | ${f2(m.phases.pack?.mean)} | ${f2(m.phases.updatePosition?.mean)} | ${f2(m.phases.updateColor?.mean)} | ${f2(m.cpuTick.mean)} | ${f1(m.cpuRenderTickFrames.mean)} | ${m.cpuRenderNoTickFrames.n ? f1(m.cpuRenderNoTickFrames.mean) : "-"} | ${f2(m.gpu.frameTime.p50)} | ${f2(g.bufferSubData)} | ${f2(g.bufferData ?? 0)} | ${f2(g.createBuffer ?? 0)} |\n`;
}

md += "\n#### A/B probes (patched copies under experiments/, bitmask `fix`)\n\n| run | fix | load1 | fps | frame p50 ms | tick ms | render on tick frame ms | cpu/frame mean | updatePosition | updateColor | speedup of (tick+render) vs fix0 |\n|---|---|---|---|---|---|---|---|---|---|---|\n";
const base = new Map();
for (const [tag, r] of recs) {
  const m = r.result?.measure;
  if (!m || !tag.startsWith("ab.") || tag.includes("profile")) continue;
  const cfg = tag.split(".")[1];
  const fix = Number(tag.match(/fix(\d+)/)[1]);
  const work = m.cpuTick.mean + m.cpuRenderTickFrames.mean;
  if (fix === 0) base.set(cfg, work);
  md += `| ${tag} | ${fix} | ${f1(r.loadavg[0])} | ${f1(m.effectiveFps)} | ${f1(m.frameTime.p50)} | ${f1(m.cpuTick.mean)} | ${f1(m.cpuRenderTickFrames.mean)} | ${f1(m.cpuPerFrame.mean)} | ${f2(m.phases?.updatePosition?.mean)} | ${f2(m.phases?.updateColor?.mean)} | ${base.has(cfg) ? (base.get(cfg) / work).toFixed(1) + "x" : "-"} |\n`;
}

// Ladder: cumulative fixes and leave-one-out at 100K, median over reps (ms of JS work per ticked frame = tick + render on tick frame).
const FIXNAMES = { 1: "F1 typed finite check", 2: "F2 skip eager query-geometry rebuild", 4: "F4 alloc-free bounds loop", 8: "F8 memoised snapshot bounds", 16: "F16 bounds from incoming array", 32: "F32 bulk typed write" };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const ladder = new Map();
for (const [tag, r] of recs) {
  const m = r.result?.measure;
  const mm = tag.match(/^ladder\.pts-100K\.fix(\d+)\.rep\d+$/);
  if (!m || !mm) continue;
  const fix = Number(mm[1]);
  const e = ladder.get(fix) ?? { work: [], tick: [], render: [], noTick: [], fps: [], load: [], pos: [], col: [] };
  e.work.push(m.cpuTick.mean + m.cpuRenderTickFrames.mean); e.tick.push(m.cpuTick.mean); e.render.push(m.cpuRenderTickFrames.mean);
  if (m.cpuRenderNoTickFrames.n) e.noTick.push(m.cpuRenderNoTickFrames.mean);
  e.fps.push(m.effectiveFps); e.load.push(r.loadavg[0]); if (m.phases?.updatePosition) { e.pos.push(m.phases.updatePosition.mean); e.col.push(m.phases.updateColor.mean); }
  ladder.set(fix, e);
}
if (ladder.size) {
  const base0 = med(ladder.get(0)?.work ?? []);
  const label = (fix) => fix === 0 ? "baseline (no fixes)" : fix === 63 ? "all six" : ([1, 3, 7, 15, 31].includes(fix) ? "cumulative up to " + Object.entries(FIXNAMES).filter(([k]) => (fix & Number(k))).map(([, v]) => v.split(" ")[0]).join("+") : "all six except " + Object.entries(FIXNAMES).filter(([k]) => !(fix & Number(k))).map(([, v]) => v)[0]);
  md += `\n#### Ladder at 100K points, 10 Hz sensor, 60 fps target (median of ${Math.max(...[...ladder.values()].map((e) => e.work.length))} reps; JS ms per ticked frame = tick + render)\n\n| fix mask | configuration | reps | load1 med | tick ms | render-on-tick ms | JS work per ticked frame ms | share of baseline removed | fps med |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const fix of [0, 1, 3, 7, 15, 31, 63, 62, 61, 59, 55, 47]) {
    const e = ladder.get(fix); if (!e) continue;
    const w = med(e.work);
    md += `| ${fix} | ${label(fix)} | ${e.work.length} | ${f1(med(e.load))} | ${f1(med(e.tick))} | ${f1(med(e.render))} | ${f1(w)} | ${fix === 0 ? "-" : (100 * (1 - w / base0)).toFixed(0) + "%"} | ${f1(med(e.fps))} |\n`;
  }
}

const floor = recs.get("floor")?.result?.floor;
if (floor) {
  const rows = Object.keys(Object.values(floor.sizes)[0]);
  md += `\n#### Floor / isolated costs (ms per operation, mean of ${floor.iter} iterations; ${floor.renderer})\n\n| operation | ${Object.keys(floor.sizes).join(" | ")} |\n|---|${Object.keys(floor.sizes).map(() => "---").join("|")}|\n`;
  for (const k of rows) md += `| ${k} | ${Object.values(floor.sizes).map((s) => f2(s[k])).join(" | ")} |\n`;
}
if (process.argv.includes("--out")) writeFileSync(process.argv[process.argv.indexOf("--out") + 1], md);
console.log(md);
