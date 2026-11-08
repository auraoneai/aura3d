/**
 * Beat Hopper audio: a 132 BPM synth built directly on `@aura3d/engine/audio`'s `createCueBank`.
 *
 * Kit gap (reported to the parent): runner-kit `createGameSound` starts a wall-clock `createStepSequencer` on unlock;
 * §3.6 requires music scheduled from sim `beatIndex` diffs, never wall-clock. So this file uses the cue bank directly
 * and schedules the 8-step bass + arp voices on `bank.voice` whenever the sim's beat advances. The context clock is
 * only the anchor for "now"; note spacing and step order come exclusively from the sim.
 *
 * Cues are derived from state diffs (`diffSounds`, pure and unit tested), never fired from the sim. Silent until the
 * first user gesture calls `unlock()`. Intensity follows the multiplier through `setMusicLevel`.
 */
import { createCueBank, noteFrom, type CueSpec, type SynthContext, type SynthCueBank } from "@aura3d/engine/audio";
import type { SoundEvent } from "../../../examples/shared/runner-kit/index";
import { CONFIG, type Phase, type Pose } from "./sim";

const note = noteFrom(523.25); // C5
const bassNote = noteFrom(130.81); // C3

/** 8-step patterns, one step per sim beat. */
export const BASS_STEPS = [0, 0, 3, 0, 5, 5, 7, 3] as const;
export const ARP_STEPS = [0, 3, 7, 12, 7, 3, 10, 7] as const;
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export interface FrameState {
  phase: Phase;
  beatIndex: number;
  pose: Pose;
  combo: number;
  mult: number;
  perfect: number;
  good: number;
  miss: number;
  milestones: number;
}

export type BeatSound = "hop" | "duck" | "perfect" | "good" | "miss" | "milestone" | "gameover" | "start";

/** Derives sound events from consecutive simulation states (pure: unit tested). */
export function diffSounds(prev: FrameState | null, next: FrameState): SoundEvent<BeatSound>[] {
  const out: SoundEvent<BeatSound>[] = [];
  if (!prev) return out;
  if (prev.phase !== "playing" && next.phase === "playing") out.push({ sound: "start", level: 0 });
  if (prev.phase !== "gameOver" && next.phase === "gameOver") out.push({ sound: "gameover", level: 0 });
  if (next.phase !== "playing" && next.phase !== "bursting") return out;
  if (next.miss > prev.miss) out.push({ sound: "miss", level: 0 });
  if (next.perfect > prev.perfect) out.push({ sound: "perfect", level: next.combo });
  if (next.good > prev.good) out.push({ sound: "good", level: next.combo });
  if (next.milestones > prev.milestones) out.push({ sound: "milestone", level: 0 });
  if (prev.pose !== "air" && next.pose === "air") out.push({ sound: "hop", level: 0 });
  if (prev.pose !== "duck" && next.pose === "duck") out.push({ sound: "duck", level: 0 });
  return out;
}

const ladder = (level: number): number => note(LADDER[Math.min(LADDER.length - 1, Math.max(0, level))] as number);

export const CUES: Record<BeatSound, CueSpec> = {
  hop: { layers: [{ freq: 340, type: "triangle", dur: 0.14, gain: 0.14, slideTo: 620 }] },
  duck: { layers: [{ freq: 300, type: "sine", dur: 0.14, gain: 0.13, slideTo: 170 }] },
  perfect: {
    layers: ({ level }) => [
      { freq: ladder(level), type: "triangle", dur: 0.18, gain: 0.2, slideTo: ladder(level) * 1.5 },
      { freq: ladder(level) * 2, type: "sine", dur: 0.24, gain: 0.14, delay: 0.02, slideTo: ladder(level) * 3 },
      { kind: "noise", dur: 0.16, gain: 0.05, freq: 4600, type: "highpass", slideTo: 9000 }
    ]
  },
  good: { layers: ({ level }) => [{ freq: ladder(level), type: "triangle", dur: 0.15, gain: 0.16, slideTo: ladder(level) * 1.25 }] },
  miss: {
    layers: [
      { freq: 180, type: "sawtooth", dur: 0.3, gain: 0.2, slideTo: 55 },
      { kind: "noise", dur: 0.24, gain: 0.1, freq: 420, q: 0.7, slideTo: 110 }
    ],
    duckMusic: 0.5
  },
  milestone: {
    layers: [0, 4, 7, 12].map((semis, i) => ({ freq: note(semis), type: "triangle" as const, dur: 0.3, gain: 0.18, delay: 0.06 * i, slideTo: 1.5 * note(semis) }))
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

/** Music bus level for a multiplier: intensity = multiplier (§3.6). */
export const musicLevel = (mult: number): number => 0.035 * Math.max(1, Math.min(CONFIG.MAX_MULT, mult));

export class BeatHopperSound {
  private readonly bank: SynthCueBank<BeatSound>;
  private lastBeat = -1;
  private lastMult = 0;

  constructor(options: { context?: SynthContext } = {}) {
    this.bank = createCueBank<BeatSound>({ cues: CUES, noiseSeed: 0x51a7b3, muteKey: false, ...(options.context ? { context: options.context } : {}) });
  }

  get muted(): boolean {
    return this.bank.muted;
  }
  setMuted(value: boolean): void {
    this.bank.setMuted(value);
  }
  /** Must be called from a user gesture. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    await this.bank.unlock();
  }
  play(sound: BeatSound, level = 0): void {
    this.bank.play(sound, { level });
  }
  setMusicLevel(level: number): void {
    this.bank.setMusicLevel(level);
  }
  /** Beats scheduled since load (QA + tests). */
  beatsScheduled = 0;

  /**
   * One call per rendered frame with the previous and current sim frame: plays diff cues and schedules one bass + arp
   * step per elapsed sim beat. Restart (beat going backwards) re-arms the scheduler without scheduling a burst.
   */
  onFrame(prev: FrameState | null, next: FrameState): void {
    for (const event of diffSounds(prev, next)) this.play(event.sound, event.level);
    if (next.mult !== this.lastMult) {
      this.lastMult = next.mult;
      this.setMusicLevel(next.phase === "playing" || next.phase === "bursting" ? musicLevel(next.mult) : 0.02);
    }
    if (next.beatIndex < this.lastBeat) this.lastBeat = next.beatIndex - 1;
    if (next.phase !== "playing" && next.phase !== "bursting") {
      this.lastBeat = next.beatIndex;
      return;
    }
    const ctx = this.bank.context;
    if (!ctx || !this.bank.running) {
      this.lastBeat = next.beatIndex;
      return;
    }
    const from = Math.max(this.lastBeat + 1, next.beatIndex - 1);
    for (let b = from; b <= next.beatIndex; b++) this.scheduleStep(b, ctx.currentTime + 0.03 + (b - from) * CONFIG.BEAT);
    this.lastBeat = next.beatIndex;
  }

  /** One 8-step pattern position: bass always, arp from x1, octave layer from x3, fifth from x5. */
  private scheduleStep(beat: number, at: number): void {
    const step = ((beat % 8) + 8) % 8;
    const mult = Math.max(1, this.lastMult);
    this.bank.voice({ type: "sine", freq: bassNote(BASS_STEPS[step] as number), at, dur: CONFIG.BEAT * 0.85, gain: 0.1, bus: "music" });
    this.bank.voice({ type: "triangle", freq: note(ARP_STEPS[step] as number), at, dur: CONFIG.BEAT * 0.5, gain: 0.05, bus: "music" });
    if (mult >= 3) this.bank.voice({ type: "sine", freq: note((ARP_STEPS[step] as number) + 12), at, dur: CONFIG.BEAT * 0.4, gain: 0.03, bus: "music" });
    if (mult >= 5) this.bank.voice({ type: "triangle", freq: note((ARP_STEPS[step] as number) + 7), at: at + CONFIG.BEAT / 2, dur: CONFIG.BEAT * 0.3, gain: 0.025, bus: "music" });
    this.beatsScheduled++;
  }

  async suspend(): Promise<void> {
    const ctx = this.bank.context as (SynthContext & { state?: string; suspend?: () => Promise<void> }) | null;
    if (!ctx) return;
    try {
      if (ctx.state === "running") await ctx.suspend?.();
    } catch { /* the context is closed */ }
  }
  async resume(): Promise<void> {
    const ctx = this.bank.context as (SynthContext & { state?: string; resume?: () => Promise<void> }) | null;
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") await ctx.resume?.();
    } catch { /* the context is closed */ }
  }
  dispose(): void {
    this.bank.dispose();
  }
}