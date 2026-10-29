/**
 * Drift & Deliver port: procedural WebAudio (this port's own sound, synthesised in code; no samples, no original audio).
 * Engine note follows speed, tyres squeal while drifting, nitro adds a rushing noise, pickups chime and traffic hits thud.
 * The context is only created from a user gesture (`resume`) so autoplay policies and headless runs stay quiet.
 */
import { AudioContextManager, createCueBank, type CueSpec } from "@aura3d/engine/audio";

export interface AudioCar {
  speed: number;
  drifting: boolean;
  boosting: boolean;
  /** nitro tank 0..1 */
  boost: number;
}

/** Fundamental of the engine note, Hz: idle burble at rest, rising with speed, higher again under nitro. */
export function engineFreq(speed: number, boosting: boolean): number {
  const v = Math.min(60, Math.abs(speed));
  return 46 + 2.6 * v + (boosting ? 18 : 0);
}

export function engineGain(speed: number, throttle: boolean): number {
  const v = Math.min(60, Math.abs(speed)) / 60;
  return 0.05 + 0.07 * v + (throttle ? 0.03 : 0);
}

/** Tyre squeal level: only while drifting, louder with speed. */
export function squealGain(drifting: boolean, speed: number): number {
  return drifting ? Math.min(0.11, 0.015 + 0.0032 * Math.abs(speed)) : 0;
}

export function rushGain(boosting: boolean, speed: number): number {
  return boosting ? Math.min(0.1, 0.03 + 0.0012 * Math.abs(speed)) : 0;
}

/** Pickup chime notes (Hz), rising with the combo. */
export function chimeNotes(kind: "coin" | "star" | "heart", combo: number): number[] {
  const base = 660 * Math.pow(2, Math.min(7, Math.max(0, combo - 1)) / 12);
  if (kind === "star") return [base, base * 1.25, base * 1.5, base * 2];
  if (kind === "heart") return [base * 0.75, base * 1.125];
  return [base, base * 1.5];
}

const chimeCue = (kind: "coin" | "star" | "heart"): CueSpec => ({
  layers: ({ level }) =>
    chimeNotes(kind, level).map((freq, i) => ({ freq, type: kind === "heart" ? ("triangle" as const) : ("sine" as const), dur: 0.28, gain: 0.16, attack: 0.012, delay: i * 0.065 }))
});

/** One-shot effects on the shared cue bank; the continuous engine, squeal and rush beds below stay hand-built (they ramp live parameters). */
export const CUES = {
  chimeCoin: chimeCue("coin"),
  chimeStar: chimeCue("star"),
  chimeHeart: chimeCue("heart"),
  thud: { layers: [{ kind: "noise" as const, type: "lowpass" as const, freq: 260, q: 1, gain: 0.6, dur: 0.35 }] } satisfies CueSpec
};

export interface PortAudio {
  resume(): void;
  /**
   * Pause, blur or a hidden tab: ramp the engine, squeal and nitro beds to silence and suspend the context (rAF stops
   * in a hidden tab, so the last ramp targets would otherwise hold). `resume()` brings it back.
   */
  suspend(): void;
  /** Current gain targets of the continuous beds (tests and QA). */
  beds(): { engine: number; squeal: number; rush: number } | null;
  update(car: AudioCar, throttle: boolean, dt: number): void;
  chime(kind: "coin" | "star" | "heart", combo: number): void;
  thud(): void;
  setMuted(muted: boolean): boolean;
  readonly muted: boolean;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let a = 0x2f6e2b1;
  for (let i = 0; i < data.length; i++) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    data[i] = (a / 4294967296) * 2 - 1;
  }
  return buffer;
}

export function createAudio(options: { context?: AudioContext } = {}): PortAudio {
  const manager = new AudioContextManager(options.context ? { context: options.context as never } : {});
  const bank = createCueBank({ cues: CUES, manager, masterGain: 0.8, sfxGain: 1, noiseSeed: 0x2f6e2b1, muteKey: false });
  let suspended = false;
  const targets = { engine: 0, squeal: 0, rush: 0 };
  let ctx: AudioContext | undefined;
  let master: GainNode | undefined;
  let muted = false;
  let engineA: OscillatorNode | undefined;
  let engineB: OscillatorNode | undefined;
  let engineGainNode: GainNode | undefined;
  let squeal: GainNode | undefined;
  let rush: GainNode | undefined;
  let noise: AudioBuffer | undefined;

  const start = (): void => {
    if (ctx) return;
    if (!options.context && typeof AudioContext === "undefined") return;
    ctx = manager.context as unknown as AudioContext;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    noise = noiseBuffer(ctx, 2);

    engineGainNode = ctx.createGain();
    engineGainNode.gain.value = 0;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 520;
    engineA = ctx.createOscillator();
    engineA.type = "sawtooth";
    engineB = ctx.createOscillator();
    engineB.type = "square";
    engineA.connect(lowpass);
    engineB.connect(lowpass);
    lowpass.connect(engineGainNode).connect(master);
    engineA.start();
    engineB.start();

    const loopNoise = (type: BiquadFilterType, freq: number, q: number): GainNode => {
      const src = ctx!.createBufferSource();
      src.buffer = noise!;
      src.loop = true;
      const f = ctx!.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx!.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master!);
      src.start();
      return g;
    };
    squeal = loopNoise("bandpass", 2300, 6);
    rush = loopNoise("highpass", 1400, 0.7);
  };

  const ramp = (param: AudioParam, value: number, dt: number): void => {
    if (!ctx) return;
    param.setTargetAtTime(value, ctx.currentTime, Math.max(0.02, dt * 2));
  };

  return {
    get muted() {
      return muted;
    },
    resume() {
      suspended = false;
      start();
      void bank.unlock();
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    suspend() {
      suspended = true;
      if (!ctx || !engineGainNode || !squeal || !rush) return;
      for (const g of [engineGainNode, squeal, rush]) {
        g.gain.cancelScheduledValues?.(ctx.currentTime);
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      }
      targets.engine = targets.squeal = targets.rush = 0;
      const c = ctx;
      // let the 30 ms ramp land before the clock stops
      setTimeout(() => { if (suspended && c.state === "running") void c.suspend(); }, 150);
    },
    beds() {
      return ctx ? { ...targets } : null;
    },
    update(car, throttle, dt) {
      if (suspended || !ctx || !engineA || !engineB || !engineGainNode || !squeal || !rush) return;
      const f = engineFreq(car.speed, car.boosting);
      ramp(engineA.frequency, f, dt);
      ramp(engineB.frequency, f * 1.503, dt);
      targets.engine = engineGain(car.speed, throttle);
      targets.squeal = squealGain(car.drifting, car.speed);
      targets.rush = rushGain(car.boosting, car.speed);
      ramp(engineGainNode.gain, targets.engine, dt);
      ramp(squeal.gain, targets.squeal, dt);
      ramp(rush.gain, targets.rush, dt);
    },
    chime(kind, combo) {
      bank.play(kind === "star" ? "chimeStar" : kind === "heart" ? "chimeHeart" : "chimeCoin", { level: combo });
    },
    thud() {
      bank.play("thud");
    },
    setMuted(value) {
      muted = value;
      bank.setMuted(value);
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.03);
      return muted;
    }
  };
}
