import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  DECK_WIDTH,
  GEM_RADIUS,
  ORB_RADIUS,
  PARTICLE_RADIUS,
  RING_INNER,
  RING_OUTER,
  SEG_LEN,
  ballMesh,
  boxMesh,
  dashMesh,
  deckHalfMesh,
  gemMesh,
  orbMesh,
  particleMesh,
  powerupMesh,
  quadMesh,
  railMesh,
  ringMesh,
  shadowMesh,
  shockwaveMesh,
  sphereMesh,
  streamMesh,
  symbolMesh,
  translateMesh
} from "../../../apps/showcase-polarity-orbs/src/meshes";

const extent = (m: { positions: number[] }, axis: 0 | 1 | 2): [number, number] => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < m.positions.length; i += 3) {
    min = Math.min(min, m.positions[i]!);
    max = Math.max(max, m.positions[i]!);
  }
  return [min, max];
};

describe("polarity orbs mesh dimensions and vertex counts", () => {
  it("boxMesh and translateMesh: 24 verts / 36 indices, exact half-extents and translation", () => {
    const m = boxMesh(2, 4, 6);
    expect(m.positions.length / 3).toBe(24);
    expect(m.normals.length / 3).toBe(24);
    expect(m.uvs.length / 2).toBe(24);
    expect(m.indices.length).toBe(36);
    expect(extent(m, 0)).toEqual([-1, 1]);
    expect(extent(m, 1)).toEqual([-2, 2]);
    expect(extent(m, 2)).toEqual([-3, 3]);

    const shifted = translateMesh(m, 3, -1, 5);
    expect(extent(shifted, 0)).toEqual([2, 4]);
    expect(extent(shifted, 1)).toEqual([-3, 1]);
    expect(extent(shifted, 2)).toEqual([2, 8]);
    // Original mesh is untouched.
    expect(extent(m, 0)).toEqual([-1, 1]);
  });

  it("quadMesh and shadowMesh: 4 verts / 6 indices on y=0 with +Y normals", () => {
    const q = quadMesh(2, 4);
    expect(q.positions.length / 3).toBe(4);
    expect(q.indices.length).toBe(6);
    expect(extent(q, 0)).toEqual([-1, 1]);
    expect(extent(q, 1)).toEqual([0, 0]);
    expect(extent(q, 2)).toEqual([-2, 2]);
    for (let i = 1; i < q.normals.length; i += 3) expect(q.normals[i]).toBe(1);

    const shadow = shadowMesh();
    expect(shadow.positions.length / 3).toBe(4);
    expect(shadow.indices.length).toBe(6);
    expect(extent(shadow, 0)).toEqual([-1, 1]);
    expect(extent(shadow, 2)).toEqual([-1, 1]);
  });

  it("sphereMesh, ballMesh, orbMesh, and particleMesh: pinned vertex counts and radii", () => {
    const s = sphereMesh(0.5, 8, 6);
    expect(s.positions.length / 3).toBe(9 * 7);
    for (let i = 0; i < s.positions.length; i += 3) {
      expect(Math.hypot(s.positions[i]!, s.positions[i + 1]!, s.positions[i + 2]!)).toBeCloseTo(0.5, 9);
    }

    const ball = ballMesh();
    expect(ball.positions.length / 3).toBe((24 + 1) * (16 + 1)); // 425
    expect(ball.indices.length).toBe(24 * (16 - 1) * 6); // 2160
    expect(extent(ball, 1)[0]).toBeCloseTo(-BALL_RADIUS, 9);
    expect(extent(ball, 1)[1]).toBeCloseTo(BALL_RADIUS, 9);

    const orb = orbMesh();
    expect(orb.positions.length / 3).toBe((16 + 1) * (12 + 1)); // 221
    expect(orb.indices.length).toBe(16 * (12 - 1) * 6); // 1056
    expect(extent(orb, 1)[0]).toBeCloseTo(-ORB_RADIUS, 9);
    expect(extent(orb, 1)[1]).toBeCloseTo(ORB_RADIUS, 9);

    const pt = particleMesh();
    expect(pt.positions.length / 3).toBe((6 + 1) * (6 + 1)); // 49
    expect(pt.indices.length).toBe(6 * (6 - 1) * 6); // 180
    expect(extent(pt, 1)[0]).toBeCloseTo(-PARTICLE_RADIUS, 9);
    expect(extent(pt, 1)[1]).toBeCloseTo(PARTICLE_RADIUS, 9);
  });

  it("ringMesh and shockwaveMesh: flat XZ annulus with pinned inner/outer radii", () => {
    const r = ringMesh(0.5, 1.5, 16);
    expect(r.positions.length / 3).toBe((16 + 1) * 2);
    expect(r.indices.length).toBe(16 * 6);
    expect(extent(r, 1)).toEqual([0, 0]);

    const sw = shockwaveMesh();
    expect(sw.positions.length / 3).toBe((48 + 1) * 2); // 98
    expect(sw.indices.length).toBe(48 * 6); // 288
    for (let i = 0; i < sw.positions.length; i += 6) {
      const rIn = Math.hypot(sw.positions[i]!, sw.positions[i + 2]!);
      const rOut = Math.hypot(sw.positions[i + 3]!, sw.positions[i + 5]!);
      expect(rIn).toBeCloseTo(RING_INNER, 9);
      expect(rOut).toBeCloseTo(RING_OUTER, 9);
    }
  });

  it("gemMesh and powerupMesh: octahedron with 24 vertices / 24 indices and unit normals", () => {
    const gem = gemMesh(GEM_RADIUS);
    const pu = powerupMesh();
    expect(pu).toEqual(gem);
    expect(pu.positions.length / 3).toBe(24);
    expect(pu.indices.length).toBe(24);
    expect(extent(pu, 0)).toEqual([-GEM_RADIUS, GEM_RADIUS]);
    expect(extent(pu, 1)[0]).toBeCloseTo(-GEM_RADIUS * 1.3, 9);
    expect(extent(pu, 1)[1]).toBeCloseTo(GEM_RADIUS * 1.3, 9);
    expect(extent(pu, 2)).toEqual([-GEM_RADIUS, GEM_RADIUS]);
    for (let i = 0; i < pu.normals.length; i += 3) {
      expect(Math.hypot(pu.normals[i]!, pu.normals[i + 1]!, pu.normals[i + 2]!)).toBeCloseTo(1, 9);
    }
  });

  it("deckHalfMesh, railMesh, dashMesh, streamMesh, and symbolMesh match their pinned specs", () => {
    const deck = deckHalfMesh();
    expect(deck.positions.length / 3).toBe(24);
    expect(deck.indices.length).toBe(36);
    expect(extent(deck, 0)).toEqual([-DECK_WIDTH / 4, DECK_WIDTH / 4]);
    expect(extent(deck, 1)[0]).toBeCloseTo(-0.15, 9);
    expect(extent(deck, 1)[1]).toBeCloseTo(0.15, 9);
    expect(extent(deck, 2)).toEqual([-SEG_LEN / 2, SEG_LEN / 2]);

    const rail = railMesh();
    expect(rail.positions.length / 3).toBe(24);
    expect(rail.indices.length).toBe(36);
    expect(extent(rail, 0)[0]).toBeCloseTo(-0.15, 9);
    expect(extent(rail, 1)[1]).toBeCloseTo(0.175, 9);
    expect(extent(rail, 2)).toEqual([-SEG_LEN / 2, SEG_LEN / 2]);

    const dash = dashMesh();
    expect(dash.positions.length / 3).toBe(24);
    expect(dash.indices.length).toBe(36);
    expect(extent(dash, 0)[1]).toBeCloseTo(0.075, 9);
    expect(extent(dash, 2)[1]).toBeCloseTo(0.6, 9);

    const stream = streamMesh();
    expect(stream.positions.length / 3).toBe(24);
    expect(stream.indices.length).toBe(36);
    expect(extent(stream, 0)[1]).toBeCloseTo(0.03, 9);
    expect(extent(stream, 2)).toEqual([-0.5, 0.5]);

    const plus = symbolMesh("plus");
    const minus = symbolMesh("minus");
    expect(plus.positions.length / 3).toBe(48);
    expect(minus.positions.length / 3).toBe(48);
    expect(plus.indices.length).toBe(72);
    expect(minus.indices).toEqual(plus.indices);
    expect(extent(plus, 2)[1]).toBeCloseTo(0.21, 9);
    expect(extent(minus, 2)[1]).toBeCloseTo(0.05, 9);
  });
});
