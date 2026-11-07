#!/usr/bin/env node
// Turn-gap experiment tables. Reads run.json (and metrics.json when scored) per condition batch.
//   node tools/agent-eval/report-504.mjs  -> evidence/agent-eval-504/tables.md
// Conditions: baseline = docs503 aura runs (and b504-base reruns for tasks 2,8); A cheat sheet; B aura_lookup; C A+B; D batching hint.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..");
const EV504 = join(REPO, "evidence/agent-eval-504");
const EV503 = join(REPO, "evidence/agent-eval/docs503");
const TASKS = [2, 5, 8, 9];
const ALL_TASKS = [1, 2, 3, 4, 5, 8, 9];

function loadBatch(dir, filter) {
  const runsDir = join(dir, "runs");
  if (!existsSync(runsDir)) return [];
  const metrics = existsSync(join(dir, "metrics.json")) ? new Map(JSON.parse(readFileSync(join(dir, "metrics.json"), "utf8")).map((m) => [m.runId, m])) : new Map();
  return readdirSync(runsDir)
    .sort()
    .map((name) => {
      const p = join(runsDir, name, "run.json");
      if (!existsSync(p)) return null;
      const run = JSON.parse(readFileSync(p, "utf8"));
      return { run, metric: metrics.get(name) };
    })
    .filter((x) => x && filter(x.run));
}

/** Cost with the repeated prefix at 10% price: new tokens 1.0, the previous turn's whole prompt 0.1. perTurn = input tokens per turn. */
export function cachedCost(perTurn) {
  let cost = 0;
  perTurn.forEach((n, i) => {
    cost += i === 0 ? n : Math.max(0, n - perTurn[i - 1]) + 0.1 * perTurn[i - 1];
  });
  return cost;
}
/** docs503 recorded only totals: assume the prompt grows linearly with turns (an estimate, labelled as such). */
export function linearPerTurn(total, turns) {
  const a = (2 * total) / (turns * (turns + 1));
  return Array.from({ length: turns }, (_, i) => a * (i + 1));
}

const med = (xs) => {
  const v = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const r = (x, d = 0) => (x == null ? "n/a" : String(Math.round(x * 10 ** d) / 10 ** d));
const range = (xs, d = 0) => (xs.length ? `${r(med(xs), d)} (${r(Math.min(...xs), d)}-${r(Math.max(...xs), d)})` : "n/a");
const count = (run, type) => (run.events ?? []).filter((e) => e.type === type).length;
const docReads = (run) => (run.events ?? []).filter((e) => e.type === "read" && /^(llms\.txt|AGENTS\.md|docs\/|\.agents\/)/.test(e.path)).length;
const typeReads = (run) => (run.events ?? []).filter((e) => e.type === "read" && e.path.startsWith("node_modules/")).length;

function summarize(entries) {
  const runs = entries.map((e) => e.run).filter((x) => !x.invalid);
  const turns = runs.map((x) => x.usage?.turns);
  const input = runs.map((x) => x.usage?.input);
  const cached = runs.map((x) => cachedCost(x.usage?.perTurnInput?.length ? x.usage.perTurnInput : linearPerTurn(x.usage.input, x.usage.turns)));
  const exact = runs.every((x) => x.usage?.perTurnInput?.length);
  const checklist = entries.map((e) => e.metric?.checklistPassFraction).filter((x) => x != null);
  return {
    n: runs.length,
    calls: range(runs.map((x) => (x.events ?? []).filter((e) => e.type !== "typecheck" && e.type !== "finish" && e.type !== "error").length)),
    turns: range(turns),
    medianTurns: med(turns),
    finish: `${runs.filter((x) => x.endReason === "finished").length}/${runs.length}`,
    tc: `${runs.filter((x) => x.firstTryTypecheck).length}/${runs.length}`,
    docs: range(runs.map(docReads)),
    typeReads: range(runs.map(typeReads)),
    search: range(runs.map((x) => count(x, "search") + count(x, "list"))),
    lookups: range(runs.map((x) => count(x, "lookup"))),
    input: `${r(med(input) / 1000)}K`,
    cached: `${r(med(cached) / 1000)}K${exact ? "" : "*"}`,
    checklist: checklist.length ? `${r(med(checklist), 2)} (${checklist.map((c) => r(c, 2)).join("/")})` : "not scored"
  };
}

const conditions = [
  ["baseline (docs503)", () => loadBatch(EV503, (x) => x.arm === "aura"), [1, 2, 3, 4, 5, 8, 9]],
  ["baseline rerun", () => loadBatch(join(EV504, "b504-base"), () => true), [2, 8]],
  ["three.js (docs503)", () => loadBatch(EV503, (x) => x.arm === "three"), [2, 5, 8, 9]],
  ["A v1 (uTime bug, superseded)", () => loadBatch(join(EV504, "b504-A-v1"), () => true), TASKS],
  ["C v1 (uTime bug, superseded)", () => loadBatch(join(EV504, "b504-C-v1"), () => true), TASKS],
  ["A cheat sheet", () => loadBatch(join(EV504, "b504-A"), () => true), TASKS],
  ["B aura_lookup", () => loadBatch(join(EV504, "b504-B"), () => true), TASKS],
  ["C A+B", () => loadBatch(join(EV504, "b504-C"), () => true), TASKS],
  ["holdout A v1/v2 sheet (tasks 1,3,4)", () => loadBatch(join(EV504, "b504-A-v1"), () => true), [1, 3, 4]],
  ["D batching hint", () => loadBatch(join(EV504, "b504-D"), () => true), TASKS]
];
const lines = [
  "| task | condition | n | turns median (range) | finished | first-try tsc | doc reads | node_modules reads | search+list | lookups | input tokens (median) | est. cached-cost tokens | checklist median (runs) |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|"
];
const perCond = {};
for (const task of ALL_TASKS) {
  for (const [label, load, tasks] of conditions) {
    if (!tasks.includes(task)) continue;
    const entries = load().filter((e) => e.run.task === task);
    if (!entries.length) continue;
    const s = summarize(entries);
    (perCond[label] ??= []).push(...entries);
    lines.push(`| ${task} | ${label} | ${s.n} | ${s.turns} | ${s.finish} | ${s.tc} | ${s.docs} | ${s.typeReads} | ${s.search} | ${s.lookups} | ${s.input} | ${s.cached} | ${s.checklist} |`);
  }
}
lines.push("", "All tasks pooled (per condition):", "", "| condition | n | turns median (range) | finished | first-try tsc | doc reads | search+list | input (median) | est. cached | checklist |", "|---|---|---|---|---|---|---|---|---|---|");
for (const [label] of conditions) {
  const entries = perCond[label];
  if (!entries?.length) continue;
  const s = summarize(entries);
  lines.push(`| ${label} | ${s.n} | ${s.turns} | ${s.finish} | ${s.tc} | ${s.docs} | ${s.search} | ${s.input} | ${s.cached} | ${s.checklist} |`);
}
lines.push("", "`*` cached-cost for docs503 rows assumes linear prompt growth (only totals were recorded); rows from this experiment use the exact per-turn prompt sizes. Cached cost = new tokens at 1.0 + previous turn's prompt at 0.1.");
writeFileSync(join(EV504, "tables.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
