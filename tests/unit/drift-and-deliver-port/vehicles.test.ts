import { describe, expect, it } from "vitest";
import { CAR_KINDS, CAR_SPECS, buildCarShell, wheelOffsets } from "../../../examples/drift-and-deliver-port/vehicles";
import { bounds, triangleCount, type MeshData } from "../../../examples/drift-and-deliver-port/mesh";

function windingErrors(m: MeshData): number {
  let bad = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const idx = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    const p = idx.map((i) => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!]);
    const u = [p[1]![0]! - p[0]![0]!, p[1]![1]! - p[0]![1]!, p[1]![2]! - p[0]![2]!];
    const v = [p[2]![0]! - p[0]![0]!, p[2]![1]! - p[0]![1]!, p[2]![2]! - p[0]![2]!];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (len < 1e-9) continue;
    const a = idx[0]!;
    if ((n[0]! * m.normals[a * 3]! + n[1]! * m.normals[a * 3 + 1]! + n[2]! * m.normals[a * 3 + 2]!) / len < 0.99) bad++;
  }
  return bad;
}

describe("car shells", () => {
  for (const kind of CAR_KINDS) {
    it(`${kind}: well-formed, inside its footprint, wheels on the ground`, () => {
      const shell = buildCarShell(kind);
      const spec = CAR_SPECS[kind];
      for (const m of [shell.paint, shell.detail]) {
        expect(triangleCount(m)).toBeGreaterThan(20);
        expect(windingErrors(m)).toBe(0);
        const b = bounds(m);
        expect(b.min[0]).toBeGreaterThanOrEqual(-spec.w / 2 - 0.1);
        expect(b.max[0]).toBeLessThanOrEqual(spec.w / 2 + 0.1);
        expect(b.min[2]).toBeGreaterThanOrEqual(-spec.l / 2 - 0.15);
        expect(b.max[2]).toBeLessThanOrEqual(spec.l / 2 + 0.15);
        expect(b.min[1]).toBeGreaterThanOrEqual(0);
        expect(b.max[1]).toBeLessThan(2.4);
      }
      const wheels = wheelOffsets(kind);
      expect(wheels.length).toBe(4);
      for (const w of wheels) expect(w[1]).toBeCloseTo(spec.wheelR, 6);
    });
  }

  it("the sedan matches the simulated car's footprint within 15%", () => {
    const s = CAR_SPECS.sedan;
    expect(Math.abs(s.w - 1.9908) / 1.9908).toBeLessThan(0.15);
    expect(Math.abs(s.l - 4.284) / 4.284).toBeLessThan(0.15);
  });
});
