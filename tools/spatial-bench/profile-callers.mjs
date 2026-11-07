#!/usr/bin/env node
// Who calls function X (and how much time under it, by call chain)?   node profile-callers.mjs <profile.cpuprofile.gz> <functionName> [depth=4]
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const [file, fn, depthArg] = process.argv.slice(2);
const depth = Number(depthArg ?? 4);
const p = JSON.parse(gunzipSync(readFileSync(file)).toString());
const nodes = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + (p.timeDeltas[i + 1] ?? 0));
const chains = new Map();
for (const [id, us] of self) {
  const chain = [];
  for (let c = id; c != null; c = parent.get(c)) chain.push(nodes.get(c).callFrame.functionName || "(anon)");
  const i = chain.indexOf(fn);
  if (i < 0) continue;
  const key = chain.slice(i, i + depth).join(" <- ");
  chains.set(key, (chains.get(key) ?? 0) + us);
}
for (const [k, v] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log((v / 1000).toFixed(0) + " ms  " + k);
