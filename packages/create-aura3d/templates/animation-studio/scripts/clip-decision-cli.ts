/**
 * clip-decision-cli.ts — B1 standalone proof of the per-beat clip-decision record.
 *
 * Builds a real {@link PerformanceRig} for a synthetic full-humanoid skeleton from the shared
 * standard library and samples a beat, emitting the {@link ClipDecision} so a unit test can assert
 * the B1 contract fields are present and populated:
 *   { intent, clipId, source, bonesTouched, maxRotAmplitudeRad, maxTransAmplitude, reachedGLBRuntime }
 * plus bodyBoneRotationRad + rootTranslation.
 *
 * Browser/GPU/Playwright-free: it drives `animation-performance.ts` directly (the same module
 * scene-player.ts uses), so the proof is of the REAL decision producer, not a re-implementation.
 *
 * Usage: tsx scripts/clip-decision-cli.ts --intent talk --t 0.6
 */
import { createSharedClipRegistry, createPerformanceRig, resolveIntent } from "../src/animation-performance.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

// A full-humanoid skeleton (so retargeting maps the body bones and the decision carries real motion).
const HUMANOID_NODES = [
  "Hips", "Spine", "Chest", "UpperChest", "Neck", "Head",
  "LeftShoulder", "LeftUpperArm", "LeftLowerArm", "LeftHand",
  "RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand",
  "LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
  "RightUpperLeg", "RightLowerLeg", "RightFoot"
];

function main(): void {
  const requestedIntent = arg("intent", "talk");
  const t = Number(arg("t", "0.6"));
  const registry = createSharedClipRegistry();
  const rig = createPerformanceRig(registry, { nodeNames: HUMANOID_NODES, embeddedClips: ["Idle"] });
  // resolveIntent normally maps a beat → standard intent; here we honor the requested intent directly
  // unless it is non-standard, in which case resolveIntent derives one.
  const intent = resolveIntent({
    clip: requestedIntent,
    moving: requestedIntent === "walk" || requestedIntent === "run",
    running: requestedIntent === "run",
    speaking: requestedIntent === "talk",
    anyDialogue: true
  });
  const { decision } = rig.poseFor(intent, t);
  // poseFor emits reachedGLBRuntime:false (the player flips it true after applyRetargetedPose). We
  // assert the FIELD EXISTS here; the gate test below covers the true case from the render summary.
  console.log(JSON.stringify(decision));
}

main();
