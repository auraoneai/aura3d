export interface CanvasRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AverageColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function canvasIsNonBlank(canvas: HTMLCanvasElement, threshold = 3): boolean {
  const context = require2d(canvas);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] > threshold || pixels[index + 1] > threshold || pixels[index + 2] > threshold || pixels[index + 3] > threshold) {
      return true;
    }
  }

  return false;
}

export function averageRegionColor(canvas: HTMLCanvasElement, region: CanvasRegion): AverageColor {
  const context = require2d(canvas);
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const width = Math.min(canvas.width - x, Math.ceil(region.width));
  const height = Math.min(canvas.height - y, Math.ceil(region.height));
  const pixels = context.getImageData(x, y, width, height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  const count = pixels.length / 4;

  for (let index = 0; index < pixels.length; index += 4) {
    r += pixels[index];
    g += pixels[index + 1];
    b += pixels[index + 2];
    a += pixels[index + 3];
  }

  return { r: r / count, g: g / count, b: b / count, a: a / count };
}

export function colorWithinTolerance(actual: AverageColor, expected: AverageColor, tolerance = 10): boolean {
  return (
    Math.abs(actual.r - expected.r) <= tolerance &&
    Math.abs(actual.g - expected.g) <= tolerance &&
    Math.abs(actual.b - expected.b) <= tolerance &&
    Math.abs(actual.a - expected.a) <= tolerance
  );
}

function require2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context is unavailable.");
  }
  return context;
}
