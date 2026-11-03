/**
 * PRD-06 §13 CPU micro-budget bench — runs under plain `node --import tsx`
 * (the PRD's "unit benchmarks, Node" wording; vitest's worker/transform layer
 * inflates the same code ~40%, so the gate measures the subprocess's medians).
 * Prints a single JSON line: { case: median-µs, ..., calibration: { case: median-µs } }.
 *
 * Machine calibration (pattern: tests/unit/engine/instance-matrices-dense.test.ts): immediately before each
 * case the bench times a fixed, engine-free calibration workload (`calibrate()`) with the same sampler, so
 * the spec can translate each §13 budget (set on the reference Mac) to the current machine.
 *
 * Cases (linear synthetic skeletons — the §13 budget shapes):
 *   mixer65x2       PoseMixer.evaluate, 65 bones × 2 clips          (≤ 25 µs)
 *   mixer191x3mask  PoseMixer.evaluate, 191 bones × 3 clips + mask  (≤ 60 µs)
 *   palette65       refreshSkinningPalettes inner loop, 65 joints   (≤ 10 µs)
 *   ik2bone         solveTwoBoneIkRotations, two-bone chain         (≤ 2 µs)
 *   spring5b1s      bound spring chain, 5 bones × 1 substep         (≤ 3 µs)
 */
import { AnimationClip } from "../../../../packages/animation/src/AnimationClip.js";
import { AnimationTrack } from "../../../../packages/animation/src/AnimationTrack.js";
import { bindSkeleton, type SkeletonBinding } from "../../../../packages/animation/src/pose/SkeletonBinding.js";
import { createPoseBuffer, copyPose } from "../../../../packages/animation/src/pose/PoseBuffer.js";
import { PoseMixer } from "../../../../packages/animation/src/pose/PoseMixer.js";
import { createBoneMask } from "../../../../packages/animation/src/pose/BoneMask.js";
import { solveTwoBoneIkRotations } from "../../../../packages/animation/src/IK.js";
import { bindSpringChainToSkeleton, createSpringChain } from "../../../../packages/animation/src/SpringBones.js";
import { invertMat4Into, multiplyMat4Into } from "../../../../packages/assets/src/GLTFAnimationRuntime.js";

function makeSkeleton(boneCount: number): SkeletonBinding {
  const names = Array.from({ length: boneCount }, (_, i) => `bone${i}`);
  return bindSkeleton({
    joints: names.map((_, i) => i),
    jointNames: names,
    parentIndices: names.map((_, i) => (i === 0 ? -1 : i - 1)),
    resolveNode: (i) => ({
      name: names[i]!,
      position: [0, i * 0.05, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    })
  });
}

function makeClip(name: string, jointNames: readonly string[], duration = 1.6, keys = 12): AnimationClip {
  const tracks = jointNames.map((jointName) => new AnimationTrack({
    target: `${jointName}.rotation`,
    valueType: "quaternion",
    keyframes: Array.from({ length: keys }, (_, k) => {
      const a = (k / keys) * Math.PI * 0.2 + jointName.length * 0.001;
      return {
        time: (duration * k) / (keys - 1),
        value: [Math.sin(a / 2) * 0.1, Math.sin(a / 3) * 0.05, 0, Math.cos(a / 2)] as const
      };
    })
  }));
  return new AnimationClip({ name, duration, tracks });
}

const results: Record<string, number> = {};
const calibration: Record<string, number> = {};

/**
 * Fixed, deterministic calibration workload: 32 column-major 4x4 Float64 matrix products (constant inputs,
 * never changes) folded into a checksum so the work is observable. Same µs scale and timer overhead as the
 * §13 cases, no engine code involved.
 */
const CALIBRATION_MATRICES = 32;
const calibrationInput = new Float64Array(CALIBRATION_MATRICES * 16).map((_, i) => ((i * 7919) % 1000) / 500 - 1);
const calibrationMatrix = new Float64Array(16).map((_, i) => ((i * 104729) % 1000) / 500 - 1);
const calibrationOutput = new Float64Array(CALIBRATION_MATRICES * 16);
let calibrationChecksum = 0;
function calibrate(): void {
  for (let k = 0; k < CALIBRATION_MATRICES; k += 1) {
    const o = k * 16;
    for (let col = 0; col < 4; col += 1) {
      const b0 = calibrationInput[o + col * 4]!, b1 = calibrationInput[o + col * 4 + 1]!;
      const b2 = calibrationInput[o + col * 4 + 2]!, b3 = calibrationInput[o + col * 4 + 3]!;
      for (let row = 0; row < 4; row += 1) {
        calibrationOutput[o + col * 4 + row] = calibrationMatrix[row]! * b0 + calibrationMatrix[4 + row]! * b1 +
          calibrationMatrix[8 + row]! * b2 + calibrationMatrix[12 + row]! * b3;
      }
    }
  }
  calibrationChecksum += calibrationOutput[(calibrationChecksum >>> 0) % calibrationOutput.length]!;
}

/**
 * Median µs of `fn` and of the calibration workload, sampled interleaved (one calibration sample immediately
 * before every case sample) so both medians see the same core, clock and load.
 */
function measure(name: string, fn: () => void, warm = 4000, iters = 20000): void {
  for (let i = 0; i < warm; i += 1) { calibrate(); fn(); }
  const calibrationSamples = new Float64Array(iters);
  const samples = new Float64Array(iters);
  for (let i = 0; i < iters; i += 1) {
    const c0 = performance.now();
    calibrate();
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    calibrationSamples[i] = t0 - c0;
    samples[i] = t1 - t0;
  }
  calibrationSamples.sort();
  samples.sort();
  calibration[name] = calibrationSamples[iters >> 1]! * 1000;
  results[name] = samples[iters >> 1]! * 1000;
}

// mixer65x2 — 65 bones × 2 clips
{
  const skeleton = makeSkeleton(65);
  const mixer = new PoseMixer({ skeleton });
  mixer.addClip("idle", makeClip("idle", skeleton.jointNames));
  mixer.addClip("walk", makeClip("walk", skeleton.jointNames));
  mixer.play("idle");
  mixer.play("walk", { weight: 0.5 });
  mixer.update(1 / 60);
  const out = createPoseBuffer(65);
  measure("mixer65x2", () => mixer.evaluate(out));
}

// mixer191x3mask — 191 bones × 3 clips with an override mask layer
{
  const skeleton = makeSkeleton(191);
  const mixer = new PoseMixer({ skeleton });
  for (const name of ["a", "b", "c"]) {
    mixer.addClip(name, makeClip(name, skeleton.jointNames));
  }
  mixer.play("a");
  mixer.play("b", { weight: 0.6 });
  const mask = createBoneMask({ include: [{ bone: "bone1", descendants: true }] }, skeleton);
  mixer.playLayer("override", "c", { mask, weight: 0.8 });
  mixer.update(1 / 60);
  const out = createPoseBuffer(191);
  measure("mixer191x3mask", () => mixer.evaluate(out));
}

// palette65 — one inverse world per binding, then (invWorld×jointWorld)×IBM
// per joint — the same flat helpers refreshSkinningPalettes calls.
{
  const world = new Float32Array(16).map((_, i) => (i % 5 === 0 ? 1 : (i * 0.13) % 1));
  const inverseBind = new Float32Array(16).map((_, i) => (i % 5 === 0 ? 1 : (i * 0.07) % 1));
  const inverseWorld = new Float32Array(16);
  const scratch = new Float32Array(16);
  const matrices = new Float32Array(65 * 16);
  measure("palette65", () => {
    invertMat4Into(inverseWorld, world);
    for (let joint = 0; joint < 65; joint += 1) {
      multiplyMat4Into(scratch, 0, inverseWorld, world);
      multiplyMat4Into(matrices, joint * 16, scratch, inverseBind);
    }
  });
}

// ik2bone — spec/target hoisted like the runtime's persistent constraint list
{
  const skeleton = makeSkeleton(65);
  const pose = createPoseBuffer(65);
  copyPose(pose, skeleton.restPose);
  const spec = { root: "bone10", mid: "bone11", tip: "bone12" } as const;
  const target: [number, number, number] = [0.2, 0.5, 0.1];
  const model = new Float32Array(16);
  model[0] = model[5] = model[10] = model[15] = 1;
  measure("ik2bone", () => {
    solveTwoBoneIkRotations(pose, skeleton, model, spec, target);
  });
}

// spring5b1s — chain pre-initialized, then steady-state step
{
  const skeleton = makeSkeleton(65);
  const pose = createPoseBuffer(65);
  copyPose(pose, skeleton.restPose);
  const chain = createSpringChain({
    bones: [[0, 1, 0], [0, 0.9, 0], [0, 0.8, 0], [0, 0.7, 0], [0, 0.6, 0]],
    substeps: 1
  });
  const bound = bindSpringChainToSkeleton(chain, skeleton, ["bone20", "bone21", "bone22", "bone23", "bone24"]);
  bound.step(pose, 1 / 60);
  measure("spring5b1s", () => bound.step(pose, 1 / 60));
}

if (!Number.isFinite(calibrationChecksum)) throw new Error("calibration checksum is not finite");
console.log(JSON.stringify({ ...results, calibration }));
