#!/usr/bin/env node
/* Print the per-pass structure and timing of a wp7.json. Usage: node wp7-summary.mjs <wp7.json> [arm-filter] */
import { readFileSync } from "node:fs";

const [file, filter] = process.argv.slice(2);
const data = JSON.parse(readFileSync(file, "utf8"));
for (const [arm, r] of Object.entries(data)) {
  if (filter && !arm.includes(filter)) continue;
  const { frame, programs, clears, blits } = r.structure;
  const draws = frame.filter((e) => e.k === "draw");
  console.log(`\n== ${arm}: draws=${draws.length} programs=${Object.keys(programs).length} clears=${clears} blits=${blits} cpu=${r.timing.cpuMsMedian.toFixed(2)}ms total=${r.timing.totalMsMedian.toFixed(1)}ms luma=${r.lumaMean.toFixed(1)}`);
  for (const [id, p] of Object.entries(programs)) console.log(`  program ${id} hash=${p.hash} lens=${p.lens} uniforms=${p.uniforms} defines=[${p.defines.join(",")}]`);
  let last = "";
  for (const e of frame) {
    if (e.k === "draw") {
      const key = `fb${e.fb} ${e.vp} prog${e.prog} dm${e.dm} cm${e.cm} z${e.depth} b${e.blend} c${e.cull}`;
      console.log(`  draw ${key} count=${e.count} inst=${e.inst} mode=${e.mode}${key === last ? "" : "  <-- state change"}`);
      last = key;
    } else console.log(`  ${e.k} fb${e.fb} ${e.vp} ${e.mask ?? ""}`);
  }
}
