import { describe, expect, it } from "vitest";
import { spritePoolGeometry, spritePoolHandle } from "../../../examples/kid-goku-beyond-the-clouds-port/sprites.js";

type Geo = { topology?: string; positions: ArrayLike<number>; uvs?: ArrayLike<number>; indices?: ArrayLike<number>; attributes: Record<string, { itemSize: number; data: ArrayLike<number> }> };

describe("Cumulus Dash sprite pools (points by default, quads on a requested WebGPU backend)", () => {
  it("the default pool is the unchanged points geometry: one vertex per sprite, no uvs", () => {
    const geo = spritePoolGeometry(3, false) as unknown as Geo;
    expect(geo.topology).toBe("points");
    expect(geo.positions.length).toBe(9);
    expect(geo.uvs).toBeUndefined();
    expect(geo.attributes.tone!.data.length).toBe(9);
    expect(geo.attributes.aSize!.data.length).toBe(3);
    expect(geo.attributes.aAlpha!.data.length).toBe(3);
  });

  it("the quad pool has four corners and two triangles per sprite, with corner uvs", () => {
    const geo = spritePoolGeometry(3, true) as unknown as Geo;
    expect(geo.topology).toBeUndefined();
    expect(geo.positions.length).toBe(3 * 4 * 3);
    expect(Array.from(geo.uvs!).slice(0, 8)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(Array.from(geo.indices!).slice(6, 12)).toEqual([4, 5, 6, 4, 6, 7]);
    expect(geo.attributes.tone!.data.length).toBe(3 * 4 * 3);
    expect(geo.attributes.aSize!.data.length).toBe(12);
    expect(geo.attributes.aAlpha!.data.length).toBe(12);
  });

  it("point updates pass through untouched on points and land on every corner on quads", () => {
    const writes: { name: string; array: number[]; offset: number }[] = [];
    const node = { updateAttribute: (name: string, u: { array: Float32Array; offset: number }) => void writes.push({ name, array: Array.from(u.array), offset: u.offset }) };
    const pos = new Float32Array([1, 2, 3, 4, 5, 6]);
    expect(spritePoolHandle(node, false)).toBe(node);
    spritePoolHandle(node, true).updateAttribute!("position", { array: pos, offset: 0 });
    spritePoolHandle(node, true).updateAttribute!("aSize", { array: new Float32Array([7, 8]), offset: 0 });
    expect(writes[0]).toEqual({ name: "position", array: [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 4, 5, 6, 4, 5, 6, 4, 5, 6, 4, 5, 6], offset: 0 });
    expect(writes[1]).toEqual({ name: "aSize", array: [7, 7, 7, 7, 8, 8, 8, 8], offset: 0 });
  });
});
