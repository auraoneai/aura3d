import { describe, expect, it } from "vitest";
import {
  PLAYER_DIMS,
  RIM_DEPTH,
  RIM_SEGMENTS,
  ROAD_DIMS,
  TOKEN_DIMS,
  WALL_DIMS,
  boxMesh,
  coneMesh,
  confettiMesh,
  groundQuad,
  playerMesh,
  rimMesh,
  roadSegmentMesh,
  roadTones,
  sphereMesh,
  tokenMesh,
  wallCellMesh
} from "../../../apps/showcase-shape-shift-sprint/src/meshes";

const extent = (m: { positions: number[] }, axis: 0 | 1 | 2): [number, number] => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < m.positions.length; i += 3) {
    min = Math.min(min, m.positions[i]!);
    max = Math.max(max, m.positions[i]!);
  }
  return [min, max];
};

describe("shape shift sprint mesh dimensions and vertex counts", () => {
  it("boxMesh: 24 verts / 36 indices, exact half-extents", () => {
    const m = boxMesh(2, 4, 6);
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
    expect(extent(m, 0)).toEqual([-1, 1]);
    expect(extent(m, 1)).toEqual([-2, 2]);
    expect(extent(m, 2)).toEqual([-3, 3]);
  });

  it("groundQuad: 4 verts / 6 indices on y=0 with +Y normals", () => {
    const m = groundQuad(2, 4);
    expect(m.positions.length / 3).toBe(4);
    expect(m.indices.length).toBe(6);
    expect(extent(m, 0)).toEqual([-1, 1]);
    expect(extent(m, 1)).toEqual([0, 0]);
    expect(extent(m, 2)).toEqual([-2, 2]);
    for (let i = 1; i < m.normals.length; i += 3) expect(m.normals[i]).toBe(1);
  });

  it("sphereMesh and coneMesh: exact vertex counts and radii", () => {
    const s = sphereMesh(0.55, 8, 6);
    expect(s.positions.length / 3).toBe(63);
    for (let i = 0; i < s.positions.length; i += 3) {
      expect(Math.hypot(s.positions[i]!, s.positions[i + 1]!, s.positions[i + 2]!)).toBeCloseTo(0.55, 9);
    }
    const c = coneMesh(0.58, 1.1, 24);
    expect(c.positions.length / 3).toBe(76);
    expect(c.indices.length).toBe(216);
    const [minY, maxY] = extent(c, 1);
    expect(minY).toBeCloseTo(-0.55, 9);
    expect(maxY).toBeCloseTo(0.55, 9);
  });

  it("playerMesh(0..2): sculpted sphere, bevelled superellipsoid cube, and filleted cone pinned to PLAYER_DIMS", () => {
    const sphere = playerMesh(0);
    expect(sphere.positions.length / 3).toBe((PLAYER_DIMS.sphere.width + 1) * (PLAYER_DIMS.sphere.height + 1));
    expect(extent(sphere, 1)[0]).toBeCloseTo(-PLAYER_DIMS.sphere.radius, 9);
    expect(extent(sphere, 1)[1]).toBeCloseTo(PLAYER_DIMS.sphere.radius, 9);
    expect(sphere.normals.every(Number.isFinite)).toBe(true);

    const cube = playerMesh(1);
    const s = PLAYER_DIMS.cube.faceSegments;
    expect(cube.positions.length / 3).toBe(6 * (s + 1) * (s + 1));
    expect(cube.indices.length).toBe(6 * s * s * 6);
    expect(extent(cube, 0)[0]).toBeCloseTo(-PLAYER_DIMS.cube.size / 2, 9);
    expect(extent(cube, 0)[1]).toBeCloseTo(PLAYER_DIMS.cube.size / 2, 9);
    expect(extent(cube, 1)[0]).toBeCloseTo(-PLAYER_DIMS.cube.size / 2, 9);
    expect(extent(cube, 1)[1]).toBeCloseTo(PLAYER_DIMS.cube.size / 2, 9);
    expect(cube.normals.every(Number.isFinite)).toBe(true);

    const cone = playerMesh(2);
    expect(cone.positions.length / 3).toBeGreaterThan(200);
    expect(extent(cone, 1)[0]).toBeCloseTo(-PLAYER_DIMS.cone.height / 2, 9);
    expect(extent(cone, 1)[1]).toBeCloseTo(PLAYER_DIMS.cone.height / 2, 9);
    expect(extent(cone, 0)[1]).toBeCloseTo(PLAYER_DIMS.cone.radius, 6);
    expect(cone.normals.every(Number.isFinite)).toBe(true);
  });

  it("wallCellMesh(0..2): molded 3D cutout blocks share 306 verts / 888 indices with exact outer extents", () => {
    const w0 = wallCellMesh(0);
    const w1 = wallCellMesh(1);
    const w2 = wallCellMesh(2);
    expect(w0.positions.length / 3).toBe(306);
    expect(w1.positions.length / 3).toBe(306);
    expect(w2.positions.length / 3).toBe(306);
    expect(w0.indices.length).toBe(888);
    expect(w1.indices).toEqual(w0.indices);
    expect(w2.indices).toEqual(w0.indices);
    expect(w0.positions).not.toEqual(w1.positions);
    expect(w1.positions).not.toEqual(w2.positions);
    expect(extent(w0, 0)[0]).toBeCloseTo(-WALL_DIMS.cellWidth / 2, 9);
    expect(extent(w0, 0)[1]).toBeCloseTo(WALL_DIMS.cellWidth / 2, 9);
    expect(extent(w0, 1)[0]).toBeCloseTo(0, 9);
    expect(extent(w0, 1)[1]).toBeCloseTo(WALL_DIMS.cellHeight, 9);
    expect(extent(w0, 2)[0]).toBeCloseTo(-WALL_DIMS.thickness / 2, 9);
    expect(extent(w0, 2)[1]).toBeCloseTo(WALL_DIMS.thickness / 2, 9);
    expect(w0.normals.every(Number.isFinite)).toBe(true);
  });

  it("rimMesh(0..2): all three 3D bevelled hole collars share 192 verts and 864 indices so one Batch swaps shapes", () => {
    const r0 = rimMesh(0);
    const r1 = rimMesh(1);
    const r2 = rimMesh(2);
    expect(r0.positions.length / 3).toBe(RIM_SEGMENTS * 4);
    expect(r1.positions.length / 3).toBe(RIM_SEGMENTS * 4);
    expect(r2.positions.length / 3).toBe(RIM_SEGMENTS * 4);
    expect(r0.indices.length).toBe(RIM_SEGMENTS * 18);
    expect(r1.indices).toEqual(r0.indices);
    expect(r2.indices).toEqual(r0.indices);
    expect(r0.positions).not.toEqual(r1.positions);
    expect(r1.positions).not.toEqual(r2.positions);
    expect(extent(r0, 2)[0]).toBeCloseTo(-0.04, 9);
    expect(extent(r0, 2)[1]).toBeCloseTo(RIM_DEPTH, 9);
    expect(r0.normals.every(Number.isFinite)).toBe(true);
  });

  it("tokenMesh(0..3), roadSegmentMesh, roadTones, and confettiMesh match their pinned specs", () => {
    const t0 = tokenMesh(0);
    const t1 = tokenMesh(1);
    const t2 = tokenMesh(2);
    const t3 = tokenMesh(3);
    const expectedVerts = (TOKEN_DIMS.width + 1) * (TOKEN_DIMS.height + 1);
    expect(t0.positions.length / 3).toBe(expectedVerts);
    expect(t1.positions.length / 3).toBe(expectedVerts);
    expect(t2.positions.length / 3).toBe(expectedVerts);
    expect(t3.positions.length / 3).toBe(expectedVerts);
    expect(t1.indices).toEqual(t0.indices);
    expect(t2.indices).toEqual(t0.indices);
    expect(t3.indices).toEqual(t0.indices);
    expect(extent(t0, 1)[1]).toBeCloseTo(TOKEN_DIMS.radius, 9);
    expect(t0.normals.every(Number.isFinite)).toBe(true);
    expect(t1.normals.every(Number.isFinite)).toBe(true);
    expect(t2.normals.every(Number.isFinite)).toBe(true);
    expect(t3.normals.every(Number.isFinite)).toBe(true);

    const road = roadSegmentMesh();
    expect(road.positions.length / 3).toBe(12);
    expect(road.indices.length).toBe(18);
    expect(extent(road, 0)[0]).toBeCloseTo(-ROAD_DIMS.width / 2, 9);
    expect(extent(road, 0)[1]).toBeCloseTo(ROAD_DIMS.width / 2, 9);
    expect(extent(road, 1)).toEqual([0, 0.02]);
    expect(extent(road, 2)).toEqual([-ROAD_DIMS.length / 2, ROAD_DIMS.length / 2]);
    expect(roadTones().length).toBe(36);

    const chip = confettiMesh();
    expect(chip.positions.length / 3).toBe(24);
    expect(chip.indices.length).toBe(36);
  });
});
