// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { performance } from "./performanceEvidence.js";

export function devicePixelRatioSafe(): number {
  return typeof window === "undefined" ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

const mediaQueries = new Map<string, MediaQueryList>();

/**
 * `matchMedia(query).matches` without creating a new MediaQueryList per call (a native call that showed up
 * every frame in the cube profile). A MediaQueryList is live, so `.matches` still follows changes.
 */
export function mediaMatches(query: string): boolean {
  if (typeof matchMedia !== "function") return false;
  let list = mediaQueries.get(query);
  if (list === undefined) {
    list = matchMedia(query);
    mediaQueries.set(query, list);
  }
  return list.matches;
}

export function performanceNow(): number {
  return typeof globalThis.performance === "undefined" ? Date.now() : globalThis.performance.now();
}

/**
 * T0-12 (PRD-16 §2): mount-phase timing marks. `performance.mark` is a no-op
 * where the API is absent, so engine code may call it unconditionally — the
 * bench harness copies `a3d:` marks into `payload.extra.mountTiming` to locate
 * the ~90 s pre-first-frame mount cost.
 */
export function markTiming(name: string): void {
  globalThis.performance?.mark?.(name);
}
