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
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(byte: number) {
  return { ok: true, arrayBuffer: async () => new Uint8Array([byte]).buffer };
}

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

  it("joins concurrent preloads before unlock and waits for the existing download", async () => {
    const f = createFakeContext("suspended");
    const bank = createCueBank({ cues: {}, context: f.ctx });
    const incoming = deferred<ReturnType<typeof response>>();
    const urls: string[] = [];
    const slices = createSampleSlices(bank, { sprites, fetch: (url) => { urls.push(url); return incoming.promise; } });
    let firstDone = false, secondDone = false;
    const first = slices.preload().then(() => { firstDone = true; });
    const second = slices.preload().then(() => { secondDone = true; });
    await flush();
    expect(urls).toEqual(["/hit.wav"]);
    expect(firstDone).toBe(false);
    expect(secondDone).toBe(false);
    expect(bank.context).toBeNull();
    incoming.resolve(response(1));
    await Promise.all([first, second]);
    expect(firstDone && secondDone).toBe(true);
    await bank.unlock();
    await slices.prepare();
    expect(slices.has("hit")).toBe(true);
    expect(urls).toEqual(["/hit.wav"]);
    slices.dispose();
    bank.dispose();
  });

  it("discards a delayed body from the old security generation even if fetch ignores abort", async () => {
    const f = createFakeContext();
    const bank = createCueBank({ cues: {}, context: f.ctx });
    await bank.unlock();
    const oldBody = deferred<ArrayBuffer>();
    const oldBuffer = buffer("a"), newBuffer = buffer("b");
    let bodyStarted = false;
    let identity = "a";
    const signals: AbortSignal[] = [];
    const fetch = (_url: string, init?: { readonly signal?: AbortSignal }) => {
      if (init?.signal) signals.push(init.signal);
      if (identity === "a") return Promise.resolve({ ok: true, arrayBuffer: () => { bodyStarted = true; return oldBody.promise; } });
      return Promise.resolve(response(2));
    };
    const ctx = f.ctx as unknown as { decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> };
    ctx.decodeAudioData = async (bytes) => new Uint8Array(bytes)[0] === 2 ? newBuffer : oldBuffer;
    const slices = createSampleSlices(bank, { sprites, fetch, securityContext: "a" });
    const oldPrepare = slices.prepare();
    await flush();
    expect(bodyStarted).toBe(true);
    slices.setSecurityContext("b");
    identity = "b";
    expect(signals[0]?.aborted).toBe(true);
    await oldPrepare;
    await slices.prepare();
    expect(slices.play("hit", { take: 0 })).toBe(0);
    expect(f.ofKind("source").at(-1)?.buffer).toBe(newBuffer);
    oldBody.resolve(new Uint8Array([1]).buffer);
    await flush();
    expect(slices.play("hit", { take: 0 })).toBe(0);
    expect(f.ofKind("source").at(-1)?.buffer).toBe(newBuffer);
    slices.dispose();
    bank.dispose();
  });

  it("does not publish an old decode after a new generation has completed", async () => {
    const f = createFakeContext();
    const bank = createCueBank({ cues: {}, context: f.ctx });
    await bank.unlock();
    const oldDecode = deferred<AudioBuffer>();
    const newBuffer = buffer("new");
    let identity = 1, oldDecodeStarted = false;
    const ctx = f.ctx as unknown as { decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> };
    ctx.decodeAudioData = (bytes) => {
      if (new Uint8Array(bytes)[0] === 1) { oldDecodeStarted = true; return oldDecode.promise; }
      return Promise.resolve(newBuffer);
    };
    const slices = createSampleSlices(bank, { sprites, fetch: async () => response(identity) });
    const oldPrepare = slices.prepare();
    await flush();
    expect(oldDecodeStarted).toBe(true);
    slices.setSecurityContext("new");
    identity = 2;
    await oldPrepare;
    await slices.prepare();
    oldDecode.resolve(buffer("old"));
    await flush();
    expect(slices.play("hit", { take: 0 })).toBe(0);
    expect(f.ofKind("source").at(-1)?.buffer).toBe(newBuffer);
    slices.dispose();
    bank.dispose();
  });

  it("shares concurrent decoding and does not overwrite a later explicit buffer", async () => {
    const f = createFakeContext();
    const bank = createCueBank({ cues: {}, context: f.ctx });
    await bank.unlock();
    const decoded = deferred<AudioBuffer>();
    let calls = 0;
    const ctx = f.ctx as unknown as { decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> };
    ctx.decodeAudioData = () => { calls += 1; return decoded.promise; };
    const slices = createSampleSlices(bank, { sprites, fetch: async () => response(1) });
    const first = slices.prepare();
    const second = slices.prepare();
    await flush();
    expect(calls).toBe(1);
    const explicit = buffer("explicit");
    slices.setBuffer("hit", explicit);
    decoded.resolve(buffer("older-decode"));
    await Promise.all([first, second]);
    expect(slices.play("hit", { take: 0 })).toBe(0);
    expect(f.ofKind("source").at(-1)?.buffer).toBe(explicit);
    slices.dispose();
    bank.dispose();
  });

  it("copies retained bytes before decoding so another prepare can decode after input detachment", async () => {
    const f = createFakeContext();
    const bank = createCueBank({ cues: {}, context: f.ctx });
    await bank.unlock();
    const original = new Uint8Array([1, 2, 3]).buffer;
    const seen: number[][] = [];
    const copied: boolean[] = [];
    let fetches = 0;
    const ctx = f.ctx as unknown as { decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> };
    ctx.decodeAudioData = async (bytes) => {
      seen.push([...new Uint8Array(bytes)]);
      copied.push(bytes !== original);
      structuredClone(bytes, { transfer: [bytes] });
      return buffer("decoded");
    };
    const slices = createSampleSlices(bank, { sprites, fetch: async () => {
      fetches += 1;
      return { ok: true, arrayBuffer: async () => original };
    } });
    await slices.prepare();
    slices.setBuffer("hit", buffer("manual"));
    await slices.prepare();
    expect(fetches).toBe(1);
    expect(seen).toEqual([[1, 2, 3], [1, 2, 3]]);
    expect(copied).toEqual([true, true]);
    expect(original.byteLength).toBe(3);
    slices.dispose();
    bank.dispose();
  });

  it("settles a pending prepare on disposal and ignores its late decode", async () => {
    const f = createFakeContext();
    const bank = createCueBank({ cues: {}, context: f.ctx });
    await bank.unlock();
    const decoded = deferred<AudioBuffer>();
    let started = false;
    const ctx = f.ctx as unknown as { decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> };
    ctx.decodeAudioData = () => { started = true; return decoded.promise; };
    const slices = createSampleSlices(bank, { sprites, fetch: async () => response(1) });
    const preparing = slices.prepare();
    await flush();
    expect(started).toBe(true);
    slices.dispose();
    await preparing;
    await bank.unlock(); // Even a reused context cannot revive disposed slices.
    decoded.resolve(buffer("late"));
    await flush();
    expect(slices.has("hit")).toBe(false);
    expect(slices.play("hit")).toBeNull();
    bank.dispose();
  });

  it("snapshots sprite URLs and slice metadata instead of mixing in later mutations", async () => {
    const f = createFakeContext();
    const bank = createCueBank({ cues: {}, context: f.ctx });
    await bank.unlock();
    const mutable = { hit: { url: "/first.wav", offsets: [0.1, 0.5], duration: 0.2 } };
    const urls: string[] = [];
    const slices = createSampleSlices(bank, { sprites: mutable, fetch: okFetch(urls) });
    mutable.hit.url = "/other.wav";
    mutable.hit.offsets[1] = 8;
    mutable.hit.duration = 4;
    await slices.prepare();
    expect(urls).toEqual(["/first.wav"]);
    expect(slices.play("hit", { take: 1 })).toBe(1);
    expect(f.ofKind("source").at(-1)?.startArgs[0]).toEqual([0, 0.5, 0.2]);
    slices.dispose();
    bank.dispose();
  });

  it("invalidates active voices and buffers on every security reset and on disposal", async () => {
    const { f, bank, slices } = await setup();
    const explicit = buffer("session-a");
    slices.setBuffer("hit", explicit);
    slices.play("hit", { lowpass: 5000, pan: 0 });
    const source = f.ofKind("source")[0]!;
    const onended = source.onended;
    expect(() => slices.setSecurityContext(" ")).toThrow(/non-empty/);
    expect(source.stopped).toHaveLength(0);
    slices.setSecurityContext("session-b");
    expect(source.stopped).toHaveLength(1);
    expect(source.disconnected).toBe(1);
    expect(source.connections[0]!.disconnected).toBe(1);
    onended?.();
    expect(source.disconnected).toBe(1);
    expect(slices.has("hit")).toBe(false);
    expect(slices.lastTake("hit")).toBe(-1);
    expect(slices.play("hit")).toBeNull();
    slices.buildFallbacks();
    expect(slices.play("hit")).toBe(-1);
    slices.setSecurityContext("session-b");
    expect(slices.play("hit")).toBeNull();
    slices.dispose();
    slices.dispose();
    slices.setBuffer("hit", explicit);
    await slices.preload();
    await slices.prepare();
    expect(slices.has("hit")).toBe(false);
    expect(slices.play("hit")).toBeNull();
    bank.dispose();
  });

  it("does not start a stale voice when the take picker changes security context", async () => {
    let invalidate = () => {};
    const { f, bank, slices } = await setup("running", { random: () => { invalidate(); return 0.5; } });
    invalidate = () => slices.setSecurityContext("next");
    slices.setBuffer("hit", buffer("old"));
    expect(slices.play("hit")).toBeNull();
    const source = f.ofKind("source")[0]!;
    expect(source.startArgs).toHaveLength(0);
    expect(source.disconnected).toBe(1);
    expect(slices.lastTake("hit")).toBe(-1);
    slices.dispose();
    bank.dispose();
  });

  it("keeps failures until invalidation, then retries even after a synchronous fetch error", async () => {
    let calls = 0;
    const { slices, bank } = await setup("running", { fetch: () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return Promise.resolve(response(1));
    } });
    await slices.preload();
    await slices.preload();
    expect(calls).toBe(1);
    slices.setSecurityContext();
    await slices.prepare();
    expect(calls).toBe(2);
    expect(slices.has("hit")).toBe(true);
    slices.dispose();
    bank.dispose();
  });

  it("does not share sheets or invalidation between separate instances", async () => {
    const { f, bank, slices: first } = await setup();
    const second = createSampleSlices(bank, { sprites, fetch: async () => response(2) });
    const firstBuffer = buffer("first"), secondBuffer = buffer("second");
    first.setBuffer("hit", firstBuffer);
    second.setBuffer("hit", secondBuffer);
    first.setSecurityContext("other-session");
    expect(first.has("hit")).toBe(false);
    expect(second.play("hit", { take: 0 })).toBe(0);
    expect(f.ofKind("source").at(-1)?.buffer).toBe(secondBuffer);
    first.dispose();
    second.dispose();
    bank.dispose();
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
