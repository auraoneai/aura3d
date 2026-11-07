// Blind pairwise visual judge, 3 independent calls per pair, randomised A/B per call, labels hidden, majority vote.
// Same protocol as tools/agent-eval/judge-visual-505.mjs (bench/505-models). usage: node judge.mjs <out.json>
// Candidate frames: two PNGs each (about 2 s apart). Task text and rubric come from the benchmark task files.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "../../../tools/agent-eval/lib/prism.mjs";
const T = "/tmp/effects514/tasks", R = "/tmp/effects514/ref", F = "evidence/effects-514/frames";
const rub = JSON.parse(readFileSync(`${T}/rubrics.json`, "utf8"));
const mrub = JSON.parse(readFileSync(`${T}/models-visual.json`, "utf8"));
const taskText = (f) => readFileSync(f, "utf8").split("The provided framework")[0];
const pairs = [
  { name: "canyon: new helpers vs three", task: taskText(`${T}/10.md`), rubric: rub["10"].visualRubric, subject: [`${F}/canyon-after-1.png`, `${F}/canyon-after-2.png`], other: [`${R}/bench505-environments-t10-three-r1-1.png`, `${R}/bench505-environments-t10-three-r1-2.png`], otherLabel: "three" },
  { name: "canyon: benchmark aura r2 vs three (baseline)", task: taskText(`${T}/10.md`), rubric: rub["10"].visualRubric, subject: [`${R}/bench505-environments-t10-aura-r2-1.png`, `${R}/bench505-environments-t10-aura-r2-2.png`], other: [`${R}/bench505-environments-t10-three-r1-1.png`, `${R}/bench505-environments-t10-three-r1-2.png`], otherLabel: "three" },
  { name: "reef: new helpers vs three", task: taskText(`${T}/13.md`), rubric: rub["13"].visualRubric, subject: [`${F}/reef-after-1.png`, `${F}/reef-after-2.png`], other: [`${R}/bench505-environments-t13-three-r1-1.png`, `${R}/bench505-environments-t13-three-r1-2.png`], otherLabel: "three" },
  { name: "reef: benchmark aura r2 vs three (baseline)", task: taskText(`${T}/13.md`), rubric: rub["13"].visualRubric, subject: [`${R}/bench505-environments-t13-aura-r2-1.png`, `${R}/bench505-environments-t13-aura-r2-2.png`], other: [`${R}/bench505-environments-t13-three-r1-1.png`, `${R}/bench505-environments-t13-three-r1-2.png`], otherLabel: "three" },
  { name: "canyon: new helpers vs same scene with plain material", task: taskText(`${T}/10.md`), rubric: rub["10"].visualRubric, subject: [`${F}/canyon-after-1.png`, `${F}/canyon-after-2.png`], other: [`${F}/canyon-before-1.png`, `${F}/canyon-before-2.png`], otherLabel: "before" },
  { name: "reef: new helpers vs same scene without them", task: taskText(`${T}/13.md`), rubric: rub["13"].visualRubric, subject: [`${F}/reef-after-1.png`, `${F}/reef-after-2.png`], other: [`${F}/reef-before-1.png`, `${F}/reef-before-2.png`], otherLabel: "before" },
  { name: "lighthouse: new beam vs existing lightCone (no three frames exist)", task: taskText(`${T}/models10.md`), rubric: mrub["10"].visualRubric, subject: [`${F}/lighthouse-after-1.png`, `${F}/lighthouse-after-2.png`], other: [`${F}/lighthouse-before-1.png`, `${F}/lighthouse-before-2.png`], otherLabel: "before" }
];
const SYSTEM = `You judge two rendered browser-frame sets (candidate A and candidate B) produced by two different programs for the same task. You see only pixels: each candidate shows two frames of the same page about 2 seconds apart. Judge with the task rubric. Score each candidate 1-5 on each of the five rubric criteria (5 best, 1 broken or empty). Be strict; do not guess which library made which. Then pick the better candidate overall ("A", "B" or "tie").
Answer with ONLY JSON: {"A":[n,n,n,n,n],"B":[n,n,n,n,n],"winner":"A"|"B"|"tie","why":"one sentence"}`;
let seed = 20261106514;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const client = createPrismClient({ key: loadKey() });
const out = [];
const only = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null;
for (const [pi, pair] of pairs.entries()) {
  if (only && !only.includes(pi)) continue;
  const files = [...pair.subject, ...pair.other];
  if (!files.every(existsSync)) { out.push({ name: pair.name, error: "missing frames" }); continue; }
  const res = { name: pair.name, other: pair.otherLabel, judges: [] };
  for (let j = 0; j < 3; j += 1) {
    const order = rand() < 0.5 ? ["other", "subject"] : ["subject", "other"];
    const content = [{ type: "text", text: `Task given to both programs:\n${pair.task}\n\nRubric:\n${pair.rubric}` }];
    order.forEach((who, i) => {
      content.push({ type: "text", text: `Candidate ${"AB"[i]}:` });
      for (const f of (who === "subject" ? pair.subject : pair.other)) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(f).toString("base64") } });
    });
    content.push({ type: "text", text: "Judge now. ONLY the JSON object." });
    try {
      const r = await client.messages({ model: DEFAULT_MODEL, max_tokens: 800, system: SYSTEM, messages: [{ role: "user", content }] }, { session: `e514-${pi}-${j}`, jobType: "agent-eval-judge" });
      const text = (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const json = JSON.parse(/\{[\s\S]*\}/.exec(text)[0]);
      const sum = (a) => a.reduce((x, y) => x + Number(y), 0);
      const totals = { [order[0]]: sum(json.A), [order[1]]: sum(json.B) };
      const winner = json.winner === "tie" ? "tie" : json.winner === "A" ? order[0] : order[1];
      res.judges.push({ order, totals, winner, why: String(json.why ?? "").slice(0, 250) });
    } catch (e) { res.judges.push({ order, error: String(e.message).slice(0, 160) }); }
  }
  const votes = res.judges.map((x) => x.winner).filter(Boolean);
  const cnt = (w) => votes.filter((v) => v === w).length;
  res.votes = { subject: cnt("subject"), other: cnt("other"), tie: cnt("tie") };
  res.majority = res.votes.subject >= 2 ? "subject" : res.votes.other >= 2 ? "other" : "tie";
  const mean = (k) => { const v = res.judges.filter((x) => x.totals).map((x) => x.totals[k]); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null; };
  res.meanTotal = { subject: mean("subject"), other: mean("other") };
  console.log(pair.name, res.majority, JSON.stringify(res.votes), JSON.stringify(res.meanTotal));
  out.push(res);
}
writeFileSync(process.argv[2], JSON.stringify({ model: DEFAULT_MODEL, pairs: out }, null, 2));
