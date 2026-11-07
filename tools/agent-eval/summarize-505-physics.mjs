#!/usr/bin/env node
// Per-task rows for bench505-physics from metrics.json, physics-probes.json and the two visual-judge files. node tools/agent-eval/summarize-505-physics.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const dir = resolve(import.meta.dirname, "..", "..", "evidence/agent-eval-505/physics");
const load = (p) => JSON.parse(readFileSync(join(dir, p), "utf8"));
const med = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const metrics = [...load("bench505-physics/metrics.json"), ...load("bench505-physics-sheet/metrics.json")];
const probes = { ...load("bench505-physics/physics-probes.json"), ...load("bench505-physics-sheet/physics-probes.json") };
const stats = load("physics-cdp-framestats.json"); // CDP frames at 0 (before click), 0.4/1 s, 3.4/3 s, 10.4/12 s after the click
const vj = { aura: load("visual-judge-aura-vs-three.json").results, "aura-sheet": load("visual-judge-aurasheet-vs-three.json").results };
const armOf = (m) => (m.runId.includes("physics-sheet") ? "aura-sheet" : m.arm);
const names = { 10: "physics-1 domino", 11: "physics-2 crates", 12: "physics-3 plinko" };
const lines = [];
const header = "| task | arm | n valid | turns median (runs) | finished | first-try tsc | final build ok | page ready | functional probe pass | checklist median (runs) | motion ok (frames change after click, mean abs luma diff > 0.15) | visual vs three (3-judge majority W/L/T, no-frames) | tokens in median / out median |";
lines.push(header, "|" + header.split("|").slice(1, -1).map(() => "---").join("|") + "|");
const rows = [];
for (const task of [10, 11, 12]) {
  for (const arm of ["aura", "aura-sheet", "three"]) {
    const ms = metrics.filter((m) => m.task === task && armOf(m) === arm);
    const valid = ms.filter((m) => m.valid);
    const pr = valid.map((m) => probes[m.runId]).filter(Boolean);
    const motion = valid.filter((m) => { const s = stats[m.runId]; const p = probes[m.runId]; return s && p?.ready && Math.max(s.diff_0_to_2 ?? 0, s.diff_2_to_3 ?? 0) > 0.15; }).length;
    let vis = "-";
    if (arm !== "three") {
      const rs = vj[arm].filter((r) => r.task === task);
      const w = rs.filter((r) => r.majority === "aura").length, l = rs.filter((r) => r.majority === "three").length, t = rs.filter((r) => r.majority === "tie").length, nf = rs.filter((r) => r.noFrames).length;
      vis = `${w}/${l}/${t}, ${nf} no-frames (aura wins ${w}, three wins ${l})`;
    }
    const row = {
      task: names[task], arm, nValid: `${valid.length}/${ms.length}`,
      turns: `${med(valid.map((m) => m.turns))} (${valid.map((m) => m.turns).join(",")})`,
      finished: `${valid.filter((m) => m.endReason === "finished").length}/${ms.length}`,
      tsc1: `${valid.filter((m) => m.firstTryTypecheck).length}/${ms.length}`,
      build: `${valid.filter((m) => m.finalBuild).length}/${ms.length}`,
      ready: `${pr.filter((p) => p.ready).length}/${ms.length}`,
      probe: `${pr.filter((p) => p.success).length}/${ms.length}`,
      checklist: `${med(valid.map((m) => m.checklistPassFraction))?.toFixed(2)} (${valid.map((m) => m.checklistPassFraction?.toFixed(2)).join(",")})`,
      motion: `${motion}/${ms.length}`, vis,
      tokens: `${med(valid.map((m) => m.tokensIn))} / ${med(valid.map((m) => m.tokensOut))}`
    };
    rows.push(row);
    lines.push(`| ${Object.values(row).join(" | ")} |`);
  }
}
writeFileSync(join(dir, "tables.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
