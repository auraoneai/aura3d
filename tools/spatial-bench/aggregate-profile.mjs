#!/usr/bin/env node
// Flatten a V8 .cpuprofile(.gz) into top self-time / inclusive-time tables with source-map-resolved file:line.
//   node aggregate-profile.mjs <profile.cpuprofile.gz> --dist dist-prof [--top 30] [--md out.md]
// The bundle was built with SB_MINIFY=0 SB_SOURCEMAP=1 so function names survive; positionTicks give line-level self ticks.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { join, resolve, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const file = argv[0];
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const dist = resolve(here, opt("dist", "dist-prof"));
const top = Number(opt("top", 30));
const repo = resolve(here, "../..");

// source-map-js lives in the pnpm store (vite dependency)
const pnpm = join(repo, "node_modules/.pnpm");
const smDir = readdirSync(pnpm).find((d) => d.startsWith("source-map-js@"));
const { SourceMapConsumer } = createRequire(join(pnpm, smDir, "node_modules/x.js"))("source-map-js");

const raw = readFileSync(file);
const profile = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString());
const consumers = new Map();
const bundleLines = new Map();
function consumerFor(url) {
  const name = basename(new URL(url).pathname);
  if (consumers.has(name)) return consumers.get(name);
  const p = join(dist, "assets", name);
  let c = null;
  if (existsSync(p + ".map")) {
    c = new SourceMapConsumer(JSON.parse(readFileSync(p + ".map", "utf8")));
    bundleLines.set(name, readFileSync(p, "utf8").split("\n"));
  }
  consumers.set(name, c);
  return c;
}
function mapPos(url, line1, col0) {
  if (!url) return null;
  let c;
  try { c = consumerFor(url); } catch { return null; }
  if (!c) return null;
  const lines = bundleLines.get(basename(new URL(url).pathname));
  if (col0 == null) col0 = Math.max(0, (lines[line1 - 1] ?? "").search(/\S/));
  const o = c.originalPositionFor({ line: line1, column: col0 });
  if (!o.source) return null;
  const src = o.source.replace(/^(\.\.\/)+/, "").replace(/^.*?(packages\/|tools\/|node_modules\/)/, "$1");
  return `${src}:${o.line}`;
}

const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const samples = profile.samples, deltas = profile.timeDeltas;
const selfUs = new Map(); // node id -> us
for (let i = 0; i < samples.length; i++) selfUs.set(samples[i], (selfUs.get(samples[i]) ?? 0) + (deltas[i + 1] ?? deltas[i] ?? 0));
const totalUs = [...selfUs.values()].reduce((a, b) => a + b, 0);
const idleUs = [...selfUs].filter(([id]) => nodes.get(id).callFrame.functionName === "(idle)").reduce((a, [, v]) => a + v, 0);
const wallMs = (profile.endTime - profile.startTime) / 1000;

const fnKey = (cf) => `${cf.functionName || "(anonymous)"}@${cf.url ? basename(cf.url) : ""}:${cf.lineNumber + 1}:${cf.columnNumber}`;
const fns = new Map();
const get = (cf) => {
  const k = fnKey(cf);
  let f = fns.get(k);
  if (!f) { f = { name: cf.functionName || "(anonymous)", url: cf.url, line: cf.lineNumber + 1, col: cf.columnNumber, self: 0, incl: 0, src: null }; fns.set(k, f); }
  return f;
};
const lineSelf = new Map();
for (const [id, us] of selfUs) {
  const n = nodes.get(id);
  get(n.callFrame).self += us;
  // inclusive: each distinct function on the stack once
  const seen = new Set();
  for (let cur = id; cur != null; cur = parent.get(cur)) {
    const cf = nodes.get(cur).callFrame; const k = fnKey(cf);
    if (!seen.has(k)) { seen.add(k); get(cf).incl += us; }
  }
  if (n.positionTicks && n.callFrame.url) {
    const sum = n.positionTicks.reduce((a, t) => a + t.ticks, 0) || 1;
    for (const t of n.positionTicks) {
      const key = `${basename(n.callFrame.url)}:${t.line}|${n.callFrame.functionName}`;
      lineSelf.set(key, (lineSelf.get(key) ?? 0) + us * (t.ticks / sum));
    }
  }
}
for (const f of fns.values()) f.src = f.url ? mapPos(f.url, f.line, f.col) : null;
const ms = (us) => (us / 1000);
const busyMs = ms(totalUs - idleUs);
const rows = [...fns.values()].sort((a, b) => b.self - a.self).slice(0, top);
const inclRows = [...fns.values()].filter((f) => !/^\((root|program|idle|garbage collector)\)$/.test(f.name)).sort((a, b) => b.incl - a.incl).slice(0, top);
const lineRows = [...lineSelf.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, us]) => {
  const [loc, fn] = k.split("|"); const [bn, ln] = loc.split(":");
  const url = [...fns.values()].find((f) => f.url && basename(f.url) === bn)?.url;
  return { fn, us, src: url ? mapPos(url, Number(ln), null) : loc };
});

let md = `### ${basename(file)}\n\nwall ${wallMs.toFixed(0)} ms, sampled ${ms(totalUs).toFixed(0)} ms, idle ${ms(idleUs).toFixed(0)} ms, busy ${busyMs.toFixed(0)} ms (${(100 * busyMs / wallMs).toFixed(0)}% of wall), ${samples.length} samples\n\n`;
const pct = (us) => (100 * us / (totalUs - idleUs)).toFixed(1) + "%";
md += `Top self time (functions)\n\n| # | function | self ms | self % busy | incl ms | source |\n|---|---|---|---|---|---|\n`;
rows.forEach((f, i) => { md += `| ${i + 1} | \`${f.name}\` | ${ms(f.self).toFixed(0)} | ${pct(f.self)} | ${ms(f.incl).toFixed(0)} | ${f.src ?? (f.url ? basename(f.url) + ":" + f.line : "native")} |\n`; });
md += `\nTop inclusive time\n\n| # | function | incl ms | incl % busy | self ms | source |\n|---|---|---|---|---|---|\n`;
inclRows.forEach((f, i) => { md += `| ${i + 1} | \`${f.name}\` | ${ms(f.incl).toFixed(0)} | ${pct(f.incl)} | ${ms(f.self).toFixed(0)} | ${f.src ?? (f.url ? basename(f.url) + ":" + f.line : "native")} |\n`; });
md += `\nTop self-time lines (positionTicks)\n\n| # | line (source map) | in function | self ms |\n|---|---|---|---|\n`;
lineRows.forEach((r, i) => { md += `| ${i + 1} | ${r.src} | \`${r.fn}\` | ${ms(r.us).toFixed(0)} |\n`; });
const mdOut = opt("md", null);
if (mdOut) writeFileSync(mdOut, md);
console.log(md);
