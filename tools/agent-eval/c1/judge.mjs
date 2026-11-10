#!/usr/bin/env node
// C1 blind visual judge. For every task and run index, three pairings (aura vs three, bridge vs three, bridge vs aura) of
// the main-phase frames (2 frames 3 s apart per candidate) go to the judge as candidates A and B in seeded random order,
// with no library names, source or file names; `--calls N` independent calls per pair (default 3, majority wins).
// `--checklist` also scores each run's final main source against the task checklist (source + measured probes).
//   node tools/agent-eval/c1/judge.mjs <batch> [--calls 3] [--seed S] [--checklist] [--stub]
// --stub replaces the model with a deterministic frame-statistics judge (no Prism traffic) to prove the pipeline.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { frameStats } from "../../docs/cheatsheet-lib.mjs";
import { JUDGE_SYSTEM, buildJudgePrompt, parseJudge } from "../lib/judge.mjs";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "../lib/prism.mjs";
import { mulberry32 } from "../run.mjs";
import { usageOf } from "../lib/loop.mjs";
import { costOf } from "./cost.mjs";
import { C1_DIR, loadTasks } from "./run-c1.mjs";

const REPO = resolve(C1_DIR, "..", "..", "..");
export const PAIRINGS = [["aura", "three"], ["bridge", "three"], ["bridge", "aura"]];

export const RUBRIC = `You judge two rendered browser frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows two frames of the same page 3 seconds apart.
Score each candidate 1 to 5 (5 best, 3 acceptable, 1 broken or empty) on:
- readability: the subject is clearly visible, centred and fully framed, not black or washed out
- lighting: depth, shading, shadows, contrast and colour that make form read
- materials: surface quality (metal/rough, colour variation, texture, no flat placeholder look)
- fidelity: how many of the task requirements are visibly met
- polish: absence of artifacts, aliasing, z-fighting, missing parts
Then pick the better candidate overall ("A", "B" or "tie"). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"readability":n,"lighting":n,"materials":n,"fidelity":n,"polish":n},"B":{...same keys},"winner":"A"|"B"|"tie","why":"one sentence"}`;

const taskText = (file) => readFileSync(join(C1_DIR, "tasks", file), "utf8");

/** Add one judge response's provider usage (tokens and any billed credits / USD) to the running judge total. */
export function addJudgeUsage(total, u) {
  for (const key of ["uncachedInput", "cacheRead", "cacheWrite", "output"]) total[key] += u[key] ?? 0;
  for (const key of ["providerCredits", "providerCostUsd"]) if (u[key] != null) total[key] = (total[key] ?? 0) + u[key];
  return total;
}

/**
 * The first balanced top-level JSON object in a model answer. A greedy /\{[\s\S]*\}/ spans to the last brace, so an answer
 * with text or a second object after the JSON failed to parse (13 of 216 C1 visual judge calls, c1-551).
 */
export function firstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in judge answer");
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}" && (depth -= 1) === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("unbalanced JSON object in judge answer");
}

export function majority(calls) {
  const tally = {};
  for (const c of calls) if (c.winner) tally[c.winner] = (tally[c.winner] ?? 0) + 1;
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return "tie";
  return sorted[0][0];
}

/** Deterministic stand-in judge: the frame with more lit, higher-contrast pixels wins. Pipeline proof only. */
async function stubJudge(order, frames) {
  const sharp = (await import(join(REPO, "node_modules/sharp/lib/index.js"))).default;
  const score = async (file) => {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const s = frameStats({ width: info.width, height: info.height, data });
    return s.litFraction * 10 + s.stdLuma / 10;
  };
  const [a, b] = [await score(frames[order[0]][0]), await score(frames[order[1]][0])];
  return { json: { winner: Math.abs(a - b) < 0.05 ? "tie" : a > b ? "A" : "B", why: "stub frame-statistics judge" }, usage: null };
}

async function main(argv) {
  const [batch, ...rest] = argv;
  if (!batch) throw new Error("usage: judge.mjs <batch> [--calls N] [--seed S] [--checklist] [--stub]");
  const opt = (name, dflt) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : dflt);
  const stub = rest.includes("--stub");
  const calls = Number(opt("--calls", stub ? 1 : 3));
  const seed = Number(opt("--seed", 20261108));
  const model = opt("--model", DEFAULT_MODEL);
  const batchDir = resolve(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval-c1", batch);
  const framesDir = join(batchDir, "frames");
  const manifest = loadTasks();
  const client = stub ? null : createPrismClient({ key: loadKey() });
  const rand = mulberry32(seed);
  const runs = readdirSync(join(batchDir, "runs")).filter((id) => existsSync(join(batchDir, "runs", id, "run.json"))).map((id) => JSON.parse(readFileSync(join(batchDir, "runs", id, "run.json"), "utf8")));
  const usage = { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0, providerCredits: null, providerCostUsd: null };
  const pairs = [];
  for (const task of manifest.tasks) {
    const file = readdirSync(join(C1_DIR, "tasks")).find((f) => f.startsWith(`${task.id}-`));
    for (const idx of [...new Set(runs.filter((r) => r.task === task.id).map((r) => r.idx))].sort()) {
      for (const [x, y] of PAIRINGS) {
        const id = (arm) => runs.find((r) => r.task === task.id && r.idx === idx && r.arm === arm)?.runId;
        if (!id(x) || !id(y)) continue;
        const frames = Object.fromEntries([x, y].map((arm) => [arm, [1, 2].map((n) => join(framesDir, `${id(arm)}-main-${n}.png`))]));
        const missing = [x, y].filter((arm) => !frames[arm].every(existsSync));
        // No frame = the build failed (SPEC section 6): that side loses without a judge call; neither side = not judged.
        if (missing.length) {
          const winner = missing.length === 1 ? [x, y].find((arm) => arm !== missing[0]) : null;
          pairs.push({ task: task.id, idx, pairing: `${x}-vs-${y}`, noFrame: missing, winner, unanimous: winner != null, calls: [] });
          continue;
        }
        const results = [];
        for (let k = 0; k < calls; k += 1) {
          const order = rand() < 0.5 ? [x, y] : [y, x];
          try {
            let json;
            if (stub) ({ json } = await stubJudge(order, frames));
            else {
              const content = [{ type: "text", text: `Task given to both programs:\n${taskText(file)}` }];
              for (const [i, arm] of order.entries()) {
                content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
                for (const f of frames[arm]) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } });
              }
              content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
              const response = await client.messages({ model, max_tokens: 800, system: RUBRIC, messages: [{ role: "user", content }] }, { session: `c1-visjudge-${task.id}`, jobType: "agent-eval-judge" });
              addJudgeUsage(usage, usageOf(response));
              json = firstJsonObject((response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(""));
            }
            const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
            results.push({ order, winner, scores: json.A ? { [order[0]]: json.A, [order[1]]: json.B } : null, why: String(json.why ?? "").slice(0, 300) });
          } catch (error) {
            results.push({ order, error: String(error.message).slice(0, 200) });
          }
        }
        const winner = majority(results);
        pairs.push({ task: task.id, idx, pairing: `${x}-vs-${y}`, winner, unanimous: results.every((r) => r.winner === winner), calls: results });
        console.log(`[c1-judge] t${task.id} r${idx} ${x}-vs-${y}: ${winner}`);
      }
    }
  }

  const checklists = [];
  if (rest.includes("--checklist") && !stub) {
    const lists = JSON.parse(readFileSync(join(C1_DIR, "tasks", "checklists.json"), "utf8"));
    const score = existsSync(join(batchDir, "c1-score.json")) ? JSON.parse(readFileSync(join(batchDir, "c1-score.json"), "utf8")) : {};
    for (const run of runs) {
      const snap = join(batchDir, "runs", run.runId, "snapshots", "main");
      if (!existsSync(snap)) continue;
      const sources = {};
      const walk = (d, pre = "") => { for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name), `${pre}${e.name}/`) : (sources[`${pre}${e.name}`] = readFileSync(join(d, e.name), "utf8")); };
      walk(snap);
      const phase = score[run.runId]?.phases?.main ?? {};
      const checklist = lists[String(run.task)] ?? [];
      try {
        const response = await client.messages({ model, max_tokens: 4000, system: JUDGE_SYSTEM, messages: [{ role: "user", content: buildJudgePrompt({ task: run.task, checklist, sources, probes: phase.probes, remote: { build: phase.build, readyTimeout: phase.ready === false, page: { pageErrors: phase.pageErrors } } }) }] }, { session: `c1-judge-${run.task}`, jobType: "agent-eval-judge" });
        addJudgeUsage(usage, usageOf(response));
        const parsed = parseJudge((response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(""));
        checklists.push({ runId: run.runId, passFraction: parsed.checklist.length ? parsed.checklist.filter((c) => c.pass).length / parsed.checklist.length : null, silentNoOps: parsed.silentNoOps.length, checklist: parsed.checklist });
      } catch (error) {
        checklists.push({ runId: run.runId, error: String(error.message).slice(0, 200) });
      }
    }
  }
  const out = { schema: "aura3d.agent-eval.c1-judge/1", judge: stub ? "stub-frame-statistics" : model, seed, callsPerPair: calls, pairs, checklists, judgeCost: stub ? null : costOf(usage, model, { usdPerCredit: process.env.AGENT_EVAL_USD_PER_CREDIT ? Number(process.env.AGENT_EVAL_USD_PER_CREDIT) : null }) };
  writeFileSync(join(batchDir, "c1-judge.json"), JSON.stringify(out, null, 2));
  console.log("wrote", join(batchDir, "c1-judge.json"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error.stack ?? error).split(/sk-[A-Za-z0-9]+/).join("[redacted]"));
    process.exit(1);
  });
}
