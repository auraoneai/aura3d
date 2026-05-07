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

function validateBuffer(buffer: PixelBuffer): void {
  if (!Number.isInteger(buffer.width) || !Number.isInteger(buffer.height) || buffer.width <= 0 || buffer.height <= 0) {
    throw new RangeError("Pixel buffer width and height must be positive integers.");
  }

  if (buffer.data.length !== buffer.width * buffer.height * 4) {
    throw new RangeError("Pixel buffer data length must equal width * height * 4.");
  }
}

function clampRegion(buffer: PixelBuffer, region: PixelRegion): PixelRegion {
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const maxX = Math.min(buffer.width, Math.ceil(region.x + region.width));
  const maxY = Math.min(buffer.height, Math.ceil(region.y + region.height));

  if (maxX <= x || maxY <= y) {
    throw new RangeError("Pixel region must overlap the buffer.");
  }

  return { x, y, width: maxX - x, height: maxY - y };
}

export function isNonBlank(buffer: PixelBuffer, threshold = 3): boolean {
  validateBuffer(buffer);

  for (let index = 0; index < buffer.data.length; index += 4) {
    if (
      buffer.data[index] > threshold ||
      buffer.data[index + 1] > threshold ||
      buffer.data[index + 2] > threshold ||
      buffer.data[index + 3] > threshold
    ) {
      return true;
    }
  }

  return false;
}

export function checkExpectedRegion(buffer: PixelBuffer, region: PixelRegion, expected: ExpectedColor): RegionCheckResult {
  validateBuffer(buffer);
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
