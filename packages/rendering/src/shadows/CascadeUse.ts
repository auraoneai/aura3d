/**
 * PRD-2 WP-7: which sun cascades does the frame sample at all?
 *
 * The legacy forward path picks ONE cascade per item (`selectForwardShadowMap`): the first cascade whose far split is >= the item's world-centre
 * depth, measured as view-space depth when the draw has a view matrix and as distance to the eye otherwise. A cascade that no visible item picks
 * is never read, so rendering its depth map is wasted work: every cascade redraws every caster.
 *
 * This module evaluates that same selection per receiver, with the same expression (`forwardCascadeSelectionDepth`, shared with
 * `selectForwardShadowMap`), the same item centre (`renderItemWorldCenter`) and the same camera inputs the renderer hands the forward pass
 * (`resolvedCamera.viewMatrix`, `cameraPosition`). Every cascade no receiver picks is reported as unused. Because the decision is computed by the
 * forward path's own function and not by a parallel formula, a skipped cascade is one the forward path cannot select for these receivers.
 */

import { forwardCascadeSelectionDepth, renderItemWorldCenter } from "../forward/Lighting";
import type { RenderItem } from "../contracts/renderItem";

export interface CascadeUseFit {
  readonly index: number;
  readonly splitFar: number;
}

/** The camera inputs `ForwardPass` receives as `cameraViewMatrix` / `cameraPosition`; they decide which depth the forward path measures. */
export interface CascadeUseCamera {
  readonly viewMatrix?: Float32Array | readonly number[];
  readonly eye?: readonly [number, number, number];
}

/**
 * Indices of cascades no receiver can select, or `undefined` when the answer cannot be given safely (fewer than two cascades, no receivers,
 * neither a view matrix nor an eye, non-finite depths). `undefined` means "render every cascade".
 */
export function unusedCascadeIndices(
  fits: readonly CascadeUseFit[],
  receivers: readonly RenderItem[],
  camera: CascadeUseCamera
): ReadonlySet<number> | undefined {
  if (fits.length < 2 || receivers.length === 0) return undefined;
  const hasView = camera.viewMatrix !== undefined && camera.viewMatrix.length >= 16;
  if (!hasView && !camera.eye) return undefined;
  const used = new Set<number>();
  for (const item of receivers) {
    const depth = forwardCascadeSelectionDepth(renderItemWorldCenter(item), camera.viewMatrix, camera.eye, fits[0]!.splitFar);
    if (!Number.isFinite(depth)) return undefined;
    // Same lookup as `cascades.find((c) => depth <= c.far) ?? last`.
    let pick = fits.length - 1;
    for (let i = 0; i < fits.length; i += 1) if (depth <= fits[i]!.splitFar) { pick = i; break; }
    used.add(pick);
    if (used.size === fits.length) return undefined;
  }
  const unused = new Set<number>();
  fits.forEach((fit, i) => { if (!used.has(i)) unused.add(fit.index); });
  return unused.size > 0 ? unused : undefined;
}
