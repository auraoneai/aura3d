/**
 * T4.1 — `bindSpringChainToSkeleton` (PRD-06 §7.1): a chain at rest under
 * gravity 0 stays at its rest pose; after a 1 m/s root stop it settles below
 * 1° oscillation within 0.6 s on the "hair" preset; the accumulator integrates
 * at a fixed substep rate regardless of frame dt.
 */
import { describe, expect, it } from "vitest";
import { bindSpringChainToSkeleton, createSpringChain, createSpringChainFromPreset } from "../../../packages/animation/src/SpringBones";
import { bindSkeleton, type SkeletonBinding } from "../../../packages/animation/src/pose/SkeletonBinding";
import { copyPose, createPoseBuffer, type PoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer";

type Vec3 = readonly [number, number, number];

/**
 * torso (root of the skeleton) -> hair0 -> hair1 -> hair2, each +0.1 m on X.
 * The chain hangs sideways off the torso: ["hair0","hair1","hair2"].
 */
function makeSkeleton(): SkeletonBinding {
  const node = (name: string, position: Vec3) => ({
    name,
    position,
    rotation: [0, 0, 0, 1] as const,
    scale: [1, 1, 1] as Vec3
  });
  const nodes = [
    node("torso", [0, 1, 0]),
    node("hair0", [0.1, 0, 0]),
    node("hair1", [0.1, 0, 0]),
    node("hair2", [0.1, 0, 0])
  ];
  return bindSkeleton({
    joints: [0, 1, 2, 3],
    resolveNode: (i) => nodes[i] as never,
    parentIndices: [-1, 0, 1, 2]
  });
}

const REST_WORLD: Vec3[] = [
  [0.1, 1, 0],
  [0.2, 1, 0],
  [0.3, 1, 0]
];

const CHAIN_BONES = ["hair0", "hair1", "hair2"] as const;

function rotationAngleDeg(qx: number, qy: number, qz: number, qw: number): number {
  return 2 * Math.acos(Math.max(-1, Math.min(1, qw))) * (180 / Math.PI);
}

describe("T4.1 — bindSpringChainToSkeleton", () => {
  it("chain at rest under gravity 0 stays at rest pose within 1e-4", () => {
    const skeleton = makeSkeleton();
    const pose = createPoseBuffer(4);
    copyPose(pose, skeleton.restPose);
    const chain = createSpringChain({ bones: REST_WORLD, gravity: [0, 0, 0] });
    const bound = bindSpringChainToSkeleton(chain, skeleton, CHAIN_BONES);

    for (let f = 0; f < 120; f += 1) bound.step(pose, 1 / 60);

    for (let joint = 1; joint <= 3; joint += 1) {
      const angle = rotationAngleDeg(
        pose.rotations[joint * 4]!,
        pose.rotations[joint * 4 + 1]!,
        pose.rotations[joint * 4 + 2]!,
        pose.rotations[joint * 4 + 3]!
      );
      expect(angle).toBeLessThanOrEqual(1e-4);
    }
    const tip = chain.positions()[2]!;
    expect(Math.abs(tip[0] - 0.3)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(tip[1] - 1)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(tip[2])).toBeLessThanOrEqual(1e-4);
  });

  it("after a 1 m/s root stop the chain settles below 1° oscillation within 0.6 s (hair preset)", () => {
    const skeleton = makeSkeleton();
    const pose = createPoseBuffer(4);
    copyPose(pose, skeleton.restPose);
    // hair preset + the lane's relative-damping default (12): absolute damping
    // alone leaves a persistent limit cycle — relative damping drains swing.
    const chain = createSpringChainFromPreset("hair", { bones: REST_WORLD, relativeDamping: 12 });
    const bound = bindSpringChainToSkeleton(chain, skeleton, CHAIN_BONES);
    const dt = 1 / 60;

    // Drag the torso (kinematic root) along +Z at 1 m/s for 1 s.
    let t = 0;
    while (t < 1) {
      pose.positions[0] = pose.positions[0]! + 1 * dt;
      bound.step(pose, dt);
      t += dt;
    }
    // Root stops. Track the tip-segment swing: the segment's signed swing-plane
    // angle vs its rest +X direction (the hair preset carries gravity, so the
    // equilibrium is drooped — measure the *oscillation*, i.e. deviation of the
    // segment direction from its own slowly-settling value via tip position
    // deltas, not the absolute droop angle).
    const tips: Vec3[] = [];
    while (t < 1.9) {
      bound.step(pose, dt);
      const sim = chain.positions();
      tips.push([...sim[2]!] as Vec3);
      t += dt;
    }
    // Oscillation during the final 0.3 s of the post-stop window (once >= 0.6 s
    // have elapsed since the stop): tip excursion around the window mean,
    // expressed as an angle of the 0.1 m tip segment, stays under 1°.
    const settledTips = tips.slice(Math.round((0.6 + 0.0001) / dt));
    expect(settledTips.length).toBeGreaterThan(0);
    const mean: Vec3 = [
      settledTips.reduce((s, p) => s + p[0], 0) / settledTips.length,
      settledTips.reduce((s, p) => s + p[1], 0) / settledTips.length,
      settledTips.reduce((s, p) => s + p[2], 0) / settledTips.length
    ];
    const maxExcursion = Math.max(...settledTips.map((p) => Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2])));
    const oscillationDeg = (maxExcursion / 0.1) * (180 / Math.PI); // small-angle approx on tip segment
    expect(oscillationDeg).toBeLessThan(1);
    // And it actually swung at some point — the preset is doing dynamics.
    const firstTip = tips[0]!;
    const overallExcursion = Math.max(...tips.map((p) => Math.hypot(p[0] - firstTip[0], p[1] - firstTip[1], p[2] - firstTip[2])));
    expect((overallExcursion / 0.1) * (180 / Math.PI)).toBeGreaterThan(1);
  });

  it("fixed-step accumulator: deterministic for identical streams and bounded on a frame hitch", () => {
    const skeleton = makeSkeleton();
    const pose = createPoseBuffer(4);
    copyPose(pose, skeleton.restPose);
    const chainA = createSpringChain({ bones: REST_WORLD, gravity: [0, 0, 0] });
    const chainB = createSpringChain({ bones: REST_WORLD, gravity: [0, 0, 0] });
    const boundA = bindSpringChainToSkeleton(chainA, skeleton, CHAIN_BONES, { substepHz: 60 });
    const boundB = bindSpringChainToSkeleton(chainB, skeleton, CHAIN_BONES, { substepHz: 60 });

    // Identical dt stream on two bindings must produce identical state.
    const dts = [1 / 60, 0.3, 1 / 60, 1 / 60];
    for (const dt of dts) {
      boundA.step(pose, dt);
      boundB.step(pose, dt);
    }
    const tipA = [...chainA.positions()[2]!];
    const tipB = [...chainB.positions()[2]!];
    for (let c = 0; c < 3; c += 1) expect(tipB[c]).toBeCloseTo(tipA[c]!, 10);

    // A giant hitch integrates at most maxSubsteps — the chain does not tunnel.
    const chainC = createSpringChain({ bones: REST_WORLD, gravity: [0, -9.81, 0] });
    const boundC = bindSpringChainToSkeleton(chainC, skeleton, CHAIN_BONES, { substepHz: 60 });
    boundC.step(pose, 5.0);
    const tipC = chainC.positions()[2]!;
    for (const c of tipC) expect(Number.isFinite(c)).toBe(true);
    // Still within a bone length of the root segment — the drop was clamped.
    expect(Math.hypot(tipC[0] - 0.2, tipC[1] - 1, tipC[2])).toBeLessThan(0.5);
  });

  it("throws on unknown bone names instead of silently binding a dead chain", () => {
    const skeleton = makeSkeleton();
    const chain = createSpringChain({ bones: REST_WORLD, gravity: [0, 0, 0] });
    expect(() => bindSpringChainToSkeleton(chain, skeleton, ["hair0", "missing-bone"])).toThrow(/unknown bone/);
  });
});
