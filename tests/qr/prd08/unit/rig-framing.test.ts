/**
 * #76 (gating lane 14 T2.3 S7): `framing.subjectHeightFraction` on all 8
 * subject-tracking rigs — chase, flight, follow2d, fighting, shoulder, orbit,
 * topDown, altitude. The framing solver must win over each rig's fixed
 * distance/altitude/back-off when provided.
 */
import { describe, expect, it } from "vitest";
import {
  createAltitudeRig,
  createChaseRig,
  createFightingRig,
  createFlightRig,
  createFollow2dRig,
  createOrbitRig,
  createShoulderRig,
  createTopDownRig,
  distanceForFractionInContext
} from "@aura3d/engine/lanes";
import { ASPECT, dist3, run, subjectAt } from "./rigTestKit.js";

const FRACTION = 0.28;
/** subjectAt default bounds: y ±0.9 → subjectHeight 1.8. */
const SUBJECT_H = 1.8;
const expected = (fov: number) =>
  distanceForFractionInContext(SUBJECT_H, fov, FRACTION, { aspect: ASPECT });

const hero = () => ({ hero: subjectAt([0, 0, 0]) });

describe("rig framing.subjectHeightFraction (#76)", () => {
  it("chase: framing solver wins over the speed-curve distance", () => {
    const rig = createChaseRig({ target: "hero", fov: 50, framing: { subjectHeightFraction: FRACTION } });
    const poses = run(rig, 240, 1 / 60, hero);
    const eye = poses.at(-1)!.position;
    // Arm is horizontal (height default small) — horizontal distance ≈ solved.
    expect(Math.hypot(eye[0], eye[2])).toBeCloseTo(expected(50), 0);
  });

  it("flight: framing solver wins over the per-speed distance", () => {
    const rig = createFlightRig({ target: "hero", fov: 50, framing: { subjectHeightFraction: FRACTION } });
    const poses = run(rig, 240, 1 / 60, hero);
    const eye = poses.at(-1)!.position;
    // yaw arm is horizontal (length `dist`); height 0.6 adds a small vertical.
    expect(Math.hypot(eye[0], eye[2])).toBeCloseTo(expected(50), 0);
  });

  it("follow2d: framing solver wins over the fixed +Z distance", () => {
    const rig = createFollow2dRig({ target: "hero", fov: 50, framing: { subjectHeightFraction: FRACTION } });
    const poses = run(rig, 8, 1 / 60, hero);
    const pose = poses.at(-1)!;
    expect(pose.position[2]).toBeCloseTo(expected(50), 6);
  });

  it("fighting: smaller fraction keeps the pair framed from farther away", () => {
    const tight = createFightingRig({ fighters: ["a", "b"], fov: 45, framing: { subjectHeightFraction: 0.15 } });
    const loose = createFightingRig({ fighters: ["a", "b"], fov: 45, framing: { subjectHeightFraction: 0.6 } });
    const script = () => ({
      a: subjectAt([-1.5, 0, 0]),
      b: subjectAt([1.5, 0, 0])
    });
    const dTight = dist3(run(tight, 240, 1 / 60, script).at(-1)!.position, [0, 0, 0]);
    const dLoose = dist3(run(loose, 240, 1 / 60, script).at(-1)!.position, [0, 0, 0]);
    expect(dTight).toBeGreaterThan(dLoose);
  });

  it("shoulder: framing solver wins over the fixed back-off", () => {
    const rig = createShoulderRig({ target: "hero", fov: 50, framing: { subjectHeightFraction: FRACTION } });
    const poses = run(rig, 240, 1 / 60, hero);
    const eye = poses.at(-1)!.position;
    // forward=[0,0,1] → facing π → eye sits `dist` behind along -forward (z<0).
    expect(Math.abs(eye[2])).toBeCloseTo(expected(50), 1);
  });

  it("orbit: distance equals the framing solution exactly", () => {
    const rig = createOrbitRig({ target: "hero", fov: 50, framing: { subjectHeightFraction: FRACTION } });
    const poses = run(rig, 8, 1 / 60, hero);
    const pose = poses.at(-1)!;
    expect(dist3(pose.position, pose.target)).toBeCloseTo(expected(50), 6);
  });

  it("topDown: altitude equals the framing solution", () => {
    const rig = createTopDownRig({ target: "hero", fov: 45, framing: { subjectHeightFraction: FRACTION } });
    const poses = run(rig, 8, 1 / 60, hero);
    expect(poses.at(-1)!.position[1]).toBeCloseTo(expected(45), 6);
  });

  it("altitude: fraction setting changes the solved distance", () => {
    const wide = createAltitudeRig({ target: "hero", ground: [0, 0, 0], fov: 50, framing: { subjectHeightFraction: 0.15 } });
    const narrow = createAltitudeRig({ target: "hero", ground: [0, 0, 0], fov: 50, framing: { subjectHeightFraction: 0.6 } });
    const dWide = dist3(run(wide, 240, 1 / 60, hero).at(-1)!.position, [0, 0, 0]);
    const dNarrow = dist3(run(narrow, 240, 1 / 60, hero).at(-1)!.position, [0, 0, 0]);
    expect(dWide).toBeGreaterThan(dNarrow);
  });
});
