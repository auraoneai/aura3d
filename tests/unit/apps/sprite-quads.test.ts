import { describe, expect, it } from "vitest";
import { quadGeometryInput, quadUpdater } from "../../../examples/shared/sprite-quads.js";

describe("shared sprite quads (Craterline GP, Lamplight Line lab-backend sprites)", () => {
  it("expands each point into four corners with corner uvs, two triangles and per-corner attributes", () => {
    const positions = Float32Array.from([1, 2, 3, 4, 5, 6]);
    const q = quadGeometryInput(positions, {
      size: { itemSize: 1, data: Float32Array.from([3, 9]) },
      tint: { itemSize: 3, data: Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) }
    });
    expect(Array.from(q.positions)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 4, 5, 6, 4, 5, 6, 4, 5, 6, 4, 5, 6]);
    // The quad shaders map uv to the corner as uv * 2 - 1, so the four corners must span [0, 1] on both axes.
    expect(Array.from(q.uvs)).toEqual([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
    expect(Array.from(q.indices)).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(Array.from(q.attributes.size!.data)).toEqual([3, 3, 3, 3, 9, 9, 9, 9]);
    expect(q.attributes.tint!.itemSize).toBe(3);
    // last corner of point 0, then first corner of point 1
    expect(Array.from(q.attributes.tint!.data.slice(9, 15))).toEqual(Array.from(Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])));
    expect("topology" in q).toBe(false);
  });

  it("routes runtime point writes to the quad corners", () => {
    const writes: { name: string; array: number[]; offset: number }[] = [];
    const handle = { updateAttribute: (name: string, u: { array: Float32Array; offset: number }) => writes.push({ name, array: Array.from(u.array), offset: u.offset }) };
    const quads = quadUpdater(handle, { position: 3, fade: 1 });
    quads.updateAttribute?.("fade", { array: Float32Array.from([0.5, 1]), offset: 0 });
    quads.updateAttribute?.("position", { array: Float32Array.from([7, 8, 9]), offset: 0 });
    expect(writes).toEqual([
      { name: "fade", array: [0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1], offset: 0 },
      { name: "position", array: [7, 8, 9, 7, 8, 9, 7, 8, 9, 7, 8, 9], offset: 0 }
    ]);
  });
});
