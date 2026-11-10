import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS, ballMesh, botMesh, boxMesh, canMesh, cellMesh, cylinderMesh, edgeMesh, finishMesh, quadMesh, roadMesh, sphereMesh, stripMesh
} from "../../../apps/showcase-splat-turf/src/meshes";

const extent = (m: { positions: number[] }, axis: 0 | 1 | 2): [number, number] => {
  let min = Infinity, max = -Infinity;
  for (let i = axis; i < m.positions.length; i += 3) {
    min = Math.min(min, m.positions[i]!);
    max = Math.max(max, m.positions[i]!);
  }
  return [min, max];
};

describe("splat turf mesh dimensions and vertex counts", () => {
  it("box: 24 verts / 36 indices, exact half-extents", () => {
    const m = boxMesh(2, 4, 6);
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
    expect(extent(m, 0)).toEqual([-1, 1]);
    expect(extent(m, 1)).toEqual([-2, 2]);
    expect(extent(m, 2)).toEqual([-3, 3]);
  });

  it("quad: 4 verts / 6 indices on y=0 with +Y normals", () => {
    const m = quadMesh(0.96, 0.96);
    expect(m.positions.length / 3).toBe(4);
    expect(m.indices.length).toBe(6);
    expect(extent(m, 1)).toEqual([0, 0]);
    for (let i = 1; i < m.normals.length; i += 3) expect(m.normals[i]).toBe(1);
  });

  it("sphere: (w+1)(h+1) verts at the exact radius", () => {
    const m = sphereMesh(0.45, 8, 6);
    expect(m.positions.length / 3).toBe(63);
    for (let i = 0; i < m.positions.length; i += 3) {
      expect(Math.hypot(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!)).toBeCloseTo(0.45, 9);
    }
  });

  it("cylinder: side ring + two caps, exact radius and height", () => {
    const m = cylinderMesh(0.28, 0.5, 16);
    expect(m.positions.length / 3).toBe(34 + 36);
    expect(extent(m, 1)).toEqual([-0.25, 0.25]);
    const [minX, maxX] = extent(m, 0);
    expect(minX).toBeCloseTo(-0.28, 9);
    expect(maxX).toBeCloseTo(0.28, 9);
  });

  it("ball: r 0.45, 49 x 33 = 1617 verts", () => {
    const m = ballMesh();
    expect(m.positions.length / 3).toBe(1617);
    expect(extent(m, 1)).toEqual([-BALL_RADIUS, BALL_RADIUS]);
  });

  it("paint cell: 1 x 1 quad (the paint program draws the streak edges)", () => {
    const m = cellMesh();
    expect(extent(m, 0)).toEqual([-0.5, 0.5]);
    expect(extent(m, 2)).toEqual([-0.5, 0.5]);
  });

  it("solvent strip: one lane wide, exactly 10 m long", () => {
    const m = stripMesh();
    expect(extent(m, 0)).toEqual([-0.49, 0.49]);
    expect(extent(m, 2)).toEqual([-5, 5]);
    expect(m.positions.length / 3).toBe(24);
  });

  it("road segment 6.4 x 0.3 x 1.02; edge 0.3 x 0.36 x 1.02", () => {
    expect(extent(roadMesh(), 0)).toEqual([-3.2, 3.2]);
    expect(extent(roadMesh(), 1)).toEqual([-0.15, 0.15]);
    expect(extent(roadMesh(), 2)).toEqual([-0.51, 0.51]);
    expect(extent(edgeMesh(), 0)).toEqual([-0.15, 0.15]);
    expect(extent(edgeMesh(), 1)).toEqual([-0.18, 0.18]);
  });

  it("paint can: two 16-segment cylinders (140 verts), base at y=0, lid top 0.56", () => {
    const m = canMesh();
    expect(m.positions.length / 3).toBe(140);
    const [minY, maxY] = extent(m, 1);
    expect(minY).toBeCloseTo(0, 9);
    expect(maxY).toBeCloseTo(0.56, 9);
  });

  it("eraser bot: pad + body + dome = 165 verts, base at y=0", () => {
    const m = botMesh();
    expect(m.positions.length / 3).toBe(24 + 24 + 117);
    expect(extent(m, 1)[0]).toBeCloseTo(0, 9);
    expect(extent(m, 0)).toEqual([-0.5, 0.5]);
  });

  it("finish gate: two 10-segment posts + bar = 116 verts, 6.4 m span", () => {
    const m = finishMesh();
    expect(m.positions.length / 3).toBe(46 + 46 + 24);
    expect(extent(m, 0)).toEqual([-3.2, 3.2]);
    expect(extent(m, 1)[0]).toBeCloseTo(0, 9);
  });
});