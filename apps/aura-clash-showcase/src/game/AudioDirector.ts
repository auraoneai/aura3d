import type { AuraClashRuntimeEvent } from "./types";

export interface AudioCue {
  id: string;
  bus: "ui" | "combat" | "crowd" | "music";
  label: string;
  atMs: number;
  gain: number;
}

export function audioCuesFromEvents(events: readonly AuraClashRuntimeEvent[]): AudioCue[] {
  return events.map((event) => ({
    id: `audio-${event.id}`,
    bus: event.type === "round" ? "crowd" : event.type === "input" ? "ui" : "combat",
    label: event.label,
    atMs: event.atMs,
    gain: event.type === "hit" ? 0.92 : 0.62,
  }));
}

