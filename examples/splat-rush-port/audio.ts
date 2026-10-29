/**
 * Splat Rush audio: a small synth built on the shared `AudioContextManager` (the repo allows exactly one owner of an
 * AudioContext). Everything is generated here: a bright 132 BPM arpeggio with a sine bass line, and one short effect per
 * game event. Nothing is sampled, no asset is loaded, and `Math.random` is never touched (the simulation's random
 * stream must stay in lock-step with the recorded reference), so the noise buffer uses its own LCG.
 *
 * Effects are triggered from state changes the renderer observes (`SoundEvents.diff`), never from the simulation.
 */
import { createCueBank, createStepSequencer, noteFrom, type CueSpec, type StepSequencer, type SynthContext, type SynthCueBank } from "@aura3d/engine/audio";

const note = noteFrom(523.25); // C5

/** Arpeggio (semitones above C5) and bass (below), one arpeggio step per eighth note. */
const ARP = [0, 7, 4, 9, 7, 12, 9, 4, 2, 9, 7, 11, 9, 5, 4, 0];
const BASS = [-12, -5, -7, -10];
/** Pentatonic ladder used for the gate-match pitch (climbs with the combo). */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

export interface FrameState {
  phase: string;
  lives: number;
  combo: number;
  multiplier: number;
  score: number;
  shieldActive: boolean;
  rainbowTimer: number;
  scoreX2Timer: number;
  playerColorIndex: number;
  /** Next milestone score: it rises by 750 each time one is reached (the sim adds 100 points then). */
  milestone: number;
  perfect: boolean;
}

export type GameSound = "match" | "perfect" | "hit" | "block" | "pickup" | "switch" | "burst" | "gameover" | "start" | "milestone";

/** Derives sound events from consecutive simulation states (pure: unit tested). */
export function diffSounds(prev: FrameState | null, next: FrameState): { sound: GameSound; level: number }[] {
  const out: { sound: GameSound; level: number }[] = [];
  if (!prev) return out;
  if (prev.phase === "splash" && next.phase === "playing") out.push({ sound: "start", level: 0 });
  if (next.phase === "bursting" && prev.phase !== "bursting") out.push({ sound: "burst", level: 0 });
  if (next.phase === "gameOver" && prev.phase !== "gameOver") out.push({ sound: "gameover", level: 0 });
  if (next.phase !== "playing" && next.phase !== "bursting") return out;
  if (next.milestone > prev.milestone) out.push({ sound: "milestone", level: 0 });
  if (next.lives < prev.lives) out.push({ sound: "hit", level: 0 });
  else if (prev.shieldActive && !next.shieldActive) out.push({ sound: "block", level: 0 });
  else if (next.combo > prev.combo) out.push({ sound: next.perfect ? "perfect" : "match", level: next.combo });
  const gainedPickup =
    (next.rainbowTimer > 0 && prev.rainbowTimer <= 0) || (next.shieldActive && !prev.shieldActive) || (next.scoreX2Timer > 0 && prev.scoreX2Timer <= 0);
  if (gainedPickup) out.push({ sound: "pickup", level: 0 });
  else if (next.playerColorIndex !== prev.playerColorIndex && next.combo >= prev.combo && next.lives === prev.lives) out.push({ sound: "switch", level: 0 });
  return out;
}

const ladder = (level: number): number => note(LADDER[Math.min(LADDER.length - 1, Math.max(0, level))] as number);

const CUES: Record<GameSound, CueSpec> = {
  match: { layers: ({ level }) => [{ freq: ladder(level), type: "triangle", dur: 0.16, gain: 0.2, slideTo: ladder(level) * 1.5 }] },
  perfect: {
    layers: ({ level }) => [
      { freq: ladder(level), type: "triangle", dur: 0.18, gain: 0.2, slideTo: ladder(level) * 1.5 },
      { freq: ladder(level) * 2, type: "sine", dur: 0.24, gain: 0.15, delay: 0.02, slideTo: ladder(level) * 3 },
      { kind: "noise", dur: 0.18, gain: 0.06, freq: 4200, type: "highpass", slideTo: 9000 }
    ]
  },
  hit: {
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
  pickup: {
    layers: [
      { freq: 620, type: "sine", dur: 0.22, gain: 0.17, slideTo: 1320 },
      { freq: 930, type: "triangle", dur: 0.25, gain: 0.11, delay: 0.05, slideTo: 1850 }
    ]
  },
  switch: {
    layers: [
      { freq: 330, type: "square", dur: 0.14, gain: 0.1, slideTo: 660 },
      { freq: 495, type: "sine", dur: 0.2, gain: 0.12, delay: 0.06, slideTo: 990 }
    ]
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
  /* the original's milestone arpeggio: four triangle notes 60 ms apart, each sliding up a fifth */
  milestone: {
    layers: [0, 4, 7, 12].map((semis, i) => ({ freq: note(semis), type: "triangle" as const, dur: 0.3, gain: 0.18, delay: 0.06 * i, slideTo: 1.5 * note(semis) }))
  },
  start: {
    layers: [
      { freq: note(0), type: "triangle", dur: 0.12, gain: 0.14 },
      { freq: note(7), type: "triangle", dur: 0.12, gain: 0.14, delay: 0.09 },
      { freq: note(12), type: "sine", dur: 0.28, gain: 0.16, delay: 0.18, slideTo: note(19) }
    ]
  }
};

export class SplatSound {
  private readonly bank: SynthCueBank<GameSound>;
  private music: StepSequencer | null = null;

  /** `context` is for tests and offline rendering; the game lets the shared manager create the real one. */
  constructor(options: { context?: SynthContext } = {}) {
    this.bank = createCueBank<GameSound>({ cues: CUES, noiseSeed: 0x2f6e2b1, muteKey: false, ...(options.context ? { context: options.context } : {}) });
  }

  get muted(): boolean {
    return this.bank.muted;
  }

  set muted(value: boolean) {
    this.bank.setMuted(value);
  }

  /** Must be called from a user gesture (first pointer/key). Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (!(await this.bank.unlock())) return;
    this.startMusic();
  }

  setMuted(muted: boolean): void {
    this.bank.setMuted(muted);
  }

  /** Music is loudest while playing and dips on the splash and game-over cards. */
  setIntensity(level: "title" | "play" | "over"): void {
    this.bank.setMusicLevel(level === "play" ? 0.1 : level === "title" ? 0.045 : 0.02);
  }

  play(sound: GameSound, level = 0): void {
    this.bank.play(sound, { level });
  }

  /** Pause or resume the whole audio graph (the tab is hidden or the game is paused). The music scheduler reads the
   * context clock, which stands still while the context is suspended, so no notes pile up. */
  async suspend(suspended: boolean): Promise<void> {
    const ctx = this.bank.context as (SynthContext & { state?: string; suspend?: () => Promise<void>; resume?: () => Promise<void> }) | null;
    if (!ctx) return;
    try {
      if (suspended && ctx.state === "running") await ctx.suspend?.();
      else if (!suspended && ctx.state === "suspended") await ctx.resume?.();
    } catch { /* the context is closed */ }
  }

  dispose(): void {
    this.music?.stop();
    this.music = null;
    this.bank.dispose();
  }

  private startMusic(): void {
    if (this.music) return;
    this.setIntensity("title");
    this.music = createStepSequencer(this.bank as SynthCueBank<string>, {
      bpm: 132,
      step: (n, at, eighth, voice) => {
        voice({ type: "triangle", freq: note(ARP[n % ARP.length] as number), at, dur: 0.9 * eighth, gain: 0.06 });
        if (n % 2 === 0) voice({ type: "sine", freq: note(BASS[(n / 2) % BASS.length] as number), at, dur: 1.8 * eighth, gain: 0.09 });
      }
    });
    this.music.start();
  }
}
