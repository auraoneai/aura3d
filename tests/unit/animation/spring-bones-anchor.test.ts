import { describe, expect, it } from "vitest";
import { bindSpringChainToSkeleton, createSpringChain } from "../../../packages/animation/src/SpringBones";
import { bindSkeleton } from "../../../packages/animation/src/pose/SkeletonBinding";
import { copyPose, createPoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer";

const turn = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
const bones = [[0, 0, 0], [1, 0, 0], [2, 0, 0]] as const;
function expectPoint(actual: readonly number[], expected: readonly number[]) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 5));
}
function anchor() {
  return createSpringChain({ bones, space: "anchor", gravity: [0, 0, 0] });
}
function bindingFixture() {
  const nodes = bones.map((_, i) => ({ name: `bone${i}`, position: [i === 0 ? 0 : 1, 0, 0] as const, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as const }));
  const skeleton = bindSkeleton({ joints: [0, 1, 2], resolveNode: i => nodes[i], parentIndices: [-1, 0, 1] });
  const pose = createPoseBuffer(3);
  copyPose(pose, skeleton.restPose);
  const chain = createSpringChain({ bones, gravity: [0, 0, 0], damping: 10, relativeDamping: 12 });
  return { pose, chain, bound: bindSpringChainToSkeleton(chain, skeleton, nodes.map(n => n.name)) };
}

describe("spring anchor transport and animated rest targets", () => {
  it("transports the first rotation and translation without introducing velocity", () => {
    const chain = anchor();
    chain.integrate(1 / 60, { position: [3, 4, 5], rotation: turn });
    expectPoint(chain.positions()[2]!, [3, 6, 5]);
    expect(chain.telemetry().kineticEnergy).toBeLessThan(1e-8);
    for (let i = 0; i < 20; i++) chain.integrate(1 / 60, { position: [3, 4, 5], rotation: turn });
    expectPoint(chain.positions()[2]!, [3, 6, 5]);
  });

  it("rotates existing particle velocity with the anchor as well as position", () => {
    const a = anchor(), b = anchor();
    const offsets = new Float32Array([0, 0, 0, 0, 1, 0, 0, 1, 0]);
    for (let i = 0; i < 10; i++) {
      a.integrate(1 / 60, { position: [0, 0, 0], offsets });
      b.integrate(1 / 60, { position: [0, 0, 0], offsets });
    }
    expect(a.telemetry().kineticEnergy).toBeGreaterThan(0.01);
    a.integrate(1 / 60, { position: [0, 0, 0], offsets });
    b.integrate(1 / 60, { position: [0, 0, 0], rotation: turn, offsets: new Float32Array([0, 0, 0, -1, 0, 0, -1, 0, 0]) });
    a.positions().forEach((p, i) => expectPoint(b.positions()[i]!, [-p[1], p[0], p[2]]));
    expect(b.telemetry().kineticEnergy).toBeCloseTo(a.telemetry().kineticEnergy, 4);
  });

  it("reset synchronizes the anchor rotation, including an omitted identity rotation", () => {
    const chain = anchor();
    chain.reset({ position: [3, 4, 5], rotation: turn });
    chain.integrate(1 / 60, { position: [3, 4, 5], rotation: turn });
    expectPoint(chain.positions()[2]!, [3, 6, 5]);
    chain.integrate(1 / 60, { position: [3, 4, 5] });
    expectPoint(chain.positions()[2]!, [5, 4, 5]);
    chain.reset();
    chain.integrate(1 / 60, { position: [0, 0, 0] });
    expectPoint(chain.positions()[2]!, [2, 0, 0]);
    expect(chain.telemetry().kineticEnergy).toBeLessThan(1e-8);
  });

  it("keeps model-space inertia as the default", () => {
    const a = createSpringChain({ bones, stiffness: 0, damping: 0, gravity: [0, 0, 0] });
    const b = createSpringChain({ bones, space: "model", stiffness: 0, damping: 0, gravity: [0, 0, 0] });
    a.integrate(1 / 60, { position: [0, 0, 0], rotation: turn });
    b.integrate(1 / 60, { position: [0, 0, 0], rotation: turn });
    expect(a.positions()).toEqual(b.positions());
    expectPoint(a.positions()[2]!, [2, 0, 0]);
  });

  it("uses supplied world-frame offsets and their lengths during reset and integration", () => {
    const chain = anchor();
    const offsets = new Float32Array([0, 0, 0, 0, 2, 0, 0, 3, 0]);
    chain.reset({ position: [1, 0, 0], rotation: turn, offsets });
    chain.integrate(1 / 60, { position: [1, 0, 0], rotation: turn, offsets });
    expectPoint(chain.positions()[2]!, [1, 5, 0]);
    expect(() => chain.integrate(1 / 60, { position: [0, 0, 0], offsets: new Float32Array(3) })).toThrow(/3 floats/);
  });

  it("initializes from the animated pose without double-rotating the rest chain", () => {
    const { pose, chain, bound } = bindingFixture();
    pose.rotations.set(turn, 0);
    bound.initialize(pose);
    expectPoint(chain.positions()[2]!, [0, 2, 0]);
    bound.step(pose, 1 / 60);
    expectPoint(chain.positions()[2]!, [0, 2, 0]);
    expectPoint(pose.rotations.subarray(4, 8), [0, 0, 0, 1]);
  });

  it("settles to a newly authored bend rather than feeding its own aim back into the target", () => {
    const { pose, chain, bound } = bindingFixture();
    bound.initialize(pose);
    pose.rotations.set(turn, 4);
    for (let i = 0; i < 480; i++) bound.step(pose, 1 / 60);
    const positions = chain.positions();
    expectPoint(positions[1]!, [1, 0, 0]);
    expectPoint(positions[2]!, [1, 1, 0]);
    expectPoint(pose.rotations.subarray(4, 8), turn);
  });

  it("aims descendant bones using the newly solved parent rotation", () => {
    const nodes = [0, 1, 2, 3].map(i => ({ name: `bone${i}`, position: [i === 0 ? 0 : 1, 0, 0] as const, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as const }));
    const skeleton = bindSkeleton({ joints: [0, 1, 2, 3], resolveNode: i => nodes[i], parentIndices: [-1, 0, 1, 2] });
    const pose = createPoseBuffer(4);
    copyPose(pose, skeleton.restPose);
    const chain = createSpringChain({ bones: [...bones, [3, 0, 0]], gravity: [0, 0, 0] });
    const bound = bindSpringChainToSkeleton(chain, skeleton, nodes.map(n => n.name));
    bound.initialize(pose);
    pose.rotations.set(turn, 4);
    pose.rotations.set(turn, 8);
    bound.step(pose, 1 / 60);
    const solved = chain.positions();
    let angle = 0;
    for (let i = 0; i < 3; i++) {
      angle += 2 * Math.atan2(pose.rotations[i * 4 + 2]!, pose.rotations[i * 4 + 3]!);
      if (i === 0) continue;
      const dx = solved[i + 1]![0] - solved[i]![0], dy = solved[i + 1]![1] - solved[i]![1];
      const length = Math.hypot(dx, dy);
      expect(Math.cos(angle)).toBeCloseTo(dx / length, 5);
      expect(Math.sin(angle)).toBeCloseTo(dy / length, 5);
    }
  });

  it("spreads animated translation across fixed substeps instead of teleporting the root", () => {
    const a = bindingFixture();
    const b = bindingFixture();
    a.bound.initialize(a.pose);
    b.bound.initialize(b.pose);
    a.pose.positions[1] = 0.2;
    a.bound.step(a.pose, 1 / 30);
    b.pose.positions[1] = 0.1;
    b.bound.step(b.pose, 1 / 60);
    b.pose.positions[1] = 0.2;
    b.bound.step(b.pose, 1 / 60);
    a.chain.positions().forEach((p, i) => expectPoint(p, b.chain.positions()[i]!));
  });

  it("initialize clears fractional time accumulated before a teleport", () => {
    const { pose, chain, bound } = bindingFixture();
    bound.step(pose, 1 / 120);
    bound.initialize(pose);
    pose.positions[0] = 1;
    bound.step(pose, 1 / 120);
    expectPoint(chain.positions()[0]!, [0, 0, 0]);
    bound.step(pose, 1 / 120);
    expectPoint(chain.positions()[0]!, [1, 0, 0]);
  });
});
