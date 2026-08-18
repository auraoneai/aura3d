import { assets } from "../aura-assets";
import type { FpsRunState } from "./state";

/**
 * Route-local audio discipline modeled on the Aura Clash manifest: every cue
 * maps to a CLI-registered typed asset. Synthesized in-repo (CC0) by
 * scripts/build-sfx.mjs — no downloaded files, no raw URLs.
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

export interface CorridorAudioController {
  readonly unlocked: () => boolean;
  readonly cuesPlayed: () => readonly string[];
  play(cue: CorridorAudioCue): void;
  dispose(): void;
}

export function createCorridorAudio(state: FpsRunState): CorridorAudioController {
  let gestureUnlocked = false;
  const played: string[] = [];
  const listeners: Array<[EventTarget, string, EventListener]> = [];

  const unlock = () => {
    gestureUnlocked = true;
  };
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
    play(cue: CorridorAudioCue): void {
      if (!gestureUnlocked) return;
      const definition = corridorAudioManifest[cue];
      const asset = assets[definition.assetKey];
      try {
        const element = new Audio(asset.url);
        element.volume = definition.volume;
        void element.play().catch(() => undefined);
        played.push(cue);
        state.audioCues.push(cue);
        if (state.audioCues.length > 64) state.audioCues.splice(0, state.audioCues.length - 64);
      } catch {
        // Audio is feel, not gameplay: never let it take the route down.
      }
    },
    dispose(): void {
      for (const [target, eventName, listener] of listeners) {
        target.removeEventListener(eventName, listener, { capture: true });
      }
    }
  };
}
