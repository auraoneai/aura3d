#!/usr/bin/env node
// bench505 environments table. node tools/agent-eval/report-505.mjs <evidenceDir>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const E = process.argv[2];
const J = (p) => JSON.parse(readFileSync(join(E, p), "utf8"));
const main = J("bench505-environments/metrics.json"), sheet = J("bench505-environments-sheet/metrics.json");
const probes = J("env-probes.json"), vA = J("judge-aura-vs-three/visual-judge3.json").results, vS = J("judge-sheet-vs-three/visual-judge3.json").results;
const names = { 10: "environments-1 desert canyon", 11: "environments-2 floating islands", 12: "environments-3 snow pass", 13: "environments-4 coral reef" };
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : "n/a"; };
const lines = ["| task | arm | n valid/3 | turns (per run) | finished (not cap) | first-try tsc | checklist (mean) | builds | motion ok | probe ok | visual wins vs three (3-judge majority) | tokens in+out (mean) |", "|---|---|---|---|---|---|---|---|---|---|---|---|"];
for (const t of [10, 11, 12, 13]) for (const [arm, ms, label, vis] of [["aura", main, "aura", vA], ["sheet", sheet, "aura-sheet", vS], ["three", main, "three", null]]) {
  const rows = ms.filter((m) => m.task === t && (arm === "three" ? m.arm === "three" : m.arm === "aura")).filter((m) => m.valid);
  const pr = (m) => probes[m.runId];
  const wins = vis ? (() => { const r = vis.filter((x) => x.task === t && !x.error); return `${r.filter((x) => x.majority === "aura").length} ${label} / ${r.filter((x) => x.majority === "three").length} three / ${r.filter((x) => x.majority === "tie").length} tie (of ${r.length} pairs)`; })() : "-";
  const toks = rows.length ? Math.round(rows.reduce((a, m) => a + (m.tokensIn ?? 0) + (m.tokensOut ?? 0), 0) / rows.length / 1000) + "K" : "n/a";
  const cl = rows.filter((m) => m.checklistPassFraction != null);
  lines.push(`| ${names[t]} | ${label} | ${rows.length}/3 | ${rows.map((m) => m.turns).join("/")} | ${rows.filter((m) => !m.hitTurnCap && m.endReason === "finished").length}/${rows.length} | ${rows.filter((m) => m.firstTryTypecheck).length}/${rows.length} | ${cl.length ? (cl.reduce((a, m) => a + m.checklistPassFraction, 0) / cl.length).toFixed(2) : "n/a"} | ${rows.filter((m) => m.finalBuild).length}/${rows.length} | ${rows.filter((m) => pr(m)?.motionOk).length}/${rows.filter((m) => pr(m)).length} | ${rows.filter((m) => pr(m)?.probeOk).length}/${rows.filter((m) => pr(m)).length} | ${wins} | ${toks} |`);
}
const tot = (vis, k) => vis.filter((x) => !x.error && x.majority === k).length;
lines.push("", `Overall visual (majority of 3 judge calls per pair): aura wins ${tot(vA, "aura")}, three wins ${tot(vA, "three")}, ties ${tot(vA, "tie")}, pairs judged ${vA.filter((x) => !x.error).length}, missing ${vA.filter((x) => x.error).length}.`);
lines.push(`aura-sheet: wins ${tot(vS, "aura")}, three wins ${tot(vS, "three")}, ties ${tot(vS, "tie")}, pairs judged ${vS.filter((x) => !x.error).length}, missing ${vS.filter((x) => x.error).length}.`);
const raw = (v) => v.flatMap((x) => x.calls ?? []).filter((c) => !c.error);
for (const [n, v, k] of [["aura", vA, "aura"], ["aura-sheet", vS, "aura"]]) { const c = raw(v); lines.push(`Individual judge calls (${n} vs three): ${c.filter((x) => x.winner === k).length} ${n} / ${c.filter((x) => x.winner === "three").length} three / ${c.filter((x) => x.winner === "tie").length} tie of ${c.length}; mean overall score ${n} ${(c.reduce((a, x) => a + Number(x.scores[k].overall), 0) / c.length).toFixed(2)} vs three ${(c.reduce((a, x) => a + Number(x.scores.three.overall), 0) / c.length).toFixed(2)}.`); }
writeFileSync(join(E, "tables.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
