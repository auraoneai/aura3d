import { describe, expect, it } from "vitest";
import { createCueBank } from "../../../packages/audio/src/synth";
import { CUES, type GameSound } from "../../../examples/roadster-hours-port/audio";
import { createFakeContext } from "../audio-synth/mockContext";

/** The port's original hand-written effects, kept verbatim as the reference the cue-bank cues must match. */
const A2 = 110;
const note = (semitones: number): number => A2 * Math.pow(2, semitones / 12);
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
interface ToneSpec { freq: number; type?: OscillatorType; dur?: number; gain?: number; slideTo?: number; delay?: number }
interface NoiseSpec { dur?: number; gain?: number; freq?: number; q?: number; type?: BiquadFilterType; slideTo?: number }

function oldTone(ctx: any, sfx: any, spec: ToneSpec): void {
  const { freq, type = "sine", dur = 0.15, gain = 0.2, slideTo, delay = 0 } = spec;
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(sfx);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}

function oldNoiseBuffer(ctx: any): { data: Float32Array } {
  const len = Math.floor(1.5 * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lcg = 0x1badf00d;
  for (let i = 0; i < len; i++) {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    data[i] = lcg / 0x80000000 - 1;
  }
  return buffer;
}

function oldNoiseHit(ctx: any, sfx: any, noise: unknown, spec: NoiseSpec): void {
  const { dur = 0.2, gain = 0.15, freq = 1200, q = 1, type = "bandpass", slideTo } = spec;
  const at = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, at);
  filter.Q.value = q;
  if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfx);
  src.start(at);
  src.stop(at + dur + 0.02);
}

function oldPlay(ctx: any, sfx: any, noise: unknown, sound: GameSound): void {
  const tone = (spec: ToneSpec) => oldTone(ctx, sfx, spec);
  const noiseHit = (spec: NoiseSpec) => oldNoiseHit(ctx, sfx, noise, spec);
  switch (sound) {
    case "beep":
      tone({ freq: 440, type: "square", dur: 0.16, gain: 0.1 });
      break;
    case "go":
      tone({ freq: 880, type: "square", dur: 0.34, gain: 0.12 });
      tone({ freq: 1320, type: "triangle", dur: 0.4, gain: 0.08, delay: 0.02 });
      break;
    case "gate":
      tone({ freq: 660, type: "triangle", dur: 0.16, gain: 0.13 });
      tone({ freq: 990, type: "sine", dur: 0.28, gain: 0.12, delay: 0.07 });
      break;
    case "cell":
      tone({ freq: 1040, type: "sine", dur: 0.14, gain: 0.11, slideTo: 1560 });
      break;
    case "crash":
      tone({ freq: 160, type: "sawtooth", dur: 0.4, gain: 0.18, slideTo: 48 });
      noiseHit({ dur: 0.42, gain: 0.22, freq: 700, q: 0.6, slideTo: 90 });
      break;
    case "landing":
      tone({ freq: 90, type: "sine", dur: 0.2, gain: 0.2, slideTo: 40 });
      noiseHit({ dur: 0.16, gain: 0.08, freq: 500, q: 0.8, slideTo: 140 });
      break;
    case "nearmiss":
      noiseHit({ dur: 0.3, gain: 0.09, freq: 1200, q: 1.4, slideTo: 3200 });
      break;
    case "combo":
      tone({ freq: note(PENTA[5]!), type: "triangle", dur: 0.16, gain: 0.12 });
      tone({ freq: note(PENTA[7]!), type: "triangle", dur: 0.2, gain: 0.12, delay: 0.08 });
      break;
    case "clear":
      tone({ freq: note(PENTA[4]!), type: "sine", dur: 0.12, gain: 0.1, slideTo: note(PENTA[6]!) });
      break;
    case "boost":
      noiseHit({ dur: 0.6, gain: 0.12, freq: 400, q: 0.7, slideTo: 3600 });
      tone({ freq: 220, type: "sawtooth", dur: 0.5, gain: 0.07, slideTo: 880 });
      break;
    case "finish":
      [0, 4, 7, 12].forEach((s, i) => tone({ freq: note(12 + s), type: "triangle", dur: 0.5, gain: 0.12, delay: i * 0.12 }));
      break;
  }
}

/** The port's first eleven sounds (compared against the hand-written originals above). */
const ORIGINAL = ["beep", "boost", "cell", "clear", "combo", "crash", "finish", "gate", "go", "landing", "nearmiss"] as const;
/** Cues added for events that were silent (no hand-written original to compare against). */
const ADDED = ["landed", "scrape", "impact", "overheat", "trick", "roll", "hop", "trailer", "shortcut", "nitro", "perfect", "shockwave", "miss", "flare"] as const;

const norm = (rows: unknown[][]) => rows.map((r) => r.map((v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v)));
const calls = (list: Array<{ node: string; method: string; args: unknown[] }>, node: string) => norm(list.filter((c) => c.node === node).map((c) => [c.method, ...c.args]));

describe("Roadster Hours effects on the synth cue kit (parameter-level equivalence; not listened to)", () => {
  for (const sound of ORIGINAL as readonly GameSound[]) {
    it(`${sound} has the original oscillators, noise filters, envelopes, timing and noise samples`, async () => {
      const ref = createFakeContext("running");
      ref.ctx.currentTime = 0.5;
      const oldBuffer = oldNoiseBuffer(ref.ctx);
      oldPlay(ref.ctx, ref.ctx.destination, oldBuffer, sound);

      const next = createFakeContext("running");
      next.ctx.currentTime = 0.5;
      const bank = createCueBank({ cues: CUES, context: next.ctx, masterGain: 0.85, sfxGain: 0.9, noiseSeed: 0x1badf00d, muteKey: false });
      await bank.unlock();
      const base = next.calls.length;
      expect(bank.play(sound)).toBe(true);
      const newCalls = next.calls.slice(base);

      const refOsc = ref.ofKind("osc"), newOsc = next.ofKind("osc");
      expect(newOsc).toHaveLength(refOsc.length);
      refOsc.forEach((o, i) => {
        expect(newOsc[i]!.type).toBe(o.type);
        expect(newOsc[i]!.started[0]).toBeCloseTo(o.started[0]!, 9);
        expect(newOsc[i]!.stopped[0]).toBeCloseTo(o.stopped[0]!, 9);
      });
      expect(calls(newCalls, "gain.gain")).toEqual(calls(ref.calls, "gain.gain"));
      expect(calls(newCalls, "osc.frequency")).toEqual(calls(ref.calls, "osc.frequency"));
      expect(calls(newCalls, "filter.frequency")).toEqual(calls(ref.calls, "filter.frequency"));

      const refFilters = ref.ofKind("filter"), newFilters = next.ofKind("filter");
      expect(newFilters).toHaveLength(refFilters.length);
      refFilters.forEach((f, i) => {
        expect(newFilters[i]!.type).toBe(f.type);
        expect(newFilters[i]!.Q.value).toBe(f.Q.value);
      });

      const refSources = ref.ofKind("source"), newSources = next.ofKind("source");
      expect(newSources).toHaveLength(refSources.length);
      refSources.forEach((src, i) => {
        expect(newSources[i]!.started[0]).toBeCloseTo(src.started[0]!, 9);
        expect(newSources[i]!.stopped[0]).toBeCloseTo(src.stopped[0]!, 9);
        expect(newSources[i]!.loop).toBe(false);
        const newBuffer = newSources[i]!.buffer as { data: Float32Array };
        expect(Array.from(newBuffer.data)).toEqual(Array.from(oldBuffer.data.subarray(0, newBuffer.data.length)));
      });
    });
  }

  it("keeps every original sound and adds the event cues of audit C6", () => {
    expect(Object.keys(CUES).sort()).toEqual([...ORIGINAL, ...ADDED].sort());
  });
});
