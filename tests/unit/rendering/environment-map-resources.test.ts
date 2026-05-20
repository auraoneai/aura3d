import { describe, expect, it } from "vitest";
import {
  createEnvironmentMapResourceSet,
  decodeRgba8EnvironmentToLinear,
  decodeRgbeEnvironmentMap,
  encodeLinearHdrEnvironmentToRgba8,
  generateApproximateBrdfLutPixels,
  generateDiffuseIrradianceRgba8,
  generateRgba8EnvironmentMipLevels,
  generateRgba16fDiffuseIrradianceMipLevel,
  generateRgba16fEnvironmentMipLevels,
  generateRgba16fSpecularPrefilterMipLevels,
  generateSpecularPrefilterMipLevels,
  linearChannelToSrgb,
  srgbChannelToLinear
} from "../../../packages/rendering/src";

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
    const grazingSmoothBias = lut.data[(0 * 4 + 0) * 4 + 1]!;
    const facingSmoothBias = lut.data[(0 * 4 + 3) * 4 + 1]!;
    const midSmoothScale = lut.data[(0 * 4 + 2) * 4]!;
    const midRoughScale = lut.data[(3 * 4 + 2) * 4]!;

    expect(lut.width).toBe(4);
    expect(lut.height).toBe(4);
    expect(lut.data.byteLength).toBe(4 * 4 * 4);
    expect(midSmoothScale).toBeGreaterThan(0);
    expect(grazingSmoothBias).toBeGreaterThan(facingSmoothBias);
    expect(midSmoothScale).not.toBe(midRoughScale);
    expect(lut.data[3]).toBe(255);
  });

  it("converts between sRGB and linear channels with deterministic endpoints", () => {
    expect(srgbChannelToLinear(0)).toBe(0);
    expect(linearChannelToSrgb(0)).toBe(0);
    expect(srgbChannelToLinear(1)).toBe(1);
    expect(linearChannelToSrgb(1)).toBeCloseTo(1, 12);
    expect(srgbChannelToLinear(0.5)).toBeCloseTo(0.214, 3);
    expect(linearChannelToSrgb(0.21404114048223255)).toBeCloseTo(0.5, 6);
  });

  it("decodes RGBE HDR pixels to linear floats and tone maps them to RGBA8", () => {
    const rgbe = new Uint8Array([
      128, 64, 32, 129,
      64, 64, 64, 128
    ]);

    const decoded = decodeRgbeEnvironmentMap({ width: 2, height: 1, data: rgbe });
    expect(Array.from(decoded.data.slice(0, 4))).toEqual([1, 0.5, 0.25, 1]);
    expect(Array.from(decoded.data.slice(4, 8))).toEqual([0.25, 0.25, 0.25, 1]);

    const encoded = encodeLinearHdrEnvironmentToRgba8(decoded, { toneMapping: "reinhard", outputColorSpace: "srgb" });
    expect(encoded.width).toBe(2);
    expect(encoded.height).toBe(1);
    expect(Array.from(encoded.data.slice(0, 4))).toEqual([188, 156, 124, 255]);
    expect(encoded.data[0]).toBeGreaterThan(encoded.data[4]!);
  });

  it("decodes RGBA8 sRGB environment pixels into linear values", () => {
    const decoded = decodeRgba8EnvironmentToLinear({
      width: 1,
      height: 1,
      data: new Uint8Array([128, 64, 255, 128])
    }, "srgb");

    expect(decoded.data[0]).toBeCloseTo(0.216, 3);
    expect(decoded.data[1]).toBeCloseTo(0.051, 3);
    expect(decoded.data[2]).toBe(1);
    expect(decoded.data[3]).toBeCloseTo(0.502, 3);
  });

  it("generates diffuse irradiance and roughness-ordered specular prefilter resources", () => {
    const data = new Uint8Array(4 * 4 * 4);
    data.fill(0);
    data[(1 * 4 + 1) * 4] = 255;
    data[(1 * 4 + 1) * 4 + 1] = 128;
    data[(1 * 4 + 1) * 4 + 2] = 64;
    for (let index = 3; index < data.length; index += 4) {
      data[index] = 255;
    }
    const source = { width: 4, height: 4, data };

    const irradiance = generateDiffuseIrradianceRgba8(source, { width: 2, height: 2, blurRadius: 2 });
    const specular = generateSpecularPrefilterMipLevels(source, { levels: 3, blurRadius: 2 });

    expect(irradiance.width).toBe(2);
    expect(irradiance.height).toBe(2);
    expect(irradiance.data[0]).toBeGreaterThan(0);
    expect(irradiance.data[0]).toBeLessThan(255);
    expect(specular.map((level) => [level.width, level.height])).toEqual([[4, 4], [2, 2], [1, 1]]);
    expect(specular[1]!.data[0]).toBeLessThan(255);
	  expect(specular[2]!.data[0]).toBeGreaterThan(0);
  });

  it("generates GGX-convolved RGBA16F specular environment mips instead of box-blurred HDR mips", () => {
    const data = new Float32Array(8 * 4 * 4);
    for (let pixel = 0; pixel < 8 * 4; pixel += 1) {
      const offset = pixel * 4;
      data[offset] = 0.03;
      data[offset + 1] = 0.025;
      data[offset + 2] = 0.02;
      data[offset + 3] = 1;
    }
    const hotSpot = (2 * 8 + 4) * 4;
    data[hotSpot] = 32;
    data[hotSpot + 1] = 16;
    data[hotSpot + 2] = 8;

    const source = { width: 8, height: 4, data };
    const ggx = generateRgba16fSpecularPrefilterMipLevels(source, { levels: 4, sampleCount: 32 });
    const box = generateRgba16fEnvironmentMipLevels(source, { levels: 4, blurRadius: 2 });
    const ggxLevel1 = expectUint16Array(ggx[1]!.data);
    const boxLevel1 = expectUint16Array(box[1]!.data);

    expect(ggx.map((level) => [level.width, level.height])).toEqual([[8, 4], [4, 2], [2, 1], [1, 1]]);
    expect(ggxLevel1).toBeInstanceOf(Uint16Array);
    expect(Array.from(ggxLevel1.slice(0, 24))).not.toEqual(Array.from(boxLevel1.slice(0, 24)));
    expect(maxHalfFloatChannel(ggxLevel1, 0)).toBeGreaterThan(maxHalfFloatChannel(boxLevel1, 0));
    expect(maxHalfFloatChannel(ggxLevel1, 0)).toBeLessThan(32);
    expect(() => generateRgba16fSpecularPrefilterMipLevels(source, { sampleCount: 0 })).toThrow(/sampleCount/);
  });

  it("generates cosine-weighted RGBA16F diffuse irradiance for the terminal environment LOD", () => {
    const data = new Float32Array(8 * 4 * 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const offset = (y * 8 + x) * 4;
        const top = y < 2;
        data[offset] = top ? 8 : 0.25;
        data[offset + 1] = top ? 6 : 0.2;
        data[offset + 2] = top ? 4 : 0.15;
        data[offset + 3] = 1;
      }
    }
    const source = { width: 8, height: 4, data };

    const irradiance = generateRgba16fDiffuseIrradianceMipLevel(source, { width: 4, height: 2, sampleCount: 64 });
    const chain = generateRgba16fSpecularPrefilterMipLevels(source, { levels: 2, sampleCount: 32 });
    const topIrradiance = halfFloatToNumber(expectUint16Array(irradiance.data)[0]!);
    const bottomIrradiance = halfFloatToNumber(expectUint16Array(irradiance.data)[(1 * 4 + 0) * 4]!);
    const terminal = expectUint16Array(chain[chain.length - 1]!.data);

    expect(irradiance.width).toBe(4);
    expect(irradiance.height).toBe(2);
    expect(topIrradiance).toBeGreaterThan(bottomIrradiance);
    expect(topIrradiance).toBeLessThan(8);
    expect(Array.from(terminal.slice(0, 16))).toEqual(Array.from(expectUint16Array(irradiance.data).slice(0, 16)));
    expect(() => generateRgba16fDiffuseIrradianceMipLevel(source, { sampleCount: 0 })).toThrow(/sampleCount/);
  });

  it("bundles environment base, irradiance, specular mips, BRDF LUT, and diagnostics", () => {
    const resources = createEnvironmentMapResourceSet({
      width: 2,
      height: 1,
      encoding: "rgbe",
      data: new Uint8Array([
        128, 64, 32, 130,
        64, 64, 64, 128
      ])
    }, {
      specularLevels: 2,
      irradianceWidth: 2,
      irradianceHeight: 1,
      brdfLutSize: 8
    });

    expect(resources.base.width).toBe(2);
    expect(resources.diffuseIrradiance.width).toBe(2);
    expect(resources.specularMipLevels).toHaveLength(2);
    expect(resources.brdfLut.width).toBe(8);
    expect(resources.brdfLut.height).toBe(8);
    expect(resources.diagnostics).toEqual({
      inputEncoding: "rgbe",
      textureEncoding: "rgba8-srgb",
      outputColorSpace: "srgb",
      hdrSource: true,
      maxLinearValue: 2,
      specularMipCount: 2,
      diffuseIrradianceSize: [2, 1],
      brdfLutSize: [8, 8]
    });
  });
});

function expectUint16Array(data: unknown): Uint16Array {
  expect(data).toBeInstanceOf(Uint16Array);
  return data as Uint16Array;
}

function maxHalfFloatChannel(data: Uint16Array, channel: number): number {
  let max = 0;
  for (let offset = channel; offset < data.length; offset += 4) {
    max = Math.max(max, halfFloatToNumber(data[offset]!));
  }
  return max;
}

function halfFloatToNumber(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}
