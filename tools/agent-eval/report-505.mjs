#!/usr/bin/env node
// node tools/agent-eval/report-505.mjs <batchDir>  -> <batchDir>/tables.md (per task and arm rows) and stdout
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const metrics = JSON.parse(readFileSync(join(dir, "metrics.json"), "utf8"));
const vj = JSON.parse(readFileSync(join(dir, "visual-judge.json"), "utf8"));
const stats = JSON.parse(readFileSync(join(dir, "framestats.json"), "utf8"));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const K = (n) => (n == null ? "-" : `${Math.round(n / 1000)}K`);
const titles = { 11: "games-1 Brick Breaker", 12: "games-2 Tower Stacker", 13: "games-3 Hurdle Sprinter", 14: "games-4 Lantern Pop" };
const rows = ["| task | arm | n | turns median (range) | finished | first-try tsc | checklist median (runs) | probe pass (median) | motion ok (probe / frame diff) | visual vs three.js: wins / losses / ties (3-judge majority, 3 pairs) | mean judge score (arm vs three) | input tokens median | output tokens median |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
const scores = JSON.parse(readFileSync(join(dir, "remote/results.json"), "utf8"));
for (const task of [11, 12, 13, 14]) for (const arm of ["aura", "aura-sheet", "three"]) {
  const m = metrics.filter((x) => x.task === task && x.arm === arm).sort((a, b) => a.runId.localeCompare(b.runId));
  const turns = m.map((x) => x.turns);
  const probeOf = (id) => scores.find((r) => r.id === `${id}-final`)?.probes?.task;
  const motionProbe = m.filter((x) => probeOf(x.runId)?.checks?.motion === true).length;
  const noSample = m.filter((x) => probeOf(x.runId)?.samples?.motionDiff == null).length; // in-page sampler got no frame (instrument fault, not a game verdict)
  const motionFrame = m.filter((x) => (stats[x.runId]?.diff ?? 0) > 0.1).length;
  let vis = "-", sc = "-";
  if (arm !== "three") {
    const v = vj.majority.filter((r) => r.task === task && r.subject === arm);
    vis = `${v.filter((r) => r.majority === arm).length} / ${v.filter((r) => r.majority === "three").length} / ${v.filter((r) => r.majority === "tie").length}`;
    const mean = (k) => (v.reduce((a, r) => a + (r.meanTotals[k] ?? 0), 0) / v.length).toFixed(1);
    sc = `${mean(arm)} vs ${mean("three")}`;
  }
  rows.push(`| ${titles[task]} | ${arm} | ${m.length} | ${med(turns)} (${Math.min(...turns)}-${Math.max(...turns)}) | ${m.filter((x) => x.endReason === "finished").length}/${m.length} | ${m.filter((x) => x.firstTryTypecheck).length}/${m.length} | ${med(m.map((x) => x.checklistPassFraction))?.toFixed(2)} (${m.map((x) => (x.checklistPassFraction ?? 0).toFixed(2)).join("/")}) | ${med(m.map((x) => x.probePassFraction))?.toFixed(2)} | ${motionProbe}/${m.length}${noSample ? ` (${noSample} sampler miss)` : ""} / ${motionFrame}/${m.length} | ${vis} | ${sc} | ${K(med(m.map((x) => x.tokensIn)))} | ${K(med(m.map((x) => x.tokensOut)))} |`);
}
// overall
rows.push("", "| arm | n | turns median | finished | first-try tsc | checklist mean | probe pass mean | visual wins vs three (of 12) | losses | ties |", "|---|---|---|---|---|---|---|---|---|---|");
for (const arm of ["aura", "aura-sheet", "three"]) {
  const m = metrics.filter((x) => x.arm === arm);
  const mean = (f) => (m.reduce((a, x) => a + (f(x) ?? 0), 0) / m.length).toFixed(2);
  const v = vj.majority.filter((r) => r.subject === arm);
  rows.push(`| ${arm} | ${m.length} | ${med(m.map((x) => x.turns))} | ${m.filter((x) => x.endReason === "finished").length}/${m.length} | ${m.filter((x) => x.firstTryTypecheck).length}/${m.length} | ${mean((x) => x.checklistPassFraction)} | ${mean((x) => x.probePassFraction)} | ${arm === "three" ? "-" : v.filter((r) => r.majority === arm).length} | ${arm === "three" ? "-" : v.filter((r) => r.majority === "three").length} | ${arm === "three" ? "-" : v.filter((r) => r.majority === "tie").length} |`);
}
const out = rows.join("\n");
writeFileSync(join(dir, "tables.md"), out + "\n");
console.log(out);
