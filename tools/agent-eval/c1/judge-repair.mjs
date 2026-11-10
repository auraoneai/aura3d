#!/usr/bin/env node
// Re-issue only the visual-judge calls that errored in <batch>/c1-judge.json (same pair, same candidate order, same
// frozen rubric), then recompute each repaired pair's majority. API-only; frames are the ones already captured.
//   node tools/agent-eval/c1/judge-repair.mjs <batch>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "../lib/prism.mjs";
import { usageOf } from "../lib/loop.mjs";
import { costOf } from "./cost.mjs";
import { RUBRIC, addJudgeUsage, firstJsonObject, majority } from "./judge.mjs";
import { C1_DIR } from "./run-c1.mjs";

const REPO = resolve(C1_DIR, "..", "..", "..");
const batch = process.argv[2];
const batchDir = resolve(REPO, "evidence/agent-eval-c1", batch);
const file = join(batchDir, "c1-judge.json");
const j = JSON.parse(readFileSync(file, "utf8"));
const runs = Object.fromEntries(readdirSync(join(batchDir, "runs")).map((id) => [id, JSON.parse(readFileSync(join(batchDir, "runs", id, "run.json"), "utf8"))]));
const idOf = (task, idx, arm) => Object.values(runs).find((r) => r.task === task && r.idx === idx && r.arm === arm)?.runId;
const client = createPrismClient({ key: loadKey() });
const usage = { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0, providerCredits: null, providerCostUsd: null };
let repaired = 0;
for (const p of j.pairs) {
  if (!p.calls.some((c) => c.error)) continue;
  const taskFile = readdirSync(join(C1_DIR, "tasks")).find((f) => f.startsWith(`${p.task}-`));
  for (const c of p.calls) {
    if (!c.error) continue;
    const content = [{ type: "text", text: `Task given to both programs:\n${readFileSync(join(C1_DIR, "tasks", taskFile), "utf8")}` }];
    for (const [i, arm] of c.order.entries()) {
      content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
      for (const n of [1, 2]) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(join(batchDir, "frames", `${idOf(p.task, p.idx, arm)}-main-${n}.png`)).toString("base64") } });
    }
    content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
    try {
      const response = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: RUBRIC, messages: [{ role: "user", content }] }, { session: `c1-visjudge-${p.task}`, jobType: "agent-eval-judge" });
      addJudgeUsage(usage, usageOf(response));
      const json = firstJsonObject((response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(""));
      const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? c.order[0] : c.order[1];
      Object.assign(c, { winner, scores: json.A ? { [c.order[0]]: json.A, [c.order[1]]: json.B } : null, why: String(json.why ?? "").slice(0, 300), repairedFrom: c.error });
      delete c.error;
      repaired += 1;
    } catch (error) {
      c.error = `repair: ${String(error.message).slice(0, 180)}`;
    }
  }
  const before = p.winner;
  p.winner = majority(p.calls);
  p.unanimous = p.calls.every((c) => c.winner === p.winner);
  console.log(`[c1-judge-repair] t${p.task} r${p.idx} ${p.pairing}: ${before} -> ${p.winner}`);
}
const prev = j.judgeCost;
const extra = costOf(usage, DEFAULT_MODEL);
j.judgeCost = { ...prev, billedUsd: (prev.billedUsd ?? 0) + (extra.billedUsd ?? 0), listUsd: (prev.listUsd ?? 0) + (extra.listUsd ?? 0), providerCredits: (prev.providerCredits ?? 0) + (extra.providerCredits ?? 0) };
j.repair = { at: new Date().toISOString(), callsRepaired: repaired, cost: extra, reason: "greedy JSON regex failed on answers with trailing text; calls re-issued with the same order and rubric" };
writeFileSync(file, JSON.stringify(j, null, 2));
console.log("repaired", repaired, JSON.stringify(extra));
