/**
 * Black-frame self-heal for Drift & Deliver. The implementation lives in `@aura3d/debug` (`packages/debug/src/safety`); this
 * module pins Drift's storage key and keeps its import names. When a frame stays black the page reloads itself one rung
 * down a compatibility ladder (each rung switches off one more optional stage) and records the rung and the reason, so
 * `?diag=1` shows which rung fixed it. `?heal=0` disables it.
 */
import {
  DEFAULT_HEAL_LADDER,
  createBlackFrameWatch as createWatch,
  healParams as libHealParams,
  healRungName as libHealRungName,
  healStage as libHealStage,
  isBlackFrame,
  type BlackFrameWatch,
  type BlackFrameWatchOptions
} from "@aura3d/debug";

const STORAGE_KEY = "drift-heal-stage";

export { isBlackFrame };
export type { BlackFrameWatch };

/** Current rung (0 = full quality), taken from session storage so a reload continues down the ladder. */
export function healStage(storage?: Pick<Storage, "getItem">): number {
  return libHealStage(storage, DEFAULT_HEAL_LADDER, STORAGE_KEY);
}

/** Query parameters implied by rung `stage` (cumulative), merged under the author's explicit parameters. */
export function healParams(stage: number): Record<string, string> {
  return libHealParams(stage, DEFAULT_HEAL_LADDER);
}

export const healRungName = (stage: number): string => libHealRungName(stage, DEFAULT_HEAL_LADDER);

/** `fastFrames` shortens the detection window (tests only). */
export function createBlackFrameWatch(canvas: HTMLCanvasElement, options: Pick<BlackFrameWatchOptions, "enabled" | "fastFrames" | "isReady" | "getDrawCalls">): BlackFrameWatch {
  return createWatch(canvas, { ...options, ladder: DEFAULT_HEAL_LADDER, storageKey: STORAGE_KEY });
}
