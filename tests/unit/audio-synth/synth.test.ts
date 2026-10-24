import { describe, expect, it } from "vitest";
import { createCueBank, createStepSequencer, createToneLoop, createNoiseSource, midiToHz, noteFrom, scaleSemitones, SCALES, type SynthScheduler } from "../../../packages/audio/src/synth";
import { createFakeContext, FakeTarget } from "./mockContext";

const cues = {
  blip: { layers: [{ freq: 440, dur: 0.1, gain: 0.2, slideTo: 880 }, { kind: "noise" as const, dur: 0.1, gain: 0.05, freq: 2000, slideTo: 4000 }] },
  rising: { layers: ({ level }: { level: number }) => [{ freq: 200 * (1 + level), dur: 0.1 }] },
  limited: { layers: [{ freq: 300, dur: 1 }], cooldownMs: 100, maxConcurrent: 2 },
  vip: { layers: [{ freq: 500, dur: 1 }], priority: 1, duckMusic: { amount: 0.5, ms: 200 } }
};

async function unlocked(options: Parameters<typeof createCueBank>[0] extends infer _ ? Record<string, unknown> : never = {}) {
  const f = createFakeContext("suspended");
  let clock = 0;
  const bank = createCueBank({ cues, context: f.ctx, now: () => clock, ...options });
  await bank.unlock();
  return { f, bank, tick: (ms: number) => { clock += ms; } };
}

describe("synth notes", () => {
  it("converts midi and semitones", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(noteFrom(100)(12)).toBeCloseTo(200, 6);
    expect(scaleSemitones(SCALES.pentatonic, 5)).toBe(12);
    expect(scaleSemitones(SCALES.pentatonic, -1)).toBe(-3);
  });
  it("noise is deterministic and in range", () => {
    const a = createNoiseSource(7);
    const b = createNoiseSource(7);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= -1 && x < 1)).toBe(true);
  });
});

describe("SynthCueBank", () => {
  it("is silent until unlocked, then resumes the context through the manager", async () => {
    const f = createFakeContext("suspended");
    const bank = createCueBank({ cues, context: f.ctx });
    expect(bank.play("blip")).toBe(false);
    expect(await bank.unlock()).toBe(true);
    expect(f.ctx.resumed).toBe(1);
    expect(bank.play("blip")).toBe(true);
  });

  it("builds tone and noise layers with envelopes and glides", async () => {
    const { f, bank } = await unlocked();
    bank.play("blip");
    expect(f.ofKind("osc")).toHaveLength(1);
    expect(f.ofKind("source")).toHaveLength(1);
    const osc = f.ofKind("osc")[0]!;
    expect(osc.started).toEqual([0]);
    expect(osc.stopped[0]).toBeCloseTo(0.13, 6);
    const slide = f.calls.find((c) => c.node === "osc.frequency" && c.method === "expRamp");
    expect(slide?.args[0]).toBe(880);
    const filterSlide = f.calls.find((c) => c.node === "filter.frequency" && c.method === "expRamp");
    expect(filterSlide?.args[0]).toBe(4000);
  });

  it("noise layers ramp up over `attack` and loop the buffer only when asked", async () => {
    const f = createFakeContext("running");
    const bank = createCueBank({
      context: f.ctx,
      cues: {
        plain: { layers: [{ kind: "noise" as const, dur: 0.5, gain: 0.1 }] },
        swell: { layers: [{ kind: "noise" as const, dur: 0.5, gain: 0.1, attack: 0.125, loop: true }] }
      }
    });
    await bank.unlock();
    bank.play("plain");
    const plainSource = f.ofKind("source")[0]!;
    expect(plainSource.loop).toBe(false);
    const plainGain = f.calls.filter((c) => c.node === "gain.gain" && c.method === "setValueAtTime" && c.args[0] === 0.1);
    expect(plainGain).toHaveLength(1);
    f.calls.length = 0;
    bank.play("swell");
    const swellSource = f.ofKind("source")[1]!;
    expect(swellSource.loop).toBe(true);
    const gainCalls = f.calls.filter((c) => c.node === "gain.gain");
    expect(gainCalls).toEqual([
      { node: "gain.gain", method: "setValueAtTime", args: [0.0001, 0] },
      { node: "gain.gain", method: "expRamp", args: [0.1, 0.125] },
      { node: "gain.gain", method: "expRamp", args: [0.0001, 0.5] }
    ]);
  });

  it("passes level to layer functions and scales pitch and gain", async () => {
    const { f, bank } = await unlocked();
    bank.play("rising", { level: 3, pitch: 2 });
    const set = f.calls.find((c) => c.node === "osc.frequency" && c.method === "setValueAtTime");
    expect(set?.args[0]).toBe(200 * 4 * 2);
  });

  it("mutes and unmutes the master bus without rebuilding the graph", async () => {
    const { f, bank } = await unlocked();
    bank.setMuted(true);
    expect(bank.play("blip")).toBe(false);
    expect(f.calls.some((c) => c.node === "gain.gain" && c.method === "setTarget" && c.args[0] === 0)).toBe(true);
    expect(bank.toggleMute()).toBe(false);
    expect(bank.play("blip")).toBe(true);
  });

  it("honours cooldown and per-cue concurrency", async () => {
    const { bank, tick } = await unlocked();
    expect(bank.play("limited")).toBe(true);
    expect(bank.play("limited")).toBe(false);
    tick(150);
    expect(bank.play("limited")).toBe(true);
    tick(150);
    expect(bank.play("limited")).toBe(false);
  });

  it("enforces the voice budget but lets priority cues use 1.5x", async () => {
    const { bank, tick } = await unlocked({ maxVoices: 4 });
    for (let i = 0; i < 4; i++) { expect(bank.play("rising")).toBe(true); tick(1); }
    expect(bank.play("rising")).toBe(false);
    expect(bank.play("vip")).toBe(true);
  });

  it("ducks the music bus for a cue with duckMusic and restores the remembered level", async () => {
    const { f, bank } = await unlocked();
    bank.setMusicLevel(0.1);
    f.calls.length = 0;
    bank.play("vip");
    const targets = f.calls.filter((c) => c.node === "gain.gain" && c.method === "setTarget").map((c) => c.args[0] as number);
    expect(targets[0]).toBeCloseTo(0.05, 6);
    expect(targets[1]).toBeCloseTo(0.1, 6);
  });

  it("installs gesture unlock and the mute key, and removes everything on dispose", async () => {
    const f = createFakeContext("suspended");
    const bank = createCueBank({ cues, context: f.ctx });
    const target = new FakeTarget();
    const seen: boolean[] = [];
    const remove = bank.install(target, { onMuteChange: (m) => seen.push(m) });
    target.emit("pointerdown");
    await Promise.resolve();
    expect(f.ctx.resumed).toBe(1);
    target.emit("keydown", { code: "KeyM" });
    target.emit("keydown", { code: "KeyM", repeat: true });
    target.emit("keydown", { code: "KeyM", target: { tagName: "INPUT" } });
    target.emit("keydown", { code: "KeyM", ctrlKey: true });
    target.emit("keydown", { code: "KeyX" });
    expect(seen).toEqual([true]);
    expect(bank.muted).toBe(true);
    remove();
    expect(target.count()).toBe(0);
  });

  it("never constructs an AudioContext itself (the injected one is used)", async () => {
    const { f, bank } = await unlocked();
    expect(bank.context).toBe(f.ctx);
  });

  it("returns false when the manager cannot unlock", async () => {
    const f = createFakeContext("closed");
    const bank = createCueBank({ cues, context: f.ctx });
    expect(await bank.unlock()).toBe(false);
    expect(bank.play("blip")).toBe(false);
  });
});

describe("step sequencer", () => {
  it("schedules steps inside the lookahead window at a steady grid", async () => {
    const { f, bank } = await unlocked();
    const handlers: Array<() => void> = [];
    const scheduler: SynthScheduler = { setInterval: (h) => { handlers.push(h); return handlers.length; }, clearInterval: () => { handlers.length = 0; } };
    const steps: number[] = [];
    const seq = createStepSequencer(bank, {
      bpm: 120, scheduler,
      step: (i, at, len, voice) => { steps.push(at); voice({ freq: 220, dur: len, gain: 0.05, type: "triangle" }); }
    });
    seq.start();
    expect(seq.playing).toBe(true);
    seq.pump();
    expect(steps.length).toBeGreaterThanOrEqual(1);
    f.ctx.currentTime = 1;
    seq.pump();
    const gaps = steps.slice(1).map((s, i) => s - (steps[i] as number));
    expect(gaps.every((g) => Math.abs(g - 0.25) < 1e-9)).toBe(true);
    expect(f.ofKind("osc").length).toBe(steps.length);
    seq.stop();
    expect(seq.playing).toBe(false);
  });
});

describe("tone loop", () => {
  it("starts voices and noise, drives parameters, and stops", async () => {
    const { f, bank } = await unlocked();
    const loop = createToneLoop(bank, { voices: [{ freq: 80 }, { freq: 82, detune: 7 }], noise: { gain: 0.05 }, filter: { type: "lowpass", freq: 600 } });
    loop.start();
    expect(loop.running).toBe(true);
    expect(f.ofKind("osc")).toHaveLength(2);
    expect(f.ofKind("source")[0]!.loop).toBe(true);
    f.calls.length = 0;
    loop.set({ pitch: 2, cutoff: 1200, gain: 0.5, noiseGain: 0.1 });
    expect(f.calls.filter((c) => c.method === "setTarget").length).toBe(5);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(f.ofKind("osc").every((o) => o.stopped.length === 1)).toBe(true);
  });
});
