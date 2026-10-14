// tests/qr/prd14/aura-clash/v2-fighting-rig.test.ts — T2.3 rig contract.
import { describe, expect, it } from "vitest";
import { createAuraClashFightingRig } from "../../../../apps/aura-clash-showcase/src/v2/scene/camera";
import { FIGHTER_TARGET_HEIGHT, P1_NODE, P2_NODE } from "../../../../apps/aura-clash-showcase/src/v2/scene/world";
import type { AuraCameraRigContext, AuraVec3 } from "@aura3d/engine";

function ctx(subjects: Record<string, { position: AuraVec3 }>, aspect = 16 / 9): AuraCameraRigContext {
  return {
    dt: 1 / 60,
    time: 0,
    aspect,
    previous: {
      position: [0, 2, 8], target: [0, 1, 0], up: [0, 1, 0], roll: 0,
      fov: 32, near: 0.05, far: 80
    },
    subject: (ref) => {
      const name = typeof ref === "string" ? ref : ref.name;
      const s = subjects[name];
      return s ? {
        position: s.position,
        velocity: [0, 0, 0],
        forward: [0, 0, 1],
        bounds: { min: [0, 0, 0], max: [0, 0, 0] }
      } : undefined;
    },
    probe: {
      sphereCast: () => ({ hit: false, distance: 0 }),
      occluders: () => []
    }
  } as AuraCameraRigContext;
}

const twoFighters = {
  [P1_NODE]: { position: [-1.45, 0, 0] as AuraVec3 },
  [P2_NODE]: { position: [1.45, 0, 0] as AuraVec3 }
};

describe("aura-clash.fighting rig", () => {
  it("frames the midpoint at fov 32 solving ~0.5 subject fraction", () => {
    const rig = createAuraClashFightingRig();
    const pose = rig.update(ctx(twoFighters));
    const expectedDistance = FIGHTER_TARGET_HEIGHT / (2 * Math.tan((16 * Math.PI) / 180) * 0.5);
    expect(pose.fov).toBe(32);
    expect(pose.position[0]).toBeCloseTo(0, 3);
    expect(pose.position[2]).toBeCloseTo(expectedDistance, 2);
    expect(pose.target[0]).toBeCloseTo(0, 3);
    // Pitch −6°: camera sits above the look target.
    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
  });

  it("separation dolly widens distance when fighters are far apart", () => {
    const rig = createAuraClashFightingRig();
    const near = rig.update(ctx(twoFighters));
    rig.reset?.();
    const far = rig.update(ctx({
      [P1_NODE]: { position: [-3.2, 0, 0] as AuraVec3 },
      [P2_NODE]: { position: [3.2, 0, 0] as AuraVec3 }
    }));
    expect(far.position[2]).toBeGreaterThan(near.position[2]);
    expect(far.target[0]).toBeCloseTo(0, 3);
  });

  it("tracks an off-centre midpoint", () => {
    const rig = createAuraClashFightingRig();
    const pose = rig.update(ctx({
      [P1_NODE]: { position: [0.6, 0, 0] as AuraVec3 },
      [P2_NODE]: { position: [2.4, 0, 0] as AuraVec3 }
    }));
    expect(pose.target[0]).toBeCloseTo(1.5, 3);
    expect(pose.position[0]).toBeCloseTo(1.5, 3);
  });

  it("holds a sane pose when subjects are not mounted yet", () => {
    const rig = createAuraClashFightingRig();
    const pose = rig.update(ctx({}));
    expect(pose.fov).toBe(32);
    expect(pose.position[2]).toBeGreaterThan(3);
    expect(pose.near).toBeLessThan(pose.far);
  });
});
