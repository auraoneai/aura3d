/**
 * Frame-loop tuning constants (quality rebuild L-2, PRD-08 §6.1).
 *
 * `DEFAULT_MAX_SUBSTEPS` is the flag-off value: it stays 5 so the runtime
 * `advance()` path is unchanged when `A3D_QR_CAMERA_LOOP` is off.
 * `QR_MAX_SUBSTEPS` is the rebuild default applied when the flag is on.
 */

import type { QrFlags } from "@aura3d/rendering/contracts";

export const DEFAULT_MAX_SUBSTEPS = 5;
export const QR_MAX_SUBSTEPS = 6;

/** Max real dt a single tick may consume under `A3D_QR_CAMERA_LOOP` (§6.1). */
export const QR_MAX_FRAME_DT = 0.1;

/**
 * L-5 lane side of Q-15-2: the clamp createAuraApp applies to its render dt
 * (seconds). Lane-15 clamps `delta` to `[1 ms, DEFAULT_MAX_FRAME_DT·1000 ms]`
 * at `index.ts:11328/:12319/:12382` with a one-line import of this constant.
 */
export const DEFAULT_MAX_FRAME_DT = QR_MAX_FRAME_DT;

/** T-5: `app.time.scale` clamps into [0, QR_TIME_SCALE_MAX] (§6.2). */
export const QR_TIME_SCALE_MAX = 4;

/**
 * L-2 overload policies (§6.1): `"slow-motion"` keeps today's clamp-the-
 * leftover behavior; `"catch-up"` drains backlogged time by running up to
 * `max(maxSubSteps, floor(maxFrameDt / fixedDt))` substeps per tick.
 */
export type AuraLoopOverloadPolicy = "slow-motion" | "catch-up";
export const DEFAULT_LOOP_OVERLOAD_POLICY: AuraLoopOverloadPolicy = "slow-motion";

/**
 * Resolves the substep cap: `configured` when given (L-2 allows up to 8),
 * the QR default when `A3D_QR_CAMERA_LOOP` is on, and the legacy default
 * when it is off.
 */
export function resolveMaxSubSteps(configured?: number, flags?: QrFlags): number {
  if (configured !== undefined) return Math.max(1, Math.floor(configured));
  return flags?.on("A3D_QR_CAMERA_LOOP") ? QR_MAX_SUBSTEPS : DEFAULT_MAX_SUBSTEPS;
}
