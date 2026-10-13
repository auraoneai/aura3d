// tests/qr/prd14/aura-clash/v2-fighting-rig.test.ts — T2.3 rig contract.
// Recipe (aura3d-art-direction look-recipes.md, fighting row): side-on
// follow, fov 45, subject 20-30% of frame height. The rig solves distance
// by construction from aspect + separation (camera.ts), so these tests
// assert the solve's inequalities at the three capture viewports rather
// than per-viewport constants.
import { describe, expect, it } from "vitest";
import {
  createAuraClashFightingRig, projectedSubjectHeightFraction,
  solveAuraClashFightingDistance,
  AURA_CLASH_FIGHTING_FOV_DEG, AURA_CLASH_SUBJECT_HEIGHT_FRACTION
} from "../../../../apps/aura-clash-showcase/src/scene/camera";
import { FIGHTER_TARGET_HEIGHT, P1_NODE, P2_NODE, STAGE_HALF_WIDTH } from "../../../../apps/aura-clash-showcase/src/scene/world";
import type { AuraCameraRigContext, AuraVec3 } from "@aura3d/engine";

function ctx(subjects: Record<string, { position: AuraVec3 }>, aspect = 16 / 9): AuraCameraRigContext {
  return {
    dt: 1 / 60,
    time: 0,
    aspect,
    previous: {
      position: [0, 2, 8], target: [0, 1, 0], up: [0, 1, 0], roll: 0,
      fov: AURA_CLASH_FIGHTING_FOV_DEG, near: 0.05, far: 80
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

const VIEWPORTS = [
  { label: "1920x1080", aspect: 1920 / 1080 },
  { label: "1280x720", aspect: 1280 / 720 },
  { label: "390x844", aspect: 390 / 844 }
] as const;

describe("aura-clash.fighting rig", () => {
  it("frames the midpoint at fov 45 solving the recipe subject fraction", () => {
    const rig = createAuraClashFightingRig();
    const pose = rig.update(ctx(twoFighters));
    const expectedDistance =
      FIGHTER_TARGET_HEIGHT /
      (2 * Math.tan((AURA_CLASH_FIGHTING_FOV_DEG / 2) * (Math.PI / 180)) *
        AURA_CLASH_SUBJECT_HEIGHT_FRACTION);
    expect(pose.fov).toBe(AURA_CLASH_FIGHTING_FOV_DEG);
    expect(pose.position[0]).toBeCloseTo(0, 3);
    expect(pose.position[2]).toBeCloseTo(expectedDistance, 2);
    expect(pose.target[0]).toBeCloseTo(0, 3);
    // Pitch −6°: camera sits above the look target.
    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
  });

  it("separation dolly widens distance when fighters are far apart (portrait)", () => {
    const rig = createAuraClashFightingRig();
    const portrait = 390 / 844;
    const near = rig.update(ctx(twoFighters, portrait));
    rig.reset?.();
    const far = rig.update(ctx({
      [P1_NODE]: { position: [-3.2, 0, 0] as AuraVec3 },
      [P2_NODE]: { position: [3.2, 0, 0] as AuraVec3 }
    }, portrait));
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

  it("clamps the midpoint to the stage", () => {
    const rig = createAuraClashFightingRig();
    const pose = rig.update(ctx({
      [P1_NODE]: { position: [9, 0, 0] as AuraVec3 },
      [P2_NODE]: { position: [10, 0, 0] as AuraVec3 }
    }));
    expect(pose.target[0]).toBeCloseTo(STAGE_HALF_WIDTH, 3);
  });

  it("holds a sane pose when subjects are not mounted yet", () => {
    const rig = createAuraClashFightingRig();
    const pose = rig.update(ctx({}));
    expect(pose.fov).toBe(AURA_CLASH_FIGHTING_FOV_DEG);
    expect(pose.position[2]).toBeGreaterThan(3);
    expect(pose.near).toBeLessThan(pose.far);
  });
});

describe("solveAuraClashFightingDistance (aspect-aware solve)", () => {
  const halfTan = Math.tan((AURA_CLASH_FIGHTING_FOV_DEG / 2) * (Math.PI / 180));

  it("distance is aspect-monotonic: narrower aspect never moves closer", () => {
    const separations = [1.2, 2.9, 4.5, 6.8];
    for (const separation of separations) {
      let previous = 0;
      for (const aspect of [2.4, 16 / 9, 4 / 3, 1, 390 / 844]) {
        const { distance } = solveAuraClashFightingDistance({ aspect, separation });
        expect(distance).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = distance;
      }
    }
  });

  it.each(VIEWPORTS)(
    "both fighters + floor fit at $label (opening separation, recipe band)",
    ({ aspect }) => {
      const separation = 2.9;
      const { distance } = solveAuraClashFightingDistance({ aspect, separation });
      // Horizontal fit: half-width visible at the fight plane covers
      // separation/2 around the midpoint.
      const visibleHalfWidth = distance * halfTan * aspect;
      expect(visibleHalfWidth).toBeGreaterThanOrEqual(separation / 2);
      // Vertical fit: a fighter spans [0, 1.8]; the frame around the
      // target (midY = 0.55 * H) must cover feet and head.
      const visibleHalfHeight = distance * halfTan;
      const midY = FIGHTER_TARGET_HEIGHT * 0.55;
      expect(midY + visibleHalfHeight).toBeGreaterThanOrEqual(FIGHTER_TARGET_HEIGHT);
      expect(midY - visibleHalfHeight).toBeLessThanOrEqual(0);
      // Recipe band: fighter share of frame height in [0.20, 0.30].
      const fraction = FIGHTER_TARGET_HEIGHT / (2 * distance * halfTan);
      expect(fraction).toBeGreaterThanOrEqual(0.2);
      expect(fraction).toBeLessThanOrEqual(0.3);
    }
  );

  it.each(VIEWPORTS)(
    "both fighters stay in frame at wall-to-wall separation at $label",
    ({ aspect }) => {
      const separation = STAGE_HALF_WIDTH * 2;
      const { distance } = solveAuraClashFightingDistance({ aspect, separation });
      const visibleHalfWidth = distance * halfTan * aspect;
      expect(visibleHalfWidth).toBeGreaterThanOrEqual(separation / 2);
      // In portrait the band is geometrically unreachable at this
      // separation; both-in-frame must win (documented in camera.ts).
      const fraction = FIGHTER_TARGET_HEIGHT / (2 * distance * halfTan);
      if (aspect >= 1) {
        expect(fraction).toBeGreaterThanOrEqual(0.2);
        expect(fraction).toBeLessThanOrEqual(0.3);
      } else {
        expect(fraction).toBeLessThan(0.2);
      }
    }
  );
});

describe("projectedSubjectHeightFraction", () => {
  // Column-major perspective (fov 45, aspect 16/9) * translation view:
  // camera at z = D looking down -z with no pitch, so a segment at z=0
  // has an analytically known fraction H / (2 * D * tan(22.5°)).
  function viewProjection(distance: number, aspect = 16 / 9): number[] {
    const f = 1 / Math.tan((AURA_CLASH_FIGHTING_FOV_DEG / 2) * (Math.PI / 180));
    const near = 0.05;
    const far = 80;
    const a = (far + near) / (near - far);
    const b = (2 * far * near) / (near - far);
    // proj (column-major) then view = translate(0, -1, -distance):
    // clip = proj * [x, y-1, z-distance, 1]; composed matrix below.
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, a, -1,
      0, -f, -a * distance + b, distance
    ];
  }

  it("matches the analytic fraction for a fighter at the fight plane", () => {
    const distance = solveAuraClashFightingDistance({
      aspect: 16 / 9,
      separation: 2.9
    }).distance;
    const fraction = projectedSubjectHeightFraction(
      viewProjection(distance),
      [-1.45, 0, 0]
    );
    expect(fraction).not.toBeNull();
    expect(fraction!).toBeCloseTo(AURA_CLASH_SUBJECT_HEIGHT_FRACTION, 3);
  });

  it("returns null behind the camera and for short matrices", () => {
    expect(projectedSubjectHeightFraction(viewProjection(5), [0, 0, 10])).toBeNull();
    expect(projectedSubjectHeightFraction([1, 2, 3], [0, 0, 0])).toBeNull();
  });
});
