import { describe, expect, it } from "vitest";
import {
  checkExpectedBackground,
  checkExpectedRegion,
  checkExpectedSubject,
  isNonBlank,
  type PixelBuffer
} from "../../visual/canvas-pixel-checks";

type Rgba = readonly [number, number, number, number];

function solid(width: number, height: number, rgba: Rgba): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) data.set(rgba, index);
  return { width, height, data };
}

function setPixel(buffer: PixelBuffer, x: number, y: number, rgba: Rgba): void {
  buffer.data.set(rgba, (y * buffer.width + x) * 4);
}

const full = { x: 0, y: 0, width: 10, height: 10 };
const black = { r: 0, g: 0, b: 0, a: 255, tolerance: 1 };
const red = { r: 210, g: 20, b: 10, a: 255, tolerance: 2 };

describe("fixture-specific pixel checks", () => {
  it("does not treat opaque black or invisible RGB as nonblank", () => {
    expect(isNonBlank(solid(2, 2, [0, 0, 0, 255]))).toBe(false);
    expect(isNonBlank(solid(2, 2, [255, 255, 255, 0]))).toBe(false);
    expect(isNonBlank(solid(2, 2, [255, 255, 255, 255]))).toBe(true);
  });

  it("checks opaque black, transparent and white backgrounds separately", () => {
    for (const [rgba, expected] of [
      [[0, 0, 0, 255], black],
      [[0, 0, 0, 0], { ...black, a: 0 }],
      [[255, 255, 255, 255], { r: 255, g: 255, b: 255, a: 255, tolerance: 1 }]
    ] as const) {
      const buffer = solid(10, 10, rgba);
      expect(checkExpectedBackground(buffer, full, expected).passed).toBe(true);
      expect(checkExpectedSubject(buffer, { region: full, background: expected, subject: red }).passed).toBe(false);
    }
  });

  it("requires a minimum subject area and ignores isolated matching noise", () => {
    const buffer = solid(10, 10, [0, 0, 0, 255]);
    setPixel(buffer, 4, 4, [210, 20, 10, 255]);
    const fixture = { region: full, background: black, subject: red, minSubjectFraction: 0.1 };
    expect(checkExpectedSubject(buffer, fixture)).toMatchObject({ passed: false, matchingCount: 1, sampleCount: 100 });
    for (let y = 3; y < 7; y += 1) for (let x = 3; x < 7; x += 1) setPixel(buffer, x, y, [210, 20, 10, 255]);
    expect(checkExpectedSubject(buffer, fixture)).toMatchObject({ passed: true, matchingCount: 16 });
    expect(checkExpectedSubject(buffer, { ...fixture, region: { x: 0, y: 0, width: 3, height: 3 } }).passed).toBe(false);
  });

  it("rejects RGB under full transparency and changes to alpha alone", () => {
    expect(checkExpectedSubject(solid(10, 10, [210, 20, 10, 0]), {
      region: full, background: { ...black, a: 0 }, subject: { ...red, a: 0 }
    }).passed).toBe(false);
    expect(checkExpectedSubject(solid(10, 10, [210, 20, 10, 1]), {
      region: full, background: black, subject: { ...red, a: 1, tolerance: 0 }, minContrast: 3
    }).passed).toBe(false);
    expect(checkExpectedSubject(solid(10, 10, [255, 255, 255, 255]), {
      region: full,
      background: { r: 255, g: 255, b: 255, a: 0 },
      subject: { r: 255, g: 255, b: 255, a: 255 }
    }).passed).toBe(false);
  });

  it("accepts a deliberately dark subject when the fixture specifies its contrast", () => {
    const buffer = solid(10, 10, [0, 0, 0, 255]);
    for (let y = 2; y < 8; y += 1) for (let x = 2; x < 8; x += 1) setPixel(buffer, x, y, [5, 6, 5, 255]);
    expect(checkExpectedSubject(buffer, {
      region: full,
      background: black,
      subject: { r: 5, g: 6, b: 5, a: 255, tolerance: 1 },
      minSubjectFraction: 0.3,
      minContrast: 4
    })).toMatchObject({ passed: true, matchingCount: 36 });
  });

  it("does not let balancing outliers satisfy a background by their average", () => {
    const buffer = solid(10, 10, [100, 100, 100, 255]);
    for (let x = 0; x < 10; x += 1) {
      setPixel(buffer, x, 0, [0, 0, 0, 255]);
      setPixel(buffer, x, 1, [200, 200, 200, 255]);
    }
    const color = { r: 100, g: 100, b: 100, a: 255, tolerance: 2 };
    expect(checkExpectedRegion(buffer, full, color).passed).toBe(true);
    expect(checkExpectedBackground(buffer, full, color, 0.95)).toMatchObject({ passed: false, matchingCount: 80 });
  });

  it("rejects empty or invalid regions, colors and thresholds", () => {
    const buffer = solid(10, 10, [0, 0, 0, 255]);
    expect(() => checkExpectedBackground(buffer, { ...full, width: NaN }, black)).toThrow(RangeError);
    expect(() => checkExpectedBackground(buffer, { ...full, x: 20 }, black)).toThrow(RangeError);
    expect(() => checkExpectedSubject(buffer, { region: full, background: black, subject: red, minSubjectFraction: 0 })).toThrow(RangeError);
    expect(() => checkExpectedSubject(buffer, { region: full, background: black, subject: { ...red, tolerance: -1 } })).toThrow(RangeError);
    expect(() => checkExpectedSubject(buffer, { region: full, background: black, subject: red, minContrast: 0 })).toThrow(RangeError);
  });
});
