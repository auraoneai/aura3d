import { describe, expect, it } from "vitest";
import { bindSkeleton, type SkeletonNodeRef } from "../../../packages/animation/src/pose/SkeletonBinding.js";

const node = (name: string, x: number): SkeletonNodeRef => ({
  name,
  position: [x, x + 1, x + 2],
  rotation: [0, 0, Math.sin(x / 2), Math.cos(x / 2)],
  scale: [1, 1, 1]
});

describe("bindSkeleton (PRD-06 T1.1)", () => {
  it("resolves joints by node index — a rig with duplicate bone names binds both correctly", () => {
    // Two joints named "Spine" at different node indices (Mixamo-style twist
    // helpers, symmetric generated rigs) must each get their own node; a
    // name map would collapse them.
    const nodes = new Map<number, SkeletonNodeRef>([
      [0, node("Hips", 0)],
      [1, node("Spine", 10)],
      [2, node("Spine", 20)],
      [3, node("Head", 30)]
    ]);
    const binding = bindSkeleton({
      joints: [0, 1, 2, 3],
      jointNames: ["Hips", "Spine", "Spine", "Head"],
      resolveNode: (index) => nodes.get(index)
    });

    expect(binding.boneCount).toBe(4);
    expect(binding.joints[1]!.position[0]).toBe(10);
    expect(binding.joints[2]!.position[0]).toBe(20);
    expect(binding.jointIndicesByName.get("Spine")).toEqual([1, 2]);
    expect(binding.jointNodeIndices).toEqual([0, 1, 2, 3]);
    expect(binding.missingNodeIndices).toEqual([]);

    // Rest pose = node local TRS at bind (§6.3 rest blend target).
    expect(binding.restPose.positions[3]).toBe(10); // joint1 x
    expect(binding.restPose.positions[6]).toBe(20); // joint2 x
    expect(binding.restPose.rotations[6]).toBeCloseTo(Math.sin(5)); // joint1 rz (4*1+2)
    expect(binding.restPose.rotations[10]).toBeCloseTo(Math.sin(10)); // joint2 rz (4*2+2)
  });

  it("reports missing node indices and falls back to identity for them", () => {
    const binding = bindSkeleton({
      joints: [0, 9],
      jointNames: ["Hips", "Ghost"],
      resolveNode: (index) => (index === 0 ? node("Hips", 0) : undefined)
    });
    expect(binding.missingNodeIndices).toEqual([9]);
    expect(binding.joints[1]!.name).toBe("Ghost");
    expect([...binding.restPose.rotations.slice(4, 8)]).toEqual([0, 0, 0, 1]);
  });

  it("carries parent indices for BoneMask descendants", () => {
    const binding = bindSkeleton({
      joints: [0, 1],
      parentIndices: [-1, 0],
      resolveNode: (index) => node(`n${index}`, index)
    });
    expect(binding.parentIndices).toEqual([-1, 0]);
  });
});
