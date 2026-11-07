#!/usr/bin/env node
// bench505 blind visual judge: THREE independent calls per (task, run index) pair, random A/B order each, majority vote.
//   node tools/agent-eval/judge-visual3.mjs <outFile> <framesDir> <subjectPrefix> <threePrefix> <tasks> [--seed N]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const [outFile, framesDir, subjPrefix, threePrefix, taskSpec, ...rest] = process.argv.slice(2);
const seed = rest.includes("--seed") ? Number(rest[rest.indexOf("--seed") + 1]) : 20261106;
const rubrics = JSON.parse(readFileSync(join(REPO, "tools/agent-eval/tasks/environments-rubrics.json"), "utf8"));
const taskDir = join(REPO, "tools/agent-eval/tasks");
const taskText = (n) => readFileSync(join(taskDir, readdirSync(taskDir).find((f) => f.startsWith(`${n}-`))), "utf8").split("The rendering contract")[0];
const RUBRIC = (extra) => `You judge two rendered browser frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows two frames of the same page 3 seconds apart.
Score each candidate 1 to 5 (5 best, 3 acceptable, 1 broken or empty) on each criterion of this task rubric:
${extra}
Also give an overall 1-5 "overall". Then pick the better candidate overall ("A", "B" or "tie"). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n,"overall":n},"B":{...same keys},"winner":"A"|"B"|"tie","why":"one sentence"}`;
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(seed);
const results = [];
const tasks = taskSpec.split(",").map(Number);
for (const task of tasks) for (const idx of [1, 2, 3]) {
  const ids = { aura: `${subjPrefix}-t${task}-aura-r${idx}`, three: `${threePrefix}-t${task}-three-r${idx}` };
  const files = (arm) => [1, 2].map((f) => join(framesDir, `${ids[arm]}-${f}.png`));
  if (![...files("aura"), ...files("three")].every(existsSync)) { results.push({ task, idx, error: "missing frames", ids }); continue; }
  const calls = await Promise.all([0, 1, 2].map(async (k) => {
    const order = rand() < 0.5 ? ["three", "aura"] : ["aura", "three"];
    const content = [{ type: "text", text: `Task given to both programs:\n${taskText(task)}` }];
    order.forEach((arm, i) => { content.push({ type: "text", text: `Candidate ${"AB"[i]}:` }); for (const f of files(arm)) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } }); });
    content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
    try {
      const r = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: RUBRIC(rubrics[task].visualRubric), messages: [{ role: "user", content }] }, { session: `visjudge3-${task}-${idx}-${k}`, jobType: "agent-eval-judge" });
      const text = (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const j = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
      const scores = { [order[0]]: j.A, [order[1]]: j.B };
      const winner = j.winner === "tie" ? "tie" : j.winner === "A" ? order[0] : order[1];
      return { call: k, order, scores, winner, why: String(j.why ?? "").slice(0, 300) };
    } catch (e) { return { call: k, order, error: String(e.message).slice(0, 200) }; }
  }));
  const valid = calls.filter((c) => !c.error);
  const tally = { aura: 0, three: 0, tie: 0 };
  valid.forEach((c) => tally[c.winner]++);
  const majority = tally.aura >= 2 ? "aura" : tally.three >= 2 ? "three" : "tie";
  results.push({ task, idx, ids, calls, tally, majority, validCalls: valid.length });
  console.log(task, idx, JSON.stringify(tally), majority);
}
writeFileSync(outFile, JSON.stringify({ model: DEFAULT_MODEL, seed, calls: 3, results }, null, 2));
