#!/usr/bin/env node
// Blind visual judge for the 505 benchmark. For every (task, run index) and every comparison (aura vs three, aura-sheet vs three):
// THREE independent judge calls, each with its own randomised A/B order and hidden labels; majority vote; all three recorded.
//   AGENT_EVAL_EVIDENCE=... node tools/agent-eval/judge-505.mjs <batch> <framesDir> [--seed N]  -> <batch>/visual-judge.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const [batch, framesDir, ...rest] = process.argv.slice(2);
const seed = rest.includes("--seed") ? Number(rest[rest.indexOf("--seed") + 1]) : 20261106;
const batchDir = join(REPO, process.env.AGENT_EVAL_EVIDENCE ?? "evidence/agent-eval", batch);
const meta = JSON.parse(readFileSync(join(REPO, "tools/agent-eval/tasks/games-meta.json"), "utf8"));
const taskFile = { 11: "11-games-1.md", 12: "12-games-2.md", 13: "13-games-3.md", 14: "14-games-4.md" };
const RUBRIC = (task) => `You judge two rendered browser frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows two frames of the same page a few seconds apart (the second is taken after a start input was sent).
Score each candidate 1 to 5 (5 best, 3 acceptable, 1 broken or empty) on:
- readability: the subject is clearly visible, centred and fully framed, not black or washed out
- lighting: depth, shading, shadows, contrast and colour that make form read
- materials: surface quality, colour variation, no flat placeholder look
- fidelity: how many of the task requirements are visibly met
- polish: absence of artifacts, aliasing, z-fighting, missing parts, HUD legibility
Task-specific guidance: ${meta[task].visualRubric}
Then pick the better candidate overall ("A", "B" or "tie"). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"readability":n,"lighting":n,"materials":n,"fidelity":n,"polish":n},"B":{...same keys},"winner":"A"|"B"|"tie","why":"one sentence"}`;
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(seed);
const comparisons = [["aura", "three"], ["aura-sheet", "three"]];
const jobs = [];
for (const task of [11, 12, 13, 14]) for (const idx of [1, 2, 3]) for (const [subject, ref] of comparisons) for (let call = 1; call <= 3; call++) jobs.push({ task, idx, subject, ref, call, flip: rand() < 0.5 });
const sum = (s) => Object.values(s).reduce((a, b) => a + Number(b), 0);
async function one(job) {
  const { task, idx, subject, ref, call, flip } = job;
  const id = (arm) => `${batch}-t${task}-${arm}-r${idx}`;
  const order = flip ? [ref, subject] : [subject, ref];
  const content = [{ type: "text", text: `Task given to both programs:\n${readFileSync(join(REPO, "tools/agent-eval/tasks", taskFile[task]), "utf8")}` }];
  for (const [i, arm] of order.entries()) {
    content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
    for (const f of [1, 2]) {
      const file = join(framesDir, `${id(arm)}-${f}.png`);
      if (!existsSync(file)) return { ...job, error: "missing frames" };
      content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(file).toString("base64") } });
    }
  }
  content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
  try {
    const r = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: RUBRIC(task), messages: [{ role: "user", content }] }, { session: `visjudge505-${task}`, jobType: "agent-eval-judge" });
    const text = (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
    const scores = { [order[0]]: json.A, [order[1]]: json.B };
    const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
    return { task, idx, subject, ref, call, order, scores, totals: { [subject]: sum(scores[subject]), [ref]: sum(scores[ref]) }, winner, why: String(json.why ?? "").slice(0, 300) };
  } catch (e) {
    return { ...job, error: String(e.message).slice(0, 200) };
  }
}
const results = [];
// --retry-errors: re-run only calls that failed for harness reasons (parse/transport) with the same A/B order; everything else is kept as recorded.
const retry = rest.includes("--retry-errors");
const prior = retry ? JSON.parse(readFileSync(join(batchDir, "visual-judge.json"), "utf8")).calls : [];
if (retry) for (const c of prior) if (!c.error) results.push(c);
const queue = retry ? jobs.filter((j) => prior.some((c) => c.error && c.task === j.task && c.idx === j.idx && c.subject === j.subject && c.call === j.call)) : [...jobs];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) { const j = queue.shift(); const r = await one(j); results.push(r); console.log(j.task, j.idx, j.subject, j.call, r.winner ?? r.error); } }));
const pairs = {};
for (const r of results) { const k = `${r.task}|${r.idx}|${r.subject}`; (pairs[k] ??= { task: r.task, idx: r.idx, subject: r.subject, ref: r.ref, calls: [] }).calls.push(r); }
const majority = Object.values(pairs).map((p) => {
  const votes = { [p.subject]: 0, [p.ref]: 0, tie: 0 };
  for (const c of p.calls) if (c.winner) votes[c.winner]++;
  const valid = p.calls.filter((c) => c.winner).length;
  let winner = "tie";
  if (votes[p.subject] >= 2) winner = p.subject; else if (votes[p.ref] >= 2) winner = p.ref;
  const mean = (arm) => { const t = p.calls.filter((c) => c.totals).map((c) => c.totals[arm]); return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null; };
  return { task: p.task, idx: p.idx, subject: p.subject, ref: p.ref, validCalls: valid, votes, majority: winner, meanTotals: { [p.subject]: mean(p.subject), [p.ref]: mean(p.ref) } };
}).sort((a, b) => a.task - b.task || a.idx - b.idx || a.subject.localeCompare(b.subject));
writeFileSync(join(batchDir, "visual-judge.json"), JSON.stringify({ model: DEFAULT_MODEL, seed, rubricMax: 25, majority, calls: results.sort((a, b) => a.task - b.task || a.idx - b.idx || a.subject.localeCompare(b.subject) || a.call - b.call) }, null, 2));
