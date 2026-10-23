import { describe, expect, it } from "vitest";
import { createCueBank, createSampleSlices, type SynthContext } from "../../../packages/audio/src/synth";
import { createFakeContext } from "./mockContext";

const sprites = {
  hit: { url: "/hit.wav", offsets: [0, 0.3, 0.6], duration: 0.24, fallback: (ctx: SynthContext) => ctx.createBuffer(1, 130, 1000) },
  pair: { offsets: [0.1, 0.5], duration: 0.2 }
};

function lcg(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

const okFetch = (urls: string[] = []) => async (url: string) => {
  urls.push(url);
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) };
};

async function setup(state = "running", options: Record<string, unknown> = {}) {
  const f = createFakeContext(state);
  const bank = createCueBank({ cues: {}, context: f.ctx });
  await bank.unlock();
  const slices = createSampleSlices(bank, { sprites, random: lcg(), fetch: okFetch(), ...options });
  return { f, bank, slices };
}

const buffer = (tag: string) => ({ tag, length: 10, getChannelData: () => new Float32Array(10) }) as unknown as AudioBuffer;

describe("SampleSlices", () => {
  it("stays silent while the bank is locked, muted or has no buffer and no fallback", async () => {
    const f = createFakeContext("suspended");
    const bank = createCueBank({ cues: {}, context: f.ctx });
    const slices = createSampleSlices(bank, { sprites });
    slices.setBuffer("hit", buffer("a"));
    expect(slices.play("hit")).toBeNull();
    await bank.unlock();
    expect(slices.play("hit")).not.toBeNull();
    bank.setMuted(true);
    expect(slices.play("hit")).toBeNull();
    bank.setMuted(false);
    expect(slices.play("pair")).toBeNull();
  });

  it("plays only the chosen slice and never repeats the previous take", async () => {
    const { f, slices } = await setup();
    slices.setBuffer("hit", buffer("decoded"));
    let previous = -1;
    for (let i = 0; i < 300; i++) {
      const take = slices.play("hit") as number;
      expect(take).toBeGreaterThanOrEqual(0);
      expect(take).toBeLessThan(3);
      expect(take).not.toBe(previous);
      previous = take;
    }
    const sources = f.ofKind("source");
    expect(sources).toHaveLength(300);
    for (const s of sources) {
      const [, offset, duration] = s.startArgs[0] as number[];
      expect([0, 0.3, 0.6]).toContain(offset);
      expect(duration).toBe(0.24);
    }
    expect(slices.lastTake("hit")).toBe(previous);
  });

  it("with two takes it alternates, and a forced take does not change the remembered one", async () => {
    const { slices } = await setup();
    slices.setBuffer("pair", buffer("p"));
    const seq = Array.from({ length: 6 }, () => slices.play("pair"));
    expect(seq).toEqual([seq[0], 1 - (seq[0] as number), seq[0], 1 - (seq[0] as number), seq[0], 1 - (seq[0] as number)]);
    const last = slices.lastTake("pair");
    expect(slices.play("pair", { take: 1 })).toBe(1);
    expect(slices.lastTake("pair")).toBe(last);
  });

  it("plays the whole fallback buffer, unsliced, until the sheet decodes", async () => {
    const { f, slices } = await setup();
    slices.buildFallbacks();
    expect(slices.play("hit")).toBe(-1);
    const source = f.ofKind("source")[0]!;
    expect(source.startArgs[0]).toEqual([0]);
    expect((source.buffer as { length: number }).length).toBe(130);
  });

  it("builds the chain only from the params given: low-pass, gain, panner", async () => {
    const { f, slices } = await setup();
    slices.setBuffer("hit", buffer("d"));
    slices.play("hit", { gain: 0.5 });
    const plain = f.ofKind("source")[0]!;
    expect(plain.connections[0]!.kind).toBe("gain");
    expect(f.ofKind("filter")).toHaveLength(0);
    expect(f.ofKind("pan")).toHaveLength(0);
    slices.play("hit", { gain: 0.25, lowpass: 4400, q: 0.7, pan: -0.3, rate: 1.02 });
    const full = f.ofKind("source")[1]!;
    const filter = full.connections[0]!;
    expect(filter.kind).toBe("filter");
    expect(filter.type).toBe("lowpass");
    expect(filter.frequency.value).toBe(4400);
    expect(filter.Q.value).toBe(0.7);
    const gain = filter.connections[0]!;
    expect(gain.kind).toBe("gain");
    expect(gain.gain.value).toBe(0.25);
    const pan = gain.connections[0]!;
    expect(pan.kind).toBe("pan");
    expect(pan.pan.value).toBe(-0.3);
    expect(full.playbackRate.value).toBe(1.02);
  });

  it("fetches each sheet once, decodes after prepare(), and keeps the fallback if a download fails", async () => {
    const urls: string[] = [];
    const { f, slices } = await setup("running", { fetch: okFetch(urls) });
    await slices.preload();
    await slices.preload();
    expect(urls).toEqual(["/hit.wav"]);
    await slices.prepare();
    expect(urls).toEqual(["/hit.wav"]);
    expect(slices.has("hit")).toBe(true);
    expect(slices.play("hit")).toBeGreaterThanOrEqual(0);

    const bad = await setup("running", { fetch: async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }) });
    await bad.slices.prepare();
    expect(bad.slices.has("hit")).toBe(false);
    expect(bad.slices.play("hit")).toBe(-1);

    const none = await setup("running", { fetch: async () => { throw new Error("offline"); } });
    await none.slices.prepare();
    expect(none.slices.play("hit")).toBe(-1);
    expect(f.ofKind("source").length).toBeGreaterThan(0);
  });

  it("stopAll stops sounding takes and ended sources disconnect their nodes", async () => {
    const { f, slices } = await setup();
    slices.setBuffer("hit", buffer("d"));
    slices.play("hit", { lowpass: 5000, pan: 0 });
    slices.play("hit");
    slices.stopAll();
    for (const s of f.ofKind("source")) expect(s.stopped).toHaveLength(1);
    const source = f.ofKind("source")[0]!;
    source.onended?.();
    expect(source.disconnected).toBe(1);
    expect(source.connections[0]!.disconnected).toBe(1);
  });

  it("passes CuePlayParams.data through to a layer function", async () => {
    const f = createFakeContext("running");
    const bank = createCueBank({
      context: f.ctx,
      cues: { t: { layers: (p) => [{ freq: (p.data as { hz: number }).hz, dur: 0.1 }] } }
    });
    await bank.unlock();
    expect(bank.play("t", { data: { hz: 777 } })).toBe(true);
    const osc = f.ofKind("osc")[0]!;
    expect(osc.frequency.value).toBe(777);
  });
});

describe("SynthCueBank mute key", () => {
  it("toggles mute even when no onMuteChange callback is given", async () => {
    const { FakeTarget } = await import("./mockContext");
    const f = createFakeContext("running");
    const bank = createCueBank({ cues: {}, context: f.ctx });
    const target = new FakeTarget();
    bank.install(target);
    expect(bank.muted).toBe(false);
    target.emit("keydown", { code: "KeyM" });
    expect(bank.muted).toBe(true);
    target.emit("keydown", { code: "KeyM", repeat: true });
    expect(bank.muted).toBe(true);
    target.emit("keydown", { code: "KeyM" });
    expect(bank.muted).toBe(false);
  });
});
