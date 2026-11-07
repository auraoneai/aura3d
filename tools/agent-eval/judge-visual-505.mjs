#!/usr/bin/env node
// Blind pairwise visual judge, 3 independent calls per pair (random A/B order per call, labels hidden), majority vote, all calls recorded.
//   node tools/agent-eval/judge-visual-505.mjs <framesDir> <out.json> [--seed N]
// Pairs: aura (bench505-interactive) vs three, aura-sheet (bench505-interactive-sheet) vs three; tasks 10 and 11; run index 1..3.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";
const [framesDir, outFile, ...rest] = process.argv.slice(2);
const seed = rest.includes("--seed") ? Number(rest[rest.indexOf("--seed") + 1]) : 20261106;
const meta = JSON.parse(readFileSync(join(import.meta.dirname, "tasks/interactive-meta.json"), "utf8"));
const taskFile = { 10: "10-interactive-garden.md", 11: "11-interactive-solar.md" };
const FRAMES = { 10: ["1", "2"], 11: ["1", "focus-1"] };
const RUBRIC = (rubric) => `You judge two sets of rendered browser frames (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows frames of the same page captured at different moments${"" } (for the solar system task: an overview frame and a focused frame).
Task-specific rubric: ${rubric}
Score each candidate on each of the five rubric criteria 1 to 5 (5 best, 1 broken or empty). Be strict and do not guess which library made which.
Then pick the better candidate overall ("A", "B" or "tie").
Answer with ONLY JSON: {"A":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n},"B":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n},"winner":"A"|"B"|"tie","why":"one sentence"}`;
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(seed);
const sum = (s) => Object.values(s).reduce((a, b) => a + Number(b), 0);
const out = [];
for (const cmp of [{ name: "aura-vs-three", subject: "bench505-interactive", subjectArm: "aura" }, { name: "aura-sheet-vs-three", subject: "bench505-interactive-sheet", subjectArm: "aura" }]) {
  for (const task of [10, 11]) for (const idx of [1, 2, 3]) {
    const ids = { subject: `${cmp.subject}-t${task}-aura-r${idx}`, three: `bench505-interactive-t${task}-three-r${idx}` };
    const files = (id) => FRAMES[task].map((f) => join(framesDir, `${id}-${f}.png`));
    const missing = [...files(ids.subject), ...files(ids.three)].filter((f) => !existsSync(f));
    const rec = { comparison: cmp.name, task, idx, ids, calls: [] };
    if (missing.length && files(ids.three).every((f) => existsSync(f)) && !files(ids.subject).some((f) => existsSync(f))) { rec.forfeit = "three"; rec.majority = "three"; rec.note = "Aura3D run has no frames (build failed or never finished): counted as a three.js win by forfeit, no judge calls"; out.push(rec); continue; }
    if (missing.length) { rec.error = `missing frames: ${missing.map((m) => m.split("/").pop()).join(",")}`; out.push(rec); continue; }
    for (let call = 1; call <= 3; call++) {
      const order = rand() < 0.5 ? ["three", "subject"] : ["subject", "three"];
      const content = [{ type: "text", text: `Task given to both programs:\n${readFileSync(join(import.meta.dirname, "tasks", taskFile[task]), "utf8")}` }];
      order.forEach((who, i) => { content.push({ type: "text", text: `Candidate ${"AB"[i]}:` }); for (const f of files(ids[who])) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } }); });
      content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
      try {
        const resp = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: RUBRIC(meta[task].visualRubric), messages: [{ role: "user", content }] }, { session: `vj505-${task}`, jobType: "agent-eval-judge" });
        const text = (resp.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
        const j = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
        const scores = { [order[0]]: j.A, [order[1]]: j.B };
        const winner = j.winner === "tie" ? "tie" : j.winner === "A" ? order[0] : order[1];
        rec.calls.push({ call, order, winner: winner === "subject" ? cmp.subjectArm + (cmp.name.includes("sheet") ? "-sheet" : "") : winner, side: winner, totals: { subject: sum(scores.subject), three: sum(scores.three) }, scores, why: String(j.why ?? "").slice(0, 300) });
      } catch (e) { rec.calls.push({ call, error: String(e.message).slice(0, 200) }); }
    }
    const tally = { subject: 0, three: 0, tie: 0 };
    for (const c of rec.calls) if (c.side) tally[c.side]++;
    rec.tally = tally;
    rec.majority = tally.subject > tally.three && tally.subject >= 2 ? "subject" : tally.three > tally.subject && tally.three >= 2 ? "three" : tally.subject === tally.three ? "tie" : tally.subject > tally.three ? "subject" : "three";
    console.log(cmp.name, task, idx, JSON.stringify(tally), rec.majority);
    out.push(rec);
  }
}
writeFileSync(outFile, JSON.stringify({ model: DEFAULT_MODEL, seed, callsPerPair: 3, results: out }, null, 2));
