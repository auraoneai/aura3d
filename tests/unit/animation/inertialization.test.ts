import { describe, expect, it } from "vitest";
import {
  createInertializer,
  fighterCrossfadeWeights,
  fighterInertializedWeights,
  inertializationDecayRate,
  inertializedQuat,
  inertializedScalar,
  inertializedTransitionWeight,
  inertializedVec3
} from "../../../packages/animation/src";

const HALF_LIFE = 0.1;

describe("inertializedScalar", () => {
  it("returns the source offset at t=0 (continuity with the source pose)", () => {
    expect(inertializedScalar(2, 0, 0, HALF_LIFE)).toBe(2);
    expect(inertializedScalar(2, 5, 0, HALF_LIFE)).toBe(2);
  });

  it("preserves the initial velocity (momentum carries through)", () => {
    // x'(0) = v0; approximate via a tiny finite difference.
    const dt = 1e-5;
    const slope = (inertializedScalar(1, 3, dt, HALF_LIFE) - inertializedScalar(1, 3, 0, HALF_LIFE)) / dt;
    expect(slope).toBeCloseTo(3, 2);
  });

  it("decays to ~0 over several half-lives (monotonic energy decay)", () => {
    let prev = Math.abs(inertializedScalar(5, 0, 0, HALF_LIFE));
    for (let i = 1; i <= 80; i += 1) {
      const t = i * (HALF_LIFE / 4);
      const mag = Math.abs(inertializedScalar(5, 0, t, HALF_LIFE));
      expect(mag).toBeLessThanOrEqual(prev + 1e-9); // monotonic non-increasing
      prev = mag;
    }
    expect(prev).toBeLessThan(1e-3); // settled near zero after ~20 half-lives
  });

  it("snaps instantly for a non-positive half-life", () => {
    expect(inertializedScalar(9, 4, 0.001, 0)).toBe(0);
    expect(inertializationDecayRate(0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("is deterministic (same inputs => identical output)", () => {
    expect(inertializedScalar(3.5, -1.2, 0.037, HALF_LIFE)).toBe(inertializedScalar(3.5, -1.2, 0.037, HALF_LIFE));
  });
});

describe("inertializedTransitionWeight", () => {
  it("starts at full source weight with zero initial slope", () => {
    expect(inertializedTransitionWeight(0, HALF_LIFE)).toBe(1);
    const dt = 1e-5;
    const slope = (inertializedTransitionWeight(dt, HALF_LIFE) - 1) / dt;
    expect(Math.abs(slope)).toBeLessThan(1e-2); // ~0 slope => smooth, not linear
  });

  it("monotonically decays toward zero and clamps to [0,1]", () => {
    let prev = 1;
    for (let i = 1; i <= 30; i += 1) {
      const w = inertializedTransitionWeight(i * (HALF_LIFE / 3), HALF_LIFE);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(prev + 1e-9);
      prev = w;
    }
    expect(prev).toBeLessThan(0.05);
  });
});

describe("inertializedVec3 / inertializedQuat", () => {
  it("decays a vector offset component-wise to zero", () => {
    const settled = inertializedVec3([1, -2, 3], 2, HALF_LIFE);
    expect(Math.hypot(settled[0], settled[1], settled[2])).toBeLessThan(1e-3);
  });

  it("returns source rotation at t=0 and target rotation once settled", () => {
    const source: [number, number, number, number] = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]; // 90deg about Y
    const target: [number, number, number, number] = [0, 0, 0, 1]; // identity
    const atZero = inertializedQuat(source, target, 0, HALF_LIFE);
    for (let i = 0; i < 4; i += 1) expect(atZero[i]).toBeCloseTo(source[i], 5);
    const atEnd = inertializedQuat(source, target, 1.5, HALF_LIFE);
    for (let i = 0; i < 4; i += 1) expect(atEnd[i]).toBeCloseTo(target[i], 3);
  });
});

describe("createInertializer (pose-space)", () => {
  const previousPose = { "hip.position": [0, 1, 0] as [number, number, number], "hip.rotation": [0, 0, 0, 1] as [number, number, number, number], "speed": 4 };
  const targetPose = { "hip.position": [0, 1.2, 0.3] as [number, number, number], "hip.rotation": [0, Math.sin(0.2), 0, Math.cos(0.2)] as [number, number, number, number], "speed": 0 };

  it("at t=0 equals the source pose for every recorded target", () => {
    const inert = createInertializer({ halfLife: HALF_LIFE });
    inert.recordTransition(previousPose, targetPose);
    const pose = inert.sampleInertialized(0);
    expect(pose["hip.position"]).toEqual([0, 1, 0]);
    expect(pose["speed"]).toBe(4);
  });

  it("settles to the target pose", () => {
    const inert = createInertializer({ halfLife: HALF_LIFE });
    inert.recordTransition(previousPose, targetPose);
    const pose = inert.sampleInertialized(2);
    const pos = pose["hip.position"] as [number, number, number];
    expect(pos[0]).toBeCloseTo(0, 3);
    expect(pos[1]).toBeCloseTo(1.2, 3);
    expect(pos[2]).toBeCloseTo(0.3, 3);
    expect(pose["speed"] as number).toBeCloseTo(0, 3);
    expect(inert.settled(2)).toBe(true);
    expect(inert.settled(0)).toBe(false);
  });

  it("is deterministic across re-records (reproducible replay)", () => {
    const a = createInertializer({ halfLife: HALF_LIFE });
    const b = createInertializer({ halfLife: HALF_LIFE });
    a.recordTransition(previousPose, targetPose);
    b.recordTransition(previousPose, targetPose);
    expect(a.sampleInertialized(0.05)).toEqual(b.sampleInertialized(0.05));
  });
});

describe("fighterInertializedWeights", () => {
  it("is non-linear: source weight differs from the linear crossfade mid-window", () => {
    const inert = fighterInertializedWeights("idle", "walk", 0.1, 0.2);
    const linear = fighterCrossfadeWeights("idle", "walk", 0.1, 0.2);
    expect(inert.weights[0] + inert.weights[1]).toBeCloseTo(1, 6);
    expect(Math.abs(inert.weights[0] - linear.weights[0])).toBeGreaterThan(1e-3);
    // Critically-damped source weight stays higher than linear early (smooth ease-out).
    expect(inert.weights[0]).toBeGreaterThan(linear.weights[0]);
  });

  it("starts fully on the source and completes on the destination", () => {
    expect(fighterInertializedWeights("a", "b", 0, 0.2).weights[0]).toBe(1);
    expect(fighterInertializedWeights("a", "b", 0.2, 0.2)).toEqual({ from: "a", to: "b", weights: [0, 1], done: true });
    expect(fighterInertializedWeights("a", "a", 0.05, 0.2)).toEqual({ from: "a", to: "a", weights: [0, 1], done: true });
  });
});
