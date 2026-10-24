#!/usr/bin/env node
// node tools/agent-eval/score.mjs <batch> [--no-judge] [--reuse-judge]  -> evidence/agent-eval/<batch>/metrics.json (needs remote/results.json)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { judgeRun } from "./lib/judge.mjs";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { computeRunMetrics } from "./lib/score.mjs";
import { collectAuthored } from "./lib/sandbox.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const [batch, ...flags] = process.argv.slice(2);
const noJudge = flags.includes("--no-judge");
const reuseJudge = flags.includes("--reuse-judge");
const previous = reuseJudge && existsSync(join(resolve(repoRoot, "evidence/agent-eval", batch), "metrics.json")) ? new Map(JSON.parse(readFileSync(join(resolve(repoRoot, "evidence/agent-eval", batch), "metrics.json"), "utf8")).map((m) => [m.runId, m])) : new Map();
const batchDir = resolve(repoRoot, "evidence/agent-eval", batch);
const remote = JSON.parse(readFileSync(join(batchDir, "remote/results.json"), "utf8"));
const byId = new Map(remote.map((r) => [r.id, r]));
const client = noJudge ? null : createPrismClient({ key: loadKey() });
const metrics = [];
for (const name of readdirSync(join(batchDir, "runs")).sort()) {
  const runPath = join(batchDir, "runs", name, "run.json");
  if (!existsSync(runPath)) continue;
  const run = JSON.parse(readFileSync(runPath, "utf8"));
  const finalDir = join(batchDir, "runs", name, "snapshots/final");
  const sources = existsSync(finalDir) ? collectAuthored(finalDir) : {};
  const remoteFinal = byId.get(`${name}-final`) ?? null;
  const remoteDraft = byId.get(`${name}-draft`) ?? null;
  let judge = null;
  if (previous.get(name)?.judgeDetail) judge = previous.get(name).judgeDetail;
  else if (client && !run.invalid && remoteFinal) {
    try {
      judge = await judgeRun({ client, model: DEFAULT_MODEL, task: run.task, sources, probes: remoteFinal.probes ?? {}, remote: remoteFinal });
    } catch (error) {
      console.error(`judge failed for ${name}: ${String(error.message).slice(0, 120)}`);
    }
  }
  const m = computeRunMetrics({ run, remoteDraft, remoteFinal, sources, judge });
  if (judge) m.judgeDetail = { checklist: judge.checklist, silentNoOps: judge.silentNoOps, glue: judge.glue };
  metrics.push(m);
}
writeFileSync(join(batchDir, "metrics.json"), JSON.stringify(metrics, null, 2));
console.log(`scored ${metrics.length} runs`);
