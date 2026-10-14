import { assets } from "../aura-assets";
import type { FpsRunState } from "./state";

/**
 * Route-local audio discipline modeled on the Aura Clash manifest: every cue
 * maps to a CLI-registered typed asset. Synthesized in-repo (CC0) by
 * scripts/build-sfx.mjs — no downloaded files, no raw URLs.
 *
 * NC-A7 bus split: the ambient drone runs on its own looped element under the
 * SFX cues. The low-ammo tick and low-HP sting briefly duck the drone so the
 * warning reads through; SFX cue volumes are unchanged.
 */
export type CorridorAudioCue =
  | "fire"
  | "hit"
  | "kill"
  | "reload-start"
  | "reload-done"
  | "dry-fire"
  | "hurt"
  | "pickup"
  | "alarm"
  | "win"
  | "lose"
  | "warn";

interface CorridorAudioCueDefinition {
  readonly cue: CorridorAudioCue;
  readonly assetKey:
    | "corridorFireSfx"
    | "corridorHitSfx"
    | "corridorKillSfx"
    | "corridorReloadStartSfx"
    | "corridorReloadDoneSfx"
    | "corridorDryFireSfx"
    | "corridorHurtSfx"
    | "corridorPickupSfx"
    | "corridorAlarmSfx"
    | "corridorWinSfx"
    | "corridorLoseSfx"
    | "corridorWarnSfx";
  readonly volume: number;
}

export const corridorAudioManifest: Record<CorridorAudioCue, CorridorAudioCueDefinition> = {
  fire: { cue: "fire", assetKey: "corridorFireSfx", volume: 0.75 },
  hit: { cue: "hit", assetKey: "corridorHitSfx", volume: 0.7 },
  kill: { cue: "kill", assetKey: "corridorKillSfx", volume: 0.8 },
  "reload-start": { cue: "reload-start", assetKey: "corridorReloadStartSfx", volume: 0.65 },
  "reload-done": { cue: "reload-done", assetKey: "corridorReloadDoneSfx", volume: 0.7 },
  "dry-fire": { cue: "dry-fire", assetKey: "corridorDryFireSfx", volume: 0.6 },
  hurt: { cue: "hurt", assetKey: "corridorHurtSfx", volume: 0.7 },
  pickup: { cue: "pickup", assetKey: "corridorPickupSfx", volume: 0.65 },
  alarm: { cue: "alarm", assetKey: "corridorAlarmSfx", volume: 0.6 },
  win: { cue: "win", assetKey: "corridorWinSfx", volume: 0.75 },
  lose: { cue: "lose", assetKey: "corridorLoseSfx", volume: 0.8 },
  warn: { cue: "warn", assetKey: "corridorWarnSfx", volume: 0.55 }
};

/** NC-A7 ambient bus: registered typed asset, own element, looped. */
const AMBIENT_BUS = {
  assetKey: "corridorAmbientDrone" as const,
  volume: 0.3,
  /** Warn ticks duck lightly; hurt stings duck harder and longer. */
  warnDuck: 0.72,
  hurtDuck: 0.45,
  warnDuckMs: 900,
  hurtDuckMs: 1600
} as const;

export interface AmbientBusStatus {
  readonly active: boolean;
  readonly ducked: boolean;
  readonly paused: boolean;
}

export interface CorridorAudioController {
  readonly unlocked: () => boolean;
  readonly cuesPlayed: () => readonly string[];
  /** NC-A7 evidence: whether the ambient drone bus is running and ducked. */
  readonly ambientBus: () => AmbientBusStatus;
  setPaused(paused: boolean): void;
  reset(): void;
  play(cue: CorridorAudioCue): void;
  dispose(): void;
}

export function createCorridorAudio(state: FpsRunState): CorridorAudioController {
  let gestureUnlocked = false;
  let droneElement: HTMLAudioElement | null = null;
  let droneDuckedUntil = 0;
  let droneRestoreTimer: ReturnType<typeof setTimeout> | undefined;
  let audioPaused = false;
  let pauseStartedAt = 0;
  const played: string[] = [];
  const activeElements = new Set<HTMLAudioElement>();
  const listeners: Array<[EventTarget, string, EventListener]> = [];

  const unlock = () => {
    gestureUnlocked = true;
    startAmbient();
  };

  /** Autoplay-safe: only ever called after a real gesture unlock. */
  function startAmbient(): void {
    if (!gestureUnlocked || droneElement || audioPaused) return;
    try {
      const element = new Audio(assets[AMBIENT_BUS.assetKey].url);
      element.loop = true;
      element.volume = AMBIENT_BUS.volume;
      void element.play().catch(() => undefined);
      droneElement = element;
      activeElements.add(element);
    } catch {
      // Ambient is feel, not gameplay: never take the route down for it.
    }
  }

  function duckDrone(factor: number, durationMs: number): void {
    if (!droneElement) return;
    try {
      droneElement.volume = Math.max(0, Math.min(1, AMBIENT_BUS.volume * factor));
      droneDuckedUntil = Date.now() + durationMs;
      scheduleDroneRestore(durationMs);
    } catch {
      // Ducking is cosmetic; ignore any media-element refusal.
    }
  }

  function scheduleDroneRestore(durationMs: number): void {
    if (droneRestoreTimer) clearTimeout(droneRestoreTimer);
    droneRestoreTimer = setTimeout(() => {
      if (droneElement) droneElement.volume = AMBIENT_BUS.volume;
      droneDuckedUntil = 0;
      droneRestoreTimer = undefined;
    }, Math.max(0, durationMs));
  }

  const targets: Array<[EventTarget, string]> = [
    [window, "keydown"],
    [window, "pointerdown"]
  ];
  for (const [target, eventName] of targets) {
    target.addEventListener(eventName, unlock, { once: false, capture: true });
    listeners.push([target, eventName, unlock]);
  }

  return {
    unlocked: () => gestureUnlocked,
    cuesPlayed: () => played,
    ambientBus: () => ({
      active: droneElement !== null && !audioPaused,
      ducked: !audioPaused && Date.now() < droneDuckedUntil,
      paused: audioPaused
    }),
    setPaused(paused: boolean): void {
      if (audioPaused === paused) return;
      audioPaused = paused;
      if (paused) {
        pauseStartedAt = Date.now();
        if (droneRestoreTimer) {
          clearTimeout(droneRestoreTimer);
          droneRestoreTimer = undefined;
        }
      } else if (pauseStartedAt > 0) {
        const pausedFor = Date.now() - pauseStartedAt;
        if (droneDuckedUntil > 0) {
          droneDuckedUntil += pausedFor;
          scheduleDroneRestore(droneDuckedUntil - Date.now());
        }
        pauseStartedAt = 0;
      }
      for (const element of activeElements) {
        if (paused) element.pause();
        else void element.play().catch(() => undefined);
      }
      if (!paused) startAmbient();
    },
    reset(): void {
      if (droneRestoreTimer) clearTimeout(droneRestoreTimer);
      droneRestoreTimer = undefined;
      droneDuckedUntil = 0;
      pauseStartedAt = 0;
      audioPaused = false;
      for (const element of [...activeElements]) {
        if (element === droneElement) continue;
        element.pause();
        activeElements.delete(element);
      }
      if (droneElement) {
        droneElement.volume = AMBIENT_BUS.volume;
        void droneElement.play().catch(() => undefined);
      } else {
        startAmbient();
      }
    },
    play(cue: CorridorAudioCue): void {
      if (!gestureUnlocked || audioPaused) return;
      startAmbient();
      const definition = corridorAudioManifest[cue];
      const asset = assets[definition.assetKey];
      try {
        const element = new Audio(asset.url);
        element.volume = definition.volume;
        activeElements.add(element);
        element.addEventListener("ended", () => activeElements.delete(element), { once: true });
        void element.play().catch(() => undefined);
        played.push(cue);
        state.audioCues.push(cue);
        if (state.audioCues.length > 64) state.audioCues.splice(0, state.audioCues.length - 64);
      } catch {
        // Audio is feel, not gameplay: never let it take the route down.
      }
      // NC-A7 ducking: the low-ammo tick and low-HP sting read over the drone.
      if (cue === "warn") duckDrone(AMBIENT_BUS.warnDuck, AMBIENT_BUS.warnDuckMs);
      if (cue === "hurt") duckDrone(AMBIENT_BUS.hurtDuck, AMBIENT_BUS.hurtDuckMs);
    },
    dispose(): void {
      for (const [target, eventName, listener] of listeners) {
        target.removeEventListener(eventName, listener, { capture: true });
      }
      if (droneRestoreTimer) clearTimeout(droneRestoreTimer);
      try {
        for (const element of activeElements) element.pause();
        activeElements.clear();
      } catch {
        // Element may already be gone during teardown.
      }
    }
  };
}
