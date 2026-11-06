#!/usr/bin/env node
// Blind visual judge for the cold-start trial. One judge call per (task, run index): the Aura3D and three.js frames of that
// pair are shown as candidates A and B in a seeded random order, with no library names, source or file names.
//   node tools/agent-eval/judge-visual.mjs <batch> <framesDir> [--seed N]   -> evidence/agent-eval/<batch>/visual-judge.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const [batch, framesDir, ...rest] = process.argv.slice(2);
const seed = rest.includes("--seed") ? Number(rest[rest.indexOf("--seed") + 1]) : 20261106;
const batchDir = join(REPO, "evidence/agent-eval", batch);
const taskText = (n) => readFileSync(join(REPO, "tools/agent-eval/tasks", readFileSyncName(n)), "utf8").split("The rendering contract")[0];
import { readdirSync } from "node:fs";
function readFileSyncName(n) {
  return readdirSync(join(REPO, "tools/agent-eval/tasks")).find((f) => f.startsWith(`0${n}-`));
}

const RUBRIC = `You judge two rendered browser frames sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows two frames of the same page a few seconds apart (frame 1 then frame 2).
Score each candidate 1 to 5 (5 best, 3 acceptable, 1 broken or empty) on:
- readability: the subject is clearly visible, centred and fully framed, not black or washed out
- lighting: depth, shading, shadows, contrast and colour that make form read
- materials: surface quality (metal/rough, colour variation, texture, no flat placeholder look)
- fidelity: how many of the task requirements are visibly met
- polish: absence of artifacts, aliasing, z-fighting, missing parts
Then pick the better candidate overall ("A", "B" or "tie"). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"readability":n,"lighting":n,"materials":n,"fidelity":n,"polish":n},"B":{...same keys},"winner":"A"|"B"|"tie","why":"one sentence"}`;

const ports = {};
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(seed);
const results = [];
for (const task of [1, 2, 3, 4, 5, 8, 9]) {
  for (const idx of [1, 2, 3]) {
    const ids = { aura: `${batch}-t${task}-aura-r${idx}`, three: `${batch}-t${task}-three-r${idx}` };
    const flip = rand() < 0.5;
    const order = flip ? ["three", "aura"] : ["aura", "three"];
    const content = [{ type: "text", text: `Task given to both programs:\n${taskText(task)}` }];
    let missing = false;
    for (const [i, arm] of order.entries()) {
      content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
      for (const f of [1, 2]) {
        const file = join(framesDir, `${ids[arm]}-${f}.png`);
        if (!existsSync(file)) missing = true;
        else content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(file).toString("base64") } });
      }
    }
    if (missing) {
      results.push({ task, idx, error: "missing frames" });
      continue;
    }
    try {
      const response = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: RUBRIC, messages: [{ role: "user", content }] }, { session: `visjudge-${task}`, jobType: "agent-eval-judge" });
      const text = (response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
      const sum = (s) => Object.values(s).reduce((a, b) => a + Number(b), 0);
      const scores = { [order[0]]: json.A, [order[1]]: json.B };
      const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
      results.push({ task, idx, order, scores, totals: { aura: sum(scores.aura), three: sum(scores.three) }, winner, why: String(json.why ?? "").slice(0, 300) });
      console.log(task, idx, "aura", sum(scores.aura), "three", sum(scores.three), "winner", winner);
    } catch (error) {
      results.push({ task, idx, error: String(error.message).slice(0, 200) });
      console.error(task, idx, "judge failed", String(error.message).slice(0, 120));
    }
  }
}
writeFileSync(join(batchDir, "visual-judge.json"), JSON.stringify({ model: DEFAULT_MODEL, seed, rubricMax: 25, results }, null, 2));
