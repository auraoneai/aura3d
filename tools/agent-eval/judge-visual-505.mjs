#!/usr/bin/env node
// 505 blind visual judge: THREE independent judge calls per pair, randomised A/B per call, labels hidden, majority vote.
//   node tools/agent-eval/judge-visual-505.mjs <evidenceDir> <framesDir> <subjectBatch> <threeBatch> <outName> <tasks> [--seed N]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const [evDir, framesDir, subjectBatch, threeBatch, outName, tasksArg, ...rest] = process.argv.slice(2);
const seed = rest.includes("--seed") ? Number(rest[rest.indexOf("--seed") + 1]) : 20261106;
const RUBRICS = JSON.parse(readFileSync(join(REPO, "tools/agent-eval/tasks/visual-rubrics-505.json"), "utf8"));
const taskFiles = { 10: "10-walking-spider.md", 11: "11-pendulum-clock.md", 12: "12-paper-bird.md" };
const taskText = (n) => readFileSync(join(REPO, "tools/agent-eval/tasks", taskFiles[n]), "utf8").replace(/^# .*\n\n/, "");
const SYSTEM = `You judge two rendered browser frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows two frames of the same page about 3 seconds apart (the scene is animated).
Score each candidate 1 to 5 on each criterion of the task rubric you are given (5 best, 3 acceptable, 1 broken or empty). Then pick the better candidate overall ("A", "B" or "tie"). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n},"B":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n},"winner":"A"|"B"|"tie","why":"one sentence"}`;
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(seed);
const results = [];
for (const task of tasksArg.split(",").map(Number)) {
  for (const idx of [1, 2, 3]) {
    const ids = { subject: `${subjectBatch}-t${task}-aura-r${idx}`, three: `${threeBatch}-t${task}-three-r${idx}` };
    const calls = [];
    for (let call = 1; call <= 3; call += 1) {
      const order = rand() < 0.5 ? ["three", "subject"] : ["subject", "three"];
      const content = [{ type: "text", text: `Task given to both programs:\n${taskText(task)}\n\nRubric (score each criterion 1-5, report as c1..c5 in order):\n${RUBRICS[task]}` }];
      for (const [i, arm] of order.entries()) {
        content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
        for (const f of [1, 2]) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(join(framesDir, `${ids[arm]}-${f}.png`)).toString("base64") } });
      }
      content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
      try {
        const response = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: SYSTEM, messages: [{ role: "user", content }] }, { session: `visjudge505-${task}-${idx}-${call}`, jobType: "agent-eval-judge" });
        const text = (response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
        const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
        const sum = (s) => Object.values(s).reduce((a, b) => a + Number(b), 0);
        const scores = { [order[0]]: json.A, [order[1]]: json.B };
        const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
        calls.push({ call, order, scores, totals: { subject: sum(scores.subject), three: sum(scores.three) }, winner, why: String(json.why ?? "").slice(0, 300) });
      } catch (error) {
        calls.push({ call, error: String(error.message).slice(0, 200) });
      }
    }
    const tally = { subject: 0, three: 0, tie: 0 };
    for (const c of calls) if (c.winner) tally[c.winner] += 1;
    const majority = tally.subject >= 2 ? "subject" : tally.three >= 2 ? "three" : "tie";
    results.push({ task, idx, runs: ids, calls, tally, majority });
    console.log(task, idx, JSON.stringify(tally), majority);
  }
}
writeFileSync(join(REPO, evDir, `${outName}.json`), JSON.stringify({ model: DEFAULT_MODEL, seed, subjectBatch, threeBatch, callsPerPair: 3, results }, null, 2));
