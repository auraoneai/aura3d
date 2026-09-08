import { describe, expect, test } from "vitest";
import { createExtensionScalarAtlas, EXTENSION_SCALAR_ATLAS_SLOTS } from "../../../packages/rendering/src/ExtensionScalarAtlas";

describe("extension scalar atlas", () => {
  test("preserves independent NPOT dimensions, all channels, and isolated mip strips", () => {
    const data = new Uint8Array(3 * 5 * 4);
    for (let pixel = 0; pixel < 15; pixel++) data.set([pixel, pixel + 32, pixel + 64, pixel + 128], pixel * 4);
    const atlas = createExtensionScalarAtlas({ clearcoat: { width: 3, height: 5, data }, sheenRoughness: { width: 1, height: 1, data: new Uint8Array([6, 7, 8, 9]) } });
    expect(atlas.clearcoat).toEqual([0, 3, 5, 2]);
    expect(atlas.sheenRoughness).toEqual([4, 1, 1, 0]);
    const pixels = atlas.texture.data as Uint8Array;
    for (let y = 0; y < 5; y++) expect(pixels.slice(y * atlas.texture.width * 4, y * atlas.texture.width * 4 + 12)).toEqual(data.slice(y * 12, y * 12 + 12));
    expect(pixels.slice(4 * 4, 5 * 4)).toEqual(new Uint8Array([6, 7, 8, 9]));
    // Final 1x1 includes the odd last source row and column.
    expect(pixels.slice(7 * atlas.texture.width * 4, 7 * atlas.texture.width * 4 + 4)).toEqual(new Uint8Array([7, 39, 71, 135]));
    expect(atlas.texture.mipLevels).toEqual([]); // manual per-map mip addressing, never whole-atlas mipmaps
  });
  test("five independent maps wrap onto multiple shelves within the device texture limit", () => {
    const inputs = Object.fromEntries(EXTENSION_SCALAR_ATLAS_SLOTS.map((slot, index) => [slot, { width: 4, height: 4, data: new Uint8Array(64).fill(index + 10) }]));
    const atlas = createExtensionScalarAtlas(inputs, 16);
    expect([atlas.texture.width, atlas.texture.height]).toEqual([16, 14]);
    expect(atlas.originsY?.iridescenceThickness).toBe(7);
    expect((atlas.texture.data as Uint8Array)[7 * 16 * 4]).toBe(14);
    expect(() => createExtensionScalarAtlas(inputs, 8)).toThrow(/cannot fit/);
  });
  test("missing maps use neutral white and malformed dimensions fail before allocation", () => {
    const atlas = createExtensionScalarAtlas({});
    expect(atlas.texture.width).toBe(5);
    expect(atlas.texture.height).toBe(1);
    expect([...atlas.texture.data!]).toEqual(Array(20).fill(255));
    expect(() => createExtensionScalarAtlas({ clearcoat: { width: 3, height: 1, data: new Uint8Array(4) } })).toThrow(/Invalid/);
  });
});
