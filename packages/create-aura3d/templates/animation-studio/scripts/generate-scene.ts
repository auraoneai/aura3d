/**
 * generate-scene.ts — the SECOND-SCENE test (heuristic Director).
 *
 * Builds a DIFFERENT scene input (different shots/dialogue/blocking intent), runs it
 * through the deterministic Director → EpisodeDocument → validates it → writes the
 * document JSON. Then `AURA_DOCUMENT=<that json> ... render-live.ts` renders it through
 * the SAME generic player — proving the renderer + Director generalize beyond Moon Garden.
 *
 * HONEST SCOPE: it reuses the Moon Garden cast + set assets (so no catalog resolution is
 * needed here) but generates entirely NEW direction (blocking, camera, shots, prop
 * scatter, world-state). The captions still come from the Moon Garden dialogue track
 * (dialogue-in-document is a follow-up). This proves the Director produces a *valid,
 * renderable, distinct* scene — NOT that arbitrary prompts are "watchable" (the human
 * rubric / watchability gate covers that, and remains the open risk).
 *
 * Run: pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/generate-scene.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileEpisodeDocument } from "../src/director/compile-episode-document.js";
import type { DirectorSceneInput } from "../src/director/director-heuristics.js";
import { validateEpisodeDocument } from "../src/animation-episode-validator.js";
import { moonGardenDocument } from "../src/examples/moon-garden.example.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "dist", "generated");
const OUT_PATH = resolve(OUT_DIR, "second-scene.document.json");

// A different scene: both characters ENTER from the sides, CONVERGE through the middle
// beats, and the speaker alternates — completely different staging from Moon Garden.
const secondScene: DirectorSceneInput = {
  duration: 60,
  characters: [
    { id: "miko", entersFrom: "left" },
    { id: "luma", entersFrom: "right" }
  ],
  shots: [
    { shotId: "open", startTime: 0, endTime: 15 },
    { shotId: "approach", startTime: 15, endTime: 32 },
    { shotId: "together", startTime: 32, endTime: 48 },
    { shotId: "close", startTime: 48, endTime: 60 }
  ],
  dialogue: [
    { lineId: "l1", speakerId: "miko", startTime: 1, endTime: 14 },
    { lineId: "l2", speakerId: "luma", startTime: 16, endTime: 31 },
    { lineId: "l3", speakerId: "miko", startTime: 33, endTime: 47 },
    { lineId: "l4", speakerId: "luma", startTime: 49, endTime: 59 }
  ],
  walkableBounds: { min: [-3.6, 0, -2], max: [3.6, 0, 2] },
  props: [{ propId: "mushroom", count: 7, scaleRange: [0.06, 0.16], feetOffset: 2.8 }],
  clips: { idle: "idle", walk: "walk", gesture: "wave" }
};

async function main(): Promise<void> {
  const result = await compileEpisodeDocument({
    id: "second-scene-001",
    duration: 60,
    assets: moonGardenDocument.assets,
    set: moonGardenDocument.set,
    scene: secondScene
  });

  const validation = validateEpisodeDocument(result.document, {
    availableClipsByCharacter: {
      miko: ["Loops"],
      luma: ["Armature|ArmatureAction", "Armature|Armature.001Action", "Armature|PoseLib"]
    }
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(result.document, null, 2)}\n`);

  console.log("=== Director second-scene test (heuristics-only) ===");
  console.log(`document: ${OUT_PATH}`);
  console.log(`shots: ${result.document.shots.map((s) => `${s.shotId}[${s.startTime}-${s.endTime}] ${s.presetId}`).join(", ")}`);
  console.log(
    `blocking: ${result.document.blocking
      .map((b) => `${b.characterId} (${b.shots.map((s) => `${s.shotId}:${s.waypoints.length}wp/${s.clip}`).join(", ")})`)
      .join(" | ")}`
  );
  console.log(`setDressing: ${result.document.setDressing.length} props`);
  console.log(`shape-valid: ${result.validation.ok}  coherence-valid: ${validation.ok}`);
  if (validation.errors.length) console.log("ERRORS:\n - " + validation.errors.join("\n - "));
  if (validation.warnings.length) console.log("warnings:\n - " + validation.warnings.join("\n - "));
  console.log(
    `\nrender it:\n  AURA_DOCUMENT=${OUT_PATH} AURA_OUTPUT_DIR=dist/episodes/second-scene \\\n` +
      `    pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/render-live.ts`
  );

  if (!result.validation.ok || !validation.ok) process.exitCode = 1;
}

void main();
