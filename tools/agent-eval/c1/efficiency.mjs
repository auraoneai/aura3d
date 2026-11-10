#!/usr/bin/env node
// C1 efficiency A/B report: baseline (c1-551 aura rows) vs efficiency passes, per task and overall. Per run: turns,
// input/output tokens, wall, list $, Kiro credits, functional checks (main / follow-up), blind rubric score (judge-ab),
// tool-call counts from the transcript (render, render with --screenshot/--image, info, examples, validate, read_file,
// edit_file, search), images delivered/dropped (pass 2). Writes <out> (markdown) and <out>.json beside it.
//   node tools/agent-eval/c1/efficiency.mjs --base c1-551 --pass c1-551-eff1[,c1-551-eff2] --tasks 101,104,109 --out FILE [--notes FILE]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { median } from "../lib/metrics.mjs";
import { C1_DIR, loadTasks } from "./run-c1.mjs";

const REPO = resolve(C1_DIR, "..", "..", "..");
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const base = opt("--base", "c1-551");
const passes = opt("--pass", "c1-551-eff1").split(",").filter(Boolean);
const taskIds = opt("--tasks", "101,104,109").split(",").map(Number);
const out = resolve(REPO, opt("--out", "tests/reports/benchmark-c1/EFFICIENCY.md"));
const notes = opt("--notes", null);
const tasks = Object.fromEntries(loadTasks().tasks.map((t) => [t.id, t]));
const dir = (b) => resolve(REPO, "evidence/agent-eval-c1", b);
const readJson = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);

function toolCounts(transcript) {
  const c = { render: 0, screenshot: 0, info: 0, examples: 0, validate: 0, read_file: 0, edit_file: 0, write_file: 0, search: 0, typecheck: 0 };
  for (const m of transcript) {
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type !== "tool_use") continue;
      if (b.name === "aura3d") {
        const cmd = b.input?.command;
        if (cmd in c) c[cmd] += 1;
        if (cmd === "render" && (b.input?.args ?? []).some((a) => /^--(screenshot|image)$/.test(String(a)))) c.screenshot += 1;
      } else if (b.name in c) c[b.name] += 1;
    }
  }
  return c;
}

// Mean rubric score per run over every A/B judging it appeared in.
const abScores = {};
const abPairs = {};
for (const p of passes) {
  const j = readJson(join(dir(p), `c1-judge-ab-${base}.json`));
  if (!j) continue;
  abPairs[p] = j;
  for (const [id, s] of Object.entries(j.meanScores ?? {})) (abScores[id] ??= []).push(s);
}

function rows(batch) {
  const score = readJson(join(dir(batch), "c1-score.json"), {});
  const rdir = join(dir(batch), "runs");
  return readdirSync(rdir)
    .filter((id) => existsSync(join(rdir, id, "run.json")))
    .map((id) => readJson(join(rdir, id, "run.json")))
    .filter((r) => r.arm === "aura" && taskIds.includes(r.task) && !r.invalid)
    .map((r) => {
      const t = tasks[r.task];
      const ph = score[r.runId]?.phases ?? {};
      const pm = ph.main?.probes?.[t.probe];
      const pf = ph.followup?.probes?.[t.followUp.probe];
      const tr = readJson(join(rdir, r.runId, "transcript.json"), []);
      const vis = abScores[r.runId];
      return {
        batch, runId: r.runId, task: r.task, idx: r.idx, end: `${r.endReason}/${r.followUpEndReason}`,
        turns: r.usage?.turns, turnsMain: r.phases?.find((p) => p.name === "main")?.turns,
        tokensIn: r.usage?.input, tokensOut: r.usage?.output, wallSec: r.wallMs == null ? null : Math.round(r.wallMs / 1000),
        usd: r.cost?.listUsd, credits: r.cost?.providerCredits,
        mainChecks: pm ? `${pm.passed}/${pm.total}` : "-", mainAll: Boolean(pm && pm.total && pm.passed === pm.total),
        followChecks: pf ? `${pf.passed}/${pf.total}` : "-", followAll: Boolean(pf && pf.total && pf.passed === pf.total),
        regressed: Boolean(pm && ph.followup?.probes?.[t.probe] && ph.followup.probes[t.probe].passed < pm.passed),
        rendered: Boolean(ph.main?.build?.ok && ph.main?.ready && !(ph.main?.pageErrors?.length > 0)),
        visual: vis ? vis.reduce((a, b) => a + b, 0) / vis.length : null,
        imagesDelivered: r.usage?.imagesDelivered ?? null, imagesDropped: r.usage?.imagesDropped ?? null,
        firstRenderSummary: (() => { const m = tr.find((x) => x.role === "user" && Array.isArray(x.content) && x.content.some((c) => /render-summary|exit \d/.test(String(c.content ?? "")) && /render/.test(String(c.content ?? "")))); return m ? /render-summary/.test(JSON.stringify(m.content)) : null; })(),
        tools: toolCounts(tr)
      };
    });
}

const all = [...rows(base), ...passes.flatMap(rows)];
const batches = [base, ...passes];
const label = (b) => (b === base ? "baseline (c1-551)" : b.replace(/^c1-551-/, ""));
const stat = (v) => { const x = v.filter((n) => typeof n === "number"); return x.length ? { median: median(x), min: Math.min(...x), max: Math.max(...x), n: x.length } : null; };
const k = (v) => (v == null ? "-" : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : `${Math.round(v / 1000)}K`);
const f = (v, d = 0) => (v == null ? "-" : Number(v).toFixed(d));
const mr = (s, fmt = f, d = 0) => (s ? `${fmt(s.median, d)} (${fmt(s.min, d)}-${fmt(s.max, d)})` : "-");

const summary = {};
for (const scope of [...taskIds, "all"]) {
  for (const b of batches) {
    const rs = all.filter((r) => r.batch === b && (scope === "all" || r.task === scope));
    if (!rs.length) continue;
    (summary[scope] ??= {})[b] = {
      n: rs.length, turns: stat(rs.map((r) => r.turns)), tokensIn: stat(rs.map((r) => r.tokensIn)), tokensOut: stat(rs.map((r) => r.tokensOut)),
      wallSec: stat(rs.map((r) => r.wallSec)), usd: stat(rs.map((r) => r.usd)), credits: stat(rs.map((r) => r.credits)),
      mainAll: rs.filter((r) => r.mainAll).length, followAll: rs.filter((r) => r.followAll).length, regressions: rs.filter((r) => r.regressed).length, rendered: rs.filter((r) => r.rendered).length,
      visual: stat(rs.map((r) => r.visual)), renders: stat(rs.map((r) => r.tools.render)), screenshots: rs.reduce((a, r) => a + r.tools.screenshot, 0),
      info: stat(rs.map((r) => r.tools.info)), examples: stat(rs.map((r) => r.tools.examples)), validate: stat(rs.map((r) => r.tools.validate)),
      readFile: stat(rs.map((r) => r.tools.read_file)), editFile: stat(rs.map((r) => r.tools.edit_file)), search: stat(rs.map((r) => r.tools.search)),
      totalUsd: Math.round(rs.reduce((a, r) => a + (r.usd ?? 0), 0) * 100) / 100, totalCredits: Math.round(rs.reduce((a, r) => a + (r.credits ?? 0), 0) * 10) / 10
    };
  }
}

const L = [];
L.push("# Agent-efficiency A/B on the C1 aura arm (tasks 101, 104, 109)", "");
L.push(`Baseline = the c1-551 aura runs of the same tasks (Aura3D 5.5.1 CLI and docs at v5.5.1 \`6ee56fe80\`). ${passes.map((p) => `\`${p}\``).join(" and ")}: same frozen harness, model (\`claude-sonnet-5.5\` via Kiro Prism), caps (40 + 15 turns), condition and seeds; \`@aura3d/cli\` from \`exp/agent-efficiency\` (\`93c069d82\`: compact render summary, PNG only with \`--screenshot\`, category starters in \`examples\`), docs at \`b89ea3183\` (done rule, exact signatures in \`llms.txt\`). Pass 2 also sets \`AGENT_EVAL_IMAGE_TURN=1\` (earlier tool results are never rewritten; a requested screenshot follows the tool results in its own block). 3 runs per task: report ranges, not just medians. Turns and tokens include the follow-up edit. Cost is list price (Prism reports Kiro credits only, and no cache fields).`, "");
L.push("## Overall (9 runs per column)", "");
const cols = batches.filter((b) => summary.all?.[b]);
const row = (name, fn) => L.push(`| ${name} | ${cols.map((b) => fn(summary.all[b])).join(" | ")} |`);
L.push(`| measure | ${cols.map(label).join(" | ")} |`, `|---|${cols.map(() => "---").join("|")}|`);
row("turns, median (range)", (s) => mr(s.turns));
row("input tokens", (s) => mr(s.tokensIn, k));
row("output tokens", (s) => mr(s.tokensOut, k));
row("wall s", (s) => mr(s.wallSec));
row("list $ per run", (s) => mr(s.usd, f, 2));
row("list $ total", (s) => f(s.totalUsd, 2));
row("Kiro credits total", (s) => f(s.totalCredits, 1));
row("main all-pass", (s) => `${s.mainAll}/${s.n}`);
row("follow-up all-pass", (s) => `${s.followAll}/${s.n}`);
row("regressions", (s) => s.regressions);
row("blind rubric score (1-5)", (s) => mr(s.visual, f, 2));
row("render calls", (s) => mr(s.renders));
row("render calls with --screenshot (total)", (s) => s.screenshots);
row("info / examples / validate (medians)", (s) => `${f(s.info?.median)} / ${f(s.examples?.median)} / ${f(s.validate?.median)}`);
row("read_file / edit_file / search (medians)", (s) => `${f(s.readFile?.median)} / ${f(s.editFile?.median)} / ${f(s.search?.median)}`);
L.push("", "## Per task", "");
L.push("| task | column | turns | input tokens | output tokens | wall s | list $ | main checks | follow-up checks | rubric score | renders (with --screenshot) | info / examples / validate |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const t of taskIds) {
  for (const b of batches) {
    const rs = all.filter((r) => r.batch === b && r.task === t).sort((x, y) => x.idx - y.idx);
    if (!rs.length) continue;
    const s = summary[t][b];
    L.push(`| ${t} ${tasks[t].slug} | ${label(b)} | ${rs.map((r) => r.turns).join(", ")} | ${rs.map((r) => k(r.tokensIn)).join(", ")} | ${rs.map((r) => k(r.tokensOut)).join(", ")} | ${rs.map((r) => r.wallSec).join(", ")} | ${rs.map((r) => f(r.usd, 2)).join(", ")} | ${rs.map((r) => r.mainChecks).join(", ")} | ${rs.map((r) => r.followChecks).join(", ")} | ${rs.map((r) => f(r.visual, 2)).join(", ")} | ${rs.map((r) => `${r.tools.render} (${r.tools.screenshot})`).join(", ")} | ${f(s.info?.median)} / ${f(s.examples?.median)} / ${f(s.validate?.median)} |`);
  }
}
L.push("", "## Blind A/B visual pairs (main-phase frames, frozen C1 rubric, majority of 3 calls)", "");
L.push("| pass vs baseline | pass wins | baseline wins | ties | no frame | pass win rate (ties half) | judge list $ |", "|---|---|---|---|---|---|---|");
for (const [p, j] of Object.entries(abPairs)) {
  const w = j.pairs.filter((x) => x.winner === "B").length, l = j.pairs.filter((x) => x.winner === "A").length, t = j.pairs.filter((x) => x.winner === "tie").length, nf = j.pairs.filter((x) => x.noFrame?.length).length;
  L.push(`| ${label(p)} | ${w} | ${l} | ${t} | ${nf} | ${w + l + t ? Math.round(((w + t / 2) / (w + l + t)) * 100) : "-"}% | ${f(j.judgeCost?.listUsd, 2)} |`);
}
L.push("", "Decision rule from the plan (`docs/agents/agent-efficiency.md` on `exp/agent-efficiency`): a pass is better only if input tokens and turns drop on at least 2 of 3 tasks with no loss in functional all-pass.", "");
for (const p of passes) {
  if (!summary.all?.[p]) continue;
  const better = taskIds.filter((t) => summary[t]?.[p] && summary[t][p].tokensIn.median < summary[t][base].tokensIn.median && summary[t][p].turns.median < summary[t][base].turns.median);
  const noLoss = summary.all[p].mainAll >= summary.all[base].mainAll && summary.all[p].followAll >= summary.all[base].followAll;
  L.push(`- **${label(p)}**: turns and input tokens both lower on ${better.length}/3 tasks (${better.join(", ") || "none"}); functional all-pass ${noLoss ? "not lower" : "lower"} (main ${summary.all[p].mainAll}/${summary.all[p].n} vs ${summary.all[base].mainAll}/${summary.all[base].n}, follow-up ${summary.all[p].followAll}/${summary.all[p].n} vs ${summary.all[base].followAll}/${summary.all[base].n}). Verdict: **${better.length >= 2 && noLoss ? "better" : "not shown better"}**.`);
}
if (notes) L.push("", readFileSync(notes, "utf8").trim());
writeFileSync(out, `${L.join("\n")}\n`);
writeFileSync(out.replace(/\.md$/, ".json"), JSON.stringify({ schema: "aura3d.agent-eval.c1-efficiency/1", base, passes, tasks: taskIds, summary, runs: all }, null, 2));
console.log("wrote", out);
