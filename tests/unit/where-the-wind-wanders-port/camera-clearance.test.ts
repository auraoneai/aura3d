import { describe, expect, it } from "vitest";
import { CAM_MIN_CLEARANCE, CAM_MIN_DISTANCE, CLEARANCE_CHEST, clearedFollowPose, computeCameraClearance, easeBoom, structureObstacles } from "../../../examples/where-the-wind-wanders-port/camera-clearance";
import { CAMERA_FOLLOW, CAMERA_OFFSET, STRUCTURES } from "../../../examples/where-the-wind-wanders-port/sim";
import { terrainHeight } from "../../../examples/where-the-wind-wanders-port/terrain";

function followLens(x: number, z: number): { chest: [number, number, number]; lens: [number, number, number] } {
  const y = terrainHeight(x, z);
  const chest: [number, number, number] = [x, y + CLEARANCE_CHEST, z];
  const lens: [number, number, number] = [x + CAMERA_FOLLOW.x + CAMERA_OFFSET.x, y + 1.8 + CAMERA_OFFSET.y, z + CAMERA_FOLLOW.z + CAMERA_OFFSET.z];
  return { chest, lens };
}

describe("where-the-wind-wanders-port follow-camera clearance", () => {
  const obstacles = structureObstacles();

  it("keeps the full boom on the open meadow and at the start", () => {
    for (const [x, z] of [[-12, 4], [10, 6], [-25, 3]] as const) {
      const { chest, lens } = followLens(x, z);
      expect(computeCameraClearance(chest, lens, obstacles)).toBe(1);
    }
  });

  it("pulls the lens in front of the cottage when the traveller walks round its back", () => {
    const c = STRUCTURES.cottage;
    const { chest, lens } = followLens(c.x, -17.4);
    const f = computeCameraClearance(chest, lens, obstacles);
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThanOrEqual(CAM_MIN_CLEARANCE);
    // hugging the back wall leaves no room behind it: the lens cranes up over the gap, keeps its distance, frames the traveller
    const pose = clearedFollowPose(chest, lens, [c.x, chest[1] + 0.4, c.z], f);
    const dist = Math.hypot(pose.position[0] - chest[0], pose.position[1] - chest[1], pose.position[2] - chest[2]);
    expect(dist).toBeGreaterThanOrEqual(CAM_MIN_DISTANCE - 1e-6);
    expect(pose.position[1]).toBeGreaterThan(chest[1] + 4);
    expect(Math.hypot(pose.target[0] - chest[0], pose.target[2] - chest[2])).toBeLessThan(0.5);
    // within a metre of the wall the craned lens is over the eave strip: it must clear the eave height (base 0.6 s + walls 3.6 s)
    expect(pose.position[1] - terrainHeight(c.x, c.z)).toBeGreaterThan(4.2 * 1.12 + 1);
  });

  it("slides straight in along the view line when there is room behind the building", () => {
    const { chest, lens } = followLens(-4, -17.4);
    const pose = clearedFollowPose(chest, lens, [-2, chest[1] + 0.4, -20.9], 0.6);
    const along = [(pose.position[0] - chest[0]) / (lens[0] - chest[0]), (pose.position[2] - chest[2]) / (lens[2] - chest[2])];
    expect(along[0]).toBeCloseTo(0.6, 6);
    expect(along[1]).toBeCloseTo(0.6, 6);
  });

  it("ignores a building the traveller is beside but not behind", () => {
    const { chest, lens } = followLens(-8.4, -11.2);
    expect(computeCameraClearance(chest, lens, obstacles)).toBe(1);
  });

  it("snaps in and eases back out", () => {
    expect(easeBoom(1, 0.4, 0.016)).toBe(0.4);
    const out = easeBoom(0.4, 1, 0.1);
    expect(out).toBeGreaterThan(0.4);
    expect(out).toBeLessThan(1);
  });
});
