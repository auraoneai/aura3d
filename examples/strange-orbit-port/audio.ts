/**
 * Presentation-only audio for the port: a catalog space-ambient loop plus synthesized engine hum, wind and event
 * cues, driven from race events and speed. It never touches the simulation. Press M to mute.
 */
import { AudioContextManager } from "@aura3d/engine/audio";

export interface AudioFrame {
  readonly speed: number;
  readonly boosting: boolean;
  readonly drafting: boolean;
  readonly flight: boolean;
  readonly racing: boolean;
}

export interface OrbitAudio {
  unlock(): void;
  toggleMute(): boolean;
  update(frame: AudioFrame, dt: number): void;
  cue(type: string, mult?: number): void;
}

const AMBIENT_URL = new URL("./assets/space-ambient.wav", import.meta.url).href;

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 1337;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

export function createOrbitAudio(): OrbitAudio {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    return { unlock() {}, toggleMute: () => true, update() {}, cue() {} };
  }
  const manager = new AudioContextManager();
  let ctx: AudioContext | undefined;
  let master: GainNode | undefined;
  let built = false;
  let muted = false;
  let humGain: GainNode | undefined;
  let humOsc: OscillatorNode[] = [];
  let humFilter: BiquadFilterNode | undefined;
  let windGain: GainNode | undefined;
  let windFilter: BiquadFilterNode | undefined;
  let boostGain: GainNode | undefined;
  let ambientGain: GainNode | undefined;

  function build(): void {
    if (built) return;
    built = true;
    ctx = manager.context as unknown as AudioContext;
    master = ctx.createGain();
    master.gain.value = 0.7;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(ctx.destination);

    humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 420;
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    humOsc = [0, 1].map((i) => {
      const osc = ctx!.createOscillator();
      osc.type = i === 0 ? "sawtooth" : "triangle";
      osc.frequency.value = 62;
      osc.detune.value = i === 0 ? -7 : 9;
      osc.connect(humFilter!);
      osc.start();
      return osc;
    });
    humFilter.connect(humGain);
    humGain.connect(master);

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 2);
    noise.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    noise.start();

    const boostNoise = ctx.createBufferSource();
    boostNoise.buffer = noiseBuffer(ctx, 2);
    boostNoise.loop = true;
    const boostFilter = ctx.createBiquadFilter();
    boostFilter.type = "highpass";
    boostFilter.frequency.value = 1800;
    boostGain = ctx.createGain();
    boostGain.gain.value = 0;
    boostNoise.connect(boostFilter);
    boostFilter.connect(boostGain);
    boostGain.connect(master);
    boostNoise.start();

    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.34;
    ambientGain.connect(master);
    void fetch(AMBIENT_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((bytes) => ctx!.decodeAudioData(bytes))
      .then((decoded) => {
        const src = ctx!.createBufferSource();
        src.buffer = decoded;
        src.loop = true;
        src.connect(ambientGain!);
        src.start();
      })
      .catch(() => { /* ambient is optional; the synthesized layers still play */ });
  }

  function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  function burst(start: number, dur: number, from: number, to: number, gain: number): void {
    if (!ctx || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur + 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(start);
  }

  return {
    unlock() {
      build();
      void manager.unlock().catch(() => undefined);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
    update(frame, dt) {
      if (!ctx || !humGain || !humFilter || !windGain || !windFilter || !boostGain || ctx.state !== "running") return;
      const k = Math.min(1, Math.max(0, frame.speed / 45));
      const active = frame.racing && !frame.flight;
      const now = ctx.currentTime;
      const ease = Math.min(1, dt * 8);
      const target = (v: AudioParam, value: number, rate = ease) => v.setTargetAtTime(value, now, Math.max(0.02, 0.12 / Math.max(rate, 0.05)));
      target(humGain.gain, active ? 0.05 + 0.1 * k : 0.012);
      target(humFilter.frequency, 260 + 1100 * k + (frame.boosting ? 500 : 0));
      for (const osc of humOsc) target(osc.frequency, 52 + 78 * k + (frame.boosting ? 22 : 0));
      target(windGain.gain, (frame.racing ? 0.03 + 0.2 * k * k : 0.01) * (frame.flight ? 1.4 : 1));
      target(windFilter.frequency, 350 + 1500 * k);
      target(boostGain.gain, frame.boosting ? 0.1 : frame.drafting ? 0.025 : 0);
    },
    cue(type, mult = 1) {
      if (!ctx || !master || ctx.state !== "running") return;
      const t = ctx.currentTime + 0.005;
      switch (type) {
        case "dust": {
          const base = 740 * Math.pow(1.0595, Math.min(12, Math.max(0, Math.round(Math.log2(Math.max(1, mult)) * 3))));
          tone(base, t, 0.22, "sine", 0.1);
          tone(base * 1.5, t + 0.05, 0.3, "sine", 0.07);
          break;
        }
        case "gate": tone(523, t, 0.25, "triangle", 0.1); tone(784, t + 0.09, 0.35, "triangle", 0.1); break;
        case "countdown": case "tick": tone(440, t, 0.16, "square", 0.05); break;
        case "go": tone(880, t, 0.45, "square", 0.07); tone(1320, t + 0.02, 0.5, "triangle", 0.06); break;
        case "jump": tone(300, t, 0.16, "sine", 0.1, 520); break;
        case "land": tone(110, t, 0.22, "sine", 0.18, 45); burst(t, 0.18, 900, 120, 0.12); break;
        case "launch": tone(180, t, 0.5, "sawtooth", 0.06, 680); burst(t, 0.5, 400, 3500, 0.07); break;
        case "stunt": tone(988, t, 0.12, "triangle", 0.08); tone(1318, t + 0.08, 0.2, "triangle", 0.08); break;
        case "hit": burst(t, 0.28, 2500, 90, 0.3); tone(70, t, 0.3, "sine", 0.2, 38); break;
        case "lost": tone(330, t, 0.9, "sawtooth", 0.07, 70); burst(t, 0.9, 1800, 60, 0.18); break;
        case "sling": case "gravity": tone(220, t, 0.55, "sine", 0.1, 880); break;
        case "route": tone(660, t, 0.18, "triangle", 0.07); break;
        case "resonance": tone(587, t, 0.5, "sine", 0.08); tone(880, t, 0.6, "sine", 0.06); break;
        case "lap": case "finish":
          [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.5, "triangle", 0.1));
          break;
        default: break;
      }
    }
  };
}
