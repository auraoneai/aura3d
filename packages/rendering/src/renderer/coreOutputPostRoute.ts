/**
 * C-05 / T0-07 routing for a postprocess chain under `A3D_QR_CORE_OUTPUT`.
 *
 * A frame with a configured chain (bloom, SSAO, grading, vignette, ...) renders
 * on the forward graph into a linear HDR target, runs the PostGraph v2 stages
 * (every effect composes in linear light), and tone-maps and encodes exactly
 * once in the OUT stage (`createLegacyOutputPass`, the OutputPass boundary).
 * Nothing authored is dropped (an earlier policy dropped the chain: scene
 * 18-game-scene lost its bloom, LPIPS 0.026 with `-core_output` vs 0.068 with
 * `core`, flags-bisect 38188725947).
 *
 * Only a chain the v2 seam cannot run (compat.post "3.0", the `-post` opt-out,
 * a non-WebGL2 backend, `cpu-deterministic`, passes the fused LDR set cannot
 * order) takes the explicit legacy chain, which encodes itself. That is
 * reported through the C-31 `output.postSkipped` record as `post-legacy-route`
 * with the reason; it is a diagnostic, not a console warning. Frames without a
 * chain take the OutputPass path unchanged.
 */

import type { QrFlags } from "../contracts/core";

export interface CoreOutputPostSkipped {
  readonly code: string;
  readonly message: string;
  readonly effects: readonly string[];
}

export interface CoreOutputPostRoute {
  /** Whether this frame takes the v2 HDR target + OutputPass path (no postprocess chain configured). */
  readonly qrOutput: boolean;
  /** Whether the frame renders on the chain's forward graph (contributors then read the `color` resource). */
  readonly legacyGraph: boolean;
  /** C-31 `output.postSkipped`: the explicit legacy chain this frame took instead of PostGraph v2 (`null` when v2 runs it or no chain exists). */
  readonly skipped: CoreOutputPostSkipped | null;
}

export const CORE_OUTPUT_LEGACY_POST_MESSAGE =
  "postprocess chain took the explicit legacy route under A3D_QR_CORE_OUTPUT (the chain encodes itself); PostGraph v2 does not run it";

/** Effect keys a legacy postprocess options object enables (booleans or option objects). */
export function legacyPostEffects(postprocess: object): readonly string[] {
  return Object.entries(postprocess as Record<string, unknown>)
    .filter(([key, value]) => key !== "targetFormat" && key !== "temporal" && (value === true || (typeof value === "object" && value !== null)))
    .map(([key]) => key);
}

/**
 * @param v2DeclineReason why the PostGraph v2 seam cannot run `postprocess`
 *   (`null` when it can); computed by the renderer from the same predicate the
 *   executor uses.
 */
export function resolveCoreOutputPostRoute(
  coreOutputOn: boolean,
  postprocess: object | undefined,
  v2DeclineReason: string | null = null
): CoreOutputPostRoute {
  if (!coreOutputOn) return { qrOutput: false, legacyGraph: false, skipped: null };
  if (postprocess === undefined) return { qrOutput: true, legacyGraph: false, skipped: null };
  if (v2DeclineReason === null) return { qrOutput: false, legacyGraph: true, skipped: null };
  return {
    qrOutput: false,
    legacyGraph: true,
    skipped: { code: "post-legacy-route", message: `${CORE_OUTPUT_LEGACY_POST_MESSAGE}: ${v2DeclineReason}`, effects: legacyPostEffects(postprocess) }
  };
}

/**
 * The frame's flags with `A3D_QR_CORE_OUTPUT` explicitly off, so frame
 * contributors (lane 07 vfx, transmission capture) pick the legacy `color`
 * resource the legacy-routed graph actually writes.
 */
const coreOutputOffCache = new WeakMap<QrFlags, QrFlags>();

export function withCoreOutputOff(flags: QrFlags): QrFlags {
  // Asked for every frame of the direct path with the same app flags: one derived (frozen) object per input, so the
  // registries' per-flags memo keeps hitting instead of seeing a new flags object each frame.
  const cached = coreOutputOffCache.get(flags);
  if (cached !== undefined) return cached;
  const derived: QrFlags = {
    values: Object.freeze({ ...flags.values, A3D_QR_CORE_OUTPUT: false }),
    on: (name) => (name === "A3D_QR_CORE_OUTPUT" ? false : flags.on(name))
  };
  // Only a flags object whose own `values` are frozen is immutable, so only then is the derived one safe to reuse.
  if (Object.isFrozen(flags.values)) coreOutputOffCache.set(flags, derived);
  return derived;
}
