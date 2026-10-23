/**
 * Drift & Deliver port: procedural WebAudio (this port's own sound, synthesised in code; no samples, no original audio).
 * Engine note follows speed, tyres squeal while drifting, nitro adds a rushing noise, pickups chime and traffic hits thud.
 * The context is only created from a user gesture (`resume`) so autoplay policies and headless runs stay quiet.
 */
import { AudioContextManager } from "@aura3d/engine/audio";

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

export interface PortAudio {
  resume(): void;
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

export function createAudio(): PortAudio {
  const manager = new AudioContextManager();
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
    if (typeof AudioContext === "undefined") return;
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
      start();
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    update(car, throttle, dt) {
      if (!ctx || !engineA || !engineB || !engineGainNode || !squeal || !rush) return;
      const f = engineFreq(car.speed, car.boosting);
      ramp(engineA.frequency, f, dt);
      ramp(engineB.frequency, f * 1.503, dt);
      ramp(engineGainNode.gain, engineGain(car.speed, throttle), dt);
      ramp(squeal.gain, squealGain(car.drifting, car.speed), dt);
      ramp(rush.gain, rushGain(car.boosting, car.speed), dt);
    },
    chime(kind, combo) {
      if (!ctx || !master) return;
      const notes = chimeNotes(kind, combo);
      notes.forEach((hz, i) => {
        const o = ctx!.createOscillator();
        const g = ctx!.createGain();
        o.type = kind === "heart" ? "triangle" : "sine";
        o.frequency.value = hz;
        const t = ctx!.currentTime + i * 0.065;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g).connect(master!);
        o.start(t);
        o.stop(t + 0.3);
      });
    },
    thud() {
      if (!ctx || !master || !noise) return;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 260;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      src.connect(f).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.4);
    },
    setMuted(value) {
      muted = value;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.03);
      return muted;
    }
  };
}
