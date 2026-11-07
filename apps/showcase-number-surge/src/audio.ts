/**
 * Number Surge audio: 128 BPM neon-arcade synth on the kit `createGameSound`.
 * Cues are derived from sim event-counter diffs (`diffSounds`, pure/unit-tested);
 * silent until the first user gesture unlocks it; mute is persisted by main.ts.
 */
import { noteFrom, type CueSpec, type SynthContext } from "@aura3d/engine/audio";
import { createGameSound, type GameSound, type SoundEvent } from "../../../examples/shared/runner-kit/index";
import type { EventCounters, Phase } from "./sim";

export const BPM = 128;

export type Cue = "pick-good" | "pick-bad" | "smash" | "wall-fail" | "wall-block" | "powerup" | "milestone" | "gameover" | "start";

export interface AudioFrame {
  phase: Phase;
  events: EventCounters;
}

const EVENT_CUES: Record<keyof EventCounters, Cue> = {
  pickGood: "pick-good",
  pickBad: "pick-bad",
  smash: "smash",
  wallFail: "wall-fail",
  wallBlock: "wall-block",
  powerup: "powerup",
  milestone: "milestone",
  gameover: "gameover"
};

/** Exactly one cue per event counter that advanced; start on the splash→playing edge. */
export function diffSounds(prev: AudioFrame | null, next: AudioFrame): SoundEvent<Cue>[] {
  if (!prev) return [];
  const out: SoundEvent<Cue>[] = [];
  if (prev.phase !== "playing" && next.phase === "playing") out.push({ sound: "start", level: 0 });
  for (const key of Object.keys(EVENT_CUES) as (keyof EventCounters)[]) {
    if (next.events[key] > prev.events[key]) out.push({ sound: EVENT_CUES[key], level: key === "pickGood" ? next.events.pickGood : 0 });
  }
  return out;
}

const note = noteFrom(440); // A4
const ARP = [0, 3, 7, 10, 12, 10, 7, 3, 0, 3, 7, 12, 15, 12, 7, 3];
const BASS = [-12, -12, -8, -5];
const LADDER = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

const ladder = (level: number): number => note(LADDER[Math.min(LADDER.length - 1, Math.max(0, level))] as number);

export const CUES: Record<Cue, CueSpec> = {
  "pick-good": { layers: ({ level }) => [{ freq: ladder(level), type: "triangle", dur: 0.14, gain: 0.18, slideTo: ladder(level) * 1.5 }] },
  "pick-bad": { layers: [{ freq: 240, type: "square", dur: 0.18, gain: 0.1, slideTo: 130 }] },
  smash: {
    layers: [
      { freq: 150, type: "sawtooth", dur: 0.4, gain: 0.22, slideTo: 50 },
      { kind: "noise", dur: 0.42, gain: 0.16, freq: 1400, q: 0.6, slideTo: 200 },
      { freq: note(12), type: "triangle", dur: 0.3, gain: 0.14, delay: 0.06, slideTo: note(24) }
    ],
    duckMusic: 0.5
  },
  "wall-fail": {
    layers: [
      { freq: 220, type: "sawtooth", dur: 0.5, gain: 0.22, slideTo: 40 },
      { kind: "noise", dur: 0.5, gain: 0.18, freq: 800, q: 0.6, slideTo: 90 }
    ],
    priority: 1,
    duckMusic: { amount: 0.8, ms: 900 }
  },
  "wall-block": { layers: [{ freq: 430, type: "square", dur: 0.16, gain: 0.12, slideTo: 760 }, { kind: "noise", dur: 0.18, gain: 0.07, freq: 2400, q: 3 }] },
  powerup: { layers: [{ freq: 620, type: "sine", dur: 0.2, gain: 0.16, slideTo: 1240 }, { freq: 930, type: "triangle", dur: 0.22, gain: 0.1, delay: 0.05, slideTo: 1860 }] },
  milestone: { layers: [0, 3, 7, 12].map((semis, i) => ({ freq: note(semis), type: "triangle" as const, dur: 0.28, gain: 0.17, delay: 0.06 * i, slideTo: 1.5 * note(semis) })) },
  gameover: {
    layers: [
      { freq: note(0), type: "triangle", dur: 0.28, gain: 0.14, slideTo: note(-4) },
      { freq: note(-5), type: "triangle", dur: 0.5, gain: 0.14, delay: 0.22, slideTo: note(-12) }
    ],
    priority: 1
  },
  start: {
    layers: [
      { freq: note(0), type: "triangle", dur: 0.12, gain: 0.14 },
      { freq: note(7), type: "triangle", dur: 0.12, gain: 0.14, delay: 0.09 },
      { freq: note(12), type: "sine", dur: 0.26, gain: 0.15, delay: 0.18, slideTo: note(19) }
    ]
  }
};

export function createNumberSurgeSound(options: { context?: SynthContext } = {}): GameSound<Cue> {
  return createGameSound<Cue>({
    cues: CUES,
    bpm: BPM,
    noiseSeed: 0x51d2b7,
    ...(options.context ? { context: options.context } : {}),
    sequence: (n, at, eighth, voice) => {
      voice({ type: "triangle", freq: note(ARP[n % ARP.length] as number), at, dur: 0.85 * eighth, gain: 0.05 });
      if (n % 2 === 0) voice({ type: "sine", freq: note(BASS[(n / 2) % BASS.length] as number), at, dur: 1.7 * eighth, gain: 0.08 });
    }
  });
}