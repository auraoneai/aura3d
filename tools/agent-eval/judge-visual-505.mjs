#!/usr/bin/env node
// bench505 blind visual judge: THREE independent judge calls per pair, randomised A/B order per call, labels hidden, majority vote.
//   node tools/agent-eval/judge-visual-505.mjs <framesDir> <outFile>
// Pairs: aura (batch bench505-effects) vs three, aura-sheet (batch bench505-effects-sheet) vs three, tasks 10 and 11, idx 1..3.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";
import { mulberry32 } from "./run.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const [framesDir, outFile] = process.argv.slice(2);
const specs = JSON.parse(readFileSync(join(REPO, "evidence/agent-eval-505/effects/tasks505.json"), "utf8"));
const client = createPrismClient({ key: loadKey() });
const rand = mulberry32(20261106);
const SYSTEM = (rubric) => `You judge two rendered browser frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels. Each candidate shows two frames of the same page about 3 seconds apart.
Rubric for this task: ${rubric}
Score each candidate 1 to 5 on each of the five numbered criteria (5 best, 1 broken or empty). Then pick the better candidate overall ("A", "B" or "tie"). Be strict and do not guess which library made which.
Answer with ONLY JSON: {"A":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n},"B":{"c1":n,"c2":n,"c3":n,"c4":n,"c5":n},"winner":"A"|"B"|"tie","why":"one sentence"}`;
const sum = (s) => Object.values(s).reduce((a, b) => a + Number(b), 0);
const prefixes = { aura: "bench505-effects", "aura-sheet": "bench505-effects-sheet", three: "bench505-effects" };
const results = [];
for (const spec of specs) {
  for (const idx of [1, 2, 3]) {
    for (const subject of ["aura", "aura-sheet"]) {
      const id = (arm) => `${prefixes[arm]}-t${spec.num}-${arm === "three" ? "three" : "aura"}-r${idx}`;
      const files = (arm) => [1, 2].map((f) => join(framesDir, `${id(arm)}-${f}.png`));
      const rec = { task: spec.id, idx, subject, vs: "three", calls: [] };
      if ([...files(subject), ...files("three")].some((f) => !existsSync(f))) {
        rec.error = "missing frames";
        results.push(rec);
        continue;
      }
      for (let call = 0; call < 3; call += 1) {
        const order = rand() < 0.5 ? ["three", subject] : [subject, "three"];
        const content = [{ type: "text", text: `Task given to both programs:\n${spec.prompt}` }];
        order.forEach((arm, i) => {
          content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
          for (const f of files(arm)) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } });
        });
        content.push({ type: "text", text: "Judge both candidates now. Answer with ONLY the JSON object." });
        try {
          const res = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: SYSTEM(spec.visualRubric), messages: [{ role: "user", content }] }, { session: `vj505-${spec.num}`, jobType: "agent-eval-judge" });
          const text = (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
          const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
          const scores = { [order[0]]: json.A, [order[1]]: json.B };
          const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
          rec.calls.push({ order, winner, totals: { [subject]: sum(scores[subject]), three: sum(scores.three) }, scores, why: String(json.why ?? "").slice(0, 300) });
        } catch (e) {
          rec.calls.push({ order, error: String(e.message).slice(0, 200) });
        }
      }
      const tally = { [subject]: 0, three: 0, tie: 0 };
      for (const c of rec.calls) if (c.winner) tally[c.winner] += 1;
      rec.tally = tally;
      rec.majority = tally[subject] >= 2 ? subject : tally.three >= 2 ? "three" : "tie";
      results.push(rec);
      console.log(spec.id, idx, subject, JSON.stringify(tally), rec.majority);
    }
  }
}
writeFileSync(outFile, JSON.stringify({ model: DEFAULT_MODEL, callsPerPair: 3, results }, null, 2));
