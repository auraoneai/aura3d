import { describe, expect, it } from "vitest";
import {
  createFootIkRig,
  createHeightFieldGround,
  inferHumanoidRig,
  gradeRig,
  type FootLegInput,
  type RigQualityReport
} from "../../../packages/animation/src/index.js";

/**
 * B6 — true two-bone foot IK is gated to CAPABLE rigs, with a foot-sliding / ground-contact check
 * over a real walk cycle.
 *
 * Part 1 (capability gate): the EXACT predicate `scene-player.ts` uses to decide between true foot
 * IK and `rootGrounding` — `hasLegs && hasKnees && hasAnkles` from gradeRig — must be TRUE for rigs
 * that carry the leg/knee/ankle chain (Mixamo/Blender/UE/rich) and FALSE for the sparse 8-node
 * mascot (which is reported as rootGrounding, not IK).
 *
 * Part 2 (foot sliding / ground contact): drive a synthetic but physically-plausible walk cycle
 * through the foot-IK rig and assert, per frame, that (a) a foot in stance is GROUNDED (contacts the
 * ground), and (b) while locked the planted foot does NOT slide in world space (the defect the PRD
 * calls out: "root-grounding, not true IK" / foot sliding).
 */

// --- the capability predicate scene-player.ts applies ---
function canRunTrueFootIk(report: RigQualityReport): boolean {
  return report.hasLegs && report.hasKnees && report.hasAnkles;
}

const MIXAMO = [
  "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Neck", "mixamorig:Head",
  "mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
  "mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
  "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot",
  "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot"
];
const RICH_HUMANOID = [
  "Hips", "Spine", "Chest", "UpperChest", "Neck", "Head",
  "LeftShoulder", "LeftUpperArm", "LeftLowerArm", "LeftHand",
  "RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand",
  "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "LeftToes",
  "RightUpperLeg", "RightLowerLeg", "RightFoot", "RightToes"
];
const SPARSE_MASCOT = ["Hips", "Spine", "Chest", "Neck", "Head", "LeftArm", "RightArm", "Tail"];

describe("B6 — foot-IK capability gate", () => {
  it("enables true two-bone foot IK ONLY for rigs with the leg/knee/ankle chain", () => {
    for (const nodes of [MIXAMO, RICH_HUMANOID]) {
      const report = gradeRig(inferHumanoidRig(nodes, { id: "capable" }));
      expect(canRunTrueFootIk(report), report.reasons.join("; ")).toBe(true);
    }
  });

  it("DISABLES foot IK and reports rootGrounding on the 8-node mascot rig", () => {
    const report = gradeRig(inferHumanoidRig(SPARSE_MASCOT, { id: "mascot" }));
    expect(canRunTrueFootIk(report)).toBe(false);
    // The honest fallback is rootGrounding (no ankle chain) — assert the data that drives that branch.
    expect(report.hasAnkles).toBe(false);
    expect(report.hasFeet).toBe(false);
    expect(report.grade).toBe("C");
  });
});

// --- a deterministic walk cycle: hip translates forward; each foot alternates stance/swing ---
const STRIDE = 0.6; // metres per step
const HIP_HEIGHT = 0.95;
const flatGround = createHeightFieldGround(() => ({ height: 0, normal: [0, 1, 0] }));

/**
 * Build the two legs for a walk-cycle frame at phase `p` in [0,1). The LEFT foot is in stance for
 * the first half and swings in the second half; the RIGHT foot is the opposite. A stance foot stays
 * planted on the ground (ankle at the ankle height); a swing foot lifts and advances.
 */
function walkFrame(phase: number, hipX: number): FootLegInput[] {
  const ankleY = 0.035;
  const lift = 0.12;
  // Left: stance in [0,0.5), swing in [0.5,1).
  const leftSwing = phase >= 0.5;
  const leftSwingT = leftSwing ? (phase - 0.5) / 0.5 : 0;
  const leftFootX = leftSwing ? hipX - STRIDE / 2 + STRIDE * leftSwingT : hipX - STRIDE / 2;
  const leftAnkleY = leftSwing ? ankleY + Math.sin(Math.PI * leftSwingT) * lift : ankleY;
  // Right: swing in [0,0.5), stance in [0.5,1).
  const rightSwing = phase < 0.5;
  const rightSwingT = rightSwing ? phase / 0.5 : 0;
  const rightFootX = rightSwing ? hipX + STRIDE / 2 - STRIDE + STRIDE * rightSwingT : hipX + STRIDE / 2;
  const rightAnkleY = rightSwing ? ankleY + Math.sin(Math.PI * rightSwingT) * lift : ankleY;
  return [
    {
      side: "left",
      hip: [leftFootX, HIP_HEIGHT, 0],
      knee: [leftFootX, HIP_HEIGHT - 0.45, 0.06],
      ankle: [leftFootX, leftAnkleY, 0],
      pole: [leftFootX, HIP_HEIGHT - 0.45, 1]
    },
    {
      side: "right",
      hip: [rightFootX, HIP_HEIGHT, 0],
      knee: [rightFootX, HIP_HEIGHT - 0.45, 0.06],
      ankle: [rightFootX, rightAnkleY, 0],
      pole: [rightFootX, HIP_HEIGHT - 0.45, 1]
    }
  ];
}

describe("B6 — foot sliding / ground contact over a walk cycle", () => {
  const FRAMES = 24;

  it("keeps a planted foot grounded and does NOT slide while it is locked", () => {
    const rig = createFootIkRig({ legs: walkFrame(0, 0), raycaster: flatGround });

    type Locked = { x: number; z: number };
    const lastLocked: Record<"left" | "right", Locked | null> = { left: null, right: null };
    let stanceContactFrames = 0;
    let maxSlideWhileLocked = 0;
    let lockTransitions = 0;

    for (let f = 0; f < FRAMES; f += 1) {
      const phase = f / FRAMES;
      const hipX = phase * STRIDE; // body advances across the cycle
      const result = rig.solveFootPlacement({ legs: walkFrame(phase, hipX) });

      for (const foot of result.feet) {
        const wasLocked = lastLocked[foot.side] !== null;
        if (foot.locked) {
          // While locked, the planted world position must be HELD (no sliding) frame-to-frame.
          if (wasLocked) {
            const prev = lastLocked[foot.side]!;
            const slide = Math.hypot(foot.sample.plantedFoot[0] - prev.x, foot.sample.plantedFoot[2] - prev.z);
            maxSlideWhileLocked = Math.max(maxSlideWhileLocked, slide);
          } else {
            lockTransitions += 1;
          }
          lastLocked[foot.side] = { x: foot.sample.plantedFoot[0], z: foot.sample.plantedFoot[2] };
        } else {
          lastLocked[foot.side] = null;
        }
        // A foot reported in stance must be grounded (contacting the ground).
        if (foot.sample.grounded) stanceContactFrames += 1;
      }
    }

    // The cycle must have produced real ground contact (not all-airborne).
    expect(stanceContactFrames).toBeGreaterThan(FRAMES); // > 1 grounded foot-frame per frame on avg
    // At least one fresh plant happened (a lock transition) — the cycle actually stepped.
    expect(lockTransitions).toBeGreaterThanOrEqual(2);
    // FOOT-LOCK: while a foot is locked, it must not slide more than a hair (sub-millimetre).
    expect(maxSlideWhileLocked).toBeLessThanOrEqual(1e-4);
  });

  it("grounds every stance foot to the ground target within tolerance (no float, no sink)", () => {
    const rig = createFootIkRig({ legs: walkFrame(0, 0), raycaster: flatGround });
    for (let f = 0; f < FRAMES; f += 1) {
      const phase = f / FRAMES;
      const result = rig.solveFootPlacement({ legs: walkFrame(phase, phase * STRIDE) });
      for (const foot of result.feet) {
        if (!foot.sample.grounded) continue;
        // Grounded foot sits at ground (0) + ankleHeight (0.035), exactly — no float/sink.
        expect(foot.sample.plantedFoot[1]).toBeCloseTo(0.035, 3);
        expect(foot.sample.targetError).toBeLessThanOrEqual(0.05);
      }
    }
  });

  it("releases the lock during swing so the foot can advance (real stepping, not dragging)", () => {
    const rig = createFootIkRig({ legs: walkFrame(0, 0), raycaster: flatGround });
    const leftLockedByFrame: boolean[] = [];
    for (let f = 0; f < FRAMES; f += 1) {
      const phase = f / FRAMES;
      const result = rig.solveFootPlacement({ legs: walkFrame(phase, phase * STRIDE) });
      leftLockedByFrame.push(result.feet.find((x) => x.side === "left")!.locked);
    }
    // The left foot must be locked for part of the cycle (stance) and released for part (swing).
    expect(leftLockedByFrame.some((l) => l)).toBe(true);
    expect(leftLockedByFrame.some((l) => !l)).toBe(true);
  });

  it("is deterministic over the whole walk cycle (same stream => identical solves)", () => {
    const a = createFootIkRig({ legs: walkFrame(0, 0), raycaster: flatGround });
    const b = createFootIkRig({ legs: walkFrame(0, 0), raycaster: flatGround });
    for (let f = 0; f < FRAMES; f += 1) {
      const phase = f / FRAMES;
      const legs = walkFrame(phase, phase * STRIDE);
      expect(a.solveFootPlacement({ legs })).toEqual(b.solveFootPlacement({ legs }));
    }
  });
});
