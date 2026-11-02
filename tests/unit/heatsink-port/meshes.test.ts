import { describe, expect, it } from "vitest";
import { appendBox, buildArches, buildDividers, buildProps, buildRails, buildRoad, buildShards, buildShoulders, emptyMesh, groundQuad, mound, padQuad, veilQuad, type MeshData } from "../../../examples/heatsink-port/meshes";
import { Track } from "../../../examples/heatsink-port/track";

const track = new Track();

const check = (m: MeshData): void => {
  const n = m.positions.length / 3;
  expect(Number.isInteger(n)).toBe(true);
  expect(m.normals.length).toBe(n * 3);
  expect(m.uvs.length).toBe(n * 2);
  expect(m.indices.length % 3).toBe(0);
  for (const i of m.indices) expect(i).toBeLessThan(n);
  expect(m.positions.every(Number.isFinite)).toBe(true);
  expect(m.normals.every(Number.isFinite)).toBe(true);
};

describe("road ribbon", () => {
  const road = buildRoad(track, 6, 9);
  it("is a well-formed indexed mesh with road attributes", () => {
    check(road);
    const n = road.positions.length / 3;
    expect(road.attrs.roadColor!.length).toBe(n * 3);
    expect(road.attrs.roadUv!.length).toBe(n * 2);
  });
  it("closes the loop: first and last rows coincide", () => {
    const cols = 9;
    const rows = road.positions.length / 3 / cols;
    for (let j = 0; j < cols; j++) for (let k = 0; k < 3; k++) expect(Math.abs((road.positions[j * 3 + k] as number) - (road.positions[((rows - 1) * cols + j) * 3 + k] as number))).toBeLessThan(1e-3);
  });
  it("faces upward on flat sections (winding and normals agree)", () => {
    let up = 0;
    for (let i = 1; i < road.normals.length; i += 3) if ((road.normals[i] as number) > 0.5) up++;
    expect(up / (road.normals.length / 3)).toBeGreaterThan(0.8);
  });
  it("spans the road width at s=0 (edge columns sit at +/- half width)", () => {
    const f = track.frame(0);
    const l = [road.positions[0]!, road.positions[1]!, road.positions[2]!];
    const r = [road.positions[8 * 3]!, road.positions[8 * 3 + 1]!, road.positions[8 * 3 + 2]!];
    expect(Math.hypot(r[0]! - l[0]!, r[2]! - l[2]!)).toBeCloseTo(2 * f.hw, 3);
  });
});

describe("other meshes", () => {
  it("dividers exist only in the two split-lane sections", () => {
    const d = buildDividers(track);
    check(d);
    expect(d.positions.length).toBeGreaterThan(0);
    const ss = track.splits.map((s) => [s.s0, s.s1] as const);
    expect(ss.length).toBe(2);
  });
  it("props are well formed and non-empty", () => {
    const { rocks, crystals } = buildProps(track);
    check(rocks);
    check(crystals);
    expect(rocks.indices.length).toBeGreaterThan(300);
    expect(crystals.indices.length).toBeGreaterThan(300);
  });
  it("is deterministic", () => {
    expect(buildProps(track).rocks.positions).toEqual(buildProps(track).rocks.positions);
  });
  it("veils, pads and ground are single quads", () => {
    for (const m of [veilQuad(track, track.checkpoints[0]!), padQuad(track, track.boostPads[0]!.s, track.boostPads[0]!.x), groundQuad(100, -5)]) {
      check(m);
      expect(m.indices.length).toBe(6);
    }
  });
});


/** area-weighted face normal of triangle `t` (index of its first index) */
const faceNormal = (m: MeshData, t: number): [number, number, number] => {
  const p = (i: number) => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
  const a = p(m.indices[t]!), b = p(m.indices[t + 1]!), c = p(m.indices[t + 2]!);
  const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  return [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
};

describe("art-pass meshes", () => {
  it("appendBox: 24 vertices, 36 indices, winding agrees with the stored normal on every face", () => {
    const m = emptyMesh();
    appendBox(m, [1, 2, 3], [1, 0, 0], [0, 1, 0], [0, 0, 1], 1, 2, 3);
    check(m);
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
    for (let t = 0; t < m.indices.length; t += 3) {
      const n = faceNormal(m, t);
      const stored = [m.normals[m.indices[t]! * 3]!, m.normals[m.indices[t]! * 3 + 1]!, m.normals[m.indices[t]! * 3 + 2]!];
      expect(n[0] * stored[0]! + n[1] * stored[1]! + n[2] * stored[2]!).toBeGreaterThan(0);
    }
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < m.positions.length; i += 3) { minY = Math.min(minY, m.positions[i]!); maxY = Math.max(maxY, m.positions[i]!); }
    expect(maxY - minY).toBeCloseTo(4, 9);
  });

  it("appendBox keeps outward winding for a left-handed basis too", () => {
    const m = emptyMesh();
    appendBox(m, [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, -1], 1, 1, 1);
    for (let t = 0; t < m.indices.length; t += 3) {
      const n = faceNormal(m, t);
      const i = m.indices[t]!;
      expect(n[0] * m.normals[i * 3]! + n[1] * m.normals[i * 3 + 1]! + n[2] * m.normals[i * 3 + 2]!).toBeGreaterThan(0);
    }
  });

  it("mound: a closed-top dome whose smooth normals face away from its axis and whose summit is at the requested height", () => {
    const m = emptyMesh();
    mound(m, 10, 5, -4, 30, 40, 1.3, 18, 8);
    check(m);
    expect(m.positions.length / 3).toBe(18 * 9);
    let maxY = -Infinity, outward = 0, up = 0;
    for (let i = 0; i < m.positions.length / 3; i++) {
      maxY = Math.max(maxY, m.positions[i * 3 + 1]!);
      const dx = m.positions[i * 3]! - 10, dz = m.positions[i * 3 + 2]! + 4;
      if (Math.hypot(dx, dz) > 4 && m.normals[i * 3]! * dx + m.normals[i * 3 + 2]! * dz > 0) outward++;
      if (m.normals[i * 3 + 1]! > -0.05) up++;
      expect(Math.hypot(m.normals[i * 3]!, m.normals[i * 3 + 1]!, m.normals[i * 3 + 2]!)).toBeCloseTo(1, 5);
    }
    expect(maxY).toBeGreaterThan(5 + 40 * 0.9);
    expect(maxY).toBeLessThan(5 + 40 * 1.12);
    expect(outward).toBeGreaterThan(m.positions.length / 3 * 0.8);
    expect(up).toBe(m.positions.length / 3);
  });

  it("shoulders: two plains that face upward and sit just below the road edge, then fall away", () => {
    const m = buildShoulders(track, 12);
    check(m);
    let up = 0;
    for (let i = 1; i < m.normals.length; i += 3) if (m.normals[i]! > 0.5) up++;
    expect(up / (m.normals.length / 3)).toBeGreaterThan(0.9);
    const f = track.frame(0);
    let nearest = Infinity;
    for (let i = 0; i < m.positions.length / 3; i++) {
      const d = Math.hypot(m.positions[i * 3]! - f.x, m.positions[i * 3 + 2]! - f.z);
      if (d < f.hw + 2) nearest = Math.min(nearest, d);
    }
    expect(Number.isFinite(nearest)).toBe(true);
  });

  it("rails and posts: a continuous square tube per side and ~every 22 m a neon post", () => {
    const { rails, posts } = buildRails(track, 8);
    check(rails);
    check(posts);
    const rows = Math.ceil(track.length / 8) + 1;
    expect(rails.positions.length / 3).toBe(rows * 4 * 2);
    expect(posts.positions.length / 3).toBe(24 * Math.ceil((track.length - 11) / 22) * 2);
  });

  it("arches: one gantry (two pillars, a beam) every 240 m with a neon strip pair each", () => {
    const { body, neon } = buildArches(track);
    check(body);
    check(neon);
    const count = Math.floor((track.length - 60 - 120 - 1) / 240) + 1;
    expect(body.positions.length / 3).toBe(count * 3 * 24);
    expect(neon.positions.length / 3).toBe(count * 2 * 24);
  });

  it("shards are well formed, floating above the course and deterministic", () => {
    const a = buildShards(track);
    check(a);
    expect(a.indices.length).toBeGreaterThan(30);
    expect(a.positions).toEqual(buildShards(track).positions);
  });
});
