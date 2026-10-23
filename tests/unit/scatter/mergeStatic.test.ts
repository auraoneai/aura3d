import { describe, expect, it } from "vitest";
import { geometry, mergeStatic, mergeStaticByKey, type AuraCustomGeometrySpec } from "../../../packages/engine/src/index.js";

const triangle: AuraCustomGeometrySpec = {
  kind: "aura-custom-geometry",
  positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
  normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
  uvs: [[0, 0], [1, 0], [0, 1]],
  indices: [0, 1, 2]
};
const flat = (v: unknown): number[] => Array.from(v as ArrayLike<number>);

describe("mergeStatic", () => {
  it("returns undefined for an empty part list", () => {
    expect(mergeStatic([])).toBeUndefined();
    expect(mergeStaticByKey([]).size).toBe(0);
  });

  it("bakes position, scale and yaw into one geometry (one draw per material)", () => {
    const merged = mergeStatic([
      { geometry: triangle, position: [10, 0, 0] },
      { geometry: triangle, position: [0, 5, 0], scale: 2 },
      { geometry: triangle, rotation: [0, Math.PI / 2, 0] }
    ])!;
    const pos = flat(merged.positions);
    expect(pos.length).toBe(27);
    expect(pos.slice(0, 3)).toEqual([10, 0, 0]);
    expect(pos.slice(3, 6)).toEqual([11, 0, 0]);
    expect(pos.slice(9, 12)).toEqual([0, 5, 0]);
    expect(pos.slice(12, 15)).toEqual([2, 5, 0]);
    // +90 degrees about Y maps +X to -Z (R = Rz*Ry*Rx), matching instance transforms.
    expect(pos[21]).toBeCloseTo(0, 6);
    expect(pos[23]).toBeCloseTo(-1, 6);
    expect(flat(merged.indices)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("matches the position an instance transform would produce", () => {
    const rotation: [number, number, number] = [0.3, 0.8, -0.4];
    const merged = mergeStatic([{ geometry: triangle, position: [1, 2, 3], rotation, scale: [2, 1, 3] }])!;
    const [x, y, z] = [1 * 2, 0, 0];
    const cx = Math.cos(rotation[0]), sx = Math.sin(rotation[0]), cy = Math.cos(rotation[1]), sy = Math.sin(rotation[1]), cz = Math.cos(rotation[2]), sz = Math.sin(rotation[2]);
    const expected = [
      cy * cz * x - cy * sz * y + sy * z + 1,
      (cz * sx * sy + cx * sz) * x + (cx * cz - sx * sy * sz) * y - cy * sx * z + 2,
      (sx * sz - cx * cz * sy) * x + (cx * sy * sz + cz * sx) * y + cx * cy * z + 3
    ];
    const pos = flat(merged.positions);
    expect(pos[3]).toBeCloseTo(expected[0]!, 6);
    expect(pos[4]).toBeCloseTo(expected[1]!, 6);
    expect(pos[5]).toBeCloseTo(expected[2]!, 6);
  });

  it("keeps normals unit length under non-uniform scale and rotation", () => {
    const merged = mergeStatic([{ geometry: triangle, rotation: [0, 1, 0], scale: [3, 1, 0.5] }])!;
    const n = flat(merged.normals);
    for (let i = 0; i < 3; i += 1) expect(Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!)).toBeCloseTo(1, 6);
  });

  it("flips winding under a mirrored scale so faces stay front-facing", () => {
    const merged = mergeStatic([{ geometry: triangle, scale: [-1, 1, 1] }])!;
    expect(flat(merged.indices)).toEqual([0, 2, 1]);
  });

  it("tints with multiply or replace and fills white where other parts have colours", () => {
    const withColors: AuraCustomGeometrySpec = { ...triangle, colors: new Float32Array([0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1]) };
    const multiplied = mergeStatic([{ geometry: withColors, color: [1, 0, 0, 1] }, { geometry: triangle }])!;
    const c = flat(multiplied.colors);
    expect(c.slice(0, 4)).toEqual([0.5, 0, 0, 1]);
    expect(c.slice(12, 16)).toEqual([1, 1, 1, 1]);
    const replaced = mergeStatic([{ geometry: withColors, color: [0, 1, 0, 1] }], { colorMode: "replace" })!;
    expect(flat(replaced.colors).slice(0, 4)).toEqual([0, 1, 0, 1]);
  });

  it("rejects a zero or non-finite scale", () => {
    expect(() => mergeStatic([{ geometry: triangle, scale: 0 }])).toThrow(/scale/);
    expect(() => mergeStatic([{ geometry: triangle, scale: [1, Number.NaN, 1] }])).toThrow(/scale/);
  });

  it("groups by key, one merged geometry per material", () => {
    const groups = mergeStaticByKey([
      { key: "stone", geometry: triangle },
      { key: "wood", geometry: triangle, position: [1, 0, 0] },
      { key: "stone", geometry: triangle, position: [2, 0, 0] }
    ]);
    expect([...groups.keys()].sort()).toEqual(["stone", "wood"]);
    expect(flat(groups.get("stone")!.positions)).toHaveLength(18);
    expect(flat(groups.get("wood")!.positions)).toHaveLength(9);
  });

  it("produces a spec geometry.define accepts", () => {
    const merged = mergeStatic([{ geometry: triangle }, { geometry: triangle, position: [2, 0, 0] }])!;
    expect(() => geometry.define(merged)).not.toThrow();
  });
});
