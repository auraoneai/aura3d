#!/usr/bin/env node
// node tools/agent-eval/report-505.mjs <categoryDir> <mainBatch> <sheetBatch> [framestats.json] -> <categoryDir>/tables.md
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const [dir, main, sheet, statsFile] = process.argv.slice(2);
const root = resolve(dir);
const load = (b) => (existsSync(join(root, b, "metrics.json")) ? JSON.parse(readFileSync(join(root, b, "metrics.json"), "utf8")) : []);
const runs = (b) => {
  const out = {};
  const d = join(root, b, "runs");
  for (const n of require_ls(d)) out[n] = JSON.parse(readFileSync(join(d, n, "run.json"), "utf8"));
  return out;
};
import { readdirSync } from "node:fs";
function require_ls(d) { return existsSync(d) ? readdirSync(d).sort() : []; }
const stats = statsFile && existsSync(statsFile) ? JSON.parse(readFileSync(statsFile, "utf8")) : {};
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const rows = [];
const vis = (f) => (existsSync(join(root, "vis", f)) ? JSON.parse(readFileSync(join(root, "vis", f), "utf8")).pairs : []);
const visA = vis("aura-vs-three.json"), visS = vis("aura-sheet-vs-three.json");
const tally = (pairs, task) => { const p = pairs.filter((x) => x.task === task && x.majority); return { n: p.length, subject: p.filter((x) => x.majority === "subject").length, three: p.filter((x) => x.majority === "three").length, tie: p.filter((x) => x.majority === "tie").length }; };
const lines = ["| task | arm | n valid/planned | turns median (range) | finished (not at cap, valid) | first-try tsc | final tsc | checklist median (runs) | motion ok (frame diff) | no page errors (non-404) | visual wins vs three (3-judge majority) | input tokens median | output tokens median | src lines median |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
for (const task of [10, 11, 12]) {
  for (const [label, batch, arm] of [["aura (docs)", main, "aura"], ["aura-sheet", sheet, "aura"], ["three", main, "three"]]) {
    const m = load(batch).filter((x) => x.task === task && x.arm === arm);
    const v = m.filter((x) => x.valid);
    const t = v.map((x) => x.turns);
    const chk = v.map((x) => x.checklistPassFraction);
    const motion = v.filter((x) => { const s = stats[x.runId]; return s && s.changedFrac > 0.005; }).length;
    const vt = label === "aura (docs)" ? tally(visA, task) : label === "aura-sheet" ? tally(visS, task) : null;
    const vcell = vt ? `${vt.subject} aura / ${vt.three} three / ${vt.tie} tie of ${vt.n}` : "n/a";
    lines.push(`| ${task} | ${label} | ${v.length}/3 | ${med(t) ?? "-"} (${t.length ? Math.min(...t) + "-" + Math.max(...t) : "-"}) | ${v.filter((x) => !x.hitTurnCap && x.endReason === "finished").length}/${v.length} | ${v.filter((x) => x.firstTryTypecheck).length}/${v.length} | ${v.filter((x) => x.finalTypecheck).length}/${v.length} | ${med(chk) ?? "-"} (${chk.map((c) => (c == null ? "-" : Number(c.toFixed(2)))).join("/")}) | ${motion}/${v.length} | see notes | ${vcell} | ${med(v.map((x) => x.tokensIn)) ?? "-"} | ${med(v.map((x) => x.tokensOut)) ?? "-"} | ${med(v.map((x) => x.srcLines)) ?? "-"} |`);
  }
}
writeFileSync(join(root, "tables.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
