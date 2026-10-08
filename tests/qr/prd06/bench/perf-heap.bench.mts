/**
 * PRD-06 §13 steady-state heap bench — run as
 * `node --import tsx --expose-gc tests/qr/prd06/bench/perf-heap.bench.mts`.
 *
 * Two actors (PoseMixer.evaluate each) + the palette-build inner loop per
 * frame for 600 frames after warm-up; prints one JSON line:
 *   { heapDeltaBytes: <usedJSHeapSize delta across the steady-state window> }
 * The §13 bar is 0 bytes/frame — asserted as < 64 KB total over 600 frames.
 */
import { AnimationClip } from "../../../../packages/animation/src/AnimationClip.js";
import { AnimationTrack } from "../../../../packages/animation/src/AnimationTrack.js";
import { bindSkeleton, type SkeletonBinding } from "../../../../packages/animation/src/pose/SkeletonBinding.js";
import { createPoseBuffer } from "../../../../packages/animation/src/pose/PoseBuffer.js";
import { PoseMixer } from "../../../../packages/animation/src/pose/PoseMixer.js";
import { createBoneMask } from "../../../../packages/animation/src/pose/BoneMask.js";
import { invertMat4Into, multiplyMat4Into } from "../../../../packages/assets/src/GLTFAnimationRuntime.js";

const gc = (globalThis as { gc?: () => void }).gc;
if (gc === undefined) {
  console.error("requires --expose-gc");
  process.exit(2);
}

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

// Two actors, each a 191-joint rig with 3 clips incl. a masked override
// layer — the heavy §13 shape.
function makeActorMixer(): { mixer: PoseMixer; out: ReturnType<typeof createPoseBuffer> } {
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
  return { mixer, out: createPoseBuffer(191) };
}

const actorA = makeActorMixer();
const actorB = makeActorMixer();

// Palette path — persistent buffers, same shape as refreshSkinningPalettes.
const world = new Float32Array(16).map((_, i) => (i % 5 === 0 ? 1 : (i * 0.13) % 1));
const inverseBind = new Float32Array(16).map((_, i) => (i % 5 === 0 ? 1 : (i * 0.07) % 1));
const inverseWorld = new Float32Array(16);
const scratch = new Float32Array(16);
const palette = new Float32Array(191 * 16);

function frame(): void {
  actorA.mixer.evaluate(actorA.out);
  actorB.mixer.evaluate(actorB.out);
  invertMat4Into(inverseWorld, world);
  for (let joint = 0; joint < 191; joint += 1) {
    multiplyMat4Into(scratch, 0, inverseWorld, world);
    multiplyMat4Into(palette, joint * 16, scratch, inverseBind);
  }
}

// Warm to steady state, then measure across 600 frames.
for (let i = 0; i < 200; i += 1) frame();
gc();
const before = process.memoryUsage().heapUsed;
for (let i = 0; i < 600; i += 1) frame();
gc();
const after = process.memoryUsage().heapUsed;

console.log(JSON.stringify({ heapDeltaBytes: after - before }));
