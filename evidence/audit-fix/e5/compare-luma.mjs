#!/usr/bin/env node
// Pair two decoded luma sets (decode-luma.mjs output) by target at the last shot and print a markdown table.
//   node evidence/audit-fix/e5/compare-luma.mjs <a.json> <b.json> [labelA] [labelB]
import { readFileSync } from "node:fs";
const [fa, fb, la = "A", lb = "B"] = process.argv.slice(2);
const last = (f) => { const m = new Map(); for (const r of JSON.parse(readFileSync(f, "utf8"))) m.set(r.target, r); return m; };
const A = last(fa), B = last(fb);
const names = [...new Set([...A.keys(), ...B.keys()])];
console.log(`| Target | ${la} mean | ${lb} mean | change | ${lb} clipped | ${lb} path |`);
console.log("| --- | ---: | ---: | ---: | ---: | --- |");
for (const n of names) {
  const a = A.get(n), b = B.get(n);
  const ch = a && b ? `${(((b.mean - a.mean) / a.mean) * 100).toFixed(1)}%` : "n/a";
  console.log(`| ${n} | ${a ? a.mean.toFixed(2) : "not reached"} | ${b ? b.mean.toFixed(2) : "not reached"} | ${ch} | ${b ? (b.clipFrac * 100).toFixed(2) + "%" : ""} | ${b?.info?.renderPath ?? ""} |`);
}
