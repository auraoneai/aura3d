export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly rgba: readonly number[];
}

export interface MockClock {
  readonly now: () => number;
  readonly advance: (deltaMs: number) => number;
  readonly reset: (nextMs?: number) => void;
}

export function createMockClock(startMs = 0): MockClock {
  let current = startMs;
  return {
    now: () => current,
    advance(deltaMs: number): number {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new RangeError("Clock advance delta must be a finite non-negative number.");
      }
      current += deltaMs;
      return current;
    },
    reset(nextMs = startMs): void {
      if (!Number.isFinite(nextMs)) {
        throw new RangeError("Clock reset value must be finite.");
      }
      current = nextMs;
    }
  };
}

export function makeSolidPixelBuffer(width: number, height: number, rgba: readonly [number, number, number, number]): PixelBuffer {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError("Pixel buffer dimensions must be positive integers.");
  }
  const pixels = width * height;
  const data: number[] = [];
  for (let index = 0; index < pixels; index += 1) {
    data.push(rgba[0], rgba[1], rgba[2], rgba[3]);
  }
  return { width, height, rgba: data };
}

export function countChangedPixels(a: PixelBuffer, b: PixelBuffer): number {
  if (a.width !== b.width || a.height !== b.height || a.rgba.length !== b.rgba.length) {
    throw new RangeError("Pixel buffers must have matching dimensions and channel counts.");
  }

  let changed = 0;
  for (let index = 0; index < a.rgba.length; index += 4) {
    if (
      a.rgba[index] !== b.rgba[index] ||
      a.rgba[index + 1] !== b.rgba[index + 1] ||
      a.rgba[index + 2] !== b.rgba[index + 2] ||
      a.rgba[index + 3] !== b.rgba[index + 3]
    ) {
      changed += 1;
    }
  }
  return changed;
}
