import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpectedColor {
  r: number;
  g: number;
  b: number;
  a?: number;
  tolerance?: number;
}

export interface RegionCheckResult {
  passed: boolean;
  sampleCount: number;
  average: { r: number; g: number; b: number; a: number };
  reason?: string;
}

export interface BackgroundCheckResult {
  passed: boolean;
  sampleCount: number;
  matchingCount: number;
  matchingFraction: number;
  reason?: string;
}

export interface SubjectExpectation {
  region: PixelRegion;
  background: ExpectedColor;
  subject: ExpectedColor;
  /** Fraction of the region that must match the subject, rather than incidental noise. */
  minSubjectFraction?: number;
  /** Minimum RGB channel difference from the expected background, in byte values. */
  minContrast?: number;
}

export interface SubjectCheckResult {
  passed: boolean;
  sampleCount: number;
  matchingCount: number;
  matchingFraction: number;
  reason?: string;
}

function validateBuffer(buffer: PixelBuffer): void {
  if (!Number.isInteger(buffer.width) || !Number.isInteger(buffer.height) || buffer.width <= 0 || buffer.height <= 0) {
    throw new RangeError("Pixel buffer width and height must be positive integers.");
  }

  if (buffer.data.length !== buffer.width * buffer.height * 4) {
    throw new RangeError("Pixel buffer data length must equal width * height * 4.");
  }
}

function clampRegion(buffer: PixelBuffer, region: PixelRegion): PixelRegion {
  if (![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.width <= 0 || region.height <= 0) {
    throw new RangeError("Pixel region coordinates must be finite and dimensions positive.");
  }
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const maxX = Math.min(buffer.width, Math.ceil(region.x + region.width));
  const maxY = Math.min(buffer.height, Math.ceil(region.y + region.height));

  if (maxX <= x || maxY <= y) {
    throw new RangeError("Pixel region must overlap the buffer.");
  }

  return { x, y, width: maxX - x, height: maxY - y };
}

/** Coarse RGB sanity check only; a nonblack background or a speck is not subject evidence. */
export function isNonBlank(buffer: PixelBuffer, threshold = 3): boolean {
  validateBuffer(buffer);
  validateByte(threshold, "threshold");

  for (let index = 0; index < buffer.data.length; index += 4) {
    if (
      buffer.data[index + 3] > threshold &&
      (buffer.data[index] > threshold ||
      buffer.data[index + 1] > threshold ||
      buffer.data[index + 2] > threshold)
    ) {
      return true;
    }
  }

  return false;
}

function validateByte(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new RangeError(`${label} must be a finite number from 0 to 255.`);
  }
}

function validateColor(color: ExpectedColor): void {
  validateByte(color.r, "red");
  validateByte(color.g, "green");
  validateByte(color.b, "blue");
  validateByte(color.a ?? 255, "alpha");
  validateByte(color.tolerance ?? 8, "tolerance");
}

function validateFraction(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError(`${name} must be greater than 0 and at most 1.`);
  }
}

function matchesColor(data: PixelBuffer["data"], index: number, color: ExpectedColor): boolean {
  const tolerance = color.tolerance ?? 8;
  return Math.abs(data[index] - color.r) <= tolerance &&
    Math.abs(data[index + 1] - color.g) <= tolerance &&
    Math.abs(data[index + 2] - color.b) <= tolerance &&
    Math.abs(data[index + 3] - (color.a ?? 255)) <= tolerance;
}

/** Check the per-pixel background instead of accepting a misleading average. */
export function checkExpectedBackground(
  buffer: PixelBuffer,
  region: PixelRegion,
  expected: ExpectedColor,
  minMatchingFraction = 0.95
): BackgroundCheckResult {
  validateBuffer(buffer);
  validateColor(expected);
  validateFraction(minMatchingFraction, "minMatchingFraction");
  const checked = clampRegion(buffer, region);
  const sampleCount = checked.width * checked.height;
  let matchingCount = 0;
  for (let y = checked.y; y < checked.y + checked.height; y += 1) {
    for (let x = checked.x; x < checked.x + checked.width; x += 1) {
      if (matchesColor(buffer.data, (y * buffer.width + x) * 4, expected)) matchingCount += 1;
    }
  }
  const matchingFraction = matchingCount / sampleCount;
  const passed = matchingFraction >= minMatchingFraction;
  return { passed, sampleCount, matchingCount, matchingFraction, reason: passed ? undefined : `background match ${matchingFraction} is below ${minMatchingFraction}` };
}

/**
 * Verify a fixture's named subject in its expected region against its known
 * background. An alpha-only change and a few noisy pixels are not evidence of
 * a visible subject. Use fixture-specific colors, tolerance and coverage.
 */
export function checkExpectedSubject(buffer: PixelBuffer, expected: SubjectExpectation): SubjectCheckResult {
  validateBuffer(buffer);
  validateColor(expected.background);
  validateColor(expected.subject);
  const minFraction = expected.minSubjectFraction ?? 0.05;
  const minContrast = expected.minContrast ?? 3;
  validateFraction(minFraction, "minSubjectFraction");
  validateByte(minContrast, "minContrast");
  if (minContrast === 0) throw new RangeError("minContrast must be greater than 0.");
  const checked = clampRegion(buffer, expected.region);
  const sampleCount = checked.width * checked.height;
  let matchingCount = 0;
  for (let y = checked.y; y < checked.y + checked.height; y += 1) {
    for (let x = checked.x; x < checked.x + checked.width; x += 1) {
      const index = (y * buffer.width + x) * 4;
      // Compare the visible contribution of the subject over the specified
      // background: fully or almost transparent RGB cannot prove a subject,
      // and an opacity change with identical RGB is not subject evidence.
      const opacity = buffer.data[index + 3] / 255;
      const contrast = Math.max(
        Math.abs(buffer.data[index] - expected.background.r) * opacity,
        Math.abs(buffer.data[index + 1] - expected.background.g) * opacity,
        Math.abs(buffer.data[index + 2] - expected.background.b) * opacity
      );
      if (contrast >= minContrast && matchesColor(buffer.data, index, expected.subject)) matchingCount += 1;
    }
  }
  const matchingFraction = matchingCount / sampleCount;
  const passed = matchingFraction >= minFraction;
  return { passed, sampleCount, matchingCount, matchingFraction, reason: passed ? undefined : `subject match ${matchingFraction} is below ${minFraction}` };
}

export function checkExpectedRegion(buffer: PixelBuffer, region: PixelRegion, expected: ExpectedColor): RegionCheckResult {
  validateBuffer(buffer);
  validateColor(expected);
  const checkedRegion = clampRegion(buffer, region);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let sampleCount = 0;

  for (let y = checkedRegion.y; y < checkedRegion.y + checkedRegion.height; y += 1) {
    for (let x = checkedRegion.x; x < checkedRegion.x + checkedRegion.width; x += 1) {
      const index = (y * buffer.width + x) * 4;
      r += buffer.data[index];
      g += buffer.data[index + 1];
      b += buffer.data[index + 2];
      a += buffer.data[index + 3];
      sampleCount += 1;
    }
  }

  const average = {
    r: r / sampleCount,
    g: g / sampleCount,
    b: b / sampleCount,
    a: a / sampleCount,
  };
  const tolerance = expected.tolerance ?? 8;
  const expectedAlpha = expected.a ?? 255;
  const passed =
    Math.abs(average.r - expected.r) <= tolerance &&
    Math.abs(average.g - expected.g) <= tolerance &&
    Math.abs(average.b - expected.b) <= tolerance &&
    Math.abs(average.a - expectedAlpha) <= tolerance;

  return {
    passed,
    sampleCount,
    average,
    reason: passed ? undefined : `average rgba(${average.r}, ${average.g}, ${average.b}, ${average.a}) outside tolerance ${tolerance}`,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createBuffer(width: number, height: number, fill: [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
    data[index + 3] = fill[3];
  }
  return { width, height, data };
}

function main(): void {
  const blank = createBuffer(4, 4, [0, 0, 0, 0]);
  const red = createBuffer(4, 4, [220, 20, 10, 255]);
  const region = checkExpectedRegion(red, { x: 1, y: 1, width: 2, height: 2 }, { r: 220, g: 20, b: 10, a: 255 });

  assert(!isNonBlank(blank), "blank buffer was reported as nonblank");
  assert(isNonBlank(red), "colored buffer was reported as blank");
  assert(region.passed, region.reason ?? "expected region failed");

  const report = {
    generatedAt: new Date().toISOString(),
    suite: "workstream-6-visual-pixels",
    status: "pass",
    checks: [
      { name: "blank-detection", passed: true },
      { name: "nonblank-detection", passed: true },
      { name: "expected-region", passed: true, average: region.average },
    ],
  };

  if (process.argv.includes("--write-report")) {
    const reportPath = resolve("tests/reports/visual.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
