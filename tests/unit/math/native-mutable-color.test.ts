import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Color, ColorManagement, COLOR_KEYWORDS, LinearSRGBColorSpace, LinearToSRGB,
  LinearTransfer, NoColorSpace, SRGBColorSpace, SRGBToLinear, SRGBTransfer
} from "../../../packages/math/src/independent/mutable/Color";
import { Matrix3 } from "../../../packages/math/src/independent/mutable/Matrix3";

function expectRGB(color: { r: number; g: number; b: number }, expected: readonly number[], digits = 12) {
  expect(color.r).toBeCloseTo(expected[0], digits);
  expect(color.g).toBeCloseTo(expected[1], digits);
  expect(color.b).toBeCloseTo(expected[2], digits);
}

afterEach(() => {
  ColorManagement.enabled = true;
  ColorManagement.workingColorSpace = LinearSRGBColorSpace;
  delete ColorManagement.spaces["test-xyz"];
  delete ColorManagement.spaces["test-red-blue-swap"];
  delete ColorManagement.spaces["test-unsupported"];
});

describe("independent mutable color", () => {
  it("uses the CSS sRGB transfer on both sides of its thresholds and for extended values", () => {
    // unified 4.x contract: the CSS Color 4 §10.2 functions with decimal constants (within 1e-5 of the exact ones on [0, 1]),
    // strict `<` breakpoints, and no sign reflection: negative channels stay on the linear segment.
    expect(SRGBToLinear(0.04045)).toBeCloseTo(0.0031308072813303342, 15);
    expect(SRGBToLinear(0.5)).toBeCloseTo(0.2140411404715882, 15);
    expect(LinearToSRGB(0.0031308)).toBeCloseTo(0.040453576944652785, 15);
    expect(LinearToSRGB(0.18)).toBeCloseTo(0.4613620325120445, 15);
    expect(Math.abs(SRGBToLinear(0.5) - 0.21404114048223255)).toBeLessThan(1e-5);
    for (const sample of [-2, -1, -0.5, -0.001, 0, 0.001, 0.1, 0.5, 1, 2]) {
      // the decimal constants make the round trip exact only to about 2.2e-5
      expect(LinearToSRGB(SRGBToLinear(sample))).toBeCloseTo(sample, 4);
      if (sample < 0) expect(SRGBToLinear(sample)).toBeCloseTo(sample / 12.92, 9);
    }
  });

  it("exposes the complete opaque CSS keyword set, including aliases and black", () => {
    // Sample values directly from https://www.w3.org/TR/css-color-4/#named-colors
    expect(Object.keys(COLOR_KEYWORDS)).toHaveLength(148);
    expect(Color.NAMES).toBe(COLOR_KEYWORDS);
    expect(COLOR_KEYWORDS.black).toBe(0x000000);
    expect(COLOR_KEYWORDS.gray).toBe(0x808080);
    expect(COLOR_KEYWORDS.green).toBe(0x008000);
    expect(COLOR_KEYWORDS.rebeccapurple).toBe(0x663399);
    expect(COLOR_KEYWORDS.ghostwhite).toBe(0xf8f8ff);
    expect(COLOR_KEYWORDS.papayawhip).toBe(0xffefd5);
    expect(COLOR_KEYWORDS.aqua).toBe(COLOR_KEYWORDS.cyan);
    expect(COLOR_KEYWORDS.darkgray).toBe(COLOR_KEYWORDS.darkgrey);
    for (const [name, value] of Object.entries(COLOR_KEYWORDS)) {
      expect(new Color(name.toUpperCase()).getHex()).toBe(value);
    }
    expectRGB(new Color("black"), [0, 0, 0]);
    const original = new Color(0x123456);
    expect(original.setColorName("constructor")).toBe(original);
    expect(original.getHex()).toBe(0x123456);
  });

  it("parses CSS hex, numeric and percent rgb, HSL angles and supported color() spaces", () => {
    for (const [style, hex] of [
      ["#abc", 0xaabbcc],
      ["rgb(255, 0, 128)", 0xff0080], ["rgb(100% 0% 50% / 40%)", 0xff0080],
      ["rgb(255\n 0\t128)", 0xff0080],
      ["rgba(255, -2, 300, 0.5)", 0xff00ff], ["hsl(120, 100%, 50%)", 0x00ff00],
      ["hsl(.5turn 100% 50% / 0.5)", 0x00ffff], ["hsl(200grad 100% 50%)", 0x00ffff],
      ["hsl(3.141592653589793rad 100% 50%)", 0x00ffff],
      ["hsl(120 100 50%)", 0x00ff00],
      ["color(srgb 1 0 0.5)", 0xff0080]
    ] as const) expect(new Color(style).getHex(), style).toBe(hex);
    expectRGB(new Color("color(srgb-linear .25 .5 2)"), [0.25, 0.5, 2]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // unified 4.x contract: 4- and 8-digit hex (alpha forms) warn and leave the color unchanged.
    for (const invalid of ["#abcd", "#12345678", "#12", "#12345", "#aabbcczz", "rgb(0, 2, 3 / 1)", "rgb(0, 0%, 0)", "rgb(none, 0, 0)", "rgb(0 2)", "rgb(0 0 nope)", "hsl(90, 1, 1)", "color(display-p3 1 0 0)", "transparent", "currentcolor", "garbage"]) {
      const color = new Color(0x123456);
      expect(color.setStyle(invalid)).toBe(color);
      expect(color.getHex(), invalid).toBe(0x123456);
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("converts HSL with cyclic hue, clamped saturation and lightness and writable targets", () => {
    const expected = [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]];
    expected.forEach((rgb, i) => {
      const color = new Color().setHSL(i / 6, 1, 0.5);
      expectRGB(color, rgb);
      const target = { h: -1, s: -1, l: -1 };
      expect(color.getHSL(target)).toBe(target);
      expect(target.h).toBeCloseTo(i / 6, 12);
      expect(target.s).toBeCloseTo(1, 12);
      expect(target.l).toBeCloseTo(0.5, 12);
    });
    expectRGB(new Color().setHSL(-1 / 6, 1, 0.5), [1, 0, 1]);
    expectRGB(new Color().setHSL(42, 0, 0.3), [0.3, 0.3, 0.3]);
    expectRGB(new Color().setHSL(0, 5, -3), [0, 0, 0]);
    expectRGB(new Color().setHSL(0, 1, 5), [1, 1, 1]);
    expectRGB(new Color().setHSL(0, 1, 0.5).offsetHSL(1 / 3, 0, 0), [0, 1, 0]);
    expectRGB(new Color(1, 0, 0).lerpHSL(new Color(0, 0, 1), 0.5), [0, 1, 0]);
    const outOfGamut = new Color(-1, 0, 0).getHSL({ h: -1, s: -1, l: -1 });
    // unified 4.x contract: textbook HSL, so an out-of-gamut color reports a negative saturation.
    expect(outOfGamut).toEqual({ h: 0.5, s: -1, l: -0.5 });
    const zeroLightness = new Color(-1, 0, 1).getHSL({ h: -1, s: -1, l: -1 });
    expect(zeroLightness).toEqual({ h: 0, s: 0, l: 0 });
  });

  it("round-trips a grid of nondegenerate HSL colors without losing their hue", () => {
    for (let step = 0; step < 18; step++) {
      for (const saturation of [0.2, 0.5, 0.8, 1]) {
        for (const lightness of [0.1, 0.25, 0.5, 0.75, 0.9]) {
          const hue = step / 18;
          const result = new Color().setHSL(hue, saturation, lightness).getHSL({ h: 0, s: 0, l: 0 });
          expect(result.h).toBeCloseTo(hue, 12);
          expect(result.s).toBeCloseTo(saturation, 12);
          expect(result.l).toBeCloseTo(lightness, 12);
        }
      }
    }
  });

  it("respects input and output spaces, formatting, and mutable state flags", () => {
    const color = new Color().setRGB(0.5, 0.5, 0.5, SRGBColorSpace);
    // unified 4.x contract: decimal-constant sRGB transfer.
    expectRGB(color, [0.2140411404715882, 0.2140411404715882, 0.2140411404715882]);
    const target = { r: 0, g: 0, b: 0 };
    expect(color.getRGB(target, SRGBColorSpace)).toBe(target);
    expectRGB(target, [0.5, 0.5, 0.5], 4); // transfer round trip, exact to about 1e-5 (unified 4.x contract)
    expect(color.getHex()).toBe(0x808080);
    expect(color.getHexString()).toBe("808080");
    expect(color.getStyle()).toBe("rgb(128,128,128)");
    expect(color.toJSON()).toBe(0x808080);
    // unified 4.x contract: color(space r g b) is written with three decimals, so it parses back to within 5e-4.
    expect(color.getStyle(LinearSRGBColorSpace)).toBe("color(srgb-linear 0.214 0.214 0.214)");
    expectRGB(new Color(color.getStyle(LinearSRGBColorSpace)), [color.r, color.g, color.b], 3);
    expect(ColorManagement.getPrimaries(SRGBColorSpace)).toEqual([0.64, 0.33, 0.3, 0.6, 0.15, 0.06]);
    expect(ColorManagement.getTransfer(NoColorSpace)).toBe(LinearTransfer);
    expect(ColorManagement.getTransfer(SRGBColorSpace)).toBe(SRGBTransfer);
    expect(ColorManagement.getToneMappingMode(SRGBColorSpace)).toBe("standard");
    const coefficients = { values: [] as number[], fromArray(v: ArrayLike<number>) { this.values = Array.from(v); return this; } };
    expect(ColorManagement.getLuminanceCoefficients(coefficients)).toBe(coefficients);
    // unified 4.x contract: four-decimal Rec. 709 luminance weights.
    expect(coefficients.values[0]).toBeCloseTo(0.2126, 14);
    expect(coefficients.values[1]).toBeCloseTo(0.7152, 14);
    expect(coefficients.values[2]).toBeCloseTo(0.0722, 14);
    ColorManagement.enabled = false;
    expectRGB(new Color().setRGB(0.5, 0.5, 0.5, SRGBColorSpace), [0.5, 0.5, 0.5]);
    expectRGB(new Color().setHex(0x808080), [128 / 255, 128 / 255, 128 / 255]);
    ColorManagement.enabled = true;
    ColorManagement.workingColorSpace = SRGBColorSpace;
    expectRGB(new Color(0x808080), [128 / 255, 128 / 255, 128 / 255]);
    expectRGB(new Color().setRGB(0.21404114048223255, 0, 0, LinearSRGBColorSpace), [0.5, 0, 0], 4);
  });

  it("converts configured linear primaries through XYZ and rejects unknown transfers", () => {
    const identity = new Matrix3();
    const swap = new Matrix3(0, 0, 1, 0, 1, 0, 1, 0, 0);
    ColorManagement.define({
      "test-xyz": { primaries: [], transfer: LinearTransfer, toXYZ: identity, fromXYZ: identity, luminanceCoefficients: [0, 1, 0] },
      "test-red-blue-swap": { primaries: [], transfer: LinearTransfer, toXYZ: swap, fromXYZ: swap, luminanceCoefficients: [0, 1, 0] },
      "test-unsupported": { primaries: [], transfer: "unknown-transfer", toXYZ: identity, fromXYZ: identity, luminanceCoefficients: [0, 1, 0] }
    });
    const color = new Color(0.2, 0.4, 0.8);
    expect(ColorManagement.convert(color, "test-red-blue-swap", "test-xyz")).toBe(color);
    expectRGB(color, [0.8, 0.4, 0.2]);
    ColorManagement.convert(color, "test-xyz", "test-red-blue-swap");
    expectRGB(color, [0.2, 0.4, 0.8]);
    const red = new Color(1, 0, 0);
    ColorManagement.convert(red, LinearSRGBColorSpace, "test-xyz");
    expectRGB(red, [506752 / 1228815, 87098 / 409605, 7918 / 409605]);
    ColorManagement.convert(red, "test-xyz", LinearSRGBColorSpace);
    expectRGB(red, [1, 0, 0]);
    expect(() => ColorManagement.convert(color, "missing", "test-xyz")).toThrow(RangeError);
    expect(() => ColorManagement.convert(color, "test-unsupported", "test-xyz")).toThrow(RangeError);
    expectRGB(color, [0.2, 0.4, 0.8]);
  });

  it("preserves input and output aliasing across mutable operations", () => {
    const a = new Color(0.2, 0.4, 0.6), b = new Color(0.1, 0.3, 0.5);
    expect(a.addColors(a, b)).toBe(a);
    expectRGB(a, [0.3, 0.7, 1.1]);
    expectRGB(b.clone().add({ r: 0.2, g: 0.4, b: 0.6 }).lerp({ r: 0.5, g: 0.1, b: 0.3 }, 0.5), [0.4, 0.4, 0.7]);
    expect(a.lerpColors(b, a, 0.5)).toBe(a);
    expectRGB(a, [0.2, 0.5, 0.8]);
    expectRGB(a.sub({ r: 1, g: 0.1, b: 0.3 }), [0, 0.4, 0.5]);
    expectRGB(a.addScalar(0.1).multiply({ r: 2, g: 3, b: 4 }).multiplyScalar(0.5), [0.1, 0.75, 1.2]);
    const matrix = new Matrix3(0, 0, 1, 0, 1, 0, 1, 0, 0);
    expectRGB(a.applyMatrix3(matrix), [1.2, 0.75, 0.1]);
    const transferred = new Color(0.5, 0.2, 0.8);
    expect(transferred.copySRGBToLinear(transferred).copyLinearToSRGB(transferred)).toBe(transferred);
    // unified 4.x contract: the transfer round trip is exact to about 1e-5 (decimal constants).
    expectRGB(transferred, [0.5, 0.2, 0.8], 4);
    expectRGB(transferred.convertSRGBToLinear().convertLinearToSRGB(), [0.5, 0.2, 0.8], 4);
    const cloned = transferred.clone();
    expect(cloned).not.toBe(transferred);
    expect(cloned.equals(transferred)).toBe(true);
  });

  it("supports scalar, vector, attribute, array, iterable and immutable bridges", () => {
    const color = new Color().setScalar(0.25).setFromVector3({ x: 0.1, y: 0.2, z: 0.3 });
    const output = [9, 9, 9, 9, 9];
    expect(color.toArray(output, 1)).toBe(output);
    expect(output).toEqual([9, 0.1, 0.2, 0.3, 9]);
    expect([...color]).toEqual([0.1, 0.2, 0.3]);
    expectRGB(new Color().fromArray(output, 1), [0.1, 0.2, 0.3]);
    const attribute = { getX: (i: number) => i, getY: (i: number) => i + 1, getZ: (i: number) => i + 2 };
    expectRGB(color.fromBufferAttribute(attribute, 2), [2, 3, 4]);
    const immutable = color.toImmutable(0.25);
    expect(immutable.a).toBe(0.25);
    expectRGB(new Color().fromImmutable(immutable), [2, 3, 4]);
    expectRGB(new Color({ r: 0.4, g: 0.5, b: 0.6 }), [0.4, 0.5, 0.6]);
  });
});
