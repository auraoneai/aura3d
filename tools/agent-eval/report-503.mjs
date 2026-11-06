#!/usr/bin/env node
// Before/after tables for the 5.0.2 docs trial: baseline1 (4.1.2) versus docs503 (5.0.2).
//   node tools/agent-eval/report-503.mjs  -> evidence/agent-eval-503/tables.md
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const load = (b) => JSON.parse(readFileSync(join(REPO, "evidence/agent-eval", b, "metrics.json"), "utf8"));
const before = load("baseline1");
const after = load("docs503");
const visual = JSON.parse(readFileSync(join(REPO, "evidence/agent-eval/docs503/visual-judge.json"), "utf8")).results;

const med = (xs) => {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const fmt = (xs, d = 1) => {
  const v = xs.filter((x) => x != null && !Number.isNaN(x));
  if (!v.length) return "n/a";
  const r = (x) => (Math.round(x * 10 ** d) / 10 ** d).toString();
  return `${r(med(v))} (${r(Math.min(...v))}-${r(Math.max(...v))}, n=${v.length})`;
};
const frac = (xs) => `${xs.filter(Boolean).length}/${xs.length}`;
const pick = (set, arm, task) => set.filter((m) => m.arm === arm && m.task === task && m.valid);

const cell = (runs) => ({
  cap: frac(runs.map((m) => m.hitTurnCap)),
  tc: frac(runs.map((m) => m.firstTryTypecheck)),
  fb: frac(runs.map((m) => m.finalBuild)),
  fr: frac(runs.map((m) => m.finalRender)),
  turns: fmt(runs.map((m) => m.turns), 0),
  wall: fmt(runs.map((m) => m.agentWallSec), 0),
  tin: fmt(runs.map((m) => m.tokensIn), 0),
  chk: fmt(runs.map((m) => m.checklistPassFraction), 2),
  nop: fmt(runs.map((m) => m.silentNoOps), 0),
  docs: fmt(runs.map((m) => m.docsFilesOpened), 0),
  types: fmt(runs.map((m) => m.typesFilesOpened), 0),
  src: fmt(runs.map((m) => m.srcLines), 0),
  bundle: fmt(runs.map((m) => m.bundleRawKB), 0)
});

const names = { 1: "PBR cube with orbit", 2: "forest of 10,000 instances", 3: "skinned character with crossfade", 4: "game loop", 5: "shader water", 8: "low-poly island, water, day/night sky (new, procedural)", 9: "procedural robot, idle animation, dramatic lighting (new, procedural)" };
let md = "";
for (const task of [1, 2, 3, 4, 5, 8, 9]) {
  const aB = pick(before, "aura", task);
  const aA = pick(after, "aura", task);
  const tB = pick(before, "three", task);
  const tA = pick(after, "three", task);
  const [cAB, cAA, cTB, cTA] = [aB, aA, tB, tA].map(cell);
  const vis = visual.filter((r) => r.task === task && r.totals);
  const vA = vis.map((r) => r.totals.aura);
  const vT = vis.map((r) => r.totals.three);
  const wins = (w) => vis.filter((r) => r.winner === w).length;
  md += `\n## Task ${task}: ${names[task]}\n\n`;
  md += "| Metric | Aura3D 4.1.2 (before) | Aura3D 5.0.2 (after) | three.js (4.x trial) | three.js (this trial) |\n| --- | --- | --- | --- | --- |\n";
  const rows = [
    ["ended at the turn cap (unfinished)", "cap"],
    ["first-try typecheck", "tc"],
    ["final builds", "fb"],
    ["final renders non-black", "fr"],
    ["agent turns", "turns"],
    ["agent wall time, s", "wall"],
    ["input tokens processed", "tin"],
    ["judge checklist passed (model judge)", "chk"],
    ["silent no-ops (model judge)", "nop"],
    ["docs files opened", "docs"],
    ["package/type files opened", "types"],
    ["final source lines (src/)", "src"],
    ["JS bundle KB", "bundle"]
  ];
  for (const [label, key] of rows) md += `| ${label} | ${aB.length ? cAB[key] : "not run"} | ${cAA[key]} | ${tB.length ? cTB[key] : "not run"} | ${cTA[key]} |\n`;
  md += `| blind visual judge, total of 25 (aura / three, same pair index) | n/a | ${fmt(vA, 0)} | n/a | ${fmt(vT, 0)} |\n`;
  md += `| blind visual pairs won (aura / three / tie) | n/a | ${wins("aura")} / ${wins("three")} / ${wins("tie")} | | |\n`;
}
mkdirSync(join(REPO, "evidence/agent-eval-503"), { recursive: true });
writeFileSync(join(REPO, "evidence/agent-eval-503/tables.md"), md);
console.log(md);
