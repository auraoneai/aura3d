import { describe, expect, it } from "vitest";
import { MeshData, gableRoof, groundDisc, pyramidRoof, stoneArch, wallBox } from "../../../examples/last-train-port/townkit";

/** Every triangle's winding must agree with its stored normal, and the normal must point away from `centre` (outward). */
function checkOutward(m: MeshData, centre: [number, number, number], min = 0): void {
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    const p = (i: number) => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!] as const;
    const pa = p(a), pb = p(b), pc = p(c);
    const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const stored = [m.normals[a * 3]!, m.normals[a * 3 + 1]!, m.normals[a * 3 + 2]!];
    expect(n[0]! * stored[0]! + n[1]! * stored[1]! + n[2]! * stored[2]!, "winding agrees with the normal").toBeGreaterThan(0);
    const mid = [(pa[0] + pb[0] + pc[0]) / 3 - centre[0], (pa[1] + pb[1] + pc[1]) / 3 - centre[1], (pa[2] + pb[2] + pc[2]) / 3 - centre[2]];
    expect(mid[0]! * stored[0]! + mid[1]! * stored[1]! + mid[2]! * stored[2]!, "normal points outward").toBeGreaterThan(min);
  }
}

describe("last-train-port town mesh builders", () => {
  it("wallBox builds four outward faces with metric UVs, at any yaw", () => {
    for (const yaw of [0, 0.7, 2.4, -1.3]) {
      const m = new MeshData();
      wallBox(m, 10, 0, -4, 8, 6.4, 10, yaw);
      expect(m.vertexCount).toBe(16);
      expect(m.triangleCount).toBe(8);
      checkOutward(m, [10, 3.2, -4]);
      expect(Math.max(...m.uvs.filter((_, i) => i % 2 === 1))).toBeCloseTo(1, 6);
    }
  });

  it("gable ends add two triangles when requested", () => {
    const m = new MeshData();
    wallBox(m, 0, 0, 0, 8, 6.4, 10, 0.3, { gables: true }, 3);
    expect(m.triangleCount).toBe(10);
    checkOutward(m, [0, 3.2, 0]);
  });

  it("roofs face up and away from the ridge; the pyramid has four faces", () => {
    const r = new MeshData();
    gableRoof(r, 0, 10, 0, 8, 10, 3.5, 0.4);
    expect(r.triangleCount).toBe(4);
    for (let i = 0; i < r.normals.length; i += 3) expect(r.normals[i + 1]).toBeGreaterThan(0.3);
    const p = new MeshData();
    pyramidRoof(p, 0, 20, 0, 7, 9, 0.2);
    expect(p.triangleCount).toBe(4);
    for (let i = 0; i < p.normals.length; i += 3) expect(p.normals[i + 1]).toBeGreaterThan(0.2);
  });

  it("the plaza disc faces up and the arch has stone faces on both sides of the opening", () => {
    const g = new MeshData();
    groundDisc(g, 0, 1, 0, 30, 6, 16);
    expect(g.triangleCount).toBe(16);
    for (let i = 0; i < g.normals.length; i += 3) expect(g.normals[i + 1]).toBe(1);
    const a = new MeshData();
    stoneArch(a, 0, 0, 0, 0.5, 4.8, 2, 3.4, 6);
    expect(a.triangleCount).toBeGreaterThan(18 * 4 * 2);
    const xs = a.positions.filter((_, i) => i % 3 === 1);
    expect(Math.max(...xs)).toBeCloseTo(6 + 4.8 + 2, 5);
  });
});
