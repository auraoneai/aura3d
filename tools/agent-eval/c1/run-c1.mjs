#!/usr/bin/env node
// C1 fixed comparison runner: 8 frozen tasks (c1/tasks.json) x arms aura | three | bridge x N runs, each run = the task
// (40-turn cap) followed by one predefined follow-up edit in the same conversation (15-turn cap).
//   node tools/agent-eval/c1/run-c1.mjs --arm all|aura|three|bridge[,..] --task all|101[,..] --runs 3 --batch NAME
//        [--idx N] [--seed S] [--concurrency C] [--model ID] [--condition base|..] [--docs-ref GITREF] [--aura-tarballs DIR]
//        [--stub] [--estimate] [--only RUNID,..] [--score]
// One arm/task/replicate: --arm aura --task 109 --idx 2 --score (runs <batch>-t109-aura-r2, then scores it).
// --stub drives everything with the scripted stub model (no Prism traffic, no cost). --estimate prints the planned spend.
// --score runs c1/score.mjs (build, real-GPU load/fps/frames over loopback CDP, functional probes) on the runs just made.
// Then c1/judge.mjs (blind pairs, needs all arms of a task/replicate) and c1/report.mjs per batch.
import { spawnSync } from "node:child_process";
import { constants as fsConstants, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { ensureBase } from "../lib/base.mjs";
import { runAgent } from "../lib/loop.mjs";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "../lib/prism.mjs";
import { assertNoRepoSourceLeak, buildSandbox, C1_ARMS, docsCommit, exportDocs, writeSnapshot } from "../lib/sandbox.mjs";
import { createToolbox } from "../lib/tools.mjs";
import { CONDITIONS, buildPlan } from "../run.mjs";
import { BRIDGE_GUIDE, FACTORY_RE, IMPORT_THREE_TOOL, createImportThreeHandler } from "./bridge.mjs";
import { AURA3D_TOOL, createAura3dHandler } from "./cli-tools.mjs";
import { costOf, estimateBatch } from "./cost.mjs";
import { createStubClient } from "./stub-model.mjs";
import { inProcessTsc } from "./tsc.mjs";

export const C1_DIR = import.meta.dirname;
const REPO_ROOT = resolve(C1_DIR, "..", "..", "..");
const WORK_ROOT = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";

export function loadTasks(file = join(C1_DIR, "tasks.json")) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function parseArgs(argv) {
  const args = { arm: "all", task: "all", runs: 3, seed: 20261108, concurrency: 4, model: DEFAULT_MODEL, condition: "base", stub: false, estimate: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === "--arm") args.arm = next();
    else if (a === "--task") args.task = next();
    else if (a === "--runs") args.runs = Number(next());
    else if (a === "--batch") args.batch = next();
    else if (a === "--seed") args.seed = Number(next());
    else if (a === "--concurrency") args.concurrency = Number(next());
    else if (a === "--model") args.model = next();
    else if (a === "--condition") args.condition = next();
    else if (a === "--docs-ref") args.docsRef = next();
    else if (a === "--aura-tarballs") args.auraTarballs = resolve(next());
    else if (a === "--idx") args.idx = Number(next());
    else if (a === "--score") args.score = true;
    else if (a === "--only") args.only = next().split(",");
    else if (a === "--stub") args.stub = true;
    else if (a === "--estimate") args.estimate = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

export function resolveArms(spec) {
  const arms = spec === "all" ? C1_ARMS : String(spec).split(",");
  for (const arm of arms) if (!C1_ARMS.includes(arm)) throw new Error(`unknown arm ${arm}`);
  return arms;
}

export function resolveC1Tasks(spec, manifest) {
  const ids = manifest.tasks.map((t) => t.id);
  if (spec === "all") return ids;
  const wanted = String(spec).split(",").map(Number);
  for (const id of wanted) if (!ids.includes(id)) throw new Error(`task ${id} is not in the frozen C1 set`);
  return wanted;
}

/**
 * Planned spend at list price. Per-run token profile from benchmark 505 medians of summed per-turn tokens (in+out):
 * aura-sheet 420K, three 63K; split assuming most of a long loop's input is a cache read. The bridge arm is assumed equal
 * to aura until measured. `uncachedWorstCase` prices every input token at the uncached rate (Prism's Kiro route can omit
 * cache fields), and the 505 docs-only median (1.45M) is the high bound if the new guidance does not help.
 */
export const COST_PROFILE = {
  aura: { uncachedInput: 25000, cacheRead: 340000, cacheWrite: 30000, output: 25000 },
  three: { uncachedInput: 8000, cacheRead: 40000, cacheWrite: 8000, output: 7000 },
  bridge: { uncachedInput: 25000, cacheRead: 340000, cacheWrite: 30000, output: 25000 }
};

const uncached = (p) => ({ uncachedInput: p.uncachedInput + p.cacheRead + p.cacheWrite, cacheRead: 0, cacheWrite: 0, output: p.output });

export function estimatePlan({ arms, tasks, runs, model, followUpShare = 0.35, judgeCalls = 0 }) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const rows = arms.map((arm) => {
    const n = tasks.length * runs;
    const e = estimateBatch({ runs: n, model, perRun: COST_PROFILE[arm] });
    const w = estimateBatch({ runs: n, model, perRun: uncached(COST_PROFILE[arm]) });
    return { arm, runs: n, perRunUsd: e?.perRunUsd ?? null, withFollowUpUsd: e ? r2(e.totalUsd * (1 + followUpShare)) : null, uncachedWorstCaseUsd: w ? r2(w.totalUsd * (1 + followUpShare)) : null };
  });
  const judge = estimateBatch({ runs: judgeCalls, model, perRun: { uncachedInput: 6000, cacheRead: 0, cacheWrite: 0, output: 400 } })?.totalUsd ?? 0;
  const sum = (k) => r2(rows.reduce((a, r) => a + (r[k] ?? 0), 0) + judge);
  return { rows, judgeCalls, judgeUsd: r2(judge), totalUsd: sum("withFollowUpUsd"), totalUncachedWorstCaseUsd: sum("uncachedWorstCaseUsd") };
}

function copyPhase(sandboxDir, into) {
  rmSync(into, { recursive: true, force: true });
  cpSync(sandboxDir, into, { recursive: true, mode: fsConstants.COPYFILE_FICLONE, filter: (src) => !src.startsWith(join(sandboxDir, "node_modules")) && !src.startsWith(join(sandboxDir, "dist")) });
  symlinkSync(join(sandboxDir, "node_modules"), join(into, "node_modules"), "dir");
}

export async function executeC1Run({ item, args, task, bases, makeClient, batchDir }) {
  const workDir = join(WORK_ROOT, args.batch, item.runId);
  const sandboxDir = join(workDir, "sandbox");
  const runDir = join(batchDir, "runs", item.runId);
  mkdirSync(runDir, { recursive: true });
  const base = bases[item.arm];
  // C1: both Aura3D arms get the N6 CLI agent tools; the bridge arm also BRIDGE.md and import_three.
  const condition = { ...(CONDITIONS[args.condition] ?? {}), ...(item.arm !== "three" ? { cliTools: true, scaffoldPublic: true } : {}), ...(item.arm === "bridge" ? { bridgeGuide: BRIDGE_GUIDE } : {}) };
  const sandbox = buildSandbox({ arm: item.arm, task: item.task, dir: sandboxDir, repoRoot: REPO_ROOT, baseDir: base.baseDir, tasksDir: join(C1_DIR, "tasks"), docsRoot: args.docsRoot ?? REPO_ROOT, condition });
  assertNoRepoSourceLeak({ dir: sandboxDir, arm: item.arm, repoRoot: REPO_ROOT, baseDir: base.baseDir });
  const record = {
    schema: "aura3d.agent-eval.c1-run/1",
    runId: item.runId,
    batch: args.batch,
    arm: item.arm,
    task: item.task,
    slug: task.slug,
    idx: item.idx,
    order: item.order,
    seed: item.seed,
    model: args.model,
    stub: args.stub,
    condition: args.condition,
    startedAt: new Date().toISOString(),
    docsCommit: item.arm === "three" ? null : (args.docsRef ?? docsCommit(REPO_ROOT)),
    docs: sandbox.docs,
    base: { versions: base.versions, patch: base.patch },
    followUp: task.followUp.text
  };

  const snapshotRoot = join(runDir, "snapshots");
  const toolbox = createToolbox({ dir: sandboxDir, snapshotRoot, lookup: Boolean(condition.lookup), runTsc: inProcessTsc, extraWritable: item.arm === "bridge" ? [{ re: FACTORY_RE, label: "recipes/*.mjs" }] : [] });
  const recordEvent = (event) => toolbox.events.push({ i: toolbox.events.length, t: Date.now() - toolbox.started, ...event });
  const handlers = {};
  const extraTools = [];
  if (condition.cliTools) {
    handlers.aura3d = createAura3dHandler({ dir: sandboxDir, record: recordEvent });
    extraTools.push(AURA3D_TOOL);
  }
  if (item.arm === "bridge") {
    handlers.import_three = createImportThreeHandler({ dir: sandboxDir, record: recordEvent });
    extraTools.push(IMPORT_THREE_TOOL);
  }
  const exec = (name, input) => {
    if (!handlers[name]) return toolbox.exec(name, input);
    try {
      return { content: handlers[name](input ?? {}), isError: false };
    } catch (error) {
      recordEvent({ type: "error", tool: name });
      return { content: String(error.message ?? error), isError: true };
    }
  };
  const phaseChecks = {};
  const onPhaseEnd = (name) => {
    writeSnapshot(sandboxDir, join(snapshotRoot, name));
    copyPhase(sandboxDir, join(workDir, `phase-${name}`));
    phaseChecks[name] = toolbox.tsc().pass;
  };
  let outcome;
  try {
    outcome = await runAgent({
      client: makeClient(item),
      model: args.model,
      arm: item.arm,
      toolbox: { ...toolbox, exec },
      maxTurns: args.maxTurns ?? 40,
      session: item.runId,
      condition,
      followUp: { text: task.followUp.text, maxTurns: args.followUpTurns ?? 15 },
      onPhaseEnd,
      extraTools
    });
    record.invalid = false;
  } catch (error) {
    outcome = { transcript: [], usage: null, endReason: "infra_error", wallMs: null };
    record.invalid = true;
    record.invalidReason = String(error.message).slice(0, 300);
  }
  toolbox.finalize();
  const usdPerCredit = process.env.AGENT_EVAL_USD_PER_CREDIT ? Number(process.env.AGENT_EVAL_USD_PER_CREDIT) : null;
  const phases = (outcome.usage?.phases ?? []).map((p) => ({ ...p, cost: costOf(p, args.model, { usdPerCredit }) }));
  Object.assign(record, {
    endReason: outcome.endReason,
    followUpEndReason: outcome.followUpEndReason ?? null,
    wallMs: outcome.wallMs,
    usage: outcome.usage ? { ...outcome.usage, phases: undefined } : null,
    phases,
    cost: costOf(outcome.usage, args.model, { usdPerCredit }),
    events: toolbox.events,
    bridgeExports: toolbox.events.filter((e) => e.type === "bridge").map(({ name, pass, ms }) => ({ name, pass, ms })),
    cliCalls: toolbox.events.filter((e) => e.type === "aura3d").map(({ command, exit, ms }) => ({ command, exit, ms })),
    docsOpened: [...toolbox.docsOpened].sort(),
    typesOpened: [...toolbox.typesOpened].sort(),
    typecheckAfterMain: phaseChecks.main ?? null,
    typecheckAfterFollowUp: phaseChecks.followup ?? null,
    summary: toolbox.state.summary
  });
  writeFileSync(join(runDir, "run.json"), JSON.stringify(record, null, 2));
  writeFileSync(join(runDir, "transcript.json"), JSON.stringify(outcome.transcript, null, 1));
  return record;
}

/** Client factory for one run: the scripted stub, or the shared Prism client. */
function clientFactory(args) {
  let prism = null;
  return (item) => (args.stub ? createStubClient({ arm: item.arm, task: item.task }) : (prism ??= createPrismClient({ key: loadKey() })));
}

/**
 * Run one item in its own worker thread. The toolbox runs typecheck, search and the bridge synchronously
 * (execFileSync); in a shared event loop one run's tool call would stall every other run's pending model response and
 * inflate their model and wall time. A worker per run keeps each run's clock its own at any concurrency.
 */
export function executeC1RunIsolated(payload) {
  return new Promise((ok, fail) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { c1Run: payload } });
    let settled = false;
    worker.once("message", (msg) => {
      settled = true;
      if (msg.error) fail(new Error(msg.error));
      else ok(msg.record);
    });
    worker.once("error", (error) => {
      settled = true;
      fail(error);
    });
    worker.once("exit", (code) => {
      if (!settled) fail(new Error(`run worker exited with code ${code}`));
    });
  });
}

async function pool(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (queue.length) results.push(await worker(queue.shift()));
    })
  );
  return results;
}

export async function main(argv) {
  const args = parseArgs(argv);
  const manifest = loadTasks();
  args.batch ??= `c1-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
  if (!CONDITIONS[args.condition]) throw new Error(`unknown condition ${args.condition}`);
  args.maxTurns = manifest.mainTurnCap;
  args.followUpTurns = manifest.followUpTurnCap;
  const arms = resolveArms(args.arm);
  const tasks = resolveC1Tasks(args.task, manifest);
  if (args.estimate) {
    const est = estimatePlan({ arms, tasks, runs: args.runs, model: args.model, judgeCalls: tasks.length * args.runs * 3 * 3 });
    console.log(JSON.stringify(est, null, 2));
    return { args, estimate: est };
  }
  const batchDir = resolve(REPO_ROOT, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval-c1", args.batch);
  mkdirSync(batchDir, { recursive: true });
  if (args.idx) args.runs = Math.max(args.runs, args.idx);
  const fullPlan = buildPlan({ arms, tasks, runs: args.runs, seed: args.seed, batch: args.batch });
  const plan = fullPlan.filter((p) => (!args.only || args.only.includes(p.runId)) && (!args.idx || p.idx === args.idx));
  if (args.docsRef) args.docsRoot = exportDocs(REPO_ROOT, args.docsRef, join(WORK_ROOT, args.batch, "docs"));
  const bases = Object.fromEntries(arms.map((arm) => [arm, ensureBase(arm, { tarballs: args.auraTarballs ?? null, withCli: arm !== "three" })]));
  const rerun = (Boolean(args.only) || Boolean(args.idx) || args.arm !== "all" || args.task !== "all") && existsSync(join(batchDir, "plan.json"));
  writeFileSync(join(batchDir, rerun ? `plan-rerun-${Date.now()}.json` : "plan.json"), JSON.stringify({ args, plan, bases, tasks: manifest.tasks.filter((t) => tasks.includes(t.id)) }, null, 2));
  if (!args.stub) loadKey(); // fail fast on a missing key before any worker starts
  const byId = Object.fromEntries(manifest.tasks.map((t) => [t.id, t]));
  const started = Date.now();
  const records = await pool(plan, args.concurrency, async (item) => {
    try {
      const r = await executeC1RunIsolated({ item, args, task: byId[item.task], bases, batchDir });
      console.log(`[c1] ${item.runId} ${r.endReason}/${r.followUpEndReason} turns=${r.usage?.turns} cost=$${r.cost?.billedUsd} (${r.cost?.source})`);
      return r;
    } catch (error) {
      console.error(`[c1] ${item.runId} FAILED: ${String(error.message).slice(0, 200)}`);
      return { runId: item.runId, invalid: true, invalidReason: String(error.message).slice(0, 300) };
    }
  });
  writeFileSync(join(batchDir, rerun ? `batch-rerun-${Date.now()}.json` : "batch.json"), JSON.stringify({ batch: args.batch, wallMs: Date.now() - started, runs: records.length, invalid: records.filter((r) => r.invalid).length }, null, 2));
  if (args.score && plan.length) {
    const scorer = spawnSync(process.execPath, [join(C1_DIR, "score.mjs"), args.batch, "--only", plan.map((p) => p.runId).join(",")], { stdio: "inherit", env: process.env });
    if (scorer.status !== 0) throw new Error(`score.mjs exited with ${scorer.status}`);
  }
  return { args, records, batchDir };
}

if (!isMainThread && workerData?.c1Run) {
  const { c1Run } = workerData;
  executeC1Run({ ...c1Run, makeClient: clientFactory(c1Run.args) }).then(
    (record) => parentPort.postMessage({ record }),
    (error) => parentPort.postMessage({ error: String(error?.message ?? error).split(/sk-[A-Za-z0-9]+/).join("[redacted]") })
  );
} else if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error.stack ?? error).split(/sk-[A-Za-z0-9]+/).join("[redacted]"));
    process.exit(1);
  });
}
