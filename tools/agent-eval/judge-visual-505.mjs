#!/usr/bin/env node
// Blind pairwise visual judge, 3 independent calls per pair, randomised A/B per call, labels hidden, majority vote.
//   node tools/agent-eval/judge-visual-505.mjs <outFile> <framesDir> <subjectBatch> <subjectArm> <threeBatch> [--tasks 10,11,12]
// subjectArm is the run-id arm token ("aura"); frames are <runId>-1.png (t~1s) and <runId>-2.png (t~3s).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";
const REPO = resolve(import.meta.dirname, "..", "..");
const [outFile, framesDir, subjBatch, subjArm, threeBatch, ...rest] = process.argv.slice(2);
const TASKS = (rest.includes("--tasks") ? rest[rest.indexOf("--tasks") + 1] : "10,11,12").split(",").map(Number);
import { readdirSync } from "node:fs";
const taskFile = (n) => readdirSync(join(REPO, "tools/agent-eval/tasks")).find((f) => f.startsWith(`${n}-`));
const meta = JSON.parse(readFileSync(join(REPO, "tools/agent-eval/tasks/models-visual.json"), "utf8"));
const SYSTEM = `You judge two rendered browser-frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels: each candidate shows two frames of the same page about 2 seconds apart. Judge with the task rubric. Score each candidate 1-5 on each of the five rubric criteria (5 best, 1 broken or empty). Be strict; do not guess which library made which. Then pick the better candidate overall ("A", "B" or "tie").
Answer with ONLY JSON: {"A":[n,n,n,n,n],"B":[n,n,n,n,n],"winner":"A"|"B"|"tie","why":"one sentence"}`;
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(20261106 + subjBatch.length);
const out = [];
for (const task of TASKS) for (const idx of [1, 2, 3]) {
  const ids = { subject: `${subjBatch}-t${task}-${subjArm}-r${idx}`, three: `${threeBatch}-t${task}-three-r${idx}` };
  const pair = { task, idx, ids, judges: [] };
  const files = (id) => [1, 2].map((f) => join(framesDir, `${id}-${f}.png`));
  if (![...files(ids.subject), ...files(ids.three)].every(existsSync)) { pair.error = "missing frames"; out.push(pair); continue; }
  const taskPrompt = readFileSync(join(REPO, "tools/agent-eval/tasks", taskFile(task)), "utf8");
  for (let j = 0; j < 3; j += 1) {
    const order = rand() < 0.5 ? ["three", "subject"] : ["subject", "three"];
    const content = [{ type: "text", text: `Task given to both programs:\n${taskPrompt.split("The provided framework")[0]}\n\nRubric:\n${meta[task].visualRubric}` }];
    order.forEach((who, i) => {
      content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
      for (const f of files(ids[who])) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } });
    });
    content.push({ type: "text", text: "Judge now. ONLY the JSON object." });
    try {
      const r = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: SYSTEM, messages: [{ role: "user", content }] }, { session: `vj505-${task}-${idx}-${j}`, jobType: "agent-eval-judge" });
      const text = (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
      const sum = (a) => a.reduce((x, y) => x + Number(y), 0);
      const sc = { [order[0]]: sum(json.A), [order[1]]: sum(json.B) };
      const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
      pair.judges.push({ order, totals: sc, winner, why: String(json.why ?? "").slice(0, 250) });
    } catch (e) { pair.judges.push({ order, error: String(e.message).slice(0, 160) }); }
  }
  const votes = pair.judges.map((x) => x.winner).filter(Boolean);
  const cnt = (w) => votes.filter((v) => v === w).length;
  pair.majority = cnt("subject") >= 2 ? "subject" : cnt("three") >= 2 ? "three" : "tie";
  pair.votes = { subject: cnt("subject"), three: cnt("three"), tie: cnt("tie") };
  console.log(task, idx, pair.majority, JSON.stringify(pair.votes));
  out.push(pair);
}
writeFileSync(outFile, JSON.stringify({ model: DEFAULT_MODEL, subjectBatch: subjBatch, threeBatch, pairs: out }, null, 2));
