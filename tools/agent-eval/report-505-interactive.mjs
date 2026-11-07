#!/usr/bin/env node
// node tools/agent-eval/report-505-interactive.mjs -> evidence/agent-eval-505/interactive/tables.md
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const E = join(resolve(import.meta.dirname, "..", ".."), "evidence/agent-eval-505/interactive");
const J = (p) => JSON.parse(readFileSync(join(E, p), "utf8"));
const rows = [];
for (const [arm, batch] of [["aura", "bench505-interactive"], ["three", "bench505-interactive"], ["aura-sheet", "bench505-interactive-sheet"]]) {
  const res = new Map(J(`${batch}/remote/results.json`).map((r) => [r.id, r]));
  for (const m of J(`${batch}/metrics.json`)) {
    if (!(arm === "three" ? m.arm === "three" : m.arm === "aura")) continue;
    const r = res.get(`${m.runId}-final`);
    const items = m.probeItems ?? {};
    const fn = Object.entries(items).filter(([k]) => !["rendersNonBlank", "animated", "builds", "noPageErrors"].includes(k));
    rows.push({ arm, task: m.task, runId: m.runId, turns: m.turns, finished: m.endReason === "finished", endReason: m.endReason, tsc1: m.firstTryTypecheck, tscF: m.finalTypecheck, checklist: m.checklistPassFraction == null ? null : Math.round(m.checklistPassFraction * 8) + "/8", built: m.finalBuild, animated: r?.probes?.animated === true, probePass: fn.filter(([, v]) => v).length, probeTotal: fn.length, failedProbe: fn.filter(([, v]) => !v).map(([k]) => k), tokIn: m.tokensIn, tokOut: m.tokensOut });
  }
}
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const vj = J("visual-judge.json").results;
let md = "# bench505 interactive: per-task, per-arm rows (n=3)\n\nProbe = page-level injected probe (functional, excluding build/blank/animated/page-error items). Motion ok = REA frames 3 s apart differ (framestats diff > 0.1).\n\n| task | arm | turns (runs) | finished | first-try tsc | final tsc | built | checklist (judge, mean of 8) | motion ok | probe checks (mean) | tokens in (median) | tokens out (median) |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n";
const metricsAll = [];
for (const task of [10, 11]) for (const arm of ["aura", "aura-sheet", "three"]) {
  const rs = rows.filter((r) => r.task === task && r.arm === arm);
  md += `| ${task === 10 ? "interactive-1 garden" : "interactive-2 solar"} | ${arm} | ${rs.map((r) => r.turns).join("/")} | ${rs.filter((r) => r.finished).length}/${rs.length} | ${rs.filter((r) => r.tsc1).length}/${rs.length} | ${rs.filter((r) => r.tscF).length}/${rs.length} | ${rs.filter((r) => r.built).length}/${rs.length} | ${rs.map((r) => r.checklist ?? "n/a").join("/")} | ${rs.filter((r) => r.animated).length}/${rs.length} | ${rs.map((r) => `${r.probePass}/${r.probeTotal}`).join(" ")} | ${med(rs.map((r) => r.tokIn))} | ${med(rs.map((r) => r.tokOut))} |\n`;
}
md += "\n## Blind visual judge (3 independent calls per pair, majority; forfeit = Aura3D run produced no frames)\n\n| task | comparison | pair wins subject (Aura3D) | pair wins three.js | ties | forfeits | call-level wins subject/three/tie |\n|---|---|---|---|---|---|---|\n";
for (const task of [10, 11]) for (const cmp of ["aura-vs-three", "aura-sheet-vs-three"]) {
  const rs = vj.filter((r) => r.task === task && r.comparison === cmp);
  const t = { subject: 0, three: 0, tie: 0 };
  let f = 0;
  const cl = { subject: 0, three: 0, tie: 0 };
  for (const r of rs) { if (r.forfeit) f++; if (r.majority) t[r.majority]++; for (const [k, v] of Object.entries(r.tally ?? {})) cl[k] += v; }
  md += `| ${task} | ${cmp} | ${t.subject} | ${t.three} | ${t.tie} | ${f} | ${cl.subject}/${cl.three}/${cl.tie} |\n`;
}
md += "\n## Per-run detail\n\n| run | turns | end | tsc1 | tscF | built | motion | failed probe items |\n|---|---|---|---|---|---|---|---|\n";
for (const r of rows) md += `| ${r.runId.replace("bench505-interactive-", "")}${r.arm === "aura-sheet" ? "" : ""} | ${r.turns} | ${r.endReason} | ${r.tsc1} | ${r.tscF} | ${r.built} | ${r.animated} | ${r.failedProbe.join(",") || "-"} |\n`;
writeFileSync(join(E, "tables.md"), md);
console.log(md);
