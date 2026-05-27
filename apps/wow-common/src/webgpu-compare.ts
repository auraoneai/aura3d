export interface WebGPUVisualDelta {
  readonly meanDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

export function compareRgbaPixels(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
  threshold = 10
): WebGPUVisualDelta {
  const length = Math.min(a.length, b.length, width * height * 4);
  let totalDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset + 3 < length; offset += 4) {
    const delta = Math.abs((a[offset] ?? 0) - (b[offset] ?? 0))
      + Math.abs((a[offset + 1] ?? 0) - (b[offset + 1] ?? 0))
      + Math.abs((a[offset + 2] ?? 0) - (b[offset + 2] ?? 0));
    totalDelta += delta / 3;
    if (delta > threshold * 3) changedPixels += 1;
  }
  const pixels = Math.max(1, Math.floor(length / 4));
  const meanDelta = totalDelta / pixels;
  return {
    meanDelta: round(meanDelta),
    changedPixels,
    structuralSimilarityProxy: round(Math.max(0, 1 - meanDelta / 255))
  };
}

export function formatDelta(delta: WebGPUVisualDelta): string {
  return `mean ${delta.meanDelta}, changed ${delta.changedPixels}, ssim-proxy ${delta.structuralSimilarityProxy}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
