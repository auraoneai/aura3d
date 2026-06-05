import type { AuraClashRuntimeEvent } from "./types";

export interface AuraClashEffectCue {
  id: string;
  kind: "hit-spark" | "guard-ring" | "dash-dust" | "aura-burst" | "round-flare";
  atMs: number;
  intensity: number;
  reducedMotionSafe: boolean;
}

export function effectsFromEvents(events: readonly AuraClashRuntimeEvent[]): AuraClashEffectCue[] {
  return events.flatMap((event) => {
    if (event.type === "hit") {
      return [{ id: `fx-${event.id}`, kind: "hit-spark", atMs: event.atMs, intensity: 1, reducedMotionSafe: true }];
    }

    if (event.type === "guard") {
      return [{ id: `fx-${event.id}`, kind: "guard-ring", atMs: event.atMs, intensity: 0.72, reducedMotionSafe: true }];
    }

    if (event.type === "movement" && event.payload?.dash) {
      return [{ id: `fx-${event.id}`, kind: "dash-dust", atMs: event.atMs, intensity: 0.5, reducedMotionSafe: true }];
    }

    if (event.type === "round") {
      return [{ id: `fx-${event.id}`, kind: "round-flare", atMs: event.atMs, intensity: 0.9, reducedMotionSafe: false }];
    }

    return [];
  });
}

