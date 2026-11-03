import { describe, expect, it } from "vitest";
import { NativeLightmapBake, verifyNativeBakedLightmap, type NativeBakeLight } from "../../../packages/rendering/src/lighting/NativeLightBaking";
import { Texture } from "../../../packages/rendering/src/Texture";

function bake(lights: readonly NativeBakeLight[], indirect?: () => readonly [number, number, number]) {
  const task = new NativeLightmapBake({
    atlas: { width: 2, height: 2, uvChannel: 1, gutter: 0, texelDensity: 2,
      charts: [{ x: 0, y: 0, width: 2, height: 2, triangles: [0] }] },
    mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] },
    lights, ...(indirect ? { indirect } : {})
  });
  while (task.status !== "complete") task.step(16);
  return task;
}

describe("native baked lightmap provenance", () => {
  it("records the actual bake inputs, including ambient and zero-intensity lights", () => {
    const direct = bake([{ type: "ambient", color: [1, 0, 0], intensity: 0 }], () => [0, 1, 0]);
    const output = direct.createRenderData();
    expect(direct.result().provenance).toEqual({ hasAuthoredLights: true, hasIndirectSampler: true });
    expect(output.provenance).toEqual(direct.result().provenance);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.provenance)).toBe(true);
    expect(verifyNativeBakedLightmap(output)).toEqual({ hasAuthoredLights: true, hasIndirectSampler: true });
    output.texture.dispose();
    expect(verifyNativeBakedLightmap(output)).toBeNull();
  });

  it("certifies an indirect callback as an input without claiming to inspect its meaning", () => {
    const indirect = bake([], () => [0.25, 0.5, 0.75]);
    const first = indirect.createRenderData();
    const second = indirect.createRenderData();
    expect(verifyNativeBakedLightmap(first)).toEqual({ hasAuthoredLights: false, hasIndirectSampler: true });
    expect(verifyNativeBakedLightmap(second)).toEqual(first.provenance);
    expect(first.texture).not.toBe(second.texture);
    expect(verifyNativeBakedLightmap({ ...first, uvChannel: 0 })).toBeNull();

    // The original array is exposed by Texture; modifying it without changing
    // the public revision must still invalidate this output's certificate.
    const pixels = first.texture.getMipLevel(0)!.data as Float32Array;
    pixels[0] += 1;
    expect(first.texture.revision).toBe(0);
    expect(verifyNativeBakedLightmap(first)).toBeNull();
    expect(verifyNativeBakedLightmap(second)).toEqual(second.provenance);
    first.texture.dispose();
    second.texture.dispose();
  });

  it("rejects an updated texture and an unrelated texture with copied metadata", () => {
    const output = bake([], () => [1, 1, 1]).createRenderData();
    const data = output.texture.getMipLevel(0)!.data as Float32Array;
    output.texture.updateMip(0, data);
    expect(verifyNativeBakedLightmap(output)).toBeNull();
    const other = new Texture({ width: 2, height: 2, format: "rgba32f", data: new Float32Array(16), generateMipmaps: false });
    expect(verifyNativeBakedLightmap({ ...output, texture: other })).toBeNull();
    output.texture.dispose();
    other.dispose();
  });
});
