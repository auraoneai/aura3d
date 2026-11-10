#!/usr/bin/env node
// Blind A/B visual judge across two batches of the same arm (C1 efficiency A/B): for every task and replicate present in
// both, the main-phase frames of batch A's run and batch B's run go to the judge as candidates A/B in seeded random
// order, with the frozen C1 rubric (judge.mjs RUBRIC), `--calls` independent calls per pair, majority wins.
//   node tools/agent-eval/c1/judge-ab.mjs <batchA> <batchB> [--arm aura] [--calls 3] [--seed S] [--out FILE]
// Writes <batchB>/c1-judge-ab-<batchA>.json: pairs (winner "A"|"B"|"tie" by batch), per-run mean rubric scores, cost.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "../lib/prism.mjs";
import { usageOf } from "../lib/loop.mjs";
import { mulberry32 } from "../run.mjs";
import { costOf } from "./cost.mjs";
import { RUBRIC, addJudgeUsage, majority } from "./judge.mjs";
import { C1_DIR } from "./run-c1.mjs";

const REPO = resolve(C1_DIR, "..", "..", "..");
const DIMS = ["readability", "lighting", "materials", "fidelity", "polish"];

async function main(argv) {
  const [batchA, batchB, ...rest] = argv;
  const opt = (n, d) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : d);
  const arm = opt("--arm", "aura");
  const calls = Number(opt("--calls", 3));
  const rand = mulberry32(Number(opt("--seed", 20261110)));
  const model = opt("--model", DEFAULT_MODEL);
  const dir = (b) => resolve(REPO, "evidence/agent-eval-c1", b);
  const runsOf = (b) => readdirSync(join(dir(b), "runs")).filter((id) => existsSync(join(dir(b), "runs", id, "run.json"))).map((id) => JSON.parse(readFileSync(join(dir(b), "runs", id, "run.json"), "utf8"))).filter((r) => r.arm === arm && !r.invalid);
  const A = runsOf(batchA);
  const B = runsOf(batchB);
  const client = createPrismClient({ key: loadKey() });
  const usage = { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0, providerCredits: null, providerCostUsd: null };
  const pairs = [];
  const scores = {};
  for (const b of B.sort((x, y) => x.task - y.task || x.idx - y.idx)) {
    const a = A.find((r) => r.task === b.task && r.idx === b.idx);
    if (!a) continue;
    const taskFile = readdirSync(join(C1_DIR, "tasks")).find((f) => f.startsWith(`${b.task}-`));
    const frames = { A: [1, 2].map((n) => join(dir(batchA), "frames", `${a.runId}-main-${n}.png`)), B: [1, 2].map((n) => join(dir(batchB), "frames", `${b.runId}-main-${n}.png`)) };
    const missing = ["A", "B"].filter((k) => !frames[k].every(existsSync));
    if (missing.length) {
      pairs.push({ task: b.task, idx: b.idx, a: a.runId, b: b.runId, noFrame: missing, winner: missing.length === 1 ? (missing[0] === "A" ? "B" : "A") : null, calls: [] });
      continue;
    }
    const results = [];
    for (let k = 0; k < calls; k += 1) {
      const order = rand() < 0.5 ? ["A", "B"] : ["B", "A"];
      try {
        const content = [{ type: "text", text: `Task given to both programs:\n${readFileSync(join(C1_DIR, "tasks", taskFile), "utf8")}` }];
        for (const [i, side] of order.entries()) {
          content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
          for (const f of frames[side]) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } });
        }
        content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
        const response = await client.messages({ model, max_tokens: 800, system: RUBRIC, messages: [{ role: "user", content }] }, { session: `c1-abjudge-${b.task}`, jobType: "agent-eval-judge" });
        addJudgeUsage(usage, usageOf(response));
        const json = JSON.parse(/\{[\s\S]*\}/.exec((response.content ?? []).filter((x) => x.type === "text").map((x) => x.text).join(""))[0]);
        const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
        const s = { [order[0]]: json.A, [order[1]]: json.B };
        for (const side of ["A", "B"]) {
          const v = DIMS.map((d) => Number(s[side]?.[d])).filter((x) => x >= 1 && x <= 5);
          if (v.length === DIMS.length) (scores[side === "A" ? a.runId : b.runId] ??= []).push(v.reduce((p, q) => p + q, 0) / v.length);
        }
        results.push({ order, winner, scores: s, why: String(json.why ?? "").slice(0, 300) });
      } catch (error) {
        results.push({ order, error: String(error.message).slice(0, 200) });
      }
    }
    const winner = majority(results);
    pairs.push({ task: b.task, idx: b.idx, a: a.runId, b: b.runId, winner, unanimous: results.every((r) => r.winner === winner), calls: results });
    console.log(`[c1-abjudge] t${b.task} r${b.idx} ${batchA} vs ${batchB}: ${winner}`);
  }
  const meanScores = Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, v.reduce((p, q) => p + q, 0) / v.length]));
  const out = { schema: "aura3d.agent-eval.c1-judge-ab/1", batchA, batchB, arm, judge: model, callsPerPair: calls, pairs, meanScores, judgeCost: costOf(usage, model) };
  const file = opt("--out", join(dir(batchB), `c1-judge-ab-${batchA}.json`));
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log("wrote", file, JSON.stringify(out.judgeCost));
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
