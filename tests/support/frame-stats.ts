// Pure pixel statistics shared by the browser receipt harnesses (bundled for the page)
// and the Node-side receipt writer. No Node or DOM imports.

/** Mean Rec. 709 luma (0..255) and the share of pixels whose brightest channel exceeds 8/255. */
export function frameStats(rgba: ArrayLike<number>): { meanLuma: number; nonBlackRatio: number } {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return { meanLuma: 0, nonBlackRatio: 0 };
  let luma = 0;
  let lit = 0;
  for (let index = 0; index < pixels; index += 1) {
    const r = rgba[index * 4]!;
    const g = rgba[index * 4 + 1]!;
    const b = rgba[index * 4 + 2]!;
    luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (Math.max(r, g, b) > 8) lit += 1;
  }
  return { meanLuma: luma / pixels, nonBlackRatio: lit / pixels };
}

/**
 * Pixels that differ between two same-size RGBA frames by more than `threshold` summed
 * channel difference, optionally limited to x in [x0, x1).
 */
export function changedPixelCount(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  width: number,
  options: { readonly threshold?: number; readonly x0?: number; readonly x1?: number } = {}
): number {
  const threshold = options.threshold ?? 30;
  const x0 = options.x0 ?? 0;
  const x1 = options.x1 ?? width;
  const pixels = Math.floor(Math.min(a.length, b.length) / 4);
  let changed = 0;
  for (let index = 0; index < pixels; index += 1) {
    const x = index % width;
    if (x < x0 || x >= x1) continue;
    const diff = Math.abs(a[index * 4]! - b[index * 4]!) + Math.abs(a[index * 4 + 1]! - b[index * 4 + 1]!) + Math.abs(a[index * 4 + 2]! - b[index * 4 + 2]!);
    if (diff > threshold) changed += 1;
  }
  return changed;
}
