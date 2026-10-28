#!/usr/bin/env node
// Three independent fresh-agent authors per scene per library (PRD WP-B.1).
//
//   node tools/bench-vs-threejs/shared/authors/run-authors.mjs --dry-run [--scenes all|a,b] [--libs three,aura] [--authors 3]
//   node tools/bench-vs-threejs/shared/authors/run-authors.mjs --confirm-spend [same flags] [--batch NAME] [--concurrency C]
//   node tools/bench-vs-threejs/shared/authors/run-authors.mjs --summarize <batch dir>
//
// Each author is a separate agent run: its own sandbox, its own Prism session id, no shared context. The agent loop,
// sandbox and leak checks are the tools/agent-eval ones (no shell, no network, docs-only Aura3D arm). A run costs real
// model spend, so a real run needs --confirm-spend; --dry-run builds the plan and validates the briefs offline.
// Build and render scoring is the existing remote step: tools/agent-eval/score-remote.sh <batch>.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ensureBase } from "../../../agent-eval/lib/base.mjs";
import { runAgent } from "../../../agent-eval/lib/loop.mjs";
import { countLoc, countTokens, median, summarize } from "../../../agent-eval/lib/metrics.mjs";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "../../../agent-eval/lib/prism.mjs";
import { ARMS, assertNoRepoSourceLeak, buildSandbox, docsCommit } from "../../../agent-eval/lib/sandbox.mjs";
import { createToolbox } from "../../../agent-eval/lib/tools.mjs";
import { mulberry32 } from "../../../agent-eval/run.mjs";

const HERE = import.meta.dirname;
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const AGENT_EVAL_TASKS = join(REPO_ROOT, "tools/agent-eval/tasks");
const WORK_ROOT = process.env.BENCH_AUTHORS_WORK ?? "/tmp/bench-authors-runs";
export const DEFAULT_AUTHORS = 3;
export const LIBS = ["three", "aura"];

export function loadBriefs(file = join(HERE, "briefs.json")) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Returns a list of problems; empty means every brief is usable. */
export function validateBriefs(briefs, tasksDir = AGENT_EVAL_TASKS) {
  const problems = [];
  const ids = new Set();
  const tasks = new Set();
  for (const scene of briefs.scenes ?? []) {
    if (!scene.id) problems.push("scene without id");
    if (ids.has(scene.id)) problems.push(`duplicate scene id ${scene.id}`);
    ids.add(scene.id);
    if (!Number.isInteger(scene.task)) problems.push(`${scene.id}: task must be an integer`);
    if (tasks.has(scene.task)) problems.push(`${scene.id}: task number ${scene.task} reused`);
    tasks.add(scene.task);
    if (scene.reuse) {
      const path = join(tasksDir, scene.reuse);
      if (!existsSync(path)) problems.push(`${scene.id}: reused task file ${scene.reuse} not found`);
      else if (!readFileSync(path, "utf8").includes("{{LIBRARY}}")) problems.push(`${scene.id}: ${scene.reuse} has no {{LIBRARY}} placeholder`);
    } else if (typeof scene.text !== "string" || !scene.text.includes("{{LIBRARY}}")) problems.push(`${scene.id}: text must contain {{LIBRARY}}`);
    if (scene.reuse && scene.text) problems.push(`${scene.id}: set either reuse or text, not both`);
    for (const asset of scene.assets ?? []) if (!asset.from || !asset.to?.startsWith("public/")) problems.push(`${scene.id}: asset needs from and a public/ target`);
  }
  if (!ids.size) problems.push("no scenes");
  return problems;
}

/** Writes 00-contract.md plus one NN-<id>.md per scene into `into`, in the layout agent-eval's readTask expects. */
export function materializeTasks(briefs, into, tasksDir = AGENT_EVAL_TASKS) {
  mkdirSync(into, { recursive: true });
  cpSync(join(tasksDir, "00-contract.md"), join(into, "00-contract.md"));
  for (const scene of briefs.scenes) {
    const name = `${String(scene.task).padStart(2, "0")}-${scene.id}.md`;
    const text = scene.reuse ? readFileSync(join(tasksDir, scene.reuse), "utf8") : scene.text;
    writeFileSync(join(into, name), text);
  }
  return into;
}

/** Every (scene, library, author) once, in seeded random order so no arm runs in a block. */
export function buildAuthorPlan({ scenes, libs = LIBS, authors = DEFAULT_AUTHORS, seed = 20261028, batch }) {
  const items = [];
  for (const scene of scenes) for (const lib of libs) for (let author = 1; author <= authors; author += 1) items.push({ scene: scene.id, task: scene.task, lib, author });
  const rand = mulberry32(seed);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.map((item, order) => ({ ...item, order, runId: `${batch}-${item.scene}-${item.lib}-a${item.author}`, seed: seed * 1000 + order }));
}

export function parseArgs(argv) {
  const args = { scenes: "all", libs: LIBS, authors: DEFAULT_AUTHORS, seed: 20261028, concurrency: 4, model: DEFAULT_MODEL, maxTurns: 40, dryRun: false, confirmSpend: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === "--scenes") args.scenes = next();
    else if (a === "--libs") args.libs = next().split(",");
    else if (a === "--authors") args.authors = Number(next());
    else if (a === "--seed") args.seed = Number(next());
    else if (a === "--batch") args.batch = next();
    else if (a === "--concurrency") args.concurrency = Number(next());
    else if (a === "--model") args.model = next();
    else if (a === "--max-turns") args.maxTurns = Number(next());
    else if (a === "--aura-tarballs") args.auraTarballs = resolve(next());
    else if (a === "--out") args.out = resolve(next());
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--confirm-spend") args.confirmSpend = true;
    else if (a === "--summarize") args.summarize = resolve(next());
    else throw new Error(`unknown argument ${a}`);
  }
  for (const lib of args.libs) if (!LIBS.includes(lib)) throw new Error(`unknown library ${lib}`);
  if (!Number.isInteger(args.authors) || args.authors < 1) throw new Error("--authors must be a positive integer");
  return args;
}

export function selectScenes(briefs, spec) {
  if (spec === "all") return briefs.scenes;
  const wanted = spec.split(",");
  const missing = wanted.filter((id) => !briefs.scenes.some((s) => s.id === id));
  if (missing.length) throw new Error(`unknown scene(s): ${missing.join(", ")}`);
  return briefs.scenes.filter((s) => wanted.includes(s.id));
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

/** Build one author's sandbox: agent-eval's isolated project, the scene's provided assets, and the repo-source leak proof. */
export function stageSandbox({ scene, lib, dir, baseDir, tasksDir, repoRoot = REPO_ROOT }) {
  const sandbox = buildSandbox({ arm: lib, task: scene.task, dir, repoRoot, baseDir, tasksDir });
  for (const asset of scene.assets ?? []) {
    mkdirSync(join(dir, asset.to, ".."), { recursive: true });
    cpSync(join(repoRoot, asset.from), join(dir, asset.to));
  }
  assertNoRepoSourceLeak({ dir, arm: lib, repoRoot, baseDir });
  return sandbox;
}

async function executeAuthor({ item, scene, args, bases, client, tasksDir, outDir }) {
  const sandboxDir = join(WORK_ROOT, args.batch, item.runId, "sandbox");
  const runDir = join(outDir, "runs", item.runId);
  mkdirSync(runDir, { recursive: true });
  const base = bases[item.lib];
  const sandbox = stageSandbox({ scene, lib: item.lib, dir: sandboxDir, baseDir: base.baseDir, tasksDir });
  const record = { runId: item.runId, batch: args.batch, scene: item.scene, lib: item.lib, author: item.author, order: item.order, model: args.model, startedAt: new Date().toISOString(), docs: sandbox.docs, docsCommit: item.lib === "aura" ? docsCommit(REPO_ROOT) : null, base: { versions: base.versions, patch: base.patch } };
  const toolbox = createToolbox({ dir: sandboxDir, snapshotRoot: join(runDir, "snapshots") });
  let outcome;
  try {
    outcome = await runAgent({ client, model: args.model, arm: item.lib, toolbox, maxTurns: args.maxTurns, session: item.runId });
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
    filesWritten: authored,
    summary: toolbox.state.summary,
    finalTypecheckPass: finalTsc.pass,
    firstTryTypecheck: firstCheck ? firstCheck.pass === true : finalTsc.pass
  });
  writeFileSync(join(runDir, "run.json"), JSON.stringify(record, null, 2));
  writeFileSync(join(runDir, "transcript.json"), JSON.stringify(outcome.transcript, null, 1));
  return record;
}

/** Source lines and tokens of the files an author wrote under src/ (final snapshot). */
export function authoredSourceSize(runDir) {
  const root = join(runDir, "snapshots", "final", "src");
  if (!existsSync(root)) return null;
  let loc = 0;
  let tokens = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|glsl|html|css)$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        loc += countLoc(text);
        tokens += countTokens(text).tokens;
      }
    }
  };
  walk(root);
  return { loc, tokens };
}

/** Per scene and library: medians over the valid authors. Invalid (infrastructure) runs are counted, not averaged in. */
export function summarizeBatch(batchDir) {
  const runsRoot = join(batchDir, "runs");
  if (!existsSync(runsRoot)) throw new Error(`no runs in ${batchDir}`);
  const groups = new Map();
  for (const name of readdirSync(runsRoot)) {
    const file = join(runsRoot, name, "run.json");
    if (!existsSync(file)) continue;
    const run = JSON.parse(readFileSync(file, "utf8"));
    const key = `${run.scene}/${run.lib}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ run, size: authoredSourceSize(join(runsRoot, name)) });
  }
  const cells = {};
  for (const [key, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const valid = entries.filter((e) => !e.run.invalid);
    const pick = (fn) => valid.map(fn);
    cells[key] = {
      authors: entries.length,
      valid: valid.length,
      invalid: entries.length - valid.length,
      turns: median(pick((e) => e.run.usage?.turns)),
      inputTokens: median(pick((e) => e.run.usage?.input)),
      outputTokens: median(pick((e) => e.run.usage?.output)),
      wallMs: median(pick((e) => e.run.wallMs)),
      sourceLoc: median(pick((e) => e.size?.loc)),
      sourceTokens: median(pick((e) => e.size?.tokens)),
      firstTryTypecheck: summarize(pick((e) => e.run.firstTryTypecheck)).trueCount,
      finalTypecheckPass: summarize(pick((e) => e.run.finalTypecheckPass)).trueCount
    };
  }
  return { schema: "aura3d.bench-authors.summary/1", batch: batchDir, note: "Authoring trial. Build and render correctness comes from tools/agent-eval/score-remote.sh; these medians say nothing about runtime speed.", cells };
}

export async function main(argv) {
  const args = parseArgs(argv);
  if (args.summarize) {
    const summary = summarizeBatch(args.summarize);
    writeFileSync(join(args.summarize, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary.cells, null, 2));
    return summary;
  }
  const briefs = loadBriefs();
  const problems = validateBriefs(briefs);
  if (problems.length) throw new Error(`briefs invalid:\n${problems.join("\n")}`);
  const scenes = selectScenes(briefs, args.scenes);
  args.batch ??= `authors-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
  const plan = buildAuthorPlan({ scenes, libs: args.libs, authors: args.authors, seed: args.seed, batch: args.batch });
  const outDir = args.out ?? resolve(REPO_ROOT, "evidence/vs-threejs/authors", args.batch);
  const tasksDir = materializeTasks(briefs, mkdtempSync(join(tmpdir(), "bench-authors-tasks-")));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "plan.json"), JSON.stringify({ args, plan, note: "model sampling is not seedable through Prism; seeds fix plan order and run ids only" }, null, 2));
  if (args.dryRun) {
    console.log(`[bench-authors] dry run: ${plan.length} author run(s) planned, briefs valid, plan written to ${join(outDir, "plan.json")}`);
    return { args, plan, outDir };
  }
  if (!args.confirmSpend) throw new Error(`refusing to start ${plan.length} paid agent run(s) without --confirm-spend (use --dry-run to plan)`);
  const libs = args.libs.filter((l) => ARMS.includes(l));
  const bases = Object.fromEntries(libs.map((lib) => [lib, ensureBase(lib, { tarballs: args.auraTarballs ?? null })]));
  const client = createPrismClient({ key: loadKey() });
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const records = await pool(plan, args.concurrency, async (item) => {
    try {
      const record = await executeAuthor({ item, scene: sceneById.get(item.scene), args, bases, client, tasksDir, outDir });
      console.log(`[bench-authors] ${item.runId} ${record.endReason} turns=${record.usage?.turns} tsc=${record.finalTypecheckPass}`);
      return record;
    } catch (error) {
      console.error(`[bench-authors] ${item.runId} FAILED: ${String(error.message).slice(0, 200)}`);
      return { runId: item.runId, invalid: true, invalidReason: String(error.message).slice(0, 300) };
    }
  });
  return { args, records, outDir };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error.message ?? error));
    process.exit(1);
  });
}
