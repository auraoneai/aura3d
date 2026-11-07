#!/usr/bin/env node
// Summarise a Chrome trace (JSON event array, .gz ok): per-thread busy time and top event names by self-ish duration,
// highlighting the renderer main thread vs the GPU process (gpu categories).   node trace-summary.mjs <trace.json.gz> [--md out.md]
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const file = process.argv[2];
const mdOut = process.argv.includes("--md") ? process.argv[process.argv.indexOf("--md") + 1] : null;
const raw = readFileSync(file);
const events = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString());
const names = new Map(); // "pid:tid" -> thread name ; "pid" -> process name
for (const e of events) if (e.ph === "M") {
  if (e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name);
  if (e.name === "process_name") names.set(`${e.pid}`, e.args.name);
}
const threads = new Map();
let tmin = Infinity, tmax = -Infinity;
for (const e of events) {
  if (e.ph !== "X" || e.dur === undefined) continue;
  tmin = Math.min(tmin, e.ts); tmax = Math.max(tmax, e.ts + e.dur);
  const key = `${e.pid}:${e.tid}`;
  let t = threads.get(key);
  if (!t) { t = { key, proc: names.get(`${e.pid}`) ?? String(e.pid), thread: names.get(key) ?? String(e.tid), events: [], byName: new Map() }; threads.set(key, t); }
  t.events.push(e);
}
const wallMs = (tmax - tmin) / 1000;
// top-level (non-nested) busy time per thread: sort by ts, drop events contained in an earlier one
const rows = [];
for (const t of threads.values()) {
  t.events.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  let end = -1, busy = 0;
  for (const e of t.events) { if (e.ts >= end) { busy += e.dur; end = e.ts + e.dur; } else if (e.ts + e.dur > end) { busy += e.ts + e.dur - end; end = e.ts + e.dur; } }
  // self time per name: dur minus children (approx via stack)
  const stack = [];
  for (const e of t.events) {
    while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop();
    const rec = { e, end: e.ts + e.dur, child: 0 };
    if (stack.length) stack[stack.length - 1].child += e.dur;
    stack.push(rec);
    rec.finish = () => {};
    t.byName.set(e.name, (t.byName.get(e.name) ?? { dur: 0, self: 0, n: 0 }));
    const agg = t.byName.get(e.name); agg.dur += e.dur; agg.n++;
    e.__rec = rec;
  }
  for (const e of t.events) { const agg = t.byName.get(e.name); agg.self += e.dur - e.__rec.child; }
  rows.push({ t, busy: busy / 1000 });
}
rows.sort((a, b) => b.busy - a.busy);
let md = `### ${file.split("/").pop()}\n\ntrace span ${wallMs.toFixed(0)} ms, ${events.length} events\n\n| process | thread | busy ms | busy % of span |\n|---|---|---|---|\n`;
for (const r of rows.slice(0, 12)) md += `| ${r.t.proc} | ${r.t.thread} | ${r.busy.toFixed(0)} | ${(100 * r.busy / wallMs).toFixed(0)}% |\n`;
for (const r of rows.slice(0, 4)) {
  md += `\nTop events on \`${r.t.proc} / ${r.t.thread}\` by self ms\n\n| event | self ms | total ms | count |\n|---|---|---|---|\n`;
  for (const [n, a] of [...r.t.byName].sort((a, b) => b[1].self - a[1].self).slice(0, 10)) md += `| ${n} | ${(a.self / 1000).toFixed(0)} | ${(a.dur / 1000).toFixed(0)} | ${a.n} |\n`;
}
const gpuRows = rows.filter((r) => /Gpu|GPU|viz|Compositor/i.test(r.t.proc + r.t.thread));
md += `\nGPU/viz process threads\n\n| process | thread | busy ms | busy % |\n|---|---|---|---|\n`;
for (const r of gpuRows.slice(0, 8)) md += `| ${r.t.proc} | ${r.t.thread} | ${r.busy.toFixed(0)} | ${(100 * r.busy / wallMs).toFixed(0)}% |\n`;
if (mdOut) writeFileSync(mdOut, md);
console.log(md);
