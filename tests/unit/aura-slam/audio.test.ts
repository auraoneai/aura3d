import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeContext, FakeNode } from "../audio-synth/mockContext";
import { createTennisAudio, impactShape, makeImpactFallback, type ImpactKind } from "../../../examples/aura-slam/audio/audio";

/**
 * Differential tests: tennis-audio.js (the original, evaluated as data against a recording fake AudioContext) and the
 * TypeScript port are driven with the same calls and the same random stream; every audible parameter must match.
 */
const SOURCE = readFileSync(resolve(__dirname, "../../../apps/showcase-top-tennis/public/toptennis/tennis-audio.js"), "utf8");

function lcg(seed = 12345) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

type Fake = ReturnType<typeof createFakeContext>;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const bytes = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(32) });

interface Harness {
  f: Fake;
  init(): void;
  hit(pitch: unknown, contact: unknown): void;
  bounce(contact: unknown): void;
  tone(...args: unknown[]): void;
  setEnabled(v: boolean): void;
}

function newFake(state = "running"): Fake {
  const f = createFakeContext(state);
  (f.ctx as unknown as { sampleRate: number }).sampleRate = 48000;
  return f;
}

function originalHarness(state = "running"): Harness {
  const f = newFake(state);
  const root: Record<string, unknown> = {
    fetch: bytes,
    AudioContext: function () { return f.ctx; }
  };
  new Function("window", SOURCE)(root);
  const audio = (root.TennisAudio as { create(): any }).create();
  return { f, init: () => audio.init(), hit: (p, c) => audio.hit(p, c), bounce: (c) => audio.bounce(c), tone: (...a) => audio.tone(...a), setEnabled: (v) => audio.setEnabled(v) };
}

function portHarness(random: () => number, state = "running"): Harness {
  const f = newFake(state);
  const audio = createTennisAudio({ context: f.ctx as never, random, fetch: bytes, assets: { hit: "/h.wav", bounce: "/b.wav" } });
  return { f, init: () => audio.init(), hit: (p, c) => audio.hit(p as number, c as never), bounce: (c) => audio.bounce(c as never), tone: (...a) => (audio.tone as (...x: unknown[]) => void)(...a), setEnabled: (v) => audio.setEnabled(v) };
}

interface Record_ {
  chain: string[];
  rate: number;
  buffer: string;
  start: unknown[];
  filterType?: string;
  cutoff?: number;
  q?: number;
  gain: number;
  pan?: number;
}

function bufferTag(b: unknown): string {
  const x = b as { decoded?: boolean; data?: Float32Array };
  return x.decoded ? "decoded" : `fallback:${x.data ? x.data.length : "?"}:${hash(x.data)}`;
}
function hash(d?: Float32Array): number {
  if (!d) return 0;
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ Math.round((d[i] as number) * 1e9), 16777619) >>> 0;
  return h;
}

function snapshot(f: Fake, from: number): Record_ {
  const nodes = f.nodes.slice(from);
  const source = nodes.find((n) => n.kind === "source") as FakeNode;
  const chain: string[] = [];
  let n: FakeNode | undefined = source;
  const visited = new Set<FakeNode>();
  while (n && !visited.has(n)) {
    visited.add(n);
    chain.push(n.kind);
    n = n.connections[0];
    if (n && !nodes.includes(n)) { chain.push("bus"); break; }
  }
  const filter = nodes.find((x) => x.kind === "filter");
  const gain = nodes.find((x) => x.kind === "gain") as FakeNode;
  const pan = nodes.find((x) => x.kind === "pan");
  const out: Record_ = {
    chain,
    rate: source.playbackRate.value,
    buffer: bufferTag(source.buffer),
    start: source.startArgs[0] as unknown[],
    gain: gain.gain.value
  };
  if (filter) { out.filterType = filter.type; out.cutoff = filter.frequency.value; out.q = filter.Q.value; }
  if (pan) out.pan = pan.pan.value;
  return out;
}

const pitches = [undefined, 0.5, 0.8, 1, 1.15, 1.3, 2, Number.NaN];
const speeds = [undefined, Number.NaN, 0, 40, 100, 145, 210];
const verticals = [undefined, Number.NaN, 0, 0.1, 1, 3, 6, 12];
const ys = [undefined, -3, -1.25, -0.2, 0, 1.25, 3];
const xs = [undefined, -5, -1, -0.2, 0, 0.3, 1, 5];
const venues = [undefined, "grass", "clay", "hard", "desert"];

function cases(): Array<["hit" | "bounce", unknown, Record<string, unknown>]> {
  const out: Array<["hit" | "bounce", unknown, Record<string, unknown>]> = [];
  for (const p of pitches) for (const s of speeds) for (const y of ys) for (const x of xs) for (const v of venues) out.push(["hit", p, { speedKph: s, y, x, venue: v }]);
  for (const vs of verticals) for (const y of ys) for (const x of xs) for (const v of venues) out.push(["bounce", 1, { verticalSpeed: vs, y, x, venue: v }]);
  return out;
}

afterEach(() => vi.restoreAllMocks());

describe("M-AUDIO differential vs tennis-audio.js", () => {
  it("fallback impact buffers are bit-identical (the damped synthetic hit and bounce)", async () => {
    const orig = originalHarness();
    const port = portHarness(lcg());
    orig.init();
    port.init();
    const buffersOf = (f: Fake) => (kind: ImpactKind) => makeImpactFallback(f.ctx as never, kind);
    // The original builds its fallbacks in init(): read them off the first impact instead of reaching inside.
    vi.spyOn(Math, "random").mockImplementation(lcg());
    orig.hit(1, {});
    orig.bounce({});
    const origBuffers = orig.f.ofKind("source").map((s) => (s.buffer as { data: Float32Array }).data);
    const mine = buffersOf(port.f);
    expect(Array.from(mine("hit").getChannelData(0))).toEqual(Array.from(origBuffers[0] as Float32Array));
    expect(Array.from(mine("bounce").getChannelData(0))).toEqual(Array.from(origBuffers[1] as Float32Array));
  });

  it("every impact (fallback buffers before the sheets decode, then decoded takes) matches over the full contact grid", async () => {
    const orig = originalHarness();
    const rnd = lcg(99);
    const port = portHarness(lcg(99));
    const spy = vi.spyOn(Math, "random").mockImplementation(rnd);
    orig.init();
    port.init();
    let compared = 0;
    const all = cases();
    const run = (subset: typeof all): void => {
      for (const [kind, pitch, contact] of subset) {
        const o0 = orig.f.nodes.length;
        const p0 = port.f.nodes.length;
        if (kind === "hit") { orig.hit(pitch, contact); port.hit(pitch, contact); } else { orig.bounce(contact); port.bounce(contact); }
        const a = snapshot(orig.f, o0);
        const b = snapshot(port.f, p0);
        // Same signal path; the original ends at its master gain, the port at the sfx bus (both gain nodes).
        expect(b.chain.slice(0, 4)).toEqual(a.chain.slice(0, 4));
        expect(b).toEqual(a);
        compared++;
      }
    };
    // Phase 1: before decode finishes, every contact plays the whole fallback buffer (no slicing, no take draw).
    run(all.filter((_, i) => i % 97 === 0));
    expect(snapshot(orig.f, orig.f.nodes.length - 5).start).toEqual([0]);
    await flush();
    // Phase 2: decoded takes; the take sequence depends on the shared random stream and the no-repeat rule.
    run(all);
    expect(compared).toBeGreaterThan(8000);
    expect(spy).toHaveBeenCalled();
  });

  it("take choice never repeats and uses offsets 0, 0.3, 0.6 with 0.24 s slices, identically to the original", async () => {
    const orig = originalHarness();
    const port = portHarness(lcg(5));
    vi.spyOn(Math, "random").mockImplementation(lcg(5));
    orig.init();
    port.init();
    await flush();
    const takes = (h: Harness, n: number) => {
      const out: number[][] = [];
      for (let i = 0; i < n; i++) {
        const from = h.f.nodes.length;
        i % 2 ? h.bounce({ verticalSpeed: 3 }) : h.hit(1, { speedKph: 100 });
        out.push(snapshot(h.f, from).start.slice(1) as number[]);
      }
      return out;
    };
    const a = takes(orig, 400);
    const b = takes(port, 400);
    expect(b).toEqual(a);
    for (const [offset, dur] of a) { expect([0, 0.3, 0.6]).toContain(offset); expect(dur).toBe(0.24); }
    const hitOffsets = a.filter((_, i) => i % 2 === 0).map((x) => x[0]);
    for (let i = 1; i < hitOffsets.length; i++) expect(hitOffsets[i]).not.toBe(hitOffsets[i - 1]);
  });

  it("tones: same oscillator type, pitch, peak volume and start time as the original (stop is 30 ms later, below audibility)", async () => {
    const orig = originalHarness();
    const port = portHarness(lcg());
    orig.init();
    port.init();
    await flush();
    const grid: Array<[number, number, OscillatorType | undefined, number | undefined, number | undefined]> = [];
    for (const freq of [170, 240, 310, 410, 620, 1000]) for (const dur of [0.06, 0.12, 0.22]) for (const type of [undefined, "sine", "triangle", "square"] as const) for (const vol of [undefined, 0.03, 0.045]) for (const delay of [undefined, 0, 0.09, 0.1]) grid.push([freq, dur, type, vol, delay]);
    let clock = 0;
    for (const [freq, dur, type, vol, delay] of grid) {
      clock += 10;
      orig.f.ctx.currentTime = clock;
      port.f.ctx.currentTime = clock;
      const o0 = orig.f.nodes.length;
      const p0 = port.f.nodes.length;
      orig.tone(freq, dur, type, vol, delay);
      port.tone(freq, dur, type, vol, delay);
      const oo = orig.f.nodes.slice(o0).find((n) => n.kind === "osc") as FakeNode;
      const po = port.f.nodes.slice(p0).find((n) => n.kind === "osc") as FakeNode;
      expect(po.type).toBe(oo.type);
      expect(po.frequency.value).toBe(oo.frequency.value);
      expect(po.started).toEqual(oo.started);
      expect(po.stopped[0]! - oo.stopped[0]!).toBeCloseTo(0.03, 9);
      const peak = (n: FakeNode, ramp: boolean) => port.f.calls.length >= 0 && (ramp ? undefined : undefined);
      void peak;
    }
    // Peak volume: the original sets it at the start; the kit ramps up to it over 1 ms.
    const origGain = orig.f.calls.filter((c) => c.node === "gain.gain" && c.method === "setValueAtTime").map((c) => (c.args as number[])[0]);
    const portPeaks = port.f.calls.filter((c) => c.node === "gain.gain" && c.method === "expRamp" && (c.args as number[])[0]! > 0.002).map((c) => (c.args as number[])[0]);
    const origPeaks = origGain.filter((v) => v !== 0.9 && v !== 0 && v !== undefined);
    expect(portPeaks.length).toBe(grid.length);
    for (let i = 0; i < grid.length; i++) expect(portPeaks[i]).toBeCloseTo(origPeaks[i] as number, 12);
  });

  it("pointSound plays the same two notes as game.js playPointSound", async () => {
    const port = portHarness(lcg());
    const audio = createTennisAudio({ context: port.f.ctx as never, random: lcg(), fetch: bytes, assets: { hit: "/h", bounce: "/b" } });
    audio.init();
    await flush();
    audio.pointSound(true);
    audio.pointSound(false);
    const oscs = port.f.ofKind("osc");
    // 4 oscillators from the second instance (the first harness' audio never played)
    expect(oscs.map((o) => [o.type, o.frequency.value, o.started[0]])).toEqual([
      ["triangle", 410, 0],
      ["triangle", 620, 0.09],
      ["sine", 240, 0],
      ["sine", 170, 0.1]
    ]);
  });
});

describe("M-AUDIO behaviour", () => {
  it("is silent before init, while disabled, and resumes after setEnabled(true)", async () => {
    const f = newFake("suspended");
    const audio = createTennisAudio({ context: f.ctx as never, random: lcg(), fetch: bytes, assets: { hit: "/h", bounce: "/b" } });
    audio.hit(1, {});
    audio.tone(440, 0.1);
    expect(f.ofKind("source")).toHaveLength(0);
    expect(f.ofKind("osc")).toHaveLength(0);
    audio.init();
    await flush();
    expect(f.ctx.resumed).toBe(1);
    audio.hit(1, { speedKph: 90 });
    expect(f.ofKind("source")).toHaveLength(1);
    audio.setEnabled(false);
    expect(audio.enabled).toBe(false);
    audio.hit(1, {});
    audio.bounce({});
    audio.tone(300, 0.1);
    audio.init();
    expect(f.ofKind("source")).toHaveLength(1);
    expect(f.ofKind("osc")).toHaveLength(0);
    for (const s of f.ofKind("source")) expect(s.stopped).toHaveLength(1);
    audio.setEnabled(true);
    await flush();
    audio.bounce({ verticalSpeed: 2 });
    expect(f.ofKind("source")).toHaveLength(2);
  });

  it("routes simulation events: hit, bounce, tone and pointSound; ignores the rest", async () => {
    const f = newFake();
    const audio = createTennisAudio({ context: f.ctx as never, random: lcg(), fetch: bytes, assets: { hit: "/h", bounce: "/b" } });
    audio.init();
    await flush();
    audio.handleEvent({ type: "hit", args: [1.2], contact: { x: 0, y: 0, speedKph: 100, verticalSpeed: 0, venue: "clay" } });
    audio.handleEvent({ type: "bounce", contact: { x: 1, y: 0.5, speedKph: 0, verticalSpeed: 4, venue: "grass" } });
    audio.handleEvent({ type: "tone", args: [310, 0.06, "sine", 0.05] });
    audio.handleEvent({ type: "pointSound", won: true });
    audio.handleEvent({ type: "complete", winner: "player" });
    audio.handleEvent({ type: "point", winner: "player", call: "x" });
    expect(f.ofKind("source")).toHaveLength(2);
    expect(f.ofKind("osc")).toHaveLength(3);
  });

  it("the kit's mute key toggles the sound when enabled, and install() unlocks on the first gesture", async () => {
    const f = newFake("suspended");
    const audio = createTennisAudio({ context: f.ctx as never, random: lcg(), fetch: bytes, assets: { hit: "/h", bounce: "/b" }, muteKey: "KeyM" });
    const listeners = new Map<string, Array<(e: unknown) => void>>();
    const target = {
      addEventListener: (t: string, l: (e: unknown) => void) => listeners.set(t, [...(listeners.get(t) ?? []), l]),
      removeEventListener: () => undefined
    };
    const remove = audio.install(target);
    for (const l of listeners.get("pointerdown") ?? []) l({});
    await flush();
    expect(f.ctx.resumed).toBeGreaterThan(0);
    expect(audio.bank.muted).toBe(false);
    for (const l of listeners.get("keydown") ?? []) l({ code: "KeyM" });
    expect(audio.bank.muted).toBe(true);
    remove();
  });

  it("never constructs its own AudioContext: the default path goes through the manager", () => {
    const source = readFileSync(resolve(__dirname, "../../../examples/aura-slam/audio/audio.ts"), "utf8");
    expect(/new\s+AudioContext\s*\(|webkitAudioContext/.test(source)).toBe(false);
  });

  it("impactShape clamps and defaults like the original", () => {
    expect(impactShape("hit", undefined, {}).energy).toBeCloseTo(100 / 145, 12);
    expect(impactShape("hit", 9, { speedKph: 1e9 }).energy).toBe(1);
    expect(impactShape("bounce", 1, { verticalSpeed: 0 }).energy).toBe(0.025);
    expect(impactShape("bounce", 1, { venue: "grass" }).cutoff).toBe(2100);
    expect(impactShape("hit", 1, { venue: "grass" }).cutoff).toBe(11000);
    expect(impactShape("hit", 1, { x: 10 }).pan).toBe(0.65);
    expect(impactShape("hit", 1, { x: -10 }).pan).toBe(-0.65);
  });
});
