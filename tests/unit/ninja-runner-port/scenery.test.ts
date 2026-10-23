import { describe, expect, it } from "vitest";
import { LAYERS, buildScenery, shade } from "../../../examples/ninja-runner-port/scenery";
import { trs, unitBox, unitCone, unitCylinder, unitDisc, unitGable, unitHip, unitRock, unitSphere, type Shape } from "../../../examples/ninja-runner-port/shapes";
import { surfaceY } from "../../../examples/ninja-runner-port/meshes";
import { COURSE_LENGTH, GAPS, biomeAt, groundFrame, pathWidth } from "../../../examples/ninja-runner-port/course";

const shapeOk = (s: Shape, closedSolid = true): void => {
  const v = s.positions.length / 3;
  expect(v).toBeGreaterThan(2);
  expect(s.normals.length).toBe(s.positions.length);
  expect(s.uvs.length / 2).toBe(v);
  expect(s.indices.length % 3).toBe(0);
  expect(Math.max(...s.indices)).toBeLessThan(v);
  expect(s.positions.every(Number.isFinite)).toBe(true);
  for (let i = 0; i < s.normals.length; i += 3) expect(Math.hypot(s.normals[i]!, s.normals[i + 1]!, s.normals[i + 2]!)).toBeCloseTo(1, 4);
  if (!closedSolid) return;
  // every triangle's winding agrees with its stored normal (outward, counter-clockwise)
  for (let t = 0; t < s.indices.length; t += 3) {
    const [a, b, c] = [s.indices[t]!, s.indices[t + 1]!, s.indices[t + 2]!];
    const p = (i: number): [number, number, number] => [s.positions[i * 3]!, s.positions[i * 3 + 1]!, s.positions[i * 3 + 2]!];
    const pa = p(a), pb = p(b), pc = p(c);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (len < 1e-9) continue;
    const stored = [s.normals[a * 3]! + s.normals[b * 3]! + s.normals[c * 3]!, s.normals[a * 3 + 1]! + s.normals[b * 3 + 1]! + s.normals[c * 3 + 1]!, s.normals[a * 3 + 2]! + s.normals[b * 3 + 2]! + s.normals[c * 3 + 2]!];
    expect(n[0]! * stored[0]! + n[1]! * stored[1]! + n[2]! * stored[2]!).toBeGreaterThan(0);
  }
};

describe("ninja-runner-port shapes", () => {
  it("every unit shape is finite, indexed and wound to match its normals", () => {
    for (const s of [unitBox(), unitGable(), unitHip(), unitCylinder(), unitCone(), unitSphere(), unitRock(7), unitDisc()]) shapeOk(s);
  });

  it("trs is a column-major non-uniform scale, yaw about +Y and translation", () => {
    const m = trs(1, 2, 3, Math.PI / 2, 2, 3, 4);
    expect(m.length).toBe(16);
    expect(m[12]).toBe(1); expect(m[13]).toBe(2); expect(m[14]).toBe(3);
    expect(m[5]).toBe(3);
    expect(m[0]).toBeCloseTo(0, 9); expect(m[2]).toBeCloseTo(-2, 9);
    expect(m[8]).toBeCloseTo(4, 9); expect(m[10]).toBeCloseTo(0, 9);
  });
});

describe("ninja-runner-port scenery", () => {
  const layers = buildScenery();
  const ids = new Set(LAYERS.map((l) => l.id));

  it("is deterministic and only uses declared layers", () => {
    const again = buildScenery();
    expect(again.map((l) => [l.id, l.placements.length])).toEqual(layers.map((l) => [l.id, l.placements.length]));
    expect(again[0]!.placements[0]).toEqual(layers[0]!.placements[0]);
    for (const l of layers) expect(ids.has(l.id)).toBe(true);
  });

  it("builds a dense world of finite matrices and valid colours", () => {
    const total = layers.reduce((n, l) => n + l.placements.length, 0);
    expect(total).toBeGreaterThan(8000);
    expect(total).toBeLessThan(60000);
    for (const l of layers) for (const p of l.placements) {
      expect(p.matrix.length).toBe(16);
      expect(p.matrix.every(Number.isFinite)).toBe(true);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("has houses, roofs, lanterns, trees and rocks in the right biomes", () => {
    const by = (id: string) => layers.find((l) => l.id === id)!.placements;
    for (const id of ["walls", "trim", "roofs", "lanterns", "trunks", "cones", "crowns", "rocks", "hills", "slabs"]) expect(by(id).length, id).toBeGreaterThan(20);
    const forestCones = by("cones").filter((p) => p.matrix[13]! > -50).length;
    expect(forestCones).toBeGreaterThan(100);
  });

  it("keeps scenery off the path and out of the jump gaps", () => {
    const walls = layers.find((l) => l.id === "walls")!.placements;
    for (const [g0, g1] of GAPS) {
      const mid = groundFrame((g0 + g1) / 2, 0);
      const inGap = walls.filter((p) => Math.hypot(p.matrix[12]! - mid.x, p.matrix[14]! - mid.z) < pathWidth(g0) / 2 - 0.5 && p.matrix[13]! > mid.y - 0.5);
      expect(inGap.length, `gap ${g0}`).toBe(0);
    }
  });

  it("surfaceY puts the village houses on the ground, not floating or buried", () => {
    const f = groundFrame(100, pathWidth(100) / 2 + 6);
    expect(Math.abs(surfaceY(100, pathWidth(100) / 2 + 6) - f.y)).toBeLessThan(2);
    expect(biomeAt(100)).toBe("village");
    expect(COURSE_LENGTH).toBe(2640);
  });

  it("shade scales sRGB brightness and clamps", () => {
    expect(shade("#808080", 1)).toBe("#808080");
    expect(shade("#808080", 2)).toBe("#ffffff");
    expect(shade("#ffffff", 0)).toBe("#000000");
  });
});
