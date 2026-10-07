/**
 * §17 screen-fraction: union of widget rects ∩ canvas rect, divided by the
 * canvas area. Anchored slots do not overlap, so the union is the sum of the
 * per-widget intersections; overlapping widgets are merged on the dominant
 * axis to stay a union rather than a double-count.
 */
import type { HudRect } from "./dom.js";

function intersect(a: HudRect, b: HudRect): number {
  const l = Math.max(a.left, b.left);
  const t = Math.max(a.top, b.top);
  const r = Math.min(a.left + a.width, b.left + b.width);
  const bt = Math.min(a.top + a.height, b.top + b.height);
  const w = r - l;
  const h = bt - t;
  return w > 0 && h > 0 ? w * h : 0;
}

function overlapArea(a: HudRect, b: HudRect): number {
  return intersect(a, b);
}

/** Union area of `rects` clipped to `canvas`, as a fraction of the canvas area. */
export function screenFraction(rects: readonly HudRect[], canvas: HudRect): number {
  const canvasArea = canvas.width * canvas.height;
  if (!(canvasArea > 0) || rects.length === 0) return 0;
  let union = 0;
  for (let i = 0; i < rects.length; i++) {
    const clipped = intersect(rects[i], canvas);
    if (clipped === 0) continue;
    let overlap = 0;
    for (let j = 0; j < i; j++) overlap += overlapArea(rects[i], rects[j]);
    union += Math.max(0, clipped - overlap);
  }
  return union / canvasArea;
}
