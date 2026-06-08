/**
 * animation-studio-director-eval — the Director quality harness.
 *
 * Generates documents for a SET of varied scene inputs through the Director, validates each
 * for coherence, and emits a rubric JSON. The harness automates GENERATION + COHERENCE; the
 * "watchable?" judgement is a HUMAN score (left null in the rubric) — because, as the design
 * doc states plainly, watchability is not automatable. This is the only honest measure of
 * whether the Director generalizes, and it deliberately leaves the hard call to a person.
 *
 * Run: pnpm exec tsx --tsconfig tsconfig.base.json tools/animation-studio-director-eval/index.ts [--out report.json]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileEpisodeDocument } from "../../packages/create-aura3d/templates/animation-studio/src/director/compile-episode-document.js";
import type { DirectorSceneInput } from "../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics.js";
import { validateEpisodeDocument } from "../../packages/create-aura3d/templates/animation-studio/src/animation-episode-validator.js";
import { moonGardenDocument } from "../../packages/create-aura3d/templates/animation-studio/src/examples/moon-garden.example.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bounds = { min: [-3.6, 0, -2] as [number, number, number], max: [3.6, 0, 2] as [number, number, number] };
const props = [{ propId: "mushroom", count: 6, scaleRange: [0.06, 0.16] as [number, number], feetOffset: 2.8 }];

const SCENES: { id: string; intent: string; scene: DirectorSceneInput }[] = [
  {
    id: "converge-chat",
    intent: "Two helpers enter from the sides and meet in the middle.",
    scene: {
      duration: 60,
      characters: [{ id: "miko", entersFrom: "left" }, { id: "luma", entersFrom: "right" }],
      shots: [
        { shotId: "open", startTime: 0, endTime: 18 },
        { shotId: "mid", startTime: 18, endTime: 40 },
        { shotId: "close", startTime: 40, endTime: 60 }
      ],
      dialogue: [
        { lineId: "a", speakerId: "miko", startTime: 1, endTime: 17 },
        { lineId: "b", speakerId: "luma", startTime: 19, endTime: 39 },
        { lineId: "c", speakerId: "miko", startTime: 41, endTime: 59 }
      ],
      walkableBounds: bounds,
      props
    }
  },
  {
    id: "static-conversation",
    intent: "A calm, mostly static chat.",
    scene: {
      duration: 45,
      characters: [{ id: "miko", entersFrom: "none" }, { id: "luma", entersFrom: "none" }],
      shots: [
        { shotId: "wide", startTime: 0, endTime: 22 },
        { shotId: "tight", startTime: 22, endTime: 45 }
      ],
      dialogue: [
        { lineId: "a", speakerId: "luma", startTime: 1, endTime: 21 },
        { lineId: "b", speakerId: "miko", startTime: 23, endTime: 44 }
      ],
      walkableBounds: bounds,
      props
    }
  },
  {
    id: "solo-monologue",
    intent: "One helper alone, reflecting.",
    scene: {
      duration: 30,
      characters: [{ id: "miko", entersFrom: "none" }],
      shots: [
        { shotId: "wide", startTime: 0, endTime: 15 },
        { shotId: "close", startTime: 15, endTime: 30 }
      ],
      dialogue: [{ lineId: "a", speakerId: "miko", startTime: 1, endTime: 29 }],
      walkableBounds: bounds,
      props
    }
  }
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1]! : resolve(__dirname, "..", "..", "tests", "reports", "animation-director-eval.json");

  const rows = [];
  for (const s of SCENES) {
    const result = await compileEpisodeDocument({
      id: s.id,
      duration: s.scene.duration,
      assets: moonGardenDocument.assets,
      set: moonGardenDocument.set,
      scene: s.scene
    });
    const v = validateEpisodeDocument(result.document, {
      availableClipsByCharacter: { miko: ["Loops"], luma: ["Armature|ArmatureAction"] }
    });
    rows.push({
      sceneId: s.id,
      intent: s.intent,
      coherent: v.ok,
      errors: v.errors,
      warningCount: v.warnings.length,
      shots: result.document.shots.map((x) => `${x.shotId}:${x.presetId}`),
      props: result.document.setDressing.length,
      // HUMAN scores (1-5), left null — automation cannot judge watchability.
      humanScore: { stagingReadable: null, cameraFramesAction: null, movementNatural: null, overallWatchable: null }
    });
  }

  const report = {
    kind: "animation-studio-director-eval",
    note: "coherent=automated; humanScore must be filled by a reviewer (watchability is not automatable).",
    scenes: rows
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("=== Director eval (coherence automated; watchability = human) ===");
  for (const r of rows) {
    console.log(`  ${r.coherent ? "coherent" : "INCOHERENT"}  ${r.sceneId.padEnd(20)} shots=[${r.shots.join(",")}] props=${r.props} warn=${r.warningCount}`);
  }
  console.log(`\nrubric → ${outPath}  (fill humanScore to judge generalization)`);
  if (rows.some((r) => !r.coherent)) process.exitCode = 1;
}

void main();
