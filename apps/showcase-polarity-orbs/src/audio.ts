/**
 * Polarity Orbs audio: 126 BPM synth bed + one cue per game event, derived from sim-state diffs (never fired from
 * the sim). Silent until the first user gesture unlocks it; mute persists in main.ts.
 */
import { noteFrom } from "@aura3d/engine/audio";
import { createGameSound, type GameSound, type GameSoundOptions, type SoundEvent } from "../../../examples/shared/runner-kit/audio-kit";
import type { GameState } from "./sim";

export const BPM = 126;

export type PolaritySound = "flip" | "collect" | "wrong" | "powerup" | "milestone" | "gameover" | "start" | "block" | "burst";

/** The slice of sim state the diff reads (plain data; unit tested). */
export interface FrameState {
  phase: string;
  lives: number;
  combo: number;
  mult: number;
  score: number;
  flips: number;
  orbsCollected: number;
  wrongs: number;
  shieldBlocks: number;
  powerupsTaken: number;
  milestones: number;
}

export function frameStateOf(o: GameState): FrameState {
  return {
    phase: o.phase, lives: o.lives, combo: o.combo, mult: o.mult, score: o.score,
    flips: o.flips, orbsCollected: o.orbsCollected, wrongs: o.wrongs,
    shieldBlocks: o.shieldBlocks, powerupsTaken: o.powerupsTaken, milestones: o.milestones
  };
}

/** Pure state diff: every sim event maps to exactly one cue. */
export function diffSounds(prev: FrameState | null, next: FrameState): SoundEvent<PolaritySound>[] {
  const out: SoundEvent<PolaritySound>[] = [];
  if (!prev) return out;
  if (prev.phase === "splash" && next.phase === "playing") out.push({ sound: "start", level: 0 });
  if (next.phase === "bursting" && prev.phase !== "bursting") out.push({ sound: "burst", level: 0 });
  if (next.phase === "gameOver" && prev.phase !== "gameOver") out.push({ sound: "gameover", level: 0 });
  if (next.phase !== "playing" && next.phase !== "bursting") return out;
  if (next.milestones > prev.milestones) out.push({ sound: "milestone", level: 0 });
  if (next.flips > prev.flips) out.push({ sound: "flip", level: 0 });
  if (next.orbsCollected > prev.orbsCollected) out.push({ sound: "collect", level: next.combo });
  if (next.wrongs > prev.wrongs) out.push({ sound: "wrong", level: 0 });
  if (next.shieldBlocks > prev.shieldBlocks) out.push({ sound: "block", level: 0 });
  if (next.powerupsTaken > prev.powerupsTaken) out.push({ sound: "powerup", level: 0 });
  return out;
}

const note = noteFrom(523.25); // C5
/** Minor-pentatonic ladder: the collect pitch climbs with the combo. */
const LADDER = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const ARP = [0, 7, 3, 10, 7, 12, 10, 5, 3, 10, 7, 14, 10, 7, 5, 0];
const BASS = [-12, -5, -8, -10];

const ladder = (level: number): number => note(LADDER[Math.min(LADDER.length - 1, Math.max(0, level))] as number);

export const CUES: GameSoundOptions<PolaritySound>["cues"] = {
  flip: {
    layers: [
      { freq: 300, type: "square", dur: 0.12, gain: 0.1, slideTo: 620 },
      { freq: 450, type: "sine", dur: 0.18, gain: 0.12, delay: 0.04, slideTo: 940 }
    ]
  },
  collect: { layers: ({ level }) => [{ freq: ladder(level), type: "triangle", dur: 0.15, gain: 0.2, slideTo: ladder(level) * 1.5 }] },
  wrong: {
    layers: [
      { freq: 190, type: "sawtooth", dur: 0.32, gain: 0.2, slideTo: 55 },
      { kind: "noise", dur: 0.26, gain: 0.11, freq: 430, q: 0.7, slideTo: 110 }
    ],
    duckMusic: 0.5
  },
  block: {
    layers: [
      { freq: 420, type: "square", dur: 0.16, gain: 0.12, slideTo: 760 },
      { kind: "noise", dur: 0.2, gain: 0.08, freq: 2300, q: 3 }
    ]
  },
  powerup: {
    layers: [
      { freq: 620, type: "sine", dur: 0.22, gain: 0.17, slideTo: 1320 },
      { freq: 930, type: "triangle", dur: 0.25, gain: 0.11, delay: 0.05, slideTo: 1850 }
    ]
  },
  milestone: {
    layers: [0, 4, 7, 12].map((semis, i) => ({ freq: note(semis), type: "triangle" as const, dur: 0.3, gain: 0.18, delay: 0.06 * i, slideTo: 1.5 * note(semis) }))
  },
  burst: {
    layers: [
      { freq: 250, type: "sawtooth", dur: 0.5, gain: 0.24, slideTo: 40 },
      { kind: "noise", dur: 0.55, gain: 0.2, freq: 900, q: 0.6, slideTo: 80 },
      { freq: 120, type: "sine", dur: 0.6, gain: 0.18, slideTo: 30, delay: 0.02 }
    ],
    priority: 1,
    duckMusic: { amount: 0.8, ms: 900 }
  },
  gameover: {
    layers: [
      { freq: note(0), type: "triangle", dur: 0.28, gain: 0.14, slideTo: note(-3) },
      { freq: note(-5), type: "triangle", dur: 0.5, gain: 0.14, delay: 0.22, slideTo: note(-12) }
    ],
    priority: 1
  },
  start: {
    layers: [
      { freq: note(0), type: "triangle", dur: 0.12, gain: 0.14 },
      { freq: note(7), type: "triangle", dur: 0.12, gain: 0.14, delay: 0.09 },
      { freq: note(12), type: "sine", dur: 0.28, gain: 0.16, delay: 0.18, slideTo: note(19) }
    ]
  }
};

export function createPolaritySound(options: { context?: Parameters<typeof createGameSound>[0]["context"] } = {}): GameSound<PolaritySound> {
  return createGameSound<PolaritySound>({
    cues: CUES,
    bpm: BPM,
    noiseSeed: 0x504f4c52,
    ...(options.context ? { context: options.context } : {}),
    sequence: (n, at, eighth, voice) => {
      voice({ type: "triangle", freq: note(ARP[n % ARP.length] as number), at, dur: 0.9 * eighth, gain: 0.06 });
      if (n % 2 === 0) voice({ type: "sine", freq: note(BASS[(n / 2) % BASS.length] as number), at, dur: 1.8 * eighth, gain: 0.09 });
    }
  });
}