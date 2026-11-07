#!/usr/bin/env node
// Side-by-side of the 2026-11-06 baseline (Aura3D legacy path, three.js) and a typed-path run directory.
//   node compare.mjs results/2026-11-06 results/2026-11-06-515 > results/2026-11-06-515/COMPARISON.md
// Measurement only: medians across repetitions, no thresholds, no claims. Different runs on a shared machine: compare the
// load-average column before reading small differences.
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [baseDir, newDir] = process.argv.slice(2).map((p) => resolve(here, p));
const base = JSON.parse(readFileSync(join(baseDir, "results.json"), "utf8")).configs;
const next = JSON.parse(readFileSync(join(newDir, "results.json"), "utf8")).configs;
const get = (rows, id) => rows.find((r) => r.id === id);
const f = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "n/a" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e4 ? (x / 1e3).toFixed(0) + "K" : x.toFixed(d));

const lines = [];
lines.push("# Typed path vs baseline (lane 515)", "");
lines.push(`Baseline: \`${baseDir.split("/results/")[1]}\` (Aura3D legacy path = \`geometry.dynamic\` + \`updateAttribute\` / \`points()\` with color strings; three.js r185). This run: \`${newDir.split("/results/")[1]}\` (Aura3D typed path only: \`points.stream\` + \`handle.write\`, typed \`points()\`). The two runs are on the same machine at different times with other agent lanes loading it; the load columns are the median 1-minute load average at run start.`, "");
lines.push("| config | metric | Aura3D legacy (baseline) | three.js (baseline) | Aura3D typed (this run) |", "|---|---|---|---|---|");
for (const row of next.filter((r) => r.id.endsWith("-typed"))) {
  const id = row.id.replace(/-typed$/, "");
  const old = get(base, id);
  const t = row.aura;
  if (!t) continue;
  const a = old?.aura, th = old?.three;
  const metrics = [
    ["frame p50 ms", "frameP50"], ["frame p95 ms", "frameP95"], ["effective fps", "effectiveFps"], ["dropped frames", "droppedFrames"],
    ["cpu ms/frame (mean)", "cpuFrameMean"], ["tick ms (mean)", "tickMean"], ["upload bytes/frame", "subBytesPerFrame"], ["bufferData bytes/frame", "dataBytesPerFrame"],
    ["gpu p50 ms", "gpuP50"], ["heap max MB", "heapMaxMB"], ["build ms", "buildMs"], ["load avg at start", "loadavg1Start"]
  ];
  for (const [label, key] of metrics) lines.push(`| ${id} | ${label} | ${f(a?.[key])} | ${f(th?.[key])} | ${f(t[key])} |`);
}
console.log(lines.join("\n"));
