#!/usr/bin/env node
// bench505 physics blind visual judge: THREE independent judge calls per pair, randomised A/B order per call, labels hidden, majority vote.
//   node tools/agent-eval/judge-physics.mjs <auraFramesDir> <threeFramesDir> <auraPrefix> <threePrefix> <outFile>
// Frames are <dir>/<prefix>-t<task>-<arm>-r<idx>-{1,2}.png (two frames 3 s apart, after the button click).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";

const [auraDir, threeDir, auraPrefix, threePrefix, outFile] = process.argv.slice(2);
const TASKS_DIR = join(import.meta.dirname, "tasks");
const rubrics = JSON.parse(readFileSync(join(TASKS_DIR, "visual-rubrics-505-physics.json"), "utf8"));
const taskFile = { 10: "10-physics-domino.md", 11: "11-physics-crates.md", 12: "12-physics-plinko.md" };
const taskText = (n) => readFileSync(join(TASKS_DIR, taskFile[n]), "utf8");
const SYSTEM = `You judge two rendered browser frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows two frames of the same page a few seconds apart, taken shortly after the user pressed the action button of the app.
Score each candidate 1 to 5 (5 best, 3 acceptable, 1 broken or empty) on the five criteria of the task rubric you are given, in the order given: composition, lighting, materials, physics/readability, polish/UI. Keys: c1..c5.
Then pick the better candidate overall ("A", "B" or "tie"). A blank, black or error page is broken (1s). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n},"B":{...same keys},"winner":"A"|"B"|"tie","why":"one sentence"}`;
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(20261106 ^ auraPrefix.length);
const results = [];
for (const task of [10, 11, 12]) {
  for (const idx of [1, 2, 3]) {
    const files = { aura: [1, 2].map((f) => join(auraDir, `${auraPrefix}-t${task}-aura-r${idx}-${f}.png`)), three: [1, 2].map((f) => join(threeDir, `${threePrefix}-t${task}-three-r${idx}-${f}.png`)) };
    const have = { aura: files.aura.every(existsSync), three: files.three.every(existsSync) };
    if (!have.aura || !have.three) {
      results.push({ task, idx, noFrames: Object.entries(have).filter(([, v]) => !v).map(([k]) => k), calls: [] });
      continue;
    }
    const calls = [];
    for (let c = 0; c < 3; c += 1) {
      const order = rand() < 0.5 ? ["three", "aura"] : ["aura", "three"];
      const content = [{ type: "text", text: `Task given to both programs:\n${taskText(task)}\nTask rubric:\n${rubrics[task]}` }];
      for (const [i, arm] of order.entries()) {
        content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
        for (const f of files[arm]) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } });
      }
      content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
      try {
        const response = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: SYSTEM, messages: [{ role: "user", content }] }, { session: `visjudge505-${task}-${idx}-${c}`, jobType: "agent-eval-judge" });
        const text = (response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
        const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
        const sum = (s) => Object.values(s).reduce((a, b) => a + Number(b), 0);
        const scores = { [order[0]]: json.A, [order[1]]: json.B };
        const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
        calls.push({ order, scores, totals: { aura: sum(scores.aura), three: sum(scores.three) }, winner, why: String(json.why ?? "").slice(0, 300) });
      } catch (error) {
        calls.push({ order, error: String(error.message).slice(0, 200) });
      }
    }
    const votes = calls.filter((c) => c.winner).map((c) => c.winner);
    const n = (w) => votes.filter((v) => v === w).length;
    const majority = n("aura") >= 2 ? "aura" : n("three") >= 2 ? "three" : votes.length ? "tie" : "none";
    results.push({ task, idx, calls, votes, majority });
    console.log(task, idx, votes.join(","), "->", majority);
  }
}
writeFileSync(outFile, JSON.stringify({ model: DEFAULT_MODEL, auraPrefix, threePrefix, judgeCallsPerPair: 3, results }, null, 2));
