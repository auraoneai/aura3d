/**
 * C-05 / T0-07 routing for a legacy post chain under `A3D_QR_CORE_OUTPUT`.
 *
 * The v2 output path encodes exactly once, in OutputPass (§8.4). A configured
 * legacy postprocess chain (bloom, SSAO, grading, ...) still tone-maps and
 * encodes itself until lane 03 migrates it into post-hdr contributors
 * (Q-03-2/Q-03-3). Running both would double-encode.
 *
 * The earlier policy dropped the chain, which silently removed authored effects.
 * On L4, scene 18-game-scene lost its bloom and the soft sky glow on the
 * foreground (LPIPS 0.026 with `-core_output` vs 0.068 with `core`; flags-bisect
 * 38188725947). The frame now keeps the legacy chain and bypasses OutputPass
 * for that frame instead: encode stays single and nothing authored is lost.
 * The bypass is still reported through the C-31 `output.postSkipped` record,
 * so the unmigrated residue stays visible. Frames without a legacy chain take
 * the v2 output path unchanged.
 */

import type { QrFlags } from "../contracts/core";

export interface CoreOutputPostSkipped {
  readonly code: string;
  readonly message: string;
  readonly effects: readonly string[];
}

export interface CoreOutputPostRoute {
  /** Whether this frame takes the v2 HDR target + OutputPass path. */
  readonly qrOutput: boolean;
  /** C-31 `output.postSkipped`: the unmigrated legacy chain this frame routed around OutputPass (`null` when none). */
  readonly skipped: CoreOutputPostSkipped | null;
}

export const CORE_OUTPUT_LEGACY_POST_MESSAGE =
  "legacy postprocess chain kept under A3D_QR_CORE_OUTPUT; OutputPass bypassed for this frame (the chain encodes itself) until PostGraph v2 routes it";

/** Effect keys a legacy postprocess options object enables (booleans or option objects). */
export function legacyPostEffects(postprocess: object): readonly string[] {
  return Object.entries(postprocess as Record<string, unknown>)
    .filter(([key, value]) => key !== "targetFormat" && key !== "temporal" && (value === true || (typeof value === "object" && value !== null)))
    .map(([key]) => key);
}

export function resolveCoreOutputPostRoute(coreOutputOn: boolean, postprocess: object | undefined): CoreOutputPostRoute {
  if (!coreOutputOn) return { qrOutput: false, skipped: null };
  if (postprocess === undefined) return { qrOutput: true, skipped: null };
  return {
    qrOutput: false,
    skipped: { code: "post-v2-unmigrated", message: CORE_OUTPUT_LEGACY_POST_MESSAGE, effects: legacyPostEffects(postprocess) }
  };
}

/**
 * The frame's flags with `A3D_QR_CORE_OUTPUT` explicitly off, so frame
 * contributors (lane 07 vfx, transmission capture) pick the legacy `color`
 * resource the legacy-routed graph actually writes.
 */
export function withCoreOutputOff(flags: QrFlags): QrFlags {
  return {
    values: { ...flags.values, A3D_QR_CORE_OUTPUT: false },
    on: (name) => (name === "A3D_QR_CORE_OUTPUT" ? false : flags.on(name))
  };
}
