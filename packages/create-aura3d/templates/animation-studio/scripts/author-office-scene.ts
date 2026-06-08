/**
 * author-office-scene.ts — demonstrates the INTENDED architecture: the AI harness AUTHORS the
 * dialogue (a coherent exchange), and the CLI/director stages + renders it. This replaces the
 * template's generic `synthesizeDialogue` filler ("look at this part" pointing at nothing) with a
 * real, readable argument. Run: `tsx scripts/author-office-scene.ts` then `episode:render-3d`.
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSceneFromPrompt } from "../src/director/prompt-to-scene.js";
import { directScene } from "../src/director/director-heuristics.js";
import { estimateSpeechDuration } from "../src/episode-document.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Base scene gives us the cast (worker-1/worker-2), the OFFICE set, camera shots, assets.
const base = generateSceneFromPrompt("two office workers arguing about a deadline");
const doc = base.document as any;
const [a, b] = base.cast;

// AUTHORED dialogue — a coherent argument about a release deadline. Each line makes sense as a
// reply to the previous one (no hollow "look at this part"). This is what the AI harness writes.
const authored: { s: string; t: string }[] = [
  { s: a, t: "We are not shipping on Friday." },
  { s: b, t: "Yes we are. The login feature is done." },
  { s: a, t: "It is not done. The tests are still failing." },
  { s: b, t: "Those tests are flaky. We can ignore them." },
  { s: a, t: "We are not ignoring failing tests before a release." },
  { s: b, t: "Fine. Give me one more day and I will fix them." }
];

let cursor = 0.4;
const lines = authored.map((x, i) => {
  const start = Number(cursor.toFixed(3));
  const dur = estimateSpeechDuration(x.t);
  let end = Number((start + dur).toFixed(3));
  if (end > doc.duration) end = doc.duration;
  cursor = end + 0.3; // a beat between lines
  return { lineId: `l${i}`, speakerId: x.s, text: x.t, startTime: start, endTime: end };
});
doc.dialogue = { language: "en", lines };

// Re-direct so the acting (who talks / reacts / gestures, and when) matches the AUTHORED dialogue.
const directed = directScene(doc.id, {
  duration: doc.duration,
  characters: [
    { id: a, entersFrom: "left" },
    { id: b, entersFrom: "right" }
  ],
  shots: doc.shots,
  dialogue: lines.map((l) => ({ lineId: l.lineId, speakerId: l.speakerId, startTime: l.startTime, endTime: l.endTime, text: l.text })),
  walkableBounds: doc.walkableBounds,
  props: [],
  durationEstimator: estimateSpeechDuration
}) as any;
doc.blocking = directed.blocking;
doc.shots = directed.shots;
doc.setDressing = directed.setDressing;
doc.worldState = directed.worldState;

const out = JSON.stringify(doc, null, 2) + "\n";
writeFileSync(resolve(ROOT, "dist/scene/working.document.json"), out);
writeFileSync(resolve(ROOT, "dist/episodes/acceptance/office.document.json"), out);
console.log(`authored office scene → ${lines.length} lines, cast ${base.cast.join(", ")}, set ${base.setTemplateId}`);
for (const l of lines) console.log(`  [${l.startTime}-${l.endTime}] ${l.speakerId}: "${l.text}"`);
