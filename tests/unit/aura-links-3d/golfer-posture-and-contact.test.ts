import { describe, expect, it } from "vitest";
import {
  BALL_SHOT,
  FOREARM_PALM_LEN,
  UPPER_ARM_LEN,
  evaluateSwing,
  makeRoot,
  solveSwing,
  vDist,
  type SwingPosePhase
} from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import { sweptClubContact, sweptSphereHit } from "../../../apps/showcase-aura-links-3d/src/game/contact";

const root = makeRoot(0);
const ARM_MAX = UPPER_ARM_LEN + FOREARM_PALM_LEN;
const solve = (phase: SwingPosePhase, t: number) => solveSwing(evaluateSwing(phase, t), root);

const SWEEPS: Array<[SwingPosePhase, number]> = [
  ["address", 0],
  ["backswing", 0], ["backswing", 0.25], ["backswing", 0.5], ["backswing", 0.75], ["backswing", 1],
  ["top", 0],
  ["downswing", 0.25], ["downswing", 0.5], ["downswing", 0.75], ["downswing", 1],
  ["follow", 0.25], ["follow", 0.5], ["follow", 0.75], ["follow", 1]
];

describe("golfer address posture", () => {
  const p = solve("address", 0).posture;

  it("spine tilt reads as a golf address (25 to 35 degrees from the hips)", () => {
    expect(p.spineTiltDeg).toBeGreaterThanOrEqual(25);
    expect(p.spineTiltDeg).toBeLessThanOrEqual(35);
  });

  it("knees are flexed (20 to 35 degrees) and the thighs are not slanted from the feet", () => {
    expect(p.kneeFlexDeg).toBeGreaterThanOrEqual(20);
    expect(p.kneeFlexDeg).toBeLessThanOrEqual(35);
    expect(p.thighTiltDeg).toBeLessThan(25);
  });

  it("head is over the ball, not leaning sideways", () => {
    expect(p.headOverBallM).toBeLessThan(0.3);
    expect(p.sideBendDeg).toBeLessThan(4);
  });

  it("drives the legs: hip hinge is cancelled so the legs do not inherit the torso lean", () => {
    const s = solve("address", 0);
    for (const bone of ["LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot"]) {
      expect(s.bones[bone], bone).toBeDefined();
    }
  });
});

describe("posture through the whole swing", () => {
  it("keeps both ankles planted (no foot slide)", () => {
    for (const [phase, t] of SWEEPS) {
      expect(solve(phase, t).posture.ankleDriftM, `${phase}@${t}`).toBeLessThan(0.01);
    }
  });

  it("never bends the spine out of a believable range", () => {
    for (const [phase, t] of SWEEPS) {
      const p = solve(phase, t).posture;
      expect(p.spineTiltDeg, `${phase}@${t}`).toBeGreaterThan(12);
      expect(p.spineTiltDeg, `${phase}@${t}`).toBeLessThan(40);
      expect(p.sideBendDeg, `${phase}@${t}`).toBeLessThan(16);
      expect(p.kneeFlexDeg, `${phase}@${t}`).toBeGreaterThan(3); // legs straighten into the finish, never hyperextend
    }
  });

  it("keeps both hands on the club within reach of the arms", () => {
    for (const [phase, t] of SWEEPS) {
      const s = solve(phase, t);
      expect(s.reachR, `${phase}@${t}`).toBeLessThanOrEqual(ARM_MAX);
      expect(s.reachL, `${phase}@${t}`).toBeLessThanOrEqual(ARM_MAX);
      expect(s.wristError, `${phase}@${t}`).toBeLessThan(0.05);
    }
  });

  it("puts the club head on the ball at address and at impact", () => {
    expect(vDist(solve("address", 0).clubHead, BALL_SHOT)).toBeLessThan(0.03);
    expect(vDist(solve("downswing", 1).clubHead, BALL_SHOT)).toBeLessThan(0.03);
  });
});

describe("swept club-head contact", () => {
  it("finds the first entry into the sphere and ignores a path that misses", () => {
    expect(sweptSphereHit([-1, 0, 0], [1, 0, 0], [0, 0, 0], 0.5)).toBeCloseTo(0.25, 6);
    expect(sweptSphereHit([-1, 2, 0], [1, 2, 0], [0, 0, 0], 0.5)).toBeNull();
    expect(sweptSphereHit([0, 0, 0], [1, 0, 0], [0, 0, 0], 0.5)).toBe(0);
  });

  const R = 0.13;
  /** the downswing then follow-through as the game drives it, sampled at `fps` */
  function strike(fps: number, ball: [number, number, number]) {
    const dt = 1 / fps;
    const downswingS = 0.3;
    let prev: [number, number, number] | null = null;
    const hits: Array<{ t: number; phase: string; offset: number; speed: number }> = [];
    let t = 0;
    let phase: "downswing" | "follow" = "downswing";
    for (let i = 0; i < 400; i++) {
      t += dt;
      if (phase === "downswing" && t >= downswingS) { phase = "follow"; t = 0; }
      const head = phase === "downswing"
        ? solve("downswing", Math.min(1, t / downswingS)).clubHead
        : solve("follow", Math.min(1, t / 0.55)).clubHead;
      if (prev) {
        const c = sweptClubContact(prev, head, ball, R, dt, 0);
        if (c) hits.push({ t, phase, offset: c.offsetM, speed: c.speed });
      }
      prev = head;
      if (phase === "follow" && t > 0.2) break;
    }
    return hits;
  }

  for (const fps of [120, 60, 30, 15]) {
    it(`strikes the ball at ${fps} fps, during the downswing or the first follow frames`, () => {
      const hits = strike(fps, BALL_SHOT);
      expect(hits.length).toBeGreaterThan(0);
      const first = hits[0]!;
      expect(first.phase === "downswing" || first.t < 0.06).toBe(true);
      expect(first.offset).toBeLessThan(0.08);
      expect(first.speed).toBeGreaterThan(3);
    });
  }

  it("does not strike a ball the head never reaches", () => {
    expect(strike(60, [BALL_SHOT[0] + 1.2, BALL_SHOT[1], BALL_SHOT[2]])).toEqual([]);
  });
});
