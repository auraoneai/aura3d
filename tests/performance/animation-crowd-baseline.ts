import { performance } from "node:perf_hooks";
import { AnimationClip, AnimationMixer, AnimationTrack, Bone, Skeleton, buildSkinningPalette } from "@galileo3d/animation";

interface AnimationCrowdBaseline {
  readonly name: string;
  readonly characters: number;
  readonly frames: number;
  readonly elapsedMs: number;
  readonly averageFrameMs: number;
  readonly targetFrameBudgetMs: number;
  readonly withinBudget: boolean;
  readonly jointsPerCharacter: number;
  readonly paletteFloatsPerCharacter: number;
  readonly checksum: number;
}

const CHARACTERS = 240;
const FRAMES = 120;
const TARGET_FRAME_BUDGET_MS = 16.67;

const report = runAnimationCrowdBaseline();
console.log(JSON.stringify(report, null, 2));

if (!report.withinBudget) {
  throw new Error(`Animation crowd baseline exceeded ${TARGET_FRAME_BUDGET_MS}ms/frame: ${report.averageFrameMs}ms/frame`);
}

export function runAnimationCrowdBaseline(): AnimationCrowdBaseline {
  const clip = new AnimationClip({
    name: "crowd-locomotion",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "character.hips.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 0.5, value: [0.5, 0.18, 0] },
          { time: 1, value: [1, 0, 0] },
        ],
      }),
      new AnimationTrack({
        target: "character.hand.offset",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0.1, 0.25, 0] },
          { time: 0.5, value: [-0.1, 0.4, 0] },
          { time: 1, value: [0.1, 0.25, 0] },
        ],
      }),
    ],
  });
  const skeleton = new Skeleton([
    new Bone({ name: "hips", parentIndex: -1, translation: [0, 0, 0] }),
    new Bone({ name: "spine", parentIndex: 0, translation: [0, 0.45, 0] }),
    new Bone({ name: "hand", parentIndex: 1, translation: [0.38, 0.22, 0] }),
  ]);
  const mixers = Array.from({ length: CHARACTERS }, () => {
    const mixer = new AnimationMixer();
    mixer.play(clip);
    return mixer;
  });

  let checksum = 0;
  const before = performance.now();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    for (const mixer of mixers) {
      mixer.update(1 / 60);
      const hips = mixer.getValue("character.hips.position") as readonly number[] | undefined;
      checksum += hips?.[0] ?? 0;
      const palette = buildSkinningPalette(skeleton);
      checksum += palette.jointCount + (palette.matrices[16 + 13] ?? 0);
    }
  }
  const elapsedMs = performance.now() - before;
  const averageFrameMs = elapsedMs / FRAMES;

  return {
    name: "animation-240-mixers-skinned-palettes-120-frames",
    characters: CHARACTERS,
    frames: FRAMES,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    averageFrameMs: Number(averageFrameMs.toFixed(3)),
    targetFrameBudgetMs: TARGET_FRAME_BUDGET_MS,
    withinBudget: averageFrameMs <= TARGET_FRAME_BUDGET_MS,
    jointsPerCharacter: skeleton.bones.length,
    paletteFloatsPerCharacter: skeleton.bones.length * 16,
    checksum: Number(checksum.toFixed(3)),
  };
}
