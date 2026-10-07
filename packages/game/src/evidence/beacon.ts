/**
 * evidence/beacon.ts — PRD-09 day-0 (`window.__AURA3D_GAME__`, C-24 §6.4).
 *
 * Installs a FROZEN beacon object that is REPLACED (never mutated) when
 * session state changes, and refreshed at most ~4x/second for the frame
 * counter. `<0.5 KB` gzipped — a few fields only.
 */

import type { GameBeacon, GameSessionState } from "@aura3d/engine/contracts";

export interface BeaconOptions {
  readonly route: string;
  readonly getState: () => GameSessionState;
  readonly getFrame: () => number;
  readonly getFirstFrameAt: () => number | null;
  readonly win?: { __AURA3D_GAME__?: GameBeacon };
}

interface BeaconWindow {
  __AURA3D_GAME__?: GameBeacon;
}

const FRAME_REFRESH_MS = 250; // <= 4 Hz

export function installGameBeacon(options: BeaconOptions): { refresh(): void; dispose(): void } {
  const win: BeaconWindow | undefined =
    options.win ?? (typeof window !== "undefined" ? (window as BeaconWindow) : undefined);
  if (win === undefined) {
    return { refresh() {}, dispose() {} };
  }

  const sessionStartedAt = Date.now();
  let firstFrameAt: number | null = null;
  let frame = 0;
  let state: GameSessionState = options.getState();
  let timer: ReturnType<typeof setInterval> | null = null;

  const publish = () => {
    win.__AURA3D_GAME__ = Object.freeze({
      route: options.route,
      state,
      frame,
      firstFrameAt,
      sessionStartedAt
    });
  };

  /** Re-publish now — call from session "state" events and first-frame. */
  const refresh = () => {
    state = options.getState();
    firstFrameAt = options.getFirstFrameAt();
    publish();
  };

  if (typeof setInterval === "function") {
    timer = setInterval(() => {
      const next = options.getFrame();
      if (next !== frame) {
        frame = next;
        publish();
      }
    }, FRAME_REFRESH_MS);
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as { unref(): void }).unref();
    }
  }

  publish();
  return {
    refresh,
    dispose() {
      if (timer !== null) clearInterval(timer);
    }
  };
}
