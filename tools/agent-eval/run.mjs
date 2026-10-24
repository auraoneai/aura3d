#!/usr/bin/env node
// Cold-start authoring trial runner. One agent per (arm, task, run) in an isolated sandbox, LLM through Kiro Prism.
//   node tools/agent-eval/run.mjs --arm aura|three|both --task N|1,2,3|all --runs K [--batch NAME] [--seed S]
//        [--concurrency C] [--model ID] [--max-turns N] [--aura-tarballs DIR] [--dry-run]
// Build and render scoring happens afterwards on the remote runner (tools/agent-eval/score-remote.sh).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureBase } from "./lib/base.mjs";
import { runAgent } from "./lib/loop.mjs";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { ARMS, assertNoRepoSourceLeak, buildSandbox, docsCommit, writeSnapshot } from "./lib/sandbox.mjs";
import { createToolbox } from "./lib/tools.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const WORK_ROOT = process.env.AGENT_EVAL_WORK ?? "/tmp/agent-eval-runs";

export function parseArgs(argv) {
  const args = { arm: "both", task: "all", runs: 3, seed: 20261024, concurrency: 5, model: DEFAULT_MODEL, maxTurns: 40, dryRun: false };
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
    else if (a === "--max-turns") args.maxTurns = Number(next());
    else if (a === "--aura-tarballs") args.auraTarballs = resolve(next());
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same plan for the same seed: every (task, arm, run) once, in seeded random order. */
export function buildPlan({ arms, tasks, runs, seed, batch }) {
  const items = [];
  for (const task of tasks) for (const arm of arms) for (let idx = 1; idx <= runs; idx += 1) items.push({ task, arm, idx });
  const rand = mulberry32(seed);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.map((item, order) => ({ ...item, order, runId: `${batch}-t${item.task}-${item.arm}-r${item.idx}`, seed: seed * 1000 + order }));
}

export function resolveTasks(spec) {
  if (spec === "all") return [1, 2, 3, 4, 5, 6, 7];
  return String(spec)
    .split(",")
    .map(Number)
    .filter((n) => n >= 1 && n <= 7);
}

async function pool(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  });
  await Promise.all(workers);
  return results;
}

export async function executeRun({ item, args, bases, client, batchDir }) {
  const workDir = join(WORK_ROOT, args.batch, item.runId);
  const sandboxDir = join(workDir, "sandbox");
  const runDir = join(batchDir, "runs", item.runId);
  mkdirSync(runDir, { recursive: true });
  const base = bases[item.arm];
  const sandbox = buildSandbox({ arm: item.arm, task: item.task, dir: sandboxDir, repoRoot: REPO_ROOT, baseDir: base.baseDir });
  assertNoRepoSourceLeak({ dir: sandboxDir, arm: item.arm, repoRoot: REPO_ROOT, baseDir: base.baseDir });
  const record = {
    runId: item.runId,
    batch: args.batch,
    arm: item.arm,
    task: item.task,
    idx: item.idx,
    order: item.order,
    seed: item.seed,
    model: args.model,
    startedAt: new Date().toISOString(),
    docsCommit: item.arm === "aura" ? docsCommit(REPO_ROOT) : null,
    docs: sandbox.docs,
    base: { versions: base.versions, patch: base.patch }
  };
  if (args.dryRun) return { ...record, dryRun: true };

  const snapshotRoot = join(runDir, "snapshots");
  const toolbox = createToolbox({ dir: sandboxDir, snapshotRoot });
  let outcome;
  try {
    outcome = await runAgent({ client, model: args.model, arm: item.arm, toolbox, maxTurns: args.maxTurns, session: item.runId });
    record.invalid = false;
  } catch (error) {
    outcome = { transcript: [], usage: null, endReason: "infra_error", wallMs: null };
    record.invalid = true;
    record.invalidReason = String(error.message).slice(0, 300);
  }
  const authored = toolbox.finalize();
  const finalTsc = toolbox.tsc();
  const firstCheck = toolbox.events.find((e) => e.type === "typecheck");
  Object.assign(record, {
    endReason: outcome.endReason,
    wallMs: outcome.wallMs,
    usage: outcome.usage,
    events: toolbox.events,
    docsOpened: [...toolbox.docsOpened].sort(),
    typesOpened: [...toolbox.typesOpened].sort(),
    filesWritten: authored,
    draftIsFinal: toolbox.state.draftIsFinal,
    summary: toolbox.state.summary,
    finalTypecheckPass: finalTsc.pass,
    finalTypecheckOutput: finalTsc.pass ? "" : finalTsc.output.slice(0, 1500),
    firstTryTypecheck: firstCheck ? firstCheck.pass === true : finalTsc.pass
  });
  writeFileSync(join(runDir, "run.json"), JSON.stringify(record, null, 2));
  writeFileSync(join(runDir, "transcript.json"), JSON.stringify(outcome.transcript, null, 1));
  return record;
}

export async function main(argv) {
  const args = parseArgs(argv);
  args.batch ??= `b${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
  const arms = args.arm === "both" ? ARMS : [args.arm];
  const tasks = resolveTasks(args.task);
  const batchDir = resolve(REPO_ROOT, "evidence/agent-eval", args.batch);
  mkdirSync(batchDir, { recursive: true });
  const plan = buildPlan({ arms, tasks, runs: args.runs, seed: args.seed, batch: args.batch });
  const bases = Object.fromEntries(arms.map((arm) => [arm, ensureBase(arm, { tarballs: args.auraTarballs ?? null })]));
  writeFileSync(
    join(batchDir, "plan.json"),
    JSON.stringify({ args, plan, bases, note: "model sampling is not seedable through Prism; seeds fix plan order and run ids only" }, null, 2)
  );
  const client = args.dryRun ? null : createPrismClient({ key: loadKey() });
  const started = Date.now();
  const records = await pool(plan, args.concurrency, async (item) => {
    try {
      const record = await executeRun({ item, args, bases, client, batchDir });
      console.log(`[agent-eval] ${item.runId} ${record.dryRun ? "dry" : `${record.endReason} turns=${record.usage?.turns} tsc=${record.finalTypecheckPass}`}`);
      return record;
    } catch (error) {
      console.error(`[agent-eval] ${item.runId} FAILED: ${String(error.message).slice(0, 200)}`);
      return { runId: item.runId, invalid: true, invalidReason: String(error.message).slice(0, 300) };
    }
  });
  writeFileSync(join(batchDir, "batch.json"), JSON.stringify({ batch: args.batch, wallMs: Date.now() - started, runs: records.length, invalid: records.filter((r) => r.invalid).length }, null, 2));
  return { args, records, batchDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error.stack ?? error).split(/sk-[A-Za-z0-9]+/).join("[redacted]"));
    process.exit(1);
  });
}
