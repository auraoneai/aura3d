#!/usr/bin/env node
/* Print GL-call time and the V8 profile of the aura-auto arms of a wp7.json taken with WP7_NOMINIFY=1. Usage: node wp7-profile.mjs <wp7.json> [arm] */
import { readFileSync } from "node:fs";

const [file, only] = process.argv.slice(2);
const d = JSON.parse(readFileSync(file, "utf8"));
for (const k of Object.keys(d)) {
  if (!k.includes("aura-auto") || (only && !k.includes(only))) continue;
  const r = d[k];
  if (!r.glTime) continue;
  console.log(`\n## ${k} JS-only frame (no readPixels sync) = ${r.glTime.cpuMsPerFrame.toFixed(2)} ms`);
  const calls = Object.entries(r.glTime.byCall).sort((a, b) => b[1].msPerFrame - a[1].msPerFrame).slice(0, 14);
  console.log("GL time per frame:", calls.map(([n, v]) => `${n} ${v.calls.toFixed(0)}x ${v.msPerFrame.toFixed(2)}ms`).join(" | "));
  const p = r.profile;
  if (!p) continue;
  console.log(`profile total ${p.totalMs} ms busy ${p.busyMs} ms`);
  console.log("TOP SELF");
  for (const e of p.topSelf.slice(0, 16)) console.log(String(e.ms.toFixed(1)).padStart(9), e.fn);
  console.log("TOP INCLUSIVE");
  for (const e of p.topInclusive.slice(0, 40)) console.log(String(e.ms.toFixed(1)).padStart(9), e.fn);
}
