#!/usr/bin/env node
// lane/511 comparison: baseline docs vs general first-screen sheet on unseen tasks 31-36.
//   AGENT_EVAL_EVIDENCE=evidence/cheatsheet-511/agent-eval node tools/agent-eval/report-511.mjs [base-batch] [sheet-batch] > REPORT.md
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", process.env.AGENT_EVAL_EVIDENCE ?? "evidence/cheatsheet-511/agent-eval");
const [baseBatch = "b511-base", sheetBatch = "b511-sheet"] = process.argv.slice(2);
const load = (batch) => JSON.parse(readFileSync(join(root, batch, "metrics.json"), "utf8"));
const median = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const range = (xs) => { const a = xs.filter((x) => x != null); return a.length ? `${Math.min(...a)}-${Math.max(...a)}` : "-"; };
const k = (n) => (n == null ? "-" : n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)));
const f2 = (n) => (n == null ? "-" : (Math.round(n * 100) / 100).toString());
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);
const rows = (ms) => ({
  n: ms.length,
  finished: ms.filter((m) => m.endReason === "finished").length,
  capped: ms.filter((m) => m.hitTurnCap).length,
  firstTsc: ms.filter((m) => m.firstTryTypecheck).length,
  finalRender: ms.filter((m) => m.finalRender).length,
  turns: median(ms.map((m) => m.turns)),
  turnsRange: range(ms.map((m) => m.turns)),
  tokensIn: median(ms.map((m) => m.tokensIn)),
  tokensOut: median(ms.map((m) => m.tokensOut)),
  docs: median(ms.map((m) => m.docsFilesOpened)),
  search: median(ms.map((m) => m.searchCalls)),
  checklist: median(ms.map((m) => m.checklistPassFraction)),
  checklistMean: sum(ms.map((m) => m.checklistPassFraction)) / ms.length,
  wall: median(ms.map((m) => m.agentWallSec))
});
const base = load(baseBatch);
const sheet = load(sheetBatch);
const line = (label, r) => `| ${label} | ${r.n} | ${r.finished}/${r.n} | ${r.capped} | ${r.firstTsc}/${r.n} | ${r.finalRender}/${r.n} | ${r.turns} (${r.turnsRange}) | ${k(r.tokensIn)} | ${k(r.tokensOut)} | ${r.docs} | ${r.search} | ${f2(r.checklist)} (mean ${f2(r.checklistMean)}) | ${r.wall}s |`;
const head = "| group | n | finished | hit 40-turn cap | first-try tsc | final build+render clean | turns median (range) | input tokens median | output tokens median | docs files opened | search calls | checklist median | agent wall median |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|";
const out = [];
out.push(`# lane/511 general first-screen sheet: unseen-task trial (tasks 31-36, n=3, docs-only Aura arm, claude-sonnet-5.5 through Prism, published engine 5.0.2)\n`);
out.push("## Pooled\n", head, line(`baseline docs (${baseBatch})`, rows(base)), line(`general sheet (${sheetBatch})`, rows(sheet)), "");
out.push("## Per task\n", head);
for (const t of [...new Set(base.map((m) => m.task))].sort((a, b) => a - b)) {
  out.push(line(`task ${t} baseline`, rows(base.filter((m) => m.task === t))));
  out.push(line(`task ${t} sheet`, rows(sheet.filter((m) => m.task === t))));
}
out.push("", "## Per run\n", "| run | end | turns | tsc1 | render | checklist | tokens in | probe frame lit/std/diff |", "|---|---|---|---|---|---|---|---|");
for (const m of [...base, ...sheet].sort((a, b) => a.task - b.task || a.runId.localeCompare(b.runId))) {
  out.push(`| ${m.runId} | ${m.endReason} | ${m.turns} | ${m.firstTryTypecheck ? "y" : "n"} | ${m.finalRender ? "y" : "n"} | ${f2(m.checklistPassFraction)} | ${k(m.tokensIn)} | |`);
}
console.log(out.join("\n"));
