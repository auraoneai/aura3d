import { describe, expect, it } from "vitest";
import { poseHero, type HeroInput } from "../../../examples/saiyan-snake-way-port/hero";
import { IDOL_RIGS } from "../../../examples/saiyan-snake-way-port/art/idolRig.data";
import { createIdolRetarget, qconj, qmul, quatFromM3, type IdolRig, type Quat } from "../../../examples/saiyan-snake-way-port/art/idolRunner";
import { IDOL_RUNNER_ASSETS } from "../../../examples/saiyan-snake-way-port/world";
import { idolEnabled } from "../../../examples/saiyan-snake-way-port/art/idolModels";

const base: HeroInput = { phase: 0, time: 0, grounded: true, vy: 0, sliding: false, flying: false, diving: false, lean: 0, surge: 0, stumble: 0, speed: 40 };
const rotate = (q: readonly number[], v: readonly number[]): number[] => {
  const p = qmul(qmul(q, [v[0]!, v[1]!, v[2]!, 0]), qconj(q));
  return [p[0], p[1], p[2]];
};
const HALF: Quat = [0, 1, 0, 0];
const toModel = (q: Quat): Quat => qmul(qmul(HALF, q), HALF);

/** World rotation of every bone from the local rotations the retarget writes (parents first). */
function worldOf(rig: IdolRig, bones: Record<string, { rotation: Quat }>): Quat[] {
  const out: Quat[] = [];
  rig.bones.forEach((b, i) => {
    const parent = b.parent >= 0 ? out[b.parent]! : (rig.rootParentWorld as Quat);
    out[i] = qmul(parent, bones[b.name]!.rotation);
  });
  return out;
}

describe("Serpentine Idol runner retarget", () => {
  it("bakes a rig for every colourway with all humanoid slots", () => {
    for (const key of Object.values(IDOL_RUNNER_ASSETS)) {
      const rig = IDOL_RIGS[key]!;
      expect(rig, key).toBeDefined();
      expect(rig.bones.length).toBeGreaterThanOrEqual(20);
      const s = rig.slots;
      const ids = [s.hips, s.neck, s.head, s.upperL, s.foreL, s.upperR, s.foreR, s.thighL, s.shinL, s.thighR, s.shinR, ...s.spine];
      expect(new Set(ids).size).toBe(ids.length);
      for (const i of ids) expect(i).toBeLessThan(rig.bones.length);
      // left limbs sit at +x in the +Z-facing model, legs point down, arms point outwards in the T-pose
      expect(rig.restDir.thighL[1]).toBeLessThan(-0.8);
      expect(Math.abs(rig.restDir.upperL[0]!)).toBeGreaterThan(0.7);
      expect(rig.hips.restHeight).toBeGreaterThan(0.7);
      expect(rig.hips.restHeight).toBeLessThan(1.25);
    }
  });

  it("points every driven limb along the procedural figure's segment in run, jump, slide and flight", () => {
    const poses: HeroInput[] = [
      { ...base, phase: 0.7 }, { ...base, phase: 2.4, surge: 1 }, { ...base, grounded: false, vy: 4 },
      { ...base, sliding: true }, { ...base, flying: true, time: 1.3 }, { ...base, stumble: 0.8, time: 0.4, lean: 0.2 }
    ];
    for (const key of Object.values(IDOL_RUNNER_ASSETS)) {
      const rig = IDOL_RIGS[key]!;
      const retarget = createIdolRetarget(rig);
      for (const input of poses) {
        const parts = poseHero(input);
        const pose = retarget(parts);
        for (const b of rig.bones) {
          const q = pose.bones[b.name]!.rotation;
          expect(Math.hypot(...q)).toBeCloseTo(1, 5);
        }
        const world = worldOf(rig, pose.bones as Record<string, { rotation: Quat }>);
        const limbs = [["upperL", "upperL"], ["foreL", "foreL"], ["upperR", "upperR"], ["foreR", "foreR"], ["thighL", "thighL"], ["shinL", "shinL"], ["thighR", "thighR"], ["shinR", "shinR"]] as const;
        for (const [slot, part] of limbs) {
          const i = rig.slots[slot];
          const restWorld = rig.bones[i]!.restWorld;
          // the bone's rest direction carried by its new world rotation
          const dir = rotate(qmul(world[i]!, qconj(restWorld)), rig.restDir[slot]);
          const want = rotate(toModel(quatFromM3(parts[part]!.m)), [0, -1, 0]);
          for (let k = 0; k < 3; k++) expect(dir[k]!).toBeCloseTo(want[k]!, 4);
        }
        const hips = pose.bones[rig.bones[rig.slots.hips]!.name]!;
        expect(hips.position?.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("keeps the rest pose for the default stance bones it does not drive", () => {
    const rig = IDOL_RIGS[IDOL_RUNNER_ASSETS.violet]!;
    const pose = createIdolRetarget(rig)(poseHero(base));
    const s = rig.slots;
    const drivenSet = new Set([s.hips, s.neck, s.head, s.upperL, s.foreL, s.upperR, s.foreR, s.thighL, s.shinL, s.thighR, s.shinR, ...s.spine]);
    rig.bones.forEach((b, i) => {
      if (drivenSet.has(i)) return;
      const q = pose.bones[b.name]!.rotation;
      const d = Math.abs(q[0] * b.restLocal[0]! + q[1] * b.restLocal[1]! + q[2] * b.restLocal[2]! + q[3] * b.restLocal[3]!);
      expect(d).toBeCloseTo(1, 5);
    });
  });

  it("turns the Idol art off with ?idol=0", () => {
    expect(idolEnabled("")).toBe(true);
    expect(idolEnabled("?idol=0")).toBe(false);
  });
});
