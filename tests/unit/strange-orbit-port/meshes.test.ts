import { describe, expect, it } from "vitest";
import { ISLAND_TILES, OPAL, SKATE_LOOPS, SPLIT, rampsFor } from "../../../examples/strange-orbit-port/course";
import { buildCourse, buildIslands, buildLoops, buildRamps, computeNormals, railStrip, trackStrip, veilQuad, vertexCount, type MeshData } from "../../../examples/strange-orbit-port/meshes";
import { paintOriginalAt, pigmentsAt } from "../../../examples/strange-orbit-port/palette";
import { mainFrame } from "../../../examples/strange-orbit-port/track";

function assertConsistent(m: MeshData, label: string, withPigments = true): void {
  const n = vertexCount(m);
  expect(n, label).toBeGreaterThan(3);
  expect(m.positions.length, `${label} positions`).toBe(n * 3);
  expect(m.normals.length, `${label} normals`).toBe(n * 3);
  expect(m.uvs.length, `${label} uvs`).toBe(n * 2);
  if (withPigments) {
    expect(m.pigmentBase.length).toBe(n * 3);
    expect(m.pigmentVein.length).toBe(n * 3);
    expect(m.pigmentChalk.length).toBe(n * 3);
    expect(m.paintOriginal.length).toBe(n);
  }
  expect(m.indices.length % 3, `${label} index count`).toBe(0);
  for (const i of m.indices) {
    if (!(i >= 0 && i < n)) throw new Error(`${label}: index ${i} outside 0..${n - 1}`);
  }
  for (const v of m.positions) if (!Number.isFinite(v)) throw new Error(`${label}: non-finite position`);
  for (let i = 0; i < m.normals.length; i += 3) {
    const len = Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!);
    if (!(Math.abs(len - 1) < 1e-6)) throw new Error(`${label}: normal ${i / 3} has length ${len}`);
  }
}

describe("strange-orbit-port meshes", () => {
  it("a track strip has 15 vertices per row, valid indices and unit analytic normals", () => {
    const m = trackStrip(0, 60, "main");
    const rows = Math.max(2, Math.ceil(60 / 1.3)) + 1;
    expect(vertexCount(m)).toBe(rows * 15);
    assertConsistent(m, "main strip");
    // 14 surface/skirt quads (6 indices each) plus the closing underside face per row gap.
    expect(m.indices.length).toBe((rows - 1) * (14 * 6 + 6));
  });

  it("surface normals point up the track frame, never into the ground", () => {
    for (const s of [40, 400, 900]) {
      const m = trackStrip(s, s + 10, "main");
      const f = mainFrame(s + 5);
      const centre = 5 * 15 + 7;
      const ny = [m.normals[centre * 3]!, m.normals[centre * 3 + 1]!, m.normals[centre * 3 + 2]!];
      expect(ny[0]! * f.up.x + ny[1]! * f.up.y + ny[2]! * f.up.z).toBeGreaterThan(0.9);
    }
  });

  it("the whole course is one consistent mesh well inside 32-bit indexing, with pigments per vertex", () => {
    const { track, rails } = buildCourse();
    assertConsistent(track, "track");
    assertConsistent(rails, "rails");
    expect(vertexCount(track)).toBeGreaterThan(20_000);
    expect(vertexCount(track)).toBeLessThan(200_000);
    const low = buildCourse(2.1);
    expect(vertexCount(low.track)).toBeLessThan(vertexCount(track));
  });

  it("pigments follow the palette and warm stretches keep the original paint", () => {
    const m = trackStrip(100, 110, "main");
    const [base] = pigmentsAt(100);
    expect(m.pigmentBase[0]).toBeCloseTo(base[0], 9);
    expect(m.paintOriginal[0]).toBe(paintOriginalAt(100));
    const violet = trackStrip(400, 410, "main");
    expect(violet.paintOriginal[0]).toBe(0);
  });

  it("rails are thin ribbons that follow the strip edge", () => {
    const m = railStrip(0, 30, "main", 11.5, 1);
    assertConsistent(m, "rail");
    const lateral = m.positions.filter((_, i) => i % 3 === 0);
    expect(lateral.length).toBeGreaterThan(4);
  });

  it("island slabs are closed solids: top, both skirts and both caps for all six tiles", () => {
    const m = buildIslands();
    assertConsistent(m, "islands");
    expect(ISLAND_TILES).toHaveLength(6);
    expect(vertexCount(m)).toBeGreaterThan(6 * 14 * 13);
    const ys = m.positions.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(5);
  });

  it("ramps: one wedge per ramp for the vehicle (3 bike, 7 skate), 132 vertices each", () => {
    for (const [vehicle, count] of [["bike", 3], ["skate", 7]] as const) {
      const m = buildRamps(vehicle);
      assertConsistent(m, `ramps ${vehicle}`);
      expect(rampsFor(vehicle)).toHaveLength(count);
      expect(vertexCount(m)).toBe(count * 33 * 4);
    }
  });

  it("skate loops are two-lane ribbons of 181 rows each that rise above the road", () => {
    const m = buildLoops(SKATE_LOOPS);
    assertConsistent(m, "loops");
    expect(vertexCount(m)).toBe(SKATE_LOOPS.length * 181 * 2);
    const first = SKATE_LOOPS[0]!;
    const f = mainFrame(first.s);
    let maxHeight = 0;
    for (let i = 0; i < 181 * 2; i++) {
      const dy = (m.positions[i * 3]! - f.p.x) * f.up.x + (m.positions[i * 3 + 1]! - f.p.y) * f.up.y + (m.positions[i * 3 + 2]! - f.p.z) * f.up.z;
      maxHeight = Math.max(maxHeight, dy);
    }
    expect(maxHeight).toBeGreaterThan(first.radius * 1.8);
  });

  it("a gate veil is a vertical 23 x 13 m quad facing along the track", () => {
    const m = veilQuad(305);
    expect(vertexCount(m)).toBe(4);
    const f = mainFrame(305);
    const p = (k: number) => [m.positions[k * 3]!, m.positions[k * 3 + 1]!, m.positions[k * 3 + 2]!];
    const width = Math.hypot(p(1)[0]! - p(0)[0]!, p(1)[1]! - p(0)[1]!, p(1)[2]! - p(0)[2]!);
    const height = Math.hypot(p(3)[0]! - p(0)[0]!, p(3)[1]! - p(0)[1]!, p(3)[2]! - p(0)[2]!);
    expect(width).toBeCloseTo(23, 6);
    expect(height).toBeCloseTo(13, 6);
    expect(m.normals[0]).toBeCloseTo(f.tangent.x, 9);
    expect(m.uvs).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it("computeNormals gives unit, area-weighted smooth normals", () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const n = computeNormals(positions, [0, 1, 2]);
    expect(n).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(SPLIT.end - SPLIT.start).toBe(125);
    expect(OPAL.end - OPAL.start).toBe(170);
  });
});
