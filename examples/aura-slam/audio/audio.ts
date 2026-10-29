/**
 * M-AUDIO: Aura Slam's sound layer, ported from public/toptennis/tennis-audio.js onto the Aura3D synth kit.
 *
 * Same game-facing surface as the original (`init`, `setEnabled`, `tone`, `hit`, `bounce`), same impact maths
 * (energy, distance, surface filter, pan, take choice, playback-rate and gain jitter), same procedural fallback.
 * What changed: the one AudioContext is owned by `AudioContextManager` through the kit's cue bank, first-gesture
 * unlock and the mute key come from the kit, tones are cue-bank cues, and recorded takes play through
 * `SampleSlices`.
 */
import { createCueBank, createSampleSlices, type CueLayer, type CueSpec, type SampleSlices, type SynthContext, type SynthCueBank } from "@aura3d/engine/audio";
import type { ContactPresentation, SimEvent } from "../contract";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export type ImpactKind = "hit" | "bounce";

/** What the original `impact()` derives from a contact before it touches Web Audio. Random draws are separate. */
export interface ImpactShape {
  readonly isHit: boolean;
  readonly energy: number;
  readonly distance: number;
  readonly surfaceGain: number;
  readonly surfaceCutoff: number;
  readonly cutoff: number;
  readonly baseGain: number;
  readonly pan: number;
  /** Rate offset from the shot's pitch, before the +-2.25% jitter. */
  readonly pitchRate: number;
}

type ContactLike = Partial<ContactPresentation> & { speedKph?: number; verticalSpeed?: number; y?: number; x?: number; venue?: string };

/** Pure: contact -> gain/filter/pan. Matches tennis-audio.js `impact()` (the random jitter factors are applied by the caller). */
export function impactShape(kind: ImpactKind, pitch: unknown, contact: ContactLike = {}): ImpactShape {
  const isHit = kind === "hit";
  const energy = isHit ? clamp(finite(contact.speedKph, 100) / 145, 0.22, 1) : clamp(finite(contact.verticalSpeed, 3) / 6, 0.025, 1);
  const distance = clamp((finite(contact.y, 0) + 1.25) / 2.5, 0, 1);
  const surface = contact.venue === "grass" ? { gain: 0.7, cutoff: 2100 } : contact.venue === "clay" ? { gain: 0.88, cutoff: 4400 } : { gain: 1, cutoff: 10000 };
  const baseGain = (isHit ? 0.38 + 0.32 * Math.sqrt(energy) : 0.46 * Math.sqrt(energy) * surface.gain) * (0.76 + distance * 0.24);
  return {
    isHit,
    energy,
    distance,
    surfaceGain: surface.gain,
    surfaceCutoff: surface.cutoff,
    cutoff: isHit ? 11000 : surface.cutoff,
    baseGain,
    pan: clamp(finite(contact.x, 0) * 0.48, -0.65, 0.65),
    pitchRate: isHit ? clamp(finite(pitch, 1) - 1, -0.2, 0.28) * 0.08 : 0
  };
}

/** The damped synthetic impact that covers slow or failed downloads (identical to the original `makeFallback`). */
export function makeImpactFallback(context: SynthContext, kind: ImpactKind): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.13), context.sampleRate);
  const data = buffer.getChannelData(0);
  const hit = kind === "hit";
  let seed = hit ? 739 : 193;
  let noise = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    noise = noise * 0.42 + (seed / 2147483648) * 0.58;
    const attack = Math.min(1, t / 0.0006);
    data[i] = attack * (0.48 * noise * Math.exp(-t / (hit ? 0.009 : 0.006)) + 0.26 * Math.sin(2 * Math.PI * (hit ? 330 : 175) * t) * Math.exp(-t / 0.014));
  }
  return buffer;
}

const TONE_ATTACK = 0.001;

/** Generic tone cue: the sim sends `(freq, duration, type, volume, delay)`; the cue reads them from `params.data`. */
type ToneArgs = readonly [freq: number, duration: number, type: OscillatorType, volume: number, delay: number];

type CueName = "tone" | "crowd" | "applause";

/** Seconds one crowd-bed cue lasts; the bed is re-armed at every point so it never runs dry between rallies. */
export const CROWD_BED_SECONDS = 14;

/** Deterministic clap pattern for the applause cue: `count` short band-passed noise bursts over about 1.6 s. */
export function applauseLayers(level: number): readonly CueLayer[] {
  const count = Math.round(10 + 14 * clamp(level, 0, 1));
  const layers: CueLayer[] = [{ kind: "noise", freq: 1500, q: 0.6, type: "bandpass", dur: 1.8, gain: 0.02 + 0.02 * level, attack: 0.08, loop: true }];
  let seed = 977;
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const r = (seed >>> 0) / 4294967296;
    layers.push({ kind: "noise", freq: 1800 + r * 1600, q: 1.4, type: "bandpass", dur: 0.035, gain: 0.05 + 0.03 * r, delay: (i / count) * 1.5 + r * 0.06 });
  }
  return layers;
}

const cues: Record<CueName, CueSpec> = {
  tone: {
    layers: (params) => {
      const [freq, duration, type, volume, delay] = params.data as ToneArgs;
      return [{ freq, type, dur: duration, gain: volume, delay, attack: TONE_ATTACK }];
    }
  },
  // C14: a low murmur under play (low-passed looping noise) and applause when a point ends.
  crowd: { layers: [{ kind: "noise", freq: 520, q: 0.4, type: "lowpass", dur: CROWD_BED_SECONDS, gain: 0.016, attack: 1.2, loop: true }], maxConcurrent: 2 },
  applause: { layers: (params) => applauseLayers(params.level), maxConcurrent: 2, cooldownMs: 600 }
};

/** Umpire call for a point or serve outcome (C14), or null when the umpire says nothing. */
export function umpireCall(event: SimEvent): string | null {
  if (event.type === "point") {
    const call = String((event as { call?: unknown }).call ?? "");
    if (call === "OUT") return "Out";
    if (call === "NET") return "Net";
    if (call === "DOUBLE FAULT") return "Double fault";
    if (call === "ACE") return "Ace";
    return null;
  }
  if (event.type === "serve" && (event as { stage?: unknown }).stage === "result") {
    const result = String(((event as { attempt?: { result?: unknown } }).attempt?.result) ?? "");
    if (result === "let") return "Let";
    if (result === "fault") return "Fault";
  }
  return null;
}

/** Spoken calls go through the browser's speech synthesis when it exists; a test can inject its own speaker. */
export type Speaker = (text: string) => void;
const browserSpeaker: Speaker | null = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"
  ? (text) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1; utterance.pitch = 0.9; utterance.volume = 0.7;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch { /* speech unavailable */ }
    }
  : null;

export interface TennisAudioOptions {
  /** Uniform [0,1) draws for rate/gain jitter and take choice. Default `Math.random` (audio never feeds the simulation). */
  readonly random?: () => number;
  /** URLs of the two sprite sheets. Defaults to the copies under `examples/aura-slam/assets/audio/`. */
  readonly assets?: { readonly hit: string; readonly bounce: string };
  readonly fetch?: (url: string) => Promise<{ readonly ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;
  /** Inject a context (tests, offline rendering). Production uses the manager's own context. */
  readonly context?: SynthContext;
  /** `KeyboardEvent.code` for the kit's mute key. Default `false`: the original game has no mute key (its sound button
   * toggles) and players can rebind actions, so enabling one is the shell's decision. */
  readonly muteKey?: string | false;
  readonly now?: () => number;
  /** Crowd bed, applause and umpire calls (C14). Default false, so the ported surface keeps the original's sounds; the shell turns it on. */
  readonly ambience?: boolean;
  /** Umpire voice when `ambience` is on; defaults to the browser's speech synthesis (null disables calls). */
  readonly speak?: Speaker | null;
}

export interface TennisAudio {
  /** Create/resume the audio graph. Call from a user gesture; no-op while disabled. */
  init(): void;
  setEnabled(value: boolean): void;
  readonly enabled: boolean;
  tone(freq: number, duration: number, type?: OscillatorType, volume?: number, delay?: number): void;
  hit(pitch?: number, contact?: ContactLike): void;
  bounce(contact?: ContactLike): void;
  /** The two-note point jingle (`won` rising, otherwise falling), as game.js `playPointSound`. */
  pointSound(won: boolean): void;
  /** Route a simulation event: `tone`, `hit`, `bounce`, `pointSound`, `point` (applause, crowd, call), `serve` (let/fault call). */
  handleEvent(event: SimEvent): void;
  /** Venue for the ambience: the Moon has no crowd. */
  setVenue(venue: string): void;
  /** Start the crowd bed (match start); a no-op while disabled or on the Moon. */
  crowd(): void;
  /** Wire the kit's first-gesture unlock (and the mute key if enabled) onto a target; returns a remover. */
  install(target?: Parameters<SynthCueBank["install"]>[0], options?: Parameters<SynthCueBank["install"]>[1]): () => void;
  readonly bank: SynthCueBank<CueName>;
  readonly slices: SampleSlices<ImpactKind>;
  dispose(): void;
}

const SPRITE_OFFSETS = [0, 0.3, 0.6] as const;
const SPRITE_SECONDS = 0.24;

export function createTennisAudio(options: TennisAudioOptions = {}): TennisAudio {
  const random = options.random ?? Math.random;
  const base = (name: string): string => new URL(`../assets/audio/${name}`, import.meta.url).href;
  const assets = options.assets ?? { hit: base("racket.wav"), bounce: base("bounce.wav") };
  const bank = createCueBank<CueName>({
    cues,
    ...(options.context ? { context: options.context } : {}),
    masterGain: 0.9,
    sfxGain: 1,
    muteKey: options.muteKey ?? false,
    ...(options.now ? { now: options.now } : {})
  });
  const slices = createSampleSlices<ImpactKind>(bank, {
    sprites: {
      hit: { url: assets.hit, offsets: SPRITE_OFFSETS, duration: SPRITE_SECONDS, fallback: (ctx) => makeImpactFallback(ctx, "hit") },
      bounce: { url: assets.bounce, offsets: SPRITE_OFFSETS, duration: SPRITE_SECONDS, fallback: (ctx) => makeImpactFallback(ctx, "bounce") }
    },
    random,
    ...(options.fetch ? { fetch: options.fetch } : {})
  });
  // Fetch while the menu is open; creating/resuming the context stays inside a user gesture.
  void slices.preload();
  let enabled = true;
  let venue = "hard";
  const ambience = options.ambience === true;
  const speak = !ambience ? null : options.speak === undefined ? browserSpeaker : options.speak;
  const crowdOn = (): boolean => ambience && enabled && venue !== "moon";
  const crowd = (): void => { if (crowdOn()) bank.play("crowd", {}); };

  const init = (): void => {
    if (!enabled) return;
    bank.setMuted(false);
    // The graph exists as soon as unlock() starts, so the fallback impacts are ready for the very first contact.
    const unlocking = bank.unlock();
    slices.buildFallbacks();
    void unlocking.then((ok) => { if (ok) { crowd(); return slices.prepare(); } return undefined; });
  };

  const impact = (kind: ImpactKind, pitch: unknown, contact: ContactLike = {}): void => {
    if (!enabled || !bank.running) return;
    const shape = impactShape(kind, pitch, contact);
    // Draw order matches the original: playback-rate jitter, gain jitter, then (inside play) the take choice.
    const rate = 1 + (random() - 0.5) * 0.045 + shape.pitchRate;
    const gain = shape.baseGain * (0.96 + random() * 0.08);
    slices.play(kind, { rate, lowpass: shape.cutoff, q: 0.5, gain, pan: shape.pan });
  };

  const tone = (freq: number, duration: number, type: OscillatorType = "sine", volume = 0.04, delay = 0): void => {
    if (!enabled) return;
    bank.play("tone", { data: [freq, duration, type, volume, delay] satisfies ToneArgs });
  };

  const pointSound = (won: boolean): void => {
    if (won) {
      tone(410, 0.12, "triangle", 0.045);
      tone(620, 0.18, "triangle", 0.04, 0.09);
    } else {
      tone(240, 0.18, "sine", 0.035);
      tone(170, 0.22, "sine", 0.03, 0.1);
    }
  };

  return {
    init,
    setEnabled(value: boolean): void {
      enabled = !!value;
      if (!enabled) {
        bank.setMuted(true);
        // Stop sounding takes as well, so unmuting cannot resurrect them.
        slices.stopAll();
      } else {
        init();
        bank.setMuted(false);
      }
    },
    get enabled(): boolean {
      return enabled;
    },
    tone,
    hit: (pitch = 1, contact) => impact("hit", pitch, contact),
    bounce: (contact) => impact("bounce", 1, contact),
    pointSound,
    handleEvent(event: SimEvent): void {
      if (event.type === "tone") {
        const [freq, duration, type, volume, delay] = event.args as unknown[];
        tone(freq as number, duration as number, type as OscillatorType | undefined, volume as number | undefined, delay as number | undefined);
      } else if (event.type === "hit") impact("hit", event.args?.[0], event.contact);
      else if (event.type === "bounce") impact("bounce", 1, event.contact);
      else if (event.type === "pointSound") pointSound(event.won);
      else if (event.type === "point") {
        if (crowdOn()) {
          bank.play("applause", { level: (event as { winner?: string }).winner === "player" ? 1 : 0.55 });
          crowd();
        }
        const call = umpireCall(event);
        if (call && enabled) speak?.(call);
      } else if (event.type === "serve") {
        const call = umpireCall(event);
        if (call && enabled) speak?.(call);
      }
    },
    setVenue(next: string): void { venue = next || "hard"; },
    crowd,
    install: (target, installOptions) => bank.install(target, installOptions),
    bank,
    slices,
    dispose(): void {
      slices.stopAll();
      bank.dispose();
    }
  };
}
