/**
 * PRD-2 WP-7: which sun cascades does the frame sample at all?
 *
 * The legacy forward path picks ONE cascade per item (`selectForwardShadowMap`): the first cascade whose far split is >= the item's world-centre
 * depth, measured as view-space depth when the draw has a view matrix and as distance to the eye otherwise. A cascade that no visible item picks
 * is never read, so rendering its depth map is wasted work: every cascade redraws every caster.
 *
 * This module answers "which cascades can no item pick?" conservatively: an item may pick any cascade between the one its view-space depth
 * selects and the one its eye distance selects (view depth <= distance for points in front of the camera), so every cascade in that range
 * counts as used. Only cascades outside every item's range are reported unused. The answer is exact for the draw path and independent of
 * the cascade maps themselves, so skipping those cascades changes no pixel.
 */

import { renderItemWorldCenter } from "../forward/Lighting";
import type { RenderItem } from "../contracts/renderItem";

export interface CascadeUseFit {
  readonly index: number;
  readonly splitFar: number;
}

/**
 * Indices of cascades no receiver can select, or `undefined` when the answer cannot be given safely (fewer than two cascades, no receivers,
 * a non-perspective or degenerate view-projection, non-finite item centres). `undefined` means "render every cascade".
 */
export function unusedCascadeIndices(
  fits: readonly CascadeUseFit[],
  receivers: readonly RenderItem[],
  viewProjection: Float32Array | readonly number[],
  eye: readonly [number, number, number]
): ReadonlySet<number> | undefined {
  if (fits.length < 2 || receivers.length === 0 || viewProjection.length < 16) return undefined;
  // Perspective only: clip w equals view-space depth. An orthographic matrix has a constant w, so depth would be unknown.
  const m = viewProjection;
  if (Math.abs(m[3]!) + Math.abs(m[7]!) + Math.abs(m[11]!) < 1e-6) return undefined;
  const pick = (depth: number): number => {
    for (let i = 0; i < fits.length; i += 1) if (depth <= fits[i]!.splitFar) return i;
    return fits.length - 1;
  };
  const used = new Set<number>();
  for (const item of receivers) {
    const c = renderItemWorldCenter(item);
    const x = c[0], y = c[1], z = c[2];
    const viewDepth = Math.max(0, m[3]! * x + m[7]! * y + m[11]! * z + m[15]!);
    const distance = Math.hypot(x - eye[0], y - eye[1], z - eye[2]);
    if (!Number.isFinite(viewDepth) || !Number.isFinite(distance)) return undefined;
    const lo = pick(Math.min(viewDepth, distance));
    const hi = pick(Math.max(viewDepth, distance));
    for (let i = lo; i <= hi; i += 1) used.add(i);
    if (used.size === fits.length) return undefined;
  }
  const unused = new Set<number>();
  fits.forEach((fit, i) => { if (!used.has(i)) unused.add(fit.index); });
  return unused.size > 0 ? unused : undefined;
}
