/**
 * Runner-game audio: a thin wrapper over the `@aura3d/engine/audio` synth kit. One cue per game event, an optional
 * step-sequenced music bed, silent until the first user gesture calls `unlock()`. Effects are triggered from state
 * diffs the renderer observes (`SoundDiff`), never from the simulation; the noise buffer is seeded, never Math.random.
 */
import { createCueBank, createStepSequencer, type CueSpec, type StepSequencer, type StepSequencerOptions, type SynthContext, type SynthCueBank } from "@aura3d/engine/audio";

/** One sound event derived from a sim-state diff; `level` carries combo/phrase context to the cue layers. */
export interface SoundEvent<S extends string> {
  sound: S;
  level: number;
}

/** The state-diff contract every game's `audio.ts` implements (pure, unit-tested). */
export type SoundDiff<F, S extends string> = (prev: F | null, next: F) => SoundEvent<S>[];

export interface GameSoundOptions<S extends string> {
  readonly cues: Record<S, CueSpec>;
  readonly bpm?: number;
  /** Music bed; omit for games that schedule their own notes (e.g. from sim beat diffs). */
  readonly sequence?: StepSequencerOptions["step"];
  readonly stepsPerBeat?: number;
  readonly noiseSeed?: number;
  /** For tests and offline rendering; the game lets the shared AudioContextManager create the real one. */
  readonly context?: SynthContext;
}

export class GameSound<S extends string> {
  private readonly bank: SynthCueBank<S>;
  private music: StepSequencer | null = null;

  constructor(private readonly options: GameSoundOptions<S>) {
    this.bank = createCueBank<S>({ cues: options.cues, noiseSeed: options.noiseSeed ?? 0x2f6e2b1, muteKey: false, ...(options.context ? { context: options.context } : {}) });
  }

  get muted(): boolean {
    return this.bank.muted;
  }

  setMuted(value: boolean): void {
    this.bank.setMuted(value);
  }

  /** Must be called from a user gesture (first pointer/key). Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (!(await this.bank.unlock())) return;
    this.startMusic();
  }

  play(sound: S, level = 0): void {
    this.bank.play(sound, { level });
  }

  /** Music is loudest while playing and dips on the splash and game-over cards. */
  setIntensity(level: "title" | "play" | "over"): void {
    this.setMusicLevel(level === "play" ? 0.1 : level === "title" ? 0.045 : 0.02);
  }

  setMusicLevel(level: number): void {
    this.bank.setMusicLevel(level);
  }

  setBpm(bpm: number): void {
    this.music?.setBpm(bpm);
  }

  /** Pause the whole audio graph (hidden tab / pause). The context clock stands still while suspended, so no notes pile up. */
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
    this.music?.stop();
    this.music = null;
    this.bank.dispose();
  }

  private startMusic(): void {
    if (this.music || !this.options.sequence) return;
    this.setIntensity("title");
    this.music = createStepSequencer(this.bank as unknown as SynthCueBank<string>, {
      bpm: this.options.bpm ?? 120,
      ...(this.options.stepsPerBeat !== undefined ? { stepsPerBeat: this.options.stepsPerBeat } : {}),
      step: this.options.sequence
    });
    this.music.start();
  }
}

export function createGameSound<S extends string>(options: GameSoundOptions<S>): GameSound<S> {
  return new GameSound(options);
}