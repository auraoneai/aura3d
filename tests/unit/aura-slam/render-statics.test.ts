import { describe, expect, it } from "vitest";
import { createStaticBoxes, mergeBoxes, unitBoxGeometry } from "../../../examples/aura-slam/view/statics";

type Spec = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };

describe("aura-slam view: static box merging", () => {
  it("the unit box has 24 vertices, 36 indices, unit normals and spans [-0.5, 0.5]", () => {
    const g = unitBoxGeometry() as unknown as Spec;
    expect(g.positions).toHaveLength(72);
    expect(g.indices).toHaveLength(36);
    for (let i = 0; i < 24; i++) expect(Math.hypot(g.normals[i * 3]!, g.normals[i * 3 + 1]!, g.normals[i * 3 + 2]!)).toBeCloseTo(1, 12);
    expect(Math.max(...g.positions)).toBe(0.5);
    expect(Math.min(...g.positions)).toBe(-0.5);
  });

  it("winding agrees with the normals (counter-clockwise seen from outside)", () => {
    const g = unitBoxGeometry() as unknown as Spec;
    for (let t = 0; t < 12; t++) {
      const [a, b, c] = [g.indices[t * 3]!, g.indices[t * 3 + 1]!, g.indices[t * 3 + 2]!];
      const p = (i: number) => [g.positions[i * 3]!, g.positions[i * 3 + 1]!, g.positions[i * 3 + 2]!];
      const [pa, pb, pc] = [p(a), p(b), p(c)];
      const e1 = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
      const e2 = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
      const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const vn = [g.normals[a * 3]!, g.normals[a * 3 + 1]!, g.normals[a * 3 + 2]!];
      expect(n[0]! * vn[0]! + n[1]! * vn[1]! + n[2]! * vn[2]!).toBeGreaterThan(0);
    }
  });

  it("merging n boxes stamps size and position and offsets indices; an empty list returns undefined", () => {
    expect(mergeBoxes([])).toBeUndefined();
    const m = mergeBoxes([{ size: [2, 4, 6], position: [10, 20, 30] }, { size: [1, 1, 1], position: [0, 0, 0] }]) as unknown as Spec;
    expect(m.positions).toHaveLength(2 * 72);
    expect(m.indices).toHaveLength(2 * 36);
    expect(Math.max(...m.indices)).toBe(47);
    const firstX = m.positions.filter((_, i) => i % 3 === 0).slice(0, 24);
    expect(Math.min(...firstX)).toBe(9);
    expect(Math.max(...firstX)).toBe(11);
  });

  it("one node per material group, never an empty node", () => {
    const boxes = createStaticBoxes();
    expect(boxes.build()).toHaveLength(0);
    const mat = { kind: "pbr" } as never;
    for (let i = 0; i < 11; i++) boxes.box("lines", mat, [1, 0.008, 1], [i, 0, 0]);
    for (let i = 0; i < 4; i++) boxes.box("bleachers", mat, [1, 1, 1], [0, i, 0]);
    expect(boxes.count()).toBe(15);
    expect(boxes.build()).toHaveLength(2);
  });
});
