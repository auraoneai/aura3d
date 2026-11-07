import { describe, expect, it } from "vitest";
import {
  PLAYER_DIMS,
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

  it("playerMesh(0..2): sphere (315 verts), cube (24 verts), cone (76 verts) pinned to PLAYER_DIMS", () => {
    const sphere = playerMesh(0);
    expect(sphere.positions.length / 3).toBe((PLAYER_DIMS.sphere.width + 1) * (PLAYER_DIMS.sphere.height + 1));
    expect(extent(sphere, 1)[0]).toBeCloseTo(-PLAYER_DIMS.sphere.radius, 9);
    expect(extent(sphere, 1)[1]).toBeCloseTo(PLAYER_DIMS.sphere.radius, 9);

    const cube = playerMesh(1);
    expect(cube.positions.length / 3).toBe(24);
    expect(cube.indices.length).toBe(36);
    expect(extent(cube, 0)[0]).toBeCloseTo(-PLAYER_DIMS.cube.size / 2, 9);
    expect(extent(cube, 0)[1]).toBeCloseTo(PLAYER_DIMS.cube.size / 2, 9);

    const cone = playerMesh(2);
    expect(cone.positions.length / 3).toBe(3 * PLAYER_DIMS.cone.radial + 4);
    expect(cone.indices.length).toBe(9 * PLAYER_DIMS.cone.radial);
    expect(extent(cone, 1)[0]).toBeCloseTo(-PLAYER_DIMS.cone.height / 2, 9);
    expect(extent(cone, 1)[1]).toBeCloseTo(PLAYER_DIMS.cone.height / 2, 9);
  });

  it("wallCellMesh: 4 box panels around the opening = 96 verts / 144 indices", () => {
    const w = wallCellMesh();
    expect(w.positions.length / 3).toBe(96);
    expect(w.indices.length).toBe(144);
    expect(extent(w, 0)[0]).toBeCloseTo(-WALL_DIMS.cellWidth / 2, 9);
    expect(extent(w, 0)[1]).toBeCloseTo(WALL_DIMS.cellWidth / 2, 9);
    expect(extent(w, 1)[0]).toBeCloseTo(0, 9);
    expect(extent(w, 1)[1]).toBeCloseTo(WALL_DIMS.cellHeight, 9);
    expect(extent(w, 2)[0]).toBeCloseTo(-WALL_DIMS.thickness / 2, 9);
    expect(extent(w, 2)[1]).toBeCloseTo(WALL_DIMS.thickness / 2, 9);
  });

  it("rimMesh(0..2): all three hole rims share 96 verts and 288 indices so one Batch swaps shapes", () => {
    const r0 = rimMesh(0);
    const r1 = rimMesh(1);
    const r2 = rimMesh(2);
    expect(r0.positions.length / 3).toBe(RIM_SEGMENTS * 2);
    expect(r1.positions.length / 3).toBe(RIM_SEGMENTS * 2);
    expect(r2.positions.length / 3).toBe(RIM_SEGMENTS * 2);
    expect(r0.indices.length).toBe(RIM_SEGMENTS * 6);
    expect(r1.indices).toEqual(r0.indices);
    expect(r2.indices).toEqual(r0.indices);
    expect(r0.positions).not.toEqual(r1.positions);
    expect(r1.positions).not.toEqual(r2.positions);
    expect(extent(r0, 2)).toEqual([0, 0]);
  });

  it("tokenMesh, roadSegmentMesh, roadTones, and confettiMesh match their pinned specs", () => {
    const t = tokenMesh();
    expect(t.positions.length / 3).toBe((TOKEN_DIMS.width + 1) * (TOKEN_DIMS.height + 1));
    expect(extent(t, 1)[1]).toBeCloseTo(TOKEN_DIMS.radius, 9);

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
