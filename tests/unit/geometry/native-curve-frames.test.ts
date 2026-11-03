/**
 * Independently derived expectations for the rewritten curve adapter
 * (packages/rendering/src/geometry/Support.ts): arc-length inversion, the
 * rotation-minimizing property of double-reflection frames, and axis rotation.
 * Expected values come from closed-form geometry, not another engine.
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "@aura3d/math";
import { Curve3Adapter, rotationAxisMatrix } from "../../../packages/rendering/src/geometry/Support";

describe("Curve3Adapter (independent rewrite)", () => {
  it("inverts arc length for a non-uniform-speed parameterization", () => {
    // z = 4t^2 has length 4; arc fraction u is reached at t = sqrt(u).
    const curve = new Curve3Adapter((t) => new Vector3(0, 0, 4 * t * t));
    expect(curve.getLength()).toBeCloseTo(4, 9);
    for (const u of [0, 0.1, 0.25, 0.5, 0.81, 1]) {
      expect(curve.getPointAt(u).z).toBeCloseTo(4 * u, 3);
      expect(curve.getUtoTmapping(u)).toBeCloseTo(Math.sqrt(u), 2);
    }
    const lengths = curve.getLengths();
    expect(lengths).toHaveLength(curve.arcLengthDivisions + 1);
    expect(curve.getLengths()).toBe(lengths);
    curve.updateArcLengths();
    expect(curve.getLengths()).not.toBe(lengths);
  });

  it("keeps a constant frame along a straight line", () => {
    const frames = new Curve3Adapter((t) => new Vector3(0, 0, 3 * t)).computeFrenetFrames(6, false);
    for (let i = 0; i <= 6; i += 1) {
      expect(frames.tangents[i]!.toArray().map((v) => +v.toFixed(9))).toEqual([0, 0, 1]);
      expect(frames.normals[i]!.toArray().map((v) => +v.toFixed(9))).toEqual([1, 0, 0]);
      expect(frames.binormals[i]!.toArray().map((v) => +v.toFixed(9))).toEqual([0, 1, 0]);
    }
  });

  it("produces rotation-minimizing frames on a helix (no spin about the tangent)", () => {
    // The spin of consecutive frames about the tangent is the antisymmetric
    // part (n_{i+1} . b_i - n_i . b_{i+1}) / 2; curvature terms are symmetric
    // and cancel. Over two turns of radius 1 and pitch c = 1/(2pi) the Frenet
    // frame spins at the torsion rate c / (1 + c^2) ~ 0.155 per unit length,
    // i.e. ~0.015 per step here; a rotation-minimizing frame has none.
    const segments = 128;
    const curve = new Curve3Adapter((t) => new Vector3(Math.cos(4 * Math.PI * t), Math.sin(4 * Math.PI * t), 2 * t));
    const { tangents, normals, binormals } = curve.computeFrenetFrames(segments, false);
    let worst = 0;
    for (let i = 0; i <= segments; i += 1) {
      expect(tangents[i]!.length()).toBeCloseTo(1, 9);
      expect(normals[i]!.length()).toBeCloseTo(1, 9);
      expect(tangents[i]!.dot(normals[i]!)).toBeCloseTo(0, 9);
      expect(binormals[i]!.dot(normals[i]!)).toBeCloseTo(0, 9);
      expect(tangents[i]!.cross(normals[i]!).dot(binormals[i]!)).toBeCloseTo(1, 9);
      if (i < segments) worst = Math.max(worst, Math.abs(normals[i + 1]!.dot(binormals[i]!) - normals[i]!.dot(binormals[i + 1]!)) / 2);
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it("closes the frame seam on a closed curve and keeps frames orthonormal", () => {
    const curve = new Curve3Adapter((t) => new Vector3(Math.cos(2 * Math.PI * t), Math.sin(2 * Math.PI * t), 0.3 * Math.sin(6 * Math.PI * t)));
    curve.closed = true;
    const { tangents, normals } = curve.computeFrenetFrames(48, true);
    for (const [a, b] of [[tangents[0]!, tangents[48]!], [normals[0]!, normals[48]!]] as const) {
      expect(a.distanceTo(b)).toBeLessThan(1e-9);
    }
    // The seam tangent is symmetric: perpendicular to the radial direction at t = 0.
    expect(Math.abs(tangents[0]!.x)).toBeLessThan(1e-6);
    for (let i = 0; i <= 48; i += 1) expect(tangents[i]!.dot(normals[i]!)).toBeCloseTo(0, 9);
  });

  it("returns finite fallbacks for a stationary sampler", () => {
    const curve = new Curve3Adapter(() => new Vector3(1, 2, 3));
    expect(curve.getLength()).toBe(0);
    expect(curve.getUtoTmapping(0.4)).toBe(0.4);
    const frames = curve.computeFrenetFrames(3, false);
    expect(frames.tangents.every((t) => t.length() === 1)).toBe(true);
    expect(frames.normals.every((n) => Math.abs(n.length() - 1) < 1e-12)).toBe(true);
  });
});

describe("rotationAxisMatrix", () => {
  it("rotates right-handedly about a unit axis and preserves the axis", () => {
    const quarter = rotationAxisMatrix(new Vector3(0, 0, 1), Math.PI / 2);
    const x = new Vector3(1, 0, 0).transformMatrix4(quarter);
    expect(x.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
    const axis = new Vector3(1, 1, 1).normalize();
    const third = rotationAxisMatrix(axis, (2 * Math.PI) / 3);
    // A 120-degree turn about (1,1,1) cycles the coordinate axes x -> y -> z.
    expect(new Vector3(1, 0, 0).transformMatrix4(third).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
    expect(new Vector3(0, 1, 0).transformMatrix4(third).distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-12);
    expect(axis.transformMatrix4(third).distanceTo(axis)).toBeLessThan(1e-12);
  });
});
