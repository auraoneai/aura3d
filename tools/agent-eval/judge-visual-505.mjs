#!/usr/bin/env node
// bench505 blind visual judge: THREE independent Prism judge calls per (task, run index) pair, A/B order randomised per call, labels hidden,
// majority vote, all three recorded.
//   node tools/agent-eval/judge-visual-505.mjs <outFile> <framesDir> <auraPrefix> <threePrefix> [tasks=10,11,12]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const [outFile, framesDir, auraPrefix, threePrefix, taskSpec = "10,11,12"] = process.argv.slice(2);
const rubrics = JSON.parse(readFileSync(join(REPO, "tools/agent-eval/tasks/visual-rubrics-505.json"), "utf8"));
const taskText = (n) => {
  const f = readdirSync(join(REPO, "tools/agent-eval/tasks")).find((x) => x.startsWith(`${String(n).padStart(2, "0")}-`));
  return readFileSync(join(REPO, "tools/agent-eval/tasks", f), "utf8").split("## Rendering contract")[0].replace(/^Framework:.*\n/m, "");
};
const SYSTEM = `You judge two rendered browser frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows two frames of the same page a few seconds apart.
Score each candidate 1 to 5 (5 best, 3 acceptable, 1 broken or empty) on the five task-specific criteria listed in the user message, in order, keys c1..c5.
Then pick the better candidate overall ("A", "B" or "tie"). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n},"B":{...same keys},"winner":"A"|"B"|"tie","why":"one sentence"}`;
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(20261106 + 505);
const results = [];
for (const task of taskSpec.split(",").map(Number)) {
  for (const idx of [1, 2, 3]) {
    const ids = { aura: `${auraPrefix}-t${task}-aura-r${idx}`, three: `${threePrefix}-t${task}-three-r${idx}` };
    const files = Object.fromEntries(Object.entries(ids).map(([arm, id]) => [arm, [1, 2].map((f) => join(framesDir, `${id}-${f}.png`))]));
    if (Object.values(files).flat().some((f) => !existsSync(f))) {
      results.push({ task, idx, error: "missing frames" });
      continue;
    }
    const calls = [];
    for (let j = 0; j < 3; j += 1) {
      const order = rand() < 0.5 ? ["three", "aura"] : ["aura", "three"];
      const content = [{ type: "text", text: `Task given to both programs:\n${taskText(task)}\nCriteria:\n${rubrics[task]}` }];
      order.forEach((arm, i) => {
        content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
        for (const f of files[arm]) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } });
      });
      content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
      try {
        const response = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: SYSTEM, messages: [{ role: "user", content }] }, { session: `visjudge505-${task}`, jobType: "agent-eval-judge" });
        const text = (response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
        const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
        const sum = (s) => Object.values(s).reduce((a, b) => a + Number(b), 0);
        const scores = { [order[0]]: json.A, [order[1]]: json.B };
        const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
        calls.push({ order, totals: { aura: sum(scores.aura), three: sum(scores.three) }, scores, winner, why: String(json.why ?? "").slice(0, 300) });
      } catch (error) {
        calls.push({ order, error: String(error.message).slice(0, 200) });
      }
    }
    const tally = { aura: 0, three: 0, tie: 0 };
    for (const c of calls) if (c.winner) tally[c.winner] += 1;
    const majority = tally.aura >= 2 ? "aura" : tally.three >= 2 ? "three" : "tie";
    results.push({ task, idx, calls, tally, majority });
    console.log(task, idx, JSON.stringify(tally), majority);
  }
}
writeFileSync(outFile, JSON.stringify({ model: DEFAULT_MODEL, judgeCallsPerPair: 3, results }, null, 2));
