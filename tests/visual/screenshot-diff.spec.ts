import { expect, test } from "@playwright/test";

type PixelBuffer = {
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
};

test.describe("screenshot diff policy", () => {
  test("classifies stable and changed RGBA buffers with the product-demo visual thresholds", () => {
    const stableA = createBuffer(4, 4, [20, 30, 40, 255]);
    const stableB = createBuffer(4, 4, [22, 31, 39, 255]);
    const changed = createBuffer(4, 4, [190, 40, 80, 255]);

    const stableDiff = compareBuffers(stableA, stableB, 8);
    const changedDiff = compareBuffers(stableA, changed, 8);

    expect(stableDiff.changedRatio).toBe(0);
    expect(stableDiff.meanDelta).toBeGreaterThan(0);
    expect(changedDiff.changedRatio).toBe(1);
    expect(changedDiff.meanDelta).toBeGreaterThan(100);
  });
});

function createBuffer(width: number, height: number, fill: readonly [number, number, number, number]): PixelBuffer {
  const data = new Array<number>(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
    data[index + 3] = fill[3];
  }
  return { width, height, data };
}

function compareBuffers(left: PixelBuffer, right: PixelBuffer, tolerance: number): { readonly changedRatio: number; readonly meanDelta: number } {
  if (left.width !== right.width || left.height !== right.height || left.data.length !== right.data.length) {
    throw new Error("Screenshot buffers must have matching dimensions.");
  }
  let changedPixels = 0;
  let totalDelta = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    const delta =
      Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0)) +
      Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0)) +
      Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0)) +
      Math.abs((left.data[index + 3] ?? 0) - (right.data[index + 3] ?? 0));
    totalDelta += delta;
    if (delta > tolerance) {
      changedPixels += 1;
    }
  }
  const pixels = left.data.length / 4;
  return {
    changedRatio: changedPixels / pixels,
    meanDelta: totalDelta / pixels
  };
}
