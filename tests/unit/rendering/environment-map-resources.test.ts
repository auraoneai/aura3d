import { describe, expect, it } from "vitest";
import { generateApproximateBrdfLutPixels, generateRgba8EnvironmentMipLevels } from "../../../packages/rendering/src";

describe("environment map resource helpers", () => {
  it("generates deterministic RGBA8 environment mip levels from source pixels", () => {
    const data = new Uint8Array([
      0, 20, 40, 255, 40, 60, 80, 255, 80, 100, 120, 255, 120, 140, 160, 255,
      10, 30, 50, 255, 50, 70, 90, 255, 90, 110, 130, 255, 130, 150, 170, 255,
      20, 40, 60, 255, 60, 80, 100, 255, 100, 120, 140, 255, 140, 160, 180, 255,
      30, 50, 70, 255, 70, 90, 110, 255, 110, 130, 150, 255, 150, 170, 190, 255
    ]);

    const levels = generateRgba8EnvironmentMipLevels({ width: 4, height: 4, data }, { levels: 3, blurRadius: 1 });

    expect(levels.map((level) => [level.width, level.height])).toEqual([[4, 4], [2, 2], [1, 1]]);
    expect(levels[0]?.data).not.toBe(data);
    expect(Array.from(levels[1]!.data.slice(0, 4))).toEqual([57, 77, 97, 255]);
    expect(Array.from(levels[2]!.data.slice(0, 4))).toEqual([74, 94, 114, 255]);
  });

  it("validates environment mip source and generation options", () => {
    expect(() => generateRgba8EnvironmentMipLevels({ width: 0, height: 1, data: new Uint8Array(4) })).toThrow(/dimensions/);
    expect(() => generateRgba8EnvironmentMipLevels({ width: 1, height: 1, data: new Uint8Array(3) })).toThrow(/RGBA8/);
    expect(() => generateRgba8EnvironmentMipLevels({ width: 1, height: 1, data: new Uint8Array(4) }, { levels: 0 })).toThrow(/levels/);
    expect(() => generateRgba8EnvironmentMipLevels({ width: 1, height: 1, data: new Uint8Array(4) }, { blurRadius: -1 })).toThrow(/blurRadius/);
  });

  it("generates a bounded approximate BRDF LUT with roughness and view dependence", () => {
    const lut = generateApproximateBrdfLutPixels({ width: 4, height: 4 });

    expect(lut.width).toBe(4);
    expect(lut.height).toBe(4);
    expect(lut.data.byteLength).toBe(4 * 4 * 4);
    expect(lut.data[0]).toBeGreaterThan(lut.data[(3 * 4 + 0) * 4]!);
    expect(lut.data[(0 * 4 + 3) * 4]).toBeGreaterThan(lut.data[(3 * 4 + 3) * 4]!);
    expect(lut.data[3]).toBe(255);
  });
});
