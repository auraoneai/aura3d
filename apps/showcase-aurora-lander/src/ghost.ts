/**
 * Input-replay ghost — record/export/import/playback of the best landing attempt.
 *
 * The ghost is a player-facing feature built on the public replay stack:
 *   - `game.input` records every press/release during an attempt (`.recorded()`)
 *   - `game.inputReplay` + `game.exportReplay` / `game.importReplay` persist it
 *   - `game.inputReplayDriver` drives a detached input controller on playback
 *
 * Playback feeds the SAME deterministic `stepLander` integration, so a round-trip
 * (record → export → import → drive) reproduces the original trajectory hash exactly.
 * The ghost mesh is visual-only: it never collides and never affects grading.
 */
import {
  game,
  type GameInputController,
  type GameInputReplayEvent,
  type GameInputReplayPlan
} from "@aura3d/engine";
import { stepLander, createLanderState, type Controls, type LanderState } from "./lander";
import type { GustWindow, LanderSite } from "./sites";

export interface GhostSample {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GhostAttempt {
  readonly siteId: number;
  readonly events: readonly GameInputReplayEvent[];
  readonly samples: readonly GhostSample[];
}

export const GHOST_FPS = 60;
const STORAGE_KEY_PREFIX = "aurora-lander-best-run/";

/** FNV-1a over rounded trajectory coordinates — stable across JSON round-trips. */
export function trajectoryHash(samples: readonly GhostSample[]): string {
  let hash = 2166136261;
  const encode = (value: number): void => {
    // Round to millimeters so float noise from serialization cannot split hashes.
    const quantized = Math.round(value * 1000);
    hash ^= quantized & 0xffff;
    hash = Math.imul(hash, 16777619);
    hash ^= (quantized >>> 16) & 0xffff;
    hash = Math.imul(hash, 16777619);
  };
  for (const sample of samples) {
    encode(sample.x);
    encode(sample.y);
    encode(sample.z);
    hash ^= sample.frame & 0xffff;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Sample an attempt's trajectory with the deterministic authored integrator. */
export function simulateAttempt(
  site: LanderSite,
  controlsAtFrame: (frame: number) => Controls,
  shouldStop?: (state: LanderState) => boolean
): GhostSample[] {
  const samples: GhostSample[] = [];
  let state = createLanderState(site.spawn, site.fuelBudget);
  const dt = 1 / GHOST_FPS;
  for (let frame = 0; frame < GHOST_FPS * 180; frame += 1) {
    state = stepLander(state, controlsAtFrame(frame), dt, site.gust);
    samples.push({ frame, x: state.x, y: state.y, z: state.z });
    if (shouldStop?.(state)) break;
  }
  return samples;
}

/** Build a persisted replay plan from a recorded attempt. */
export function buildGhostPlan(events: readonly GameInputReplayEvent[], label: string): GameInputReplayPlan {
  return game.inputReplay(events, { fps: GHOST_FPS, seed: 0x5e_ed, label });
}

export interface StoredBestRun {
  readonly kind: "aura-game-input-replay-export";
  readonly schemaVersion: "aura-game-input-replay/v1";
  /** Trajectory hash of the recorded run, verified after import. */
  readonly trajectoryHash: string;
  readonly siteId: number;
  readonly grade: string;
  readonly score: number;
}

export function exportBestRun(attempt: GhostAttempt, replay: GameInputReplayPlan, grade: string, score: number): StoredBestRun {
  // The stored document IS the engine's replay export plus our provenance fields,
  // so game.importReplay can consume it directly after a JSON round-trip.
  return {
    ...game.exportReplay(replay, { exportedAt: new Date().toISOString() }),
    trajectoryHash: trajectoryHash(attempt.samples),
    siteId: attempt.siteId,
    grade,
    score
  };
}

const hasLocalStorage = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
};

export function saveBestRun(siteId: number, run: StoredBestRun): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(STORAGE_KEY_PREFIX + siteId, JSON.stringify(run));
}

export function loadBestRunRaw(siteId: number): StoredBestRun | undefined {
  if (!hasLocalStorage()) return undefined;
  const raw = localStorage.getItem(STORAGE_KEY_PREFIX + siteId);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as StoredBestRun;
  } catch {
    return undefined;
  }
}

export interface ImportedBestRun {
  readonly meta: StoredBestRun;
  readonly replay: GameInputReplayPlan;
}

/** Import a stored best run; throws on schema mismatch so stale data fails loudly. */
export function importBestRun(stored: StoredBestRun): ImportedBestRun {
  const replay = game.importReplay(stored as unknown as Parameters<typeof game.importReplay>[0]);
  return { meta: stored, replay };
}

/**
 * A playback controller: owns a detached input controller plus the replay driver,
 * exposing per-frame Controls suitable for stepLander. Keyboard bindings mirror
 * main.ts actions ("thrust" via KeyW/ArrowUp, rotate via KeyA/KeyD).
 */
export interface GhostPlayback {
  readonly active: boolean;
  begin(replay: GameInputReplayPlan, spawn: LanderState, gust?: GustWindow): void;
  /** Advance one fixed step; returns the replayed controls and resulting state. */
  step(dt: number): { controls: Controls; state: LanderState; complete: boolean };
  stop(): void;
}

export function createGhostPlayback(): GhostPlayback {
  const input: GameInputController = game.input({
    autoListen: false,
    gamepad: false,
    actions: {
      thrust: ["KeyW", "ArrowUp"],
      left: ["KeyA"],
      right: ["KeyD"]
    },
    axes: {
      steer: { negative: "left", positive: "right" }
    }
  });
  let driver: ReturnType<typeof game.inputReplayDriver> | undefined;
  let gustWindow: GustWindow | undefined;
  let currentState = createLanderState({ x: 0, y: 120, z: 0 }, 20);

  return {
    get active() {
      return driver !== undefined;
    },
    begin(replay, spawn, gust) {
      currentState = spawn;
      gustWindow = gust;
      driver = game.inputReplayDriver(input, replay);
    },
    step(dt) {
      if (!driver) return { controls: { thrust: 0, rotate: 0 }, state: currentState, complete: true };
      const snapshot = driver.step(dt);
      const controls: Controls = {
        thrust: snapshot.actions.thrust?.held ? 1 : 0,
        rotate: (snapshot.actions.right?.held ? 1 : 0) - (snapshot.actions.left?.held ? 1 : 0)
      };
      currentState = stepLander(currentState, controls, dt, gustWindow);
      const status = driver.snapshot();
      return { controls, state: currentState, complete: status.complete };
    },
    stop() {
      driver = undefined;
      input.clearReplay();
    }
  };
}
