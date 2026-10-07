// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraApp, AuraAppRegistry } from "../nodes/types.js";

/**
 * Live apps on this page, so tooling can act on a scene it did not create.
 *
 * ## Why this exists
 *
 * Visual-approval and screenshot gates need to *freeze* a scene before capturing it. Without a way
 * to reach the running app, they cannot: a route creates its app in module scope and typically never
 * exposes the handle, so an automated capture can only `waitForTimeout` and photograph whatever frame
 * the loop happened to reach.
 *
 * Measured consequence, before this existed: re-running the showcase screenshot spec with **no code
 * change** produced different bytes for 14 of 29 screenshots, because most routes animate and print
 * live telemetry. Any gate binding approval to a screenshot hash was therefore unsatisfiable — every
 * regeneration invalidated a still-correct signature.
 *
 * Deliberately a `Set` of handles rather than a global "the app", because a page may legitimately
 * mount several. Entries are removed on `dispose()` so a long-lived page does not leak.
 */
const liveAuraApps = new Set<AuraApp>();

export function registerAuraApp(app: AuraApp): void {
  liveAuraApps.add(app);
  if (typeof globalThis !== "undefined") {
    (globalThis as { __AURA3D_LIVE_APPS__?: unknown }).__AURA3D_LIVE_APPS__ = auraAppRegistry;
  }
}

export function unregisterAuraApp(app: AuraApp): void {
  liveAuraApps.delete(app);
}

export const auraAppRegistry: AuraAppRegistry = {
  kind: "aura3d-live-app-registry",
  count() {
    return liveAuraApps.size;
  },
  pauseAll() {
    for (const app of liveAuraApps) app.pause();
    return liveAuraApps.size;
  },
  resumeAll() {
    for (const app of liveAuraApps) app.resume();
    return liveAuraApps.size;
  },
  settle(steps = 30, dt = 1 / 60) {
    for (const app of liveAuraApps) {
      app.pause();
      /*
       * Rewind before stepping.
       *
       * Without this, `settle(30)` means "30 steps after however long the page took to load", which
       * differs run to run — and routes that animate from accumulated `time` then render a different
       * frame. Measured before this: 8 of 29 screenshots still drifted perceptually even with every
       * app paused and stepped identically.
       */
      const resettable = app as AuraApp & { resetRuntimeClock?: () => void };
      resettable.resetRuntimeClock?.();
      for (let index = 0; index < Math.max(0, steps); index += 1) app.step(dt);
    }
    return liveAuraApps.size;
  },
  all() {
    return [...liveAuraApps];
  }
};
