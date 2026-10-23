import { describe, expect, it } from "vitest";
import { game, racketSports } from "@aura3d/engine";
import { applyAthleteLimbs, athleteLocomotion, solveKnee, type AthleteLimbHandles, type AthleteLocomotionInput } from "../../../packages/engine/src/agent-api/game-kits/racketAthleteRig";

type V3 = [number, number, number];
class Handle {
  pos: V3 | null = null; rot: V3 | null = null; scale: V3 | null = null; visible: boolean | null = null;
  setPosition(x: number, y: number, z: number): this { this.pos = [x, y, z]; return this; }
  setRotation(x: number, y: number, z: number): this { this.rot = [x, y, z]; return this; }
  setScale(s: readonly number[]): this { this.scale = [s[0]!, s[1]!, s[2]!]; return this; }
  setVisible(v: boolean): this { this.visible = v; return this; }
}
const LIMB_KEYS = [
  "leftUpperLeg", "leftLowerLeg", "leftKnee", "leftShoe", "rightUpperLeg", "rightLowerLeg", "rightKnee", "rightShoe",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand", "racketHandle",
  "racketThroatLeft", "racketThroatRight", "racketHoop", "racketStrings"
] as const;
const makeHandles = (): AthleteLimbHandles => Object.fromEntries(LIMB_KEYS.map((k) => [k, new Handle()])) as unknown as AthleteLimbHandles;

const idle = (over: Partial<AthleteLocomotionInput> = {}): AthleteLocomotionInput => ({
  side: "player", moveBlend: 0, stride: 0, vx: 0, vy: 0, splitStep: 0, swingAge: 0, strokeConnected: false, swing: 0, stroke: "forehand", ...over
});
const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe("game.racketSports().athleteRig", () => {
  it("is exposed on the kit and the racketSports namespace", () => {
    expect(game.racketSports().athleteRig).toBe(racketSports.athleteRig);
    expect(typeof racketSports.athleteRig.locomotion).toBe("function");
  });

  it("standing: hips at ready height, feet planted either side, no slide", () => {
    const s = athleteLocomotion(idle());
    expect(s.move).toBe(0);
    expect(s.slide).toBe(0);
    expect(s.hipY).toBeCloseTo(0.887, 12);
    expect(s.legs[0].foot[0]).toBeLessThan(0);
    expect(s.legs[1].foot[0]).toBeGreaterThan(0);
    expect(s.legs.every((l) => l.planted)).toBe(true);
  });

  it("keeps both knee segments at thigh length while the stride is within reach", () => {
    for (let i = 0; i < 200; i++) {
      const s = athleteLocomotion(idle({ moveBlend: 1, stride: i * 0.37, vx: Math.sin(i), vy: Math.cos(i * 0.7) }));
      for (const leg of s.legs) {
        const d = len(leg.hip, leg.foot);
        if (d < 0.95) {
          expect(len(leg.hip, leg.knee)).toBeCloseTo(len(leg.knee, leg.foot), 6);
        }
        expect(leg.foot[1]).toBeGreaterThanOrEqual(0.09 - 1e-12);
      }
    }
  });

  it("the stride cycle is periodic and the legs are half a cycle apart", () => {
    const a = athleteLocomotion(idle({ moveBlend: 1, vy: -1, stride: 1.3 }));
    const b = athleteLocomotion(idle({ moveBlend: 1, vy: -1, stride: 1.3 + Math.PI * 2 }));
    expect(b.legs[0].foot[2]).toBeCloseTo(a.legs[0].foot[2], 9);
    const c = athleteLocomotion(idle({ moveBlend: 1, vy: -1, stride: 1.3 + Math.PI }));
    expect(c.legs[0].foot[2]).toBeCloseTo(a.legs[1].foot[2] - 0.05 * 0, 1);
  });

  it("split step lowers the hips and widens the stance mid-hop", () => {
    const calm = athleteLocomotion(idle());
    const hop = athleteLocomotion(idle({ splitStep: 0.11 }));
    expect(hop.split).toBeCloseTo(1, 9);
    expect(hop.hipY).toBeLessThan(calm.hipY);
    expect(hop.legs[1].foot[0]).toBeGreaterThan(calm.legs[1].foot[0]);
  });

  it("slide drops the body and reaches the leading foot toward the move direction", () => {
    const s = athleteLocomotion(idle({ moveBlend: 1, vx: 1, slideRemaining: 0.2, slidePoseStatic: true }));
    expect(s.slide).toBe(1);
    expect(s.hipY).toBeLessThan(0.7);
    expect(s.dx).toBeCloseTo(1, 9);
    const lead = s.legs[1];
    expect(lead.foot[0]).toBeGreaterThan(0.5);
  });

  it("planted stroke coils the stance and ends settled", () => {
    const mid = athleteLocomotion(idle({ swing: 0.2, swingAge: 0.085, strokeContactAge: 0.17 }));
    expect(mid.plantedStroke).toBe(true);
    expect(mid.coil).toBeGreaterThan(0.5);
    const done = athleteLocomotion(idle({ swing: 0.01, swingAge: 0.4, strokeConnected: true, strokeContactAge: 0.17 }));
    expect(done.settle).toBeGreaterThan(0.9);
    expect(athleteLocomotion(idle({ swing: 0.2, swingAge: 0.1, stroke: "serve" })).plantedStroke).toBe(false);
  });

  it("far-end athletes mirror the move direction", () => {
    const near = athleteLocomotion(idle({ moveBlend: 1, vx: 1, vy: -1 }));
    const far = athleteLocomotion(idle({ side: "ai", moveBlend: 1, vx: 1, vy: -1 }));
    expect(far.face).toBe(-1);
    expect(far.dx).toBeCloseTo(-near.dx, 12);
    expect(far.dz).toBeCloseTo(-near.dz, 12);
  });

  it("solveKnee bends forward (-z) and degrades safely when the leg is overstretched", () => {
    const k = solveKnee([0, 0.9, 0], [0, 0.1, 0]);
    expect(k[2]).toBeLessThan(0);
    expect(Number.isFinite(solveKnee([0, 1, 0], [0, 1, 0])[1])).toBe(true);
    expect(Number.isFinite(solveKnee([0, 3, 0], [0, 0, 0])[1])).toBe(true);
  });
});

describe("athleteRig.applyLimbs", () => {
  const root = { position: [2, 0, -3] as V3, yaw: 0.4, scale: [0.88, 0.94, 0.88] as V3 };
  it("poses and shows every limb handle", () => {
    const h = makeHandles();
    const loco = athleteLocomotion(idle({ moveBlend: 0.7, stride: 2, vx: 0.4, vy: -0.5 }));
    applyAthleteLimbs(h, { shoulderY: 1.4, legs: loco.legs, left: [-0.3, 1.1, -0.1], right: [0.3, 1.1, -0.2], racketDirection: [0.2, 0.8, -0.3] }, root);
    for (const k of LIMB_KEYS) {
      const handle = h[k] as unknown as Handle;
      expect(handle.visible, k).toBe(true);
      expect(handle.pos, k).not.toBeNull();
    }
  });

  it("cylinders span exactly the joint distance and the shoes never sink below the floor", () => {
    const h = makeHandles();
    const loco = athleteLocomotion(idle({ moveBlend: 1, stride: 0.5, vy: -1 }));
    applyAthleteLimbs(h, { shoulderY: 1.4, legs: loco.legs }, { position: [0, 0, 0], yaw: 0, scale: [1, 1, 1] });
    const upper = h.leftUpperLeg as unknown as Handle;
    expect(upper.scale![1]).toBeCloseTo(len(loco.legs[0].hip, loco.legs[0].knee), 9);
    expect((h.leftShoe as unknown as Handle).pos![1]).toBeGreaterThanOrEqual(0.045);
  });

  it("places the racket hoop 0.49 along the racket direction from the right hand", () => {
    const h = makeHandles();
    applyAthleteLimbs(h, { shoulderY: 1.4, right: [0.3, 1.1, -0.2], racketDirection: [0, 1, 0] }, { position: [0, 0, 0], yaw: 0, scale: [1, 1, 1] });
    const hand = (h.rightHand as unknown as Handle).pos!;
    const hoop = (h.racketHoop as unknown as Handle).pos!;
    expect(hoop[0]).toBeCloseTo(hand[0], 9);
    expect(hoop[1]).toBeCloseTo(hand[1] + 0.49, 9);
    expect(hoop[2]).toBeCloseTo(hand[2], 9);
  });

  it("falls back to default limbs when the pose omits them", () => {
    const h = makeHandles();
    applyAthleteLimbs(h, { shoulderY: 1.4 }, root);
    for (const k of LIMB_KEYS) expect((h[k] as unknown as Handle).visible, k).toBe(true);
  });
});
