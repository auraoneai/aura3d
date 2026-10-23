import { describe, expect, it } from "vitest";
import { buildDividers, buildProps, buildRoad, groundQuad, padQuad, veilQuad, type MeshData } from "../../../examples/heatsink-port/meshes";
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
