// Blind visual judge for lane 514 (same rubric and procedure as tools/agent-eval/judge-visual.mjs on origin/exp/turn-gap-504):
// one call per (task, three.js run); candidate A/B order seeded-random; pixels only. 3 calls per pair.
// usage: node judge-514.mjs <judgeToolsDir> <taskMdDir> <framesDir> <out.json> <label> <ourFrame> <task> <threePrefix> [seed]
//   <ourFrame>  = the Aura3D PNG being judged (before or after); <threePrefix> e.g. t10-three  -> <framesDir>/<prefix>-r{1,2,3}-1.png
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [toolsDir, taskDir, framesDir, outFile, label, ourFrame, task, threePrefix, seedArg] = process.argv.slice(2);
const { createPrismClient, loadKey, DEFAULT_MODEL } = await import(join(toolsDir, "lib/prism.mjs"));
const seed = Number(seedArg ?? 20261106);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = mulberry32(seed);
const taskText = readFileSync(join(taskDir, task), "utf8").split("The rendering contract")[0];
const RUBRIC = `You judge two rendered browser frames sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows one or two frames of the same program. Do not try to identify the programs.
Score each candidate 1 to 5 (5 best, 3 acceptable, 1 broken or empty) on:
- readability: the subject is clearly visible, centred and fully framed, not black or washed out
- lighting: depth, shading, shadows, contrast and colour that make form read
- materials: surface quality (metal/rough, colour variation, texture, no flat placeholder look)
- fidelity: how many of the task requirements are visibly met
- polish: absence of artifacts, aliasing, z-fighting, missing parts
Then pick the better candidate overall ("A", "B" or "tie"). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"readability":n,"lighting":n,"materials":n,"fidelity":n,"polish":n},"B":{...same keys},"winner":"A"|"B"|"tie","why":"one sentence"}`;
const client = createPrismClient({ key: loadKey() });
const img = (f) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } });
const results = [];
for (const idx of [1, 2, 3]) {
  const files = { aura: ourFrame, three: join(framesDir, `${threePrefix}-r${idx}-1.png`) };
  const order = rand() < 0.5 ? ["three", "aura"] : ["aura", "three"];
  const content = [{ type: "text", text: `Task given to both programs:\n${taskText}` }];
  for (const [i, arm] of order.entries()) { content.push({ type: "text", text: `Candidate ${"AB"[i]}:` }); content.push(img(files[arm])); }
  content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
  try {
    const response = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: RUBRIC, messages: [{ role: "user", content }] }, { session: `visjudge514-${label}`, jobType: "agent-eval-judge" });
    const text = (response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
    const sum = (s) => Object.values(s).reduce((a, b) => a + Number(b), 0);
    const scores = { [order[0]]: json.A, [order[1]]: json.B };
    const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
    results.push({ label, idx, order, scores, totals: { aura: sum(scores.aura), three: sum(scores.three) }, winner, why: String(json.why ?? "").slice(0, 300) });
    console.log(label, idx, "aura", sum(scores.aura), "three", sum(scores.three), "winner", winner);
  } catch (error) { results.push({ label, idx, error: String(error.message).slice(0, 200) }); console.error(label, idx, "judge failed", String(error.message).slice(0, 160)); }
}
writeFileSync(outFile, JSON.stringify({ model: DEFAULT_MODEL, seed, label, ourFrame, task, rubricMax: 25, results }, null, 2));
