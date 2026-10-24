/**
 * evidence/beacon.ts — PRD-09 day-0 (`window.__AURA3D_GAME__`, C-24 §6.4).
 *
 * Installs a FROZEN beacon object that is REPLACED (never mutated) when
 * session state changes, and refreshed at most ~4x/second for the frame
 * counter. `<0.5 KB` gzipped — a few fields only.
 */

import type { GameBeacon, GameSessionState } from "@aura3d/engine";

export interface BeaconOptions {
  readonly route: string;
  /** Defaults to "playing" for routes that do not use a game session. */
  readonly getState?: () => GameSessionState;
  readonly getFrame?: () => number;
  readonly getFirstFrameAt?: () => number | null;
  /** Live mounted app for audit lanes (beacon.app.scene / app.diagnostics()). */
  readonly getApp?: () => GameBeacon["app"] | undefined;
  readonly getSession?: () => unknown;
  /** Window globals that receive the raw evidence object on every `publishEvidence` (legacy readers such as `__AURA3D_GAME_EVIDENCE__`). */
  readonly evidenceGlobals?: readonly string[];
  readonly win?: { __AURA3D_GAME__?: GameBeacon } & Record<string, unknown>;
}

export interface BeaconHandle {
  refresh(): void;
  /**
   * Publish a route evidence snapshot on the beacon: the beacon fields (route, state, frame, ...) plus the
   * evidence fields, evidence winning on a shared key. Getters on the evidence object stay lazy. The snapshot
   * is also assigned to `evidenceGlobals`. Call once per frame (or per change); each call replaces the beacon.
   */
  publishEvidence(evidence: object): void;
  dispose(): void;
}

interface BeaconWindow {
  __AURA3D_GAME__?: GameBeacon;
}

const FRAME_REFRESH_MS = 250; // <= 4 Hz

export function installGameBeacon(options: BeaconOptions): BeaconHandle {
  const win: BeaconWindow | undefined =
    options.win ?? (typeof window !== "undefined" ? (window as BeaconWindow) : undefined);
  if (win === undefined) {
    return { refresh() {}, publishEvidence() {}, dispose() {} };
  }

  const sessionStartedAt = Date.now();
  let firstFrameAt: number | null = null;
  let frame = 0;
  const readState = options.getState ?? (() => "playing" as GameSessionState);
  const readFrame = options.getFrame ?? (() => 0);
  const readFirstFrameAt = options.getFirstFrameAt ?? (() => null);
  let evidence: object | null = null;
  let state: GameSessionState = readState();
  let timer: ReturnType<typeof setInterval> | null = null;

  const publish = () => {
    const app = options.getApp?.();
    const beacon: Record<string, unknown> = { route: options.route, state, frame, firstFrameAt, sessionStartedAt };
    if (evidence !== null) Object.defineProperties(beacon, Object.getOwnPropertyDescriptors(evidence));
    // Live handles stay reachable for audit lanes but are not enumerable, so JSON.stringify and remote capture serialize the beacon (app.post is circular).
    const hidden = (value: unknown) => ({ value, enumerable: false, writable: false, configurable: false });
    const free = (key: string) => !Object.prototype.hasOwnProperty.call(beacon, key);
    if (app !== undefined && free("app")) Object.defineProperty(beacon, "app", hidden(app));
    if (app !== undefined && free("scene")) Object.defineProperty(beacon, "scene", hidden(app.scene));
    if (options.getSession !== undefined && free("session")) Object.defineProperty(beacon, "session", hidden(options.getSession()));
    win.__AURA3D_GAME__ = Object.freeze(beacon) as unknown as GameBeacon;
  };

  /** Re-publish now — call from session "state" events and first-frame. */
  const refresh = () => {
    state = readState();
    firstFrameAt = readFirstFrameAt();
    publish();
  };

  const publishEvidence = (next: object) => {
    evidence = next;
    for (const name of options.evidenceGlobals ?? []) (win as unknown as Record<string, unknown>)[name] = next;
    state = readState();
    frame = readFrame();
    firstFrameAt = readFirstFrameAt();
    publish();
  };

  if (typeof setInterval === "function") {
    timer = setInterval(() => {
      const next = readFrame();
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
    publishEvidence,
    dispose() {
      if (timer !== null) clearInterval(timer);
    }
  };
}
