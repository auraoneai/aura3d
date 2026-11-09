#!/usr/bin/env node
// C1 report: merges run.json (agent cost, time, turns), c1-score.json (build, size, load, fps, functional probes) and
// c1-judge.json (blind visual pairs) into <batch>/c1-metrics.json and <batch>/REPORT.md, and evaluates the bridge
// decision rule from docs/project/future-engine-work.md section 4.
//   node tools/agent-eval/c1/report.mjs <batch>
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { median } from "../lib/metrics.mjs";
import { C1_DIR, loadTasks } from "./run-c1.mjs";

const REPO = resolve(C1_DIR, "..", "..", "..");
const ARMS = ["aura", "three", "bridge"];

const fraction = (p) => (p && p.total ? p.passed / p.total : 0);
const sec = (ms) => (ms == null ? null : Math.round(ms / 100) / 10);

/** One flat row per run. Missing score data stays null (never counted as a pass). */
export function runMetrics(run, score, task) {
  const main = score?.phases?.main ?? {};
  const fu = score?.phases?.followup ?? {};
  const pMain = main.probes?.[task.probe];
  const pFollow = fu.probes?.[task.followUp.probe];
  const pRegress = fu.probes?.[task.probe];
  const ph = Object.fromEntries((run.phases ?? []).map((p) => [p.name, p]));
  const rendered = (x) => Boolean(x.build?.ok && x.ready && !x.blank && !(x.pageErrors?.length > 0));
  return {
    runId: run.runId,
    arm: run.arm,
    task: run.task,
    idx: run.idx,
    valid: !run.invalid,
    invalidReason: run.invalidReason ?? null,
    mainEnd: run.endReason ?? null,
    followUpEnd: run.followUpEndReason ?? null,
    mainFinished: run.endReason === "finished",
    mainCapped: run.endReason === "max_turns",
    followUpFinished: run.followUpEndReason === "finished",
    followUpCapped: run.followUpEndReason === "max_turns",
    turnsMain: ph.main?.turns ?? null,
    tokensMain: ph.main ? (ph.main.input ?? 0) + (ph.main.output ?? 0) : null,
    turnsFollowUp: ph.followup?.turns ?? null,
    turns: run.usage?.turns ?? null,
    wallSec: sec(run.wallMs),
    toolSec: sec(run.usage?.toolMs),
    modelSec: sec(run.usage?.modelMs),
    tokensIn: run.usage?.input ?? null,
    tokensOut: run.usage?.output ?? null,
    cacheRead: run.usage?.cacheRead ?? null,
    cacheWrite: run.usage?.cacheWrite ?? null,
    cachedShare: run.usage?.input ? Math.round((run.usage.cacheRead / run.usage.input) * 1000) / 1000 : null,
    billedUsd: run.cost?.billedUsd ?? null,
    billedUsdFollowUp: ph.followup?.cost?.billedUsd ?? null,
    costSource: run.cost?.source ?? null,
    bridgeExports: run.bridgeExports?.length ?? 0,
    bridgeFailures: (run.bridgeExports ?? []).filter((b) => !b.pass).length,
    cliCalls: run.cliCalls?.length ?? 0,
    renderCalls: (run.cliCalls ?? []).filter((c) => c.command === "render").length,
    buildMain: main.build?.ok ?? null,
    renderMain: score ? rendered(main) : null,
    buildFollowUp: fu.build?.ok ?? null,
    functionalMain: pMain ? fraction(pMain) : score ? 0 : null,
    functionalMainAll: pMain ? pMain.passed === pMain.total && pMain.total > 0 : score ? false : null,
    functionalFollowUp: pFollow ? fraction(pFollow) : score ? 0 : null,
    functionalFollowUpAll: pFollow ? pFollow.passed === pFollow.total && pFollow.total > 0 : score ? false : null,
    regressedMain: pMain && pRegress ? pRegress.passed < pMain.passed : null,
    jsGzipKB: main.size?.jsGzipKB ?? null,
    totalKB: main.size?.totalKB ?? null,
    assetKB: main.size?.assetKB ?? null,
    loadedKB: main.loaded?.totalKB ?? null,
    loadMs: main.loadMs ?? null,
    fps: main.fps ?? null,
    p95FrameMs: main.p95FrameMs ?? null,
    pageErrors: main.pageErrors?.length ?? null,
    probeErrors: [pMain?.error, pFollow?.error].filter(Boolean)
  };
}

/** Wilson 95% interval for k of n. */
export function wilson(k, n) {
  if (!n) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.round((c - h) * 1000) / 1000, Math.round((c + h) * 1000) / 1000];
}

export function armSummary(rows) {
  const valid = rows.filter((r) => r.valid);
  const m = (k) => median(valid.map((r) => r[k]));
  const range = (k) => {
    const v = valid.map((r) => r[k]).filter((x) => typeof x === "number");
    return v.length ? [Math.min(...v), Math.max(...v)] : null;
  };
  const rate = (k) => (valid.length ? valid.filter((r) => r[k] === true).length / valid.length : null);
  return {
    runs: rows.length,
    valid: valid.length,
    invalid: rows.length - valid.length,
    mainFinished: rate("mainFinished"),
    mainCapped: valid.filter((r) => r.mainCapped).length,
    followUpFinished: rate("followUpFinished"),
    followUpCapped: valid.filter((r) => r.followUpCapped).length,
    renderMain: rate("renderMain"),
    functionalMainAll: rate("functionalMainAll"),
    functionalMainMean: valid.length ? valid.reduce((a, r) => a + (r.functionalMain ?? 0), 0) / valid.length : null,
    functionalFollowUpAll: rate("functionalFollowUpAll"),
    regressions: valid.filter((r) => r.regressedMain === true).length,
    turnsMedian: m("turns"),
    turnsMainMedian: m("turnsMain"),
    turnsFollowUpMedian: m("turnsFollowUp"),
    tokensMainMedian: m("tokensMain"),
    cliCallsMedian: m("cliCalls"),
    renderCallsMedian: m("renderCalls"),
    ranges: Object.fromEntries(["turns", "turnsMain", "tokensIn", "tokensOut", "tokensMain", "wallSec", "toolSec", "billedUsd"].map((k) => [k, range(k)])),
    wallSecMedian: m("wallSec"),
    toolSecMedian: m("toolSec"),
    tokensInMedian: m("tokensIn"),
    tokensOutMedian: m("tokensOut"),
    cachedShareMedian: m("cachedShare"),
    billedUsdMedian: m("billedUsd"),
    billedUsdTotal: Math.round(valid.reduce((a, r) => a + (r.billedUsd ?? 0), 0) * 10000) / 10000,
    costSources: [...new Set(valid.map((r) => r.costSource))],
    jsGzipKBMedian: m("jsGzipKB"),
    totalKBMedian: m("totalKB"),
    loadedKBMedian: m("loadedKB"),
    loadMsMedian: m("loadMs"),
    fpsMedian: m("fps")
  };
}

export function visualSummary(pairs) {
  const out = {};
  for (const p of pairs) {
    const [x, , y] = p.pairing.split("-");
    const s = (out[p.pairing] ??= { subject: x, opponent: y, wins: 0, losses: 0, ties: 0, noFrame: 0, unanimousWins: 0 });
    if (!p.winner) s.noFrame += 1;
    else if (p.winner === "tie") s.ties += 1;
    else if (p.winner === x) {
      s.wins += 1;
      if (p.unanimous) s.unanimousWins += 1;
    } else s.losses += 1;
  }
  for (const s of Object.values(out)) {
    const n = s.wins + s.losses + s.ties;
    s.winRate = n ? Math.round(((s.wins + s.ties / 2) / n) * 1000) / 1000 : null;
    s.wilson = wilson(s.wins + s.ties / 2, n);
  }
  return out;
}

/**
 * Bridge decision rule: keep the bridge if it is about 25% lower in time or cost at comparable quality and correctness,
 * or clearly better in quality at comparable time and cost, against native Aura3D on the same version.
 * Comparable quality = bridge-vs-aura blind win rate 0.4..0.6; clearly better = >= 0.65. Comparable correctness = full
 * functional pass rates within 0.10. Comparable time/cost = within 10%. Thresholds are fixed here, before results.
 */
export function bridgeDecision(arms, visual) {
  const a = arms.aura;
  const b = arms.bridge;
  const v = visual["bridge-vs-aura"];
  if (!a?.valid || !b?.valid || !v || v.winRate == null) return { verdict: "insufficient data", detail: {} };
  const rel = (x, y) => (x != null && y ? (y - x) / y : null);
  const timeGain = rel(b.wallSecMedian, a.wallSecMedian);
  const costGain = rel(b.billedUsdMedian, a.billedUsdMedian);
  const corrDelta = (b.functionalMainAll ?? 0) - (a.functionalMainAll ?? 0);
  const comparableQuality = v.winRate >= 0.4 && v.winRate <= 0.6;
  const clearlyBetter = v.winRate >= 0.65;
  const comparableCorrect = Math.abs(corrDelta) <= 0.1 || corrDelta > 0;
  const cheaperOrFaster = (timeGain ?? -1) >= 0.25 || (costGain ?? -1) >= 0.25;
  const comparableTimeCost = (timeGain ?? -1) >= -0.1 && (costGain ?? -1) >= -0.1;
  let verdict = "native stays the default (bridge does not meet the rule)";
  if (cheaperOrFaster && (comparableQuality || clearlyBetter) && comparableCorrect) verdict = "keep bridge: >=25% lower time or cost at comparable quality and correctness";
  else if (clearlyBetter && comparableTimeCost && comparableCorrect) verdict = "keep bridge: clearly better quality at comparable time and cost";
  return { verdict, detail: { timeGain, costGain, bridgeVsAuraWinRate: v.winRate, correctnessDelta: corrDelta, comparableQuality, clearlyBetter, comparableCorrect } };
}

/**
 * The rule on all tasks and on the procedural-asset tasks (`assetHeavy` in tasks.json). Passing only on the asset subset
 * means "support the bridge for assets only" (plan section 4).
 */
export function decideBridge({ rows, pairs, tasks }) {
  const assetIds = new Set(tasks.tasks.filter((t) => t.assetHeavy).map((t) => t.id));
  const on = (keep) => {
    const sub = rows.filter((r) => keep(r.task));
    const arms = Object.fromEntries(["aura", "bridge"].map((arm) => [arm, sub.some((r) => r.arm === arm) ? armSummary(sub.filter((r) => r.arm === arm)) : null]));
    return bridgeDecision(arms, visualSummary(pairs.filter((p) => keep(p.task))));
  };
  const all = on(() => true);
  const assets = on((id) => assetIds.has(id));
  const keeps = (d) => d.verdict.startsWith("keep bridge");
  let verdict = all.verdict;
  if (!keeps(all) && keeps(assets)) verdict = "support the bridge for assets only (the rule passes on the procedural-asset tasks, not overall)";
  return { verdict, all, assets: { tasks: [...assetIds], ...assets } };
}

const fmt = (v, d = 2) => (v == null ? "-" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : String(v));
const pct = (v) => (v == null ? "-" : `${Math.round(v * 100)}%`);

export function renderReport({ batch, tasks, rows, arms, visual, decision, judge, stub }) {
  const L = [];
  L.push(`# C1 fixed comparison: ${batch}`, "");
  if (stub) L.push("**DRY RUN with the stub model.** Agent output, tokens and cost are synthetic (scripted solutions, made-up usage); build, real-GPU load/fps, frames and functional probes are real measurements of the stub solutions. The visual judge is a frame-statistics stand-in. No number here says anything about Aura3D versus three.js.", "");
  L.push(`Tasks (frozen ${tasks.frozenAt}, before results): ${tasks.tasks.map((t) => `${t.id} ${t.slug} (${t.category})`).join(", ")}. Runs per arm per task: ${tasks.runsPerArm}. Turn caps: task ${tasks.mainTurnCap}, follow-up ${tasks.followUpTurnCap}.`, "");
  L.push("## Per arm", "");
  L.push("| arm | runs (valid) | finished task | capped | follow-up finished | renders | functional all pass (mean) | follow-up all pass | regressions | turns median (task + follow-up) | wall s median | tool s median | tokens in median (cached share) | tokens out median | billed $ median | billed $ total | cost source | emitted JS gzip KB | fetched at load KB | load ms | fps |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const arm of ARMS) {
    const s = arms[arm];
    if (!s) continue;
    L.push(`| ${arm} | ${s.runs} (${s.valid}) | ${pct(s.mainFinished)} | ${s.mainCapped} | ${pct(s.followUpFinished)} | ${pct(s.renderMain)} | ${pct(s.functionalMainAll)} (${pct(s.functionalMainMean)}) | ${pct(s.functionalFollowUpAll)} | ${s.regressions} | ${fmt(s.turnsMedian)} (${fmt(s.turnsMainMedian)} + ${fmt(s.turnsFollowUpMedian)}) | ${fmt(s.wallSecMedian, 1)} | ${fmt(s.toolSecMedian, 1)} | ${fmt(s.tokensInMedian)} (${pct(s.cachedShareMedian)}) | ${fmt(s.tokensOutMedian)} | ${fmt(s.billedUsdMedian, 4)} | ${fmt(s.billedUsdTotal, 4)} | ${s.costSources.join(", ")} | ${fmt(s.jsGzipKBMedian, 1)} | ${fmt(s.loadedKBMedian, 1)} | ${fmt(s.loadMsMedian)} | ${fmt(s.fpsMedian, 1)} |`);
  }
  L.push("", "## Blind visual pairs (main phase, majority of judge calls)", "");
  L.push(`Judge: ${judge?.judge ?? "not run"}; calls per pair: ${judge?.callsPerPair ?? "-"}; judge cost: ${judge?.judgeCost?.billedUsd != null ? `$${judge.judgeCost.billedUsd} (${judge.judgeCost.source})` : "-"}.`, "");
  L.push("| pairing | subject wins | losses | ties | no-frame | win rate (ties half) | Wilson 95% |", "|---|---|---|---|---|---|---|");
  for (const [k, s] of Object.entries(visual)) L.push(`| ${k} | ${s.wins} | ${s.losses} | ${s.ties} | ${s.noFrame} | ${pct(s.winRate)} | ${s.wilson ? `${pct(s.wilson[0])}-${pct(s.wilson[1])}` : "-"} |`);
  L.push("", "## Ranges per arm (min-max over valid runs)", "", "| arm | turns | task turns | task tokens (in+out) | tokens in | tokens out | wall s | tool s | billed $ | aura3d CLI calls median (renders) |", "|---|---|---|---|---|---|---|---|---|---|");
  const rg = (x, d = 0) => (x ? `${fmt(x[0], d)}-${fmt(x[1], d)}` : "-");
  for (const arm of ARMS) {
    const s = arms[arm];
    if (s) L.push(`| ${arm} | ${rg(s.ranges.turns)} | ${rg(s.ranges.turnsMain)} | ${rg(s.ranges.tokensMain)} | ${rg(s.ranges.tokensIn)} | ${rg(s.ranges.tokensOut)} | ${rg(s.ranges.wallSec, 1)} | ${rg(s.ranges.toolSec, 1)} | ${rg(s.ranges.billedUsd, 4)} | ${fmt(s.cliCallsMedian)} (${fmt(s.renderCallsMedian)}) |`);
  }
  L.push("", "## Against benchmark 505 (task phase only; 505 had no follow-up)", "");
  L.push("505 medians over all 24 tasks: turns 25 docs / 14 cheat sheet / 5 three.js; tokens 1.45M / 420K / 63K.", "");
  L.push(`C1 task-phase medians: ${ARMS.filter((a) => arms[a]).map((a) => `${a} ${fmt(arms[a].turnsMainMedian)} turns, ${fmt(arms[a].tokensMainMedian)} tokens`).join("; ")}.`, "");
  L.push("| task | 505 docs | 505 cheat sheet | 505 three.js | C1 aura | C1 three | C1 bridge |", "|---|---|---|---|---|---|---|");
  for (const t of tasks.tasks) {
    const b = t.bench505?.medianTurns ?? {};
    const c = (arm) => fmt(median(rows.filter((r) => r.task === t.id && r.arm === arm && r.valid).map((r) => r.turnsMain)));
    L.push(`| ${t.id} ${t.slug} | ${fmt(b.aura)} | ${fmt(b.auraSheet)} | ${fmt(b.three)} | ${c("aura")} | ${c("three")} | ${c("bridge")} |`);
  }
  L.push("", "## Bridge decision rule", "", `Verdict: **${decision.verdict}**${stub ? " (meaningless on a dry run)" : ""}.`, "", "All tasks and the procedural-asset subset:", "", "```json", JSON.stringify({ all: decision.all, assets: decision.assets }, null, 1), "```", "");
  L.push("## Per task", "", "| task | arm | finished | functional | follow-up | turns median | billed $ median | load ms | fps |", "|---|---|---|---|---|---|---|---|---|");
  for (const t of tasks.tasks) {
    for (const arm of ARMS) {
      const rs = rows.filter((r) => r.task === t.id && r.arm === arm && r.valid);
      if (!rs.length) continue;
      const k = (f) => rs.filter((r) => r[f] === true).length;
      L.push(`| ${t.id} ${t.slug} | ${arm} | ${k("mainFinished")}/${rs.length} | ${k("functionalMainAll")}/${rs.length} | ${k("functionalFollowUpAll")}/${rs.length} | ${fmt(median(rs.map((r) => r.turns)))} | ${fmt(median(rs.map((r) => r.billedUsd)), 4)} | ${fmt(median(rs.map((r) => r.loadMs)))} | ${fmt(median(rs.map((r) => r.fps)), 1)} |`);
    }
  }
  const failures = rows.filter((r) => !r.valid || r.mainCapped || r.followUpCapped || r.buildMain === false || r.probeErrors.length || r.pageErrors > 0);
  L.push("", "## Failed, capped and errored runs", "");
  if (!failures.length) L.push("None.");
  for (const r of failures) L.push(`- ${r.runId}: ${[!r.valid && `invalid (${r.invalidReason})`, r.mainCapped && "task hit turn cap", r.followUpCapped && "follow-up hit turn cap", r.buildMain === false && "main build failed", r.pageErrors > 0 && `${r.pageErrors} page errors`, ...r.probeErrors.map((e) => `probe error: ${e}`)].filter(Boolean).join("; ")}`);
  L.push("", "Definitions: finished = the agent called finish before the cap; functional all pass = every scripted probe check for the requested interactions passed on the real-GPU build; regression = the follow-up build passes fewer main-probe checks than the main build; billed $ = provider-reported cost when present, otherwise list price on the provider token split (see cost source). Tool time = time inside tool calls (typecheck, aura3d CLI incl. render builds, bridge import, file I/O); wall = whole agent session incl. model latency.");
  return `${L.join("\n")}\n`;
}

function main(argv) {
  const [batch] = argv;
  if (!batch) throw new Error("usage: report.mjs <batch>");
  const batchDir = resolve(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval-c1", batch);
  const tasks = loadTasks();
  const byId = Object.fromEntries(tasks.tasks.map((t) => [t.id, t]));
  const score = existsSync(join(batchDir, "c1-score.json")) ? JSON.parse(readFileSync(join(batchDir, "c1-score.json"), "utf8")) : {};
  const judge = existsSync(join(batchDir, "c1-judge.json")) ? JSON.parse(readFileSync(join(batchDir, "c1-judge.json"), "utf8")) : null;
  const runs = readdirSync(join(batchDir, "runs")).filter((id) => existsSync(join(batchDir, "runs", id, "run.json"))).map((id) => JSON.parse(readFileSync(join(batchDir, "runs", id, "run.json"), "utf8")));
  const rows = runs.map((r) => runMetrics(r, score[r.runId], byId[r.task]));
  const arms = Object.fromEntries(ARMS.map((arm) => [arm, rows.some((r) => r.arm === arm) ? armSummary(rows.filter((r) => r.arm === arm)) : null]).filter(([, v]) => v));
  const visual = visualSummary(judge?.pairs ?? []);
  const decision = decideBridge({ rows, pairs: judge?.pairs ?? [], tasks });
  const stub = runs.some((r) => r.stub);
  writeFileSync(join(batchDir, "c1-metrics.json"), JSON.stringify({ batch, stub, arms, visual, decision, rows }, null, 2));
  writeFileSync(join(batchDir, "REPORT.md"), renderReport({ batch, tasks, rows, arms, visual, decision, judge, stub }));
  console.log("wrote", join(batchDir, "REPORT.md"));
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
