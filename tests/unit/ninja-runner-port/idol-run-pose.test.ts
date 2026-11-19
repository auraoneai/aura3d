/**
 * Real-GPU regression (owner, 2026-11-18): every rigged Shadowstep figure (hero, echo clones, Sunfire / Ember forms, every
 * enemy) ran "kneeling": sunk to the knees, torso pitched far forward, both arms thrown up and out in a V. Cause: the
 * hero, its forms and clones ran on the captured "Dash" clip (a face-down lunge, hands above the shoulders every frame,
 * torso 70-120 degrees from upright) and the enemies on the captured "Run" (35-60 degrees of lean, hands over the
 * shoulders on the back swing, stance foot 4 cm under the road). Every runner now plays the captured sprint
 * straightened by `uprightRun`, with its feet held on the road (`groundFeet`).
 *
 * Over 300 frames of the real per-frame path (`idolMotionPose`, the same call the world makes), for every Idol body:
 * - feet on the road: the lowest knee/foot/toe joint never sinks more than 5 cm under its standing height, and every
 *   stride brings it back within 5 cm of the road (no gliding in the air);
 * - the arms swing below the shoulders, the torso leans no more than a sprint lean, and the limbs really move.
 */
import { describe, expect, it } from "vitest";
import { driverFor, idolMotionPose, lowestLegPoint, standingSole, type IdolActorKey } from "../../../examples/ninja-runner-port/art/idolActors";
import { IDOL_RIGS } from "../../../examples/ninja-runner-port/art/idolRigData";
import { RUN_MAX_LEAN, motionClipFor } from "../../../examples/ninja-runner-port/art/idolMotion";
import type { CharacterId } from "../../../examples/ninja-runner-port/models";

const BODIES: readonly (readonly [IdolActorKey, CharacterId, number, string])[] = [
  ["nrHero", "hero", 20, "hero"],
  ["nrHeroClone", "hero", 20, "echo clone"],
  ["nrSage", "sage", 22, "Sunfire form"],
  ["nrEmber", "sage", 25, "Ember form"],
  ["nrSoldier", "soldier", 16, "Hawk swordsman / foot soldier"],
  ["nrBrute", "brute", 17, "Boar guardian"],
  ["nrCaster", "caster", 19, "Owl caster"],
  ["nrScout", "scout", 22, "Fox scout"]
];
let slot = 9100;

function run(key: IdolActorKey, id: CharacterId, speed: number, dash = false) {
  const s = slot++, d = driverFor(key), m = d.data.map;
  const rows: { low: number; handOver: number; lean: number; rots: string }[] = [];
  let travel = 0;
  // standing reference for the torso: neck over hips with every segment at rest
  const sole = standingSole(d);
  const I: [number, number, number, number] = [0, 0, 0, 1];
  d.solve({ body: I, head: I, armL: I, foreL: I, armR: I, foreR: I, legL: I, shinL: I, footL: I, legR: I, shinR: I, footR: I });
  const restNeck = d.jointPosition(m.neck[0] ?? m.head), restHips = d.jointPosition(m.hips);
  const restLean = Math.atan2(restNeck[2] - restHips[2], restNeck[1] - restHips[1]);
  for (let f = 0; f < 300; f++) {
    const dt = 1 / 60;
    travel += speed * dt;
    const r = idolMotionPose(s, key, id, { clip: "run", time: 0, duration: 0.64 }, { travel, dt, y: 0, vy: 0, dash }, 1);
    expect(r).not.toBeNull();
    const y = (b: number): number => d.jointPosition(b)[1];
    const over = (arm: readonly number[]): number => Math.max(y(arm[2]!), y(arm[3]!)) - y(arm[1]!);
    const neck = d.jointPosition(m.neck[0] ?? m.head), hips = d.jointPosition(m.hips);
    const lean = Math.atan2(neck[2] - hips[2], neck[1] - hips[1]) - restLean;
    rows.push({ low: lowestLegPoint(d) - sole, handOver: Math.max(over(m.armL), over(m.armR)), lean, rots: JSON.stringify(r!.pose.bones) });
  }
  return rows;
}

describe("Shadowstep Idol runners run upright with their feet on the road", () => {
  it("no runner plays the captured face-down Dash lunge", () => {
    for (const [, id] of BODIES) { expect(motionClipFor(id, "run")).toBe("Run"); expect(motionClipFor(id, "run", true)).toBe("Run"); }
  });

  it.each(BODIES)("%s (%s at %d m/s, %s): feet on the road, arms below the shoulders, sprint lean, limbs moving", (key, id, speed) => {
    expect(IDOL_RIGS[key]).toBeTruthy();
    for (const dash of [false, true]) {
      const rows = run(key, id, speed, dash);
      // never sunk into the road
      expect(Math.min(...rows.map((r) => r.low))).toBeGreaterThan(-0.05);
      // every step (2.6-3.0 a second: any 0.4 s window holds a footfall) comes back down onto the road
      for (let k = 0; k + 24 <= rows.length; k += 12) expect(Math.min(...rows.slice(k, k + 24).map((r) => r.low))).toBeLessThan(0.05);
      // hands below the shoulders the whole cycle (no arms-up V)
      expect(Math.max(...rows.map((r) => r.handOver))).toBeLessThan(0);
      // a sprint lean, never pitched toward horizontal
      expect(Math.max(...rows.map((r) => r.lean))).toBeLessThan(RUN_MAX_LEAN + 0.2);
      // the limbs really move (not a frozen bind pose)
      expect(new Set(rows.map((r) => r.rots)).size).toBeGreaterThan(100);
    }
  });
});
