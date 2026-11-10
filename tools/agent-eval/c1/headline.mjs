#!/usr/bin/env node
// C1 headline numbers, after report.mjs: per-arm medians and ranges (turns, tokens, wall, cost, Kiro credits,
// functional checks passed, blind rubric score, checklist), per-task tables, the 505 comparison and the bridge verdict.
// Writes <batch>/c1-headline.json, evidence/vs-threejs/agent-authoring-c1-<ver>/results.json and
// evidence/vs-threejs/RESULTS-agent-authoring-c1-<ver>.md, and (with --report) tests/reports/benchmark-c1/REPORT.md as
// headline + notes file + the batch REPORT.md from report.mjs.
//   node tools/agent-eval/c1/headline.mjs <batch> --version 5.5.0 [--report --notes FILE --extra-spend USD,CREDITS]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { median } from "../lib/metrics.mjs";
import { C1_DIR, loadTasks } from "./run-c1.mjs";

const REPO = resolve(C1_DIR, "..", "..", "..");
const ARMS = ["aura", "three", "bridge"];
const DIMS = ["readability", "lighting", "materials", "fidelity", "polish"];
const B505 = { turns: { docs: 25, sheet: 14, three: 5 }, tokens: { docs: 1450000, sheet: 420000, three: 63000 } };

const r = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const stat = (vals) => {
  const v = vals.filter((x) => typeof x === "number" && Number.isFinite(x));
  return v.length ? { median: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length } : { median: null, min: null, max: null, n: 0 };
};

/** Mean rubric score (1-5, 5 dimensions) each run received across all its judge calls. */
export function visualScores(pairs, runsByKey) {
  const acc = {};
  for (const p of pairs) {
    for (const c of p.calls ?? []) {
      if (!c.scores) continue;
      for (const [arm, s] of Object.entries(c.scores)) {
        const vals = DIMS.map((d) => Number(s?.[d])).filter((x) => x >= 1 && x <= 5);
        if (vals.length !== DIMS.length) continue;
        const id = runsByKey[`${p.task}-${p.idx}-${arm}`];
        if (!id) continue;
        (acc[id] ??= []).push(vals.reduce((a, b) => a + b, 0) / vals.length);
      }
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([id, v]) => [id, v.reduce((a, b) => a + b, 0) / v.length]));
}

function main(argv) {
  const [batch, ...rest] = argv;
  const opt = (n, d) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : d);
  const version = opt("--version", "5.5.0");
  const batchDir = resolve(REPO, "evidence/agent-eval-c1", batch);
  const tasks = loadTasks();
  const metrics = JSON.parse(readFileSync(join(batchDir, "c1-metrics.json"), "utf8"));
  const score = JSON.parse(readFileSync(join(batchDir, "c1-score.json"), "utf8"));
  const judge = existsSync(join(batchDir, "c1-judge.json")) ? JSON.parse(readFileSync(join(batchDir, "c1-judge.json"), "utf8")) : { pairs: [], checklists: [] };
  const runs = Object.fromEntries(readdirSync(join(batchDir, "runs")).filter((id) => existsSync(join(batchDir, "runs", id, "run.json"))).map((id) => [id, JSON.parse(readFileSync(join(batchDir, "runs", id, "run.json"), "utf8"))]));
  const byKey = Object.fromEntries(Object.values(runs).map((x) => [`${x.task}-${x.idx}-${x.arm}`, x.runId]));
  const vis = visualScores(judge.pairs ?? [], byKey);
  const checklist = Object.fromEntries((judge.checklists ?? []).filter((c) => c.passFraction != null).map((c) => [c.runId, c.passFraction]));
  const tById = Object.fromEntries(tasks.tasks.map((t) => [t.id, t]));
  const rows = metrics.rows.map((m) => {
    const t = tById[m.task];
    const ph = score[m.runId]?.phases ?? {};
    const pm = ph.main?.probes?.[t.probe];
    const pf = ph.followup?.probes?.[t.followUp.probe];
    const run = runs[m.runId];
    return {
      ...m,
      credits: run?.cost?.providerCredits ?? null,
      listUsd: run?.cost?.listUsd ?? null,
      mainChecks: pm ? `${pm.passed}/${pm.total}` : `0/${t.probe ? "?" : 0}`,
      mainPassed: pm?.passed ?? 0,
      mainTotal: pm?.total ?? null,
      followChecks: pf ? `${pf.passed}/${pf.total}` : "0/?",
      followPassed: pf?.passed ?? 0,
      checksPassed: (pm?.passed ?? 0) + (pf?.passed ?? 0),
      visual: vis[m.runId] ?? null,
      checklist: checklist[m.runId] ?? null
    };
  });
  const valid = rows.filter((x) => x.valid);
  const summarise = (rs) => ({
    runs: rs.length,
    turns: stat(rs.map((x) => x.turns)),
    turnsMain: stat(rs.map((x) => x.turnsMain)),
    tokensMain: stat(rs.map((x) => x.tokensMain)),
    tokensIn: stat(rs.map((x) => x.tokensIn)),
    tokensOut: stat(rs.map((x) => x.tokensOut)),
    wallSec: stat(rs.map((x) => x.wallSec)),
    listUsd: stat(rs.map((x) => x.listUsd)),
    credits: stat(rs.map((x) => x.credits)),
    mainChecksFraction: stat(rs.map((x) => x.functionalMain)),
    followChecksFraction: stat(rs.map((x) => x.functionalFollowUp)),
    mainAllPass: rs.length ? rs.filter((x) => x.functionalMainAll).length / rs.length : null,
    followAllPass: rs.length ? rs.filter((x) => x.functionalFollowUpAll).length / rs.length : null,
    visual: stat(rs.map((x) => x.visual)),
    checklist: stat(rs.map((x) => x.checklist)),
    totalUsd: r(rs.reduce((a, x) => a + (x.listUsd ?? 0), 0)),
    totalCredits: r(rs.reduce((a, x) => a + (x.credits ?? 0), 0), 1)
  });
  const arms = Object.fromEntries(ARMS.map((a) => [a, summarise(valid.filter((x) => x.arm === a))]));
  const perTask = Object.fromEntries(tasks.tasks.map((t) => [t.id, Object.fromEntries(ARMS.map((a) => [a, summarise(valid.filter((x) => x.arm === a && x.task === t.id))]))]));
  const judgeUsd = judge.judgeCost?.listUsd ?? 0;
  const judgeCredits = judge.judgeCost?.providerCredits ?? 0;
  const [extraUsd, extraCredits] = String(opt("--extra-spend", "0,0")).split(",").map(Number);
  const spend = {
    runsUsd: r(valid.concat(rows.filter((x) => !x.valid)).reduce((a, x) => a + (x.listUsd ?? 0), 0)),
    runsCredits: r(rows.reduce((a, x) => a + (x.credits ?? 0), 0), 1),
    judgeUsd: r(judgeUsd),
    judgeCredits: r(judgeCredits, 1),
    preflightUsd: extraUsd,
    preflightCredits: extraCredits
  };
  spend.totalUsd = r(spend.runsUsd + spend.judgeUsd + extraUsd);
  spend.totalCredits = r(spend.runsCredits + spend.judgeCredits + extraCredits, 1);

  const headline = { schema: "aura3d.agent-eval.c1-headline/1", batch, version, generatedAt: new Date().toISOString(), model: "claude-sonnet-5.5 via Kiro Prism /v1/messages", costBasis: "list price on provider token split; Prism returned no cache fields (all input uncached) and bills Kiro credits with no defined USD rate", arms, perTask, visualPairs: metrics.visual, decision: metrics.decision, bench505: B505, spend };
  writeFileSync(join(batchDir, "c1-headline.json"), JSON.stringify(headline, null, 2));

  // Markdown.
  const f = (v, d = 0) => (v == null ? "-" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const k = (v) => (v == null ? "-" : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : `${Math.round(v / 1000)}K`);
  const pct = (v) => (v == null ? "-" : `${Math.round(v * 100)}%`);
  const mr = (s, fmt = f, d = 0) => (s.median == null ? "-" : `${fmt(s.median, d)} (${fmt(s.min, d)}-${fmt(s.max, d)})`);
  const L = [];
  L.push(`## Headline: medians (min-max) per arm, ${valid.length} valid runs of ${rows.length}`, "");
  L.push("Every valid run counts, including capped and failed ones. Turns, tokens, wall time and cost cover the task plus the follow-up edit. Cost is list price (`claude-sonnet-5.5`: $2/M input, $10/M output) because Prism reports Kiro credits, not USD, and returned no cache fields, so every input token is priced uncached. Functional = scripted probe checks on the real-GPU build (main / follow-up), shown as the median fraction passed and the share of runs passing every check. Visual = mean blind-rubric score (1-5, five dimensions) a run received over all its judge calls. Checklist = share of the task checklist items the source judge marked as met.", "");
  L.push("| arm | turns | input tokens | output tokens | wall s | list $ | Kiro credits | main checks passed | main all-pass | follow-up checks passed | follow-up all-pass | visual score (1-5) | checklist |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const a of ARMS) {
    const s = arms[a];
    L.push(`| ${a} | ${mr(s.turns)} | ${mr(s.tokensIn, k)} | ${mr(s.tokensOut, k)} | ${mr(s.wallSec)} | ${mr(s.listUsd, f, 2)} | ${mr(s.credits, f, 1)} | ${mr(s.mainChecksFraction, pct)} | ${pct(s.mainAllPass)} | ${mr(s.followChecksFraction, pct)} | ${pct(s.followAllPass)} | ${mr(s.visual, f, 2)} | ${mr(s.checklist, pct)} |`);
  }
  L.push("", "Blind visual pairs (main-phase frames, majority of 3 calls, ties count half):", "", "| pairing | wins | losses | ties | no frame | win rate | Wilson 95% |", "|---|---|---|---|---|---|---|");
  for (const [p, s] of Object.entries(metrics.visual)) L.push(`| ${p} | ${s.wins} | ${s.losses} | ${s.ties} | ${s.noFrame} | ${pct(s.winRate)} | ${s.wilson ? `${pct(s.wilson[0])}-${pct(s.wilson[1])}` : "-"} |`);
  L.push("", "## Against benchmark 505 (task phase only; 505 had no follow-up)", "");
  L.push("| measure | 505 docs | 505 cheat sheet | 505 three.js | C1 aura | C1 three | C1 bridge |", "|---|---|---|---|---|---|---|");
  L.push(`| median turns, task phase | 25 | 14 | 5 | ${f(arms.aura.turnsMain.median)} | ${f(arms.three.turnsMain.median)} | ${f(arms.bridge.turnsMain.median)} |`);
  L.push(`| median tokens (in+out), task phase | 1.45M | 420K | 63K | ${k(arms.aura.tokensMain.median)} | ${k(arms.three.tokensMain.median)} | ${k(arms.bridge.tokensMain.median)} |`);
  const rel = (a, b) => (a == null || !b ? "-" : `${a / b >= 1 ? "+" : ""}${Math.round((a / b - 1) * 100)}%`);
  L.push("", `aura vs 505 docs: turns ${rel(arms.aura.turnsMain.median, 25)}, tokens ${rel(arms.aura.tokensMain.median, 1450000)}; aura vs 505 cheat sheet: turns ${rel(arms.aura.turnsMain.median, 14)}, tokens ${rel(arms.aura.tokensMain.median, 420000)}; three vs 505 three.js: turns ${rel(arms.three.turnsMain.median, 5)}, tokens ${rel(arms.three.tokensMain.median, 63000)}. The 505 figures are medians over all 24 of its tasks; the per-task 505 turn medians for these 8 tasks are in the batch section below.`);
  L.push("", "## Bridge decision rule (SPEC section 8, thresholds in report.mjs)", "", `**Verdict: ${metrics.decision.verdict}.**`, "");
  L.push("| scope | bridge wall time vs aura | bridge cost vs aura | bridge-vs-aura blind win rate | main all-pass delta (bridge - aura) | rule met |", "|---|---|---|---|---|---|");
  for (const [name, d] of [["all 8 tasks", metrics.decision.all], [`asset tasks (${metrics.decision.assets.tasks.join(", ")})`, metrics.decision.assets]]) {
    const g = (x) => (x == null ? "-" : `${x >= 0 ? "-" : "+"}${Math.abs(Math.round(x * 100))}%`);
    L.push(`| ${name} | ${g(d.detail.timeGain)} | ${g(d.detail.costGain)} | ${pct(d.detail.bridgeVsAuraWinRate)} | ${d.detail.correctnessDelta == null ? "-" : `${Math.round(d.detail.correctnessDelta * 100)} pts`} | ${d.verdict.startsWith("keep") ? "yes" : "no"} |`);
  }
  L.push("", "(Negative = bridge lower than aura.)", "", "## Per task: medians per arm", "");
  L.push("| task | arm | turns (task+fu) | input tokens | output tokens | wall s | list $ | main checks | follow-up checks | main all-pass | visual | checklist |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const t of tasks.tasks) {
    for (const a of ARMS) {
      const rs = valid.filter((x) => x.arm === a && x.task === t.id);
      const s = perTask[t.id][a];
      if (!rs.length) continue;
      L.push(`| ${t.id} ${t.slug} | ${a} | ${f(s.turns.median)} | ${k(s.tokensIn.median)} | ${k(s.tokensOut.median)} | ${f(s.wallSec.median)} | ${f(s.listUsd.median, 2)} | ${rs.map((x) => x.mainChecks).join(", ")} | ${rs.map((x) => x.followChecks).join(", ")} | ${rs.filter((x) => x.functionalMainAll).length}/${rs.length} | ${f(s.visual.median, 2)} | ${pct(s.checklist.median)} |`);
    }
  }
  L.push("", "## Spend", "", `| item | list $ | Kiro credits |`, "|---|---|---|", `| 72 agent runs | ${f(spend.runsUsd, 2)} | ${f(spend.runsCredits, 1)} |`, `| judges (visual pairs + checklist) | ${f(spend.judgeUsd, 2)} | ${f(spend.judgeCredits, 1)} |`, `| preflight (image check + smoke run) | ${f(extraUsd, 2)} | ${f(extraCredits, 1)} |`, `| **total** | **${f(spend.totalUsd, 2)}** | **${f(spend.totalCredits, 1)}** |`);
  const md = L.join("\n");
  writeFileSync(join(batchDir, "c1-headline.md"), `${md}\n`);

  // evidence/vs-threejs: the public-number source (docs/agents/claims-and-boundaries.md).
  const evDir = join(REPO, "evidence/vs-threejs", `agent-authoring-c1-${version}`);
  mkdirSync(evDir, { recursive: true });
  writeFileSync(join(evDir, "results.json"), JSON.stringify({ ...headline, source: `evidence/agent-eval-c1/${batch}/`, report: "tests/reports/benchmark-c1/REPORT.md" }, null, 2));
  const ev = [
    `# Aura3D ${version} vs three.js 0.185.1: agent authoring (benchmark C1)`,
    "",
    `Generated ${headline.generatedAt} from \`agent-authoring-c1-${version}/results.json\` (batch \`evidence/agent-eval-c1/${batch}/\`). Method: \`tests/reports/benchmark-c1/SPEC.md\` (frozen before any run); full report: \`tests/reports/benchmark-c1/REPORT.md\`.`,
    "",
    `**Read this first.** One model (\`claude-sonnet-5.5\` through Kiro Prism), 8 fixed tasks x 3 runs x 3 arms, each run a task plus one follow-up edit, no shell or network. \`aura\` = Aura3D ${version} from npm with its docs and CLI agent tools; \`three\` = three.js 0.185.1 with no docs (as in benchmark 505); \`bridge\` = three.js content imported with \`aura3d import-three\` plus native Aura3D behaviour. Frames and fps are from headless Chrome on an Apple M-series GPU (ANGLE Metal), not a CI runner. Cost is list price on the token split (Prism reports Kiro credits only and no cache fields). Three runs per task is a small sample; ranges are given beside medians. These are agent-effort and correctness numbers for these tasks, not engine performance numbers.`,
    "",
    md.replace(/^## /gm, "### ")
  ].join("\n");
  writeFileSync(join(REPO, "evidence/vs-threejs", `RESULTS-agent-authoring-c1-${version}.md`), `${ev}\n`);

  if (rest.includes("--report")) {
    const notes = opt("--notes", null);
    const batchReport = readFileSync(join(batchDir, "REPORT.md"), "utf8").replace(/^# .*\n/, "").replace(/^## /gm, "### ");
    const out = [
      `# Benchmark C1 report: Aura3D ${version} (npm) vs three.js vs three.js + bridge`,
      "",
      `Batch \`${batch}\`, run 2026-11-09/10 on \`exp/551-c1bench\`. Spec: [\`SPEC.md\`](SPEC.md) (frozen; tasks, rubric and thresholds unchanged). Evidence: \`evidence/agent-eval-c1/${batch}/\` (run.json, transcripts, snapshots, frames, c1-score.json, c1-judge.json, c1-metrics.json, c1-headline.json). Public numbers: \`evidence/vs-threejs/RESULTS-agent-authoring-c1-${version}.md\`.`,
      "",
      md,
      "",
      notes ? readFileSync(notes, "utf8").trim() : "",
      "",
      "## Batch report (report.mjs output)",
      "",
      batchReport.trim(),
      ""
    ].join("\n");
    writeFileSync(join(REPO, "tests/reports/benchmark-c1/REPORT.md"), out);
  }
  console.log(JSON.stringify(spend));
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
