import { describe, expect, it } from "vitest";
import { PROFILE, buildRoadMesh, buildRoadSamples, frameAt, onRoad } from "../../../examples/saiyan-snake-way-port/road";
import { ROAD_BEHIND, ROAD_LENGTH, ROAD_TAIL, SAMPLE_SPACING, roadGapAt, sampleGap } from "../../../examples/saiyan-snake-way-port/sim";

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const len = (a: readonly number[]): number => Math.sqrt(dot(a, a));

describe("Serpentine Sky Run road", () => {
  const samples = buildRoadSamples();

  it("samples every 3 m from 150 m behind the start to the road's tail", () => {
    expect(samples[0]!.s).toBe(-ROAD_BEHIND);
    expect(samples[samples.length - 1]!.s).toBeGreaterThanOrEqual(ROAD_LENGTH + ROAD_TAIL - SAMPLE_SPACING);
    for (let i = 1; i < samples.length; i++) expect(samples[i]!.s - samples[i - 1]!.s).toBe(SAMPLE_SPACING);
  });

  it("is a continuous path: neighbouring samples are one step apart along the tangent", () => {
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!, b = samples[i]!;
      const d = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
      expect(len(d)).toBeCloseTo(SAMPLE_SPACING, 6);
    }
  });

  it("every frame has unit vectors and a side axis exactly perpendicular to the tangent", () => {
    // The original re-tilts the tangent after re-deriving up once the road climbs past |y| = 9, so up can
    // drift off perpendicular by a few thousandths of a radian there; side is built from the tangent and
    // the rolled up vector and stays exactly perpendicular to the tangent.
    let worstUp = 0;
    for (const s of samples) {
      expect(len(s.F)).toBeCloseTo(1, 6);
      expect(len(s.U)).toBeCloseTo(1, 6);
      expect(len(s.R)).toBeCloseTo(1, 6);
      expect(Math.abs(dot(s.F, s.R))).toBeLessThan(1e-6);
      worstUp = Math.max(worstUp, Math.abs(dot(s.F, s.U)));
    }
    expect(worstUp).toBeLessThan(1.5e-2); // measured worst case on the full road: 9.0e-3
  });

  it("carries the same per-sample gap flag the simulation uses, and At(s).gap follows the nearer sample", () => {
    for (const s of samples) expect(s.gap).toBe(sampleGap(s.s));
    for (let s = 0; s < ROAD_LENGTH; s += 0.7) expect(frameAt(samples, s).gap).toBe(roadGapAt(s));
    expect(samples.some((s) => s.gap)).toBe(true);
  });

  it("builds a ribbon whose indices are in range and which leaves holes where plates are missing", () => {
    const mesh = buildRoadMesh(samples);
    const ring = PROFILE.length;
    expect(mesh.positions.length).toBe(samples.length * ring * 3);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.uvs.length).toBe(samples.length * ring * 2);
    expect(mesh.indices.length % 3).toBe(0);
    const max = samples.length * ring;
    let highest = 0;
    for (const i of mesh.indices) if (i > highest) highest = i;
    expect(highest).toBeLessThan(max);
    const full = (samples.length - 1) * ring * 6;
    expect(mesh.indices.length).toBeLessThan(full);
    expect(mesh.indices.length).toBeGreaterThan(full * 0.9);
  });

  it("puts a player at the road's walkable top (0.48 at the centre line, lower toward the edge)", () => {
    const f = frameAt(samples, 100);
    const centre = onRoad(f, 0, 0);
    const lift = dot([centre[0] - f.p[0], centre[1] - f.p[1], centre[2] - f.p[2]], f.U);
    expect(lift).toBeCloseTo(0.48, 6);
    const edge = onRoad(f, 3.6, 0);
    expect(dot([edge[0] - f.p[0], edge[1] - f.p[1], edge[2] - f.p[2]], f.U)).toBeCloseTo(0.3, 6);
  });
});
