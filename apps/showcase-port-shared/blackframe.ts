/**
 * Black-frame self-heal for the showcase games. The implementation lives in `@aura3d/debug` (`packages/debug/src/safety`):
 * readiness gating (document loaded, no loading overlay, no asset fetches in flight), black-versus-dark detection over a
 * nearest-neighbour grid, a time budget that scales with the measured frame time, once-per-load stepping down the engine's
 * `a3d-qr` flag ladder and a recorded reason shown by `?diag=1`. This module only keeps the showcase pages' import path
 * and names stable. `?heal=0` disables it; an `a3d-qr` already in the URL is always respected.
 */
import {
  QR_HEAL_LADDER,
  installBlackFrameGuard as installGuard,
  isBlackFrame,
  qrHealRungName,
  qrHealStage,
  qrHealUrl,
  type BlackFrameGuardOptions
} from "../../packages/debug/src/safety/index";

export const HEAL_LADDER = QR_HEAL_LADDER;
export const healStage = qrHealStage;
export const healRungName = qrHealRungName;
export const healUrl = qrHealUrl;
export { isBlackFrame };
export type { BlackFrameGuardOptions };

/** Install once, before the app starts drawing. Safe to call without options. */
export function installBlackFrameGuard(options: BlackFrameGuardOptions = {}): void {
  installGuard(options);
}
