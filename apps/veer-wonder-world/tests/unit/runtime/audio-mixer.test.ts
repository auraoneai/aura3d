// PRD 04 B06 / J04: the audio mixer against a fake Web Audio graph.
// The fakes implement the real DOM interfaces, so the mixer runs unmodified
// through the engine's AudioContextManager, AudioFileManager and master chain.
import { describe, expect, it } from "vitest";
import type { AudioDecodeContextLike, AudioFileFetchResponseLike } from "@aura3d/engine/audio";
import {
  AUDIO_LEVELS,
  AUDIO_LIMITS,
  CLIP_LEVELS,
  clipGain,
  createAudioMixer,
  measureClipLevels,
  type AudioManifest,
  type AudioMixerOptions
} from "../../../src/runtime/audio-mixer.js";
import { createNarrationPlayer } from "../../../src/runtime/narration-player.js";
import type { AudioClipRef, LineRef } from "../../../src/types.js";

const RATE = 8000;

class FakeParam implements AudioParam {
  automationRate: AutomationRate = "a-rate";
  readonly defaultValue: number;
  readonly maxValue = 3.4e38;
  readonly minValue = -3.4e38;
  value: number;
  readonly events: { readonly kind: string; readonly value: number; readonly time: number }[] = [];

  constructor(initial: number) {
    this.value = initial;
    this.defaultValue = initial;
  }

  cancelAndHoldAtTime(time: number): AudioParam {
    this.events.push({ kind: "cancelAndHold", value: Number.NaN, time });
    return this;
  }

  cancelScheduledValues(time: number): AudioParam {
    this.events.push({ kind: "cancel", value: Number.NaN, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): AudioParam {
    this.events.push({ kind: "ramp", value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): AudioParam {
    this.events.push({ kind: "ramp", value, time });
    return this;
  }

  setTargetAtTime(value: number, time: number, _timeConstant: number): AudioParam {
    this.events.push({ kind: "target", value, time });
    return this;
  }

  setValueAtTime(value: number, time: number): AudioParam {
    this.events.push({ kind: "set", value, time });
    return this;
  }

  setValueCurveAtTime(values: number[] | Float32Array, time: number, _duration: number): AudioParam {
    this.events.push({ kind: "curve", value: values[values.length - 1] ?? Number.NaN, time });
    return this;
  }

  /** The newest scheduled value event, if any. */
  lastEvent(): { readonly kind: string; readonly value: number; readonly time: number } | undefined {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const event = this.events[i];
      if (event && !Number.isNaN(event.value)) return event;
    }
    return undefined;
  }

  /** Where the param is heading: the newest scheduled value, else `value`. */
  get target(): number {
    return this.lastEvent()?.value ?? this.value;
  }
}

class FakeNode implements AudioNode {
  channelCount = 2;
  channelCountMode: ChannelCountMode = "max";
  channelInterpretation: ChannelInterpretation = "speakers";
  readonly numberOfInputs = 1;
  readonly numberOfOutputs = 1;
  readonly outputs: (AudioNode | AudioParam)[] = [];
  readonly kind: string;

  constructor(kind: string) {
    this.kind = kind;
  }

  get context(): BaseAudioContext {
    throw new Error("FakeNode.context is not modelled");
  }

  connect(destination: AudioNode | AudioParam, _output?: number, _input?: number): AudioNode {
    this.outputs.push(destination);
    return this;
  }

  disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
    this.outputs.length = 0;
  }

  addEventListener(_type: string, _listener: unknown, _options?: unknown): void {}

  removeEventListener(_type: string, _listener: unknown, _options?: unknown): void {}

  dispatchEvent(_event: Event): boolean {
    return true;
  }
}

class FakeGain extends FakeNode implements GainNode {
  readonly gain: FakeParam;

  constructor() {
    super("gain");
    this.gain = new FakeParam(1);
  }
}

class FakeSource extends FakeNode implements AudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  readonly detune = new FakeParam(0);
  loop = false;
  loopEnd = 0;
  loopStart = 0;
  readonly playbackRate = new FakeParam(1);
  onended: ((this: AudioScheduledSourceNode, ev: Event) => unknown) | null = null;
  started: { readonly when: number; readonly offset: number } | null = null;
  stoppedAt: number | null = null;

  constructor() {
    super("source");
  }

  start(when = 0, offset = 0, _duration?: number): void {
    this.started = { when, offset };
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }

  /** The browser reports the end (natural end, or a stop taking effect). */
  end(): void {
    this.onended?.call(this, new Event("ended"));
  }

  get playing(): boolean {
    return this.started !== null && this.stoppedAt === null;
  }
}

/**
 * Channel data backed by a plain ArrayBuffer: newer DOM typings (TypeScript
 * 5.9, the monorepo's strict workspace typecheck) declare
 * `getChannelData(): Float32Array<ArrayBuffer>`, which a bare `Float32Array`
 * (ArrayBufferLike) does not satisfy.
 */
type ChannelData = Float32Array<ArrayBuffer>;

class FakeBuffer implements AudioBuffer {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  private readonly channels: ChannelData[];

  constructor(channels: ChannelData[], sampleRate = RATE) {
    this.channels = channels;
    this.numberOfChannels = channels.length;
    this.length = channels[0]?.length ?? 0;
    this.sampleRate = sampleRate;
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  copyFromChannel(destination: Float32Array, channelNumber: number, bufferOffset = 0): void {
    destination.set(this.getChannelData(channelNumber).subarray(bufferOffset, bufferOffset + destination.length));
  }

  copyToChannel(source: Float32Array, channelNumber: number, bufferOffset = 0): void {
    this.getChannelData(channelNumber).set(source, bufferOffset);
  }

  getChannelData(channel: number): ChannelData {
    const data = this.channels[channel];
    if (!data) throw new RangeError(`no channel ${channel}`);
    return data;
  }
}

/** A square wave: RMS and peak both equal `amplitude`. */
function tone(seconds: number, amplitude: number): FakeBuffer {
  const data = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < data.length; i += 1) data[i] = i % 2 === 0 ? amplitude : -amplitude;
  return new FakeBuffer([data]);
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Fake same-origin server plus decoder: fetch returns an id that decode maps back to a buffer. */
class AudioLibrary {
  readonly fetched: string[] = [];
  readonly failing = new Set<string>();
  private readonly buffers = new Map<number, FakeBuffer>();
  private readonly ids = new Map<string, number>();
  private readonly gates = new Map<string, Deferred>();

  add(url: string, buffer: FakeBuffer): AudioClipRef {
    const id = this.ids.size + 1;
    this.ids.set(url, id);
    this.buffers.set(id, buffer);
    return { url, sha256: "0".repeat(64), durationMs: Math.round(buffer.duration * 1000) };
  }

  bufferOf(ref: AudioClipRef): FakeBuffer {
    const buffer = this.buffers.get(this.ids.get(ref.url) ?? 0);
    if (!buffer) throw new Error(`unknown clip ${ref.url}`);
    return buffer;
  }

  /** Holds the next fetch of `url` until the returned function runs. */
  gate(url: string): () => void {
    const gate = deferred();
    this.gates.set(url, gate);
    return () => {
      this.gates.delete(url);
      gate.resolve();
    };
  }

  count(url: string): number {
    return this.fetched.filter((entry) => entry === url).length;
  }

  readonly fetch = async (url: string): Promise<AudioFileFetchResponseLike> => {
    this.fetched.push(url);
    const gate = this.gates.get(url);
    if (gate) await gate.promise;
    const id = this.ids.get(url);
    if (id === undefined || this.failing.has(url)) {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => {
        const bytes = new ArrayBuffer(4);
        new DataView(bytes).setUint32(0, id);
        return bytes;
      }
    };
  };

  decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const id = data.byteLength >= 4 ? new DataView(data).getUint32(0) : 0;
    const buffer = this.buffers.get(id);
    return buffer ? Promise.resolve(buffer) : Promise.reject(new Error("undecodable"));
  }
}

type ResumeMode = "ok" | "hang" | "reject";

class FakeContext implements AudioDecodeContextLike {
  state = "suspended";
  currentTime = 0;
  readonly destination = new FakeNode("destination");
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  resumeCalls = 0;
  closeCalls = 0;
  private readonly library: AudioLibrary;
  private readonly resumeMode: ResumeMode;

  constructor(library: AudioLibrary, resumeMode: ResumeMode) {
    this.library = library;
    this.resumeMode = resumeMode;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.state === "closed") return Promise.reject(new Error("closed"));
    if (this.resumeMode === "hang") return new Promise<void>(() => undefined);
    if (this.resumeMode === "reject") return Promise.reject(new Error("NotAllowedError"));
    this.state = "running";
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    if (this.state !== "closed") this.state = "suspended";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
    return Promise.resolve();
  }

  createGain(): GainNode {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeSource();
    this.sources.push(node);
    return node;
  }

  createPanner(): PannerNode {
    throw new Error("createPanner is not modelled");
  }

  createBiquadFilter(): BiquadFilterNode {
    throw new Error("createBiquadFilter is not modelled");
  }

  createConvolver(): ConvolverNode {
    throw new Error("createConvolver is not modelled");
  }

  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.library.decode(data);
  }
}

class FakeTimers {
  now = 0;
  private seq = 0;
  private tasks: { readonly id: number; readonly at: number; readonly fn: () => void }[] = [];

  readonly schedule = (fn: () => void, ms: number): (() => void) => {
    this.seq += 1;
    const id = this.seq;
    this.tasks.push({ id, at: this.now + ms, fn });
    return () => {
      this.tasks = this.tasks.filter((task) => task.id !== id);
    };
  };

  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due = this.tasks.filter((task) => task.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.tasks = this.tasks.filter((task) => task !== due);
      this.now = due.at;
      due.fn();
    }
    this.now = end;
  }

  get pending(): number {
    return this.tasks.length;
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function gainAfter(node: FakeNode): FakeGain {
  const next = node.outputs[0];
  if (!(next instanceof FakeGain)) throw new Error(`${node.kind} is not connected to a gain`);
  return next;
}

/** source -> clip gain -> bus -> master */
const clipGainOf = (source: FakeSource): FakeGain => gainAfter(source);
const busOf = (source: FakeSource): FakeGain => gainAfter(gainAfter(source));
const masterOf = (source: FakeSource): FakeGain => gainAfter(busOf(source));

interface SetupOptions {
  readonly resume?: ResumeMode;
  /** The browser lets the context run without a gesture (autoplay allowed). */
  readonly autoplay?: boolean;
  readonly musicEnabled?: boolean;
  readonly soundEnabled?: boolean;
  readonly cacheBudgetBytes?: number;
}

function setup(options: SetupOptions = {}) {
  const library = new AudioLibrary();
  const refs = {
    line: library.add("/audio/lines/e17.greet.1.mp3", tone(2, 0.125)),
    line2: library.add("/audio/lines/e17.greet.2.mp3", tone(2, 0.125)),
    line3: library.add("/audio/lines/e17.greet.3.mp3", tone(2, 0.125)),
    quietLine: library.add("/audio/lines/e17.hook.1.mp3", tone(2, 0.03)),
    loudLine: library.add("/audio/lines/e17.hook.2.mp3", tone(2, 0.5)),
    woof: library.add("/audio/sfx/woof.mp3", tone(0.5, 0.9)),
    pop: library.add("/audio/sfx/pop.mp3", tone(0.2, 0.02)),
    ding: library.add("/audio/sfx/ding.mp3", tone(0.5, 0.05)),
    clap: library.add("/audio/sfx/clap.mp3", tone(0.3, 0.05)),
    hello: library.add("/audio/songs/hello.mp3", tone(10, 0.1)),
    ballRolls: library.add("/audio/songs/ballRolls.mp3", tone(12, 0.1)),
    meadowBed: library.add("/audio/music/meadowBed.mp3", tone(8, 0.1)),
    homeBed: library.add("/audio/music/homeBed.mp3", tone(8, 0.1))
  };
  const manifest: AudioManifest = {
    lines: {
      "e17.greet.1": refs.line,
      "e17.greet.2": refs.line2,
      "e17.greet.3": refs.line3,
      "e17.hook.1": refs.quietLine,
      "e17.hook.2": refs.loudLine
    },
    sfx: { woof: refs.woof, pop: refs.pop, ding: refs.ding, clap: refs.clap },
    songs: { hello: refs.hello, ballRolls: refs.ballRolls },
    beds: { meadowBed: refs.meadowBed, homeBed: refs.homeBed }
  };
  const contexts: FakeContext[] = [];
  const timers = new FakeTimers();
  const mixerOptions: AudioMixerOptions = {
    manifest,
    musicEnabled: options.musicEnabled ?? true,
    soundEnabled: options.soundEnabled ?? true,
    createContext: () => {
      const context = new FakeContext(library, options.resume ?? "ok");
      if (options.autoplay) context.state = "running";
      contexts.push(context);
      return context;
    },
    fetch: library.fetch,
    schedule: timers.schedule,
    ...(options.cacheBudgetBytes !== undefined ? { cacheBudgetBytes: options.cacheBudgetBytes } : {})
  };
  const mixer = createAudioMixer(mixerOptions);
  const ctx = (): FakeContext => {
    const context = contexts[0];
    if (!context) throw new Error("no AudioContext was created");
    return context;
  };
  const latest = (): FakeSource => {
    const source = ctx().sources.at(-1);
    if (!source) throw new Error("no source was started");
    return source;
  };
  const playingWith = (buffer: AudioBuffer | null): FakeSource[] =>
    ctx().sources.filter((source) => source.playing && source.buffer === buffer);
  return { library, refs, manifest, contexts, timers, mixer, ctx, latest, playingWith };
}

const LINE_1: LineRef = { speaker: "momo", key: "e17.greet.1" };
const LINE_2: LineRef = { speaker: "momo", key: "e17.greet.2" };

describe("audio mixer: availability and the one AudioContext", () => {
  it("is silent and never throws when Web Audio is unavailable", async () => {
    const ref: AudioClipRef = { url: "/audio/lines/x.mp3", sha256: "0".repeat(64), durationMs: 1000 };
    const mixer = createAudioMixer({ manifest: { lines: {}, sfx: {}, songs: {}, beds: {} }, musicEnabled: true, soundEnabled: true });
    expect(mixer.manager).toBeNull();
    await expect(mixer.unlock()).resolves.toBe(false);
    expect(mixer.canPlayVoice()).toBe(false);
    await expect(mixer.startVoice(ref, () => undefined)).resolves.toBeNull();
    await expect(mixer.preload(ref)).resolves.toBe(false);
    mixer.playSfx("woof");
    expect(mixer.playSong("hello")).toBe(0);
    mixer.setBed("meadowBed");
    mixer.duck(true);
    mixer.pauseAll();
    mixer.resumeAll();
    mixer.stopAll();
    expect(mixer.gameSoundOptions()).toEqual({ browserContext: false, context: null, cues: {} });
    expect(mixer.snapshot()).toMatchObject({ available: false, contextState: "unavailable", unlocked: false });
    mixer.dispose();
  });

  it("lends createGame the same context instead of a second one", async () => {
    const { mixer, contexts, refs } = setup();
    const sound = mixer.gameSoundOptions();
    expect(sound.browserContext).toBe(false);
    expect(sound.context).toBeUndefined();
    expect(sound.cues).toEqual({});
    const lent = sound.createContext?.();
    await mixer.unlock();
    await mixer.preload(refs.line);
    expect(contexts).toHaveLength(1);
    expect(lent).toBe(contexts[0]);
    expect(mixer.manager?.context).toBe(contexts[0]);
  });

  it("unlock resumes the context inside the gesture and resolves true", async () => {
    const { mixer, ctx } = setup();
    expect(mixer.isUnlocked()).toBe(false);
    expect(mixer.canPlayVoice()).toBe(false);
    const pending = mixer.unlock();
    expect(ctx().resumeCalls).toBe(1);
    await expect(pending).resolves.toBe(true);
    expect(mixer.isUnlocked()).toBe(true);
    expect(mixer.canPlayVoice()).toBe(true);
    expect(mixer.snapshot()).toMatchObject({ available: true, contextState: "running", unlocked: true });
  });

  it("unlock resolves false when the browser never starts audio", async () => {
    const { mixer, timers, refs } = setup({ resume: "hang" });
    const pending = mixer.unlock();
    expect(mixer.canPlayVoice()).toBe(true);
    timers.advance(AUDIO_LIMITS.unlockTimeoutMs);
    await expect(pending).resolves.toBe(false);
    expect(mixer.canPlayVoice()).toBe(false);
    await expect(mixer.startVoice(refs.line, () => undefined)).resolves.toBeNull();
    expect(timers.pending).toBe(0);
  });

  it("plays nothing before unlock() even when the browser runs the context by itself", async () => {
    const { mixer, refs, ctx } = setup({ autoplay: true });
    // Preloading (or createGame borrowing the context) builds it before any gesture.
    await mixer.preload(refs.woof);
    await mixer.preload(refs.hello);
    expect(ctx().state).toBe("running");
    expect(mixer.isUnlocked()).toBe(false);
    expect(mixer.canPlayVoice()).toBe(false);
    await expect(mixer.startVoice(refs.line, () => undefined)).resolves.toBeNull();
    mixer.playSfx("woof");
    expect(mixer.playSong("hello")).toBe(0);
    mixer.setBed("meadowBed");
    await flush();
    expect(ctx().sources).toHaveLength(0);
    expect(mixer.snapshot()).toMatchObject({ unlocked: false, contextState: "running" });

    await expect(mixer.unlock()).resolves.toBe(true);
    await flush();
    expect(mixer.isUnlocked()).toBe(true);
    expect(mixer.snapshot().bedId).toBe("meadowBed");
    mixer.playSfx("woof");
    expect(ctx().sources.filter((source) => source.playing)).toHaveLength(2);
  });

  it("unlock resolves false when the browser refuses audio", async () => {
    const { mixer, ctx } = setup({ resume: "reject" });
    await expect(mixer.unlock()).resolves.toBe(false);
    expect(mixer.isUnlocked()).toBe(false);
    mixer.playSfx("woof");
    expect(mixer.playSong("hello")).toBe(0);
    await flush();
    expect(ctx().sources).toHaveLength(0);
  });
});

describe("audio mixer: levels", () => {
  it("keeps SFX below voice and the bed at its caps", async () => {
    const { mixer } = setup();
    await mixer.unlock();
    const { levels } = mixer.snapshot();
    expect(levels.master).toBe(AUDIO_LEVELS.master);
    expect(levels.voice).toBe(1);
    expect(levels.sfx).toBeLessThanOrEqual(0.6);
    expect(levels.sfx).toBeLessThan(levels.voice);
    expect(levels.bed).toBe(0.25);
  });

  it("ducks the bed and the song under speech, and releases after a hold", async () => {
    const { mixer, refs, playingWith, library, ctx } = setup();
    await mixer.unlock();
    mixer.setBed("meadowBed");
    await flush();
    const [bed] = playingWith(library.bufferOf(refs.meadowBed));
    if (!bed) throw new Error("bed did not start");
    const bedBus = busOf(bed);
    ctx().currentTime = 2;
    mixer.duck(true);
    expect(mixer.snapshot().levels).toMatchObject({ bed: AUDIO_LEVELS.bedDucked, song: AUDIO_LEVELS.songUnderVoice });
    expect(bedBus.gain.target).toBe(0.08);
    expect(bedBus.gain.lastEvent()?.time).toBe(2);
    ctx().currentTime = 4;
    mixer.duck(false);
    expect(bedBus.gain.target).toBe(0.25);
    expect(bedBus.gain.lastEvent()?.time).toBeGreaterThan(4);
    expect(mixer.snapshot().levels.bed).toBe(0.25);
  });

  it("turns loud SFX down, never boosts quiet ones, and keeps them under normalised speech", async () => {
    const { mixer, refs, playingWith, library } = setup();
    await mixer.unlock();
    mixer.playSfx("woof");
    mixer.playSfx("pop");
    await flush();
    const [woof] = playingWith(library.bufferOf(refs.woof));
    const [pop] = playingWith(library.bufferOf(refs.pop));
    if (!woof || !pop) throw new Error("sfx did not start");
    // The woof's samples are stored as float32, so compare against the stored amplitude.
    const woofAmplitude = Math.fround(0.9);
    const woofGain = clipGainOf(woof).gain.value;
    expect(woofGain).toBeLessThan(1);
    expect(woofAmplitude * woofGain).toBeLessThanOrEqual(CLIP_LEVELS.sfxMaxWindowRms + 1e-9);
    expect(clipGainOf(pop).gain.value).toBe(1);
    expect(busOf(woof).gain.value).toBe(AUDIO_LEVELS.sfx);

    // Loudest SFX moment after its bus vs the average level of a normalised voice line.
    const loudestSfx = woofAmplitude * woofGain * AUDIO_LEVELS.sfx;
    const voiceLevels = measureClipLevels(tone(2, 0.125));
    const voiceAverage = voiceLevels.gatedRms * clipGain(voiceLevels, "voice") * AUDIO_LEVELS.voice;
    expect(loudestSfx).toBeLessThan(voiceAverage);
  });

  it("evens out voice lines within limits", async () => {
    const { mixer, refs, latest } = setup();
    await mixer.unlock();
    await mixer.startVoice(refs.quietLine, () => undefined);
    expect(clipGainOf(latest()).gain.value).toBe(CLIP_LEVELS.voiceMaxGain);
    await mixer.startVoice(refs.loudLine, () => undefined);
    expect(clipGainOf(latest()).gain.value).toBe(CLIP_LEVELS.voiceMinGain);
    await mixer.startVoice(refs.line, () => undefined);
    expect(clipGainOf(latest()).gain.value).toBeCloseTo(1, 6);
  });

  it("measures clip levels and never boosts music", () => {
    const loud = measureClipLevels(tone(1, 0.5));
    expect(loud.peak).toBeCloseTo(0.5, 6);
    expect(loud.gatedRms).toBeCloseTo(0.5, 6);
    expect(clipGain(loud, "music")).toBeCloseTo(CLIP_LEVELS.musicMaxRms / 0.5, 6);
    expect(clipGain(measureClipLevels(tone(1, 0.05)), "music")).toBe(1);
    const silent = measureClipLevels(new FakeBuffer([new Float32Array(RATE)]));
    expect(silent).toEqual({ peak: 0, loudestWindowRms: 0, gatedRms: 0 });
    expect(clipGain(silent, "voice")).toBe(1);
    expect(clipGain(silent, "sfx")).toBe(1);
  });
});

describe("audio mixer: SFX", () => {
  it("ignores missing ids and stays silent before unlock", async () => {
    const { mixer, contexts, ctx } = setup();
    mixer.playSfx("woof");
    await flush();
    expect(contexts).toHaveLength(0);
    await mixer.unlock();
    mixer.playSfx("moo");
    await flush();
    expect(ctx().sources).toHaveLength(0);
  });

  it("rate limits repeats and caps how many sound at once", async () => {
    const { mixer, refs, ctx } = setup();
    await mixer.unlock();
    for (const ref of [refs.woof, refs.pop, refs.ding, refs.clap]) await mixer.preload(ref);
    mixer.playSfx("woof");
    mixer.playSfx("woof");
    expect(ctx().sources).toHaveLength(1);
    ctx().currentTime += AUDIO_LIMITS.sfxRepeatGuardS + 0.01;
    mixer.playSfx("woof");
    mixer.playSfx("pop");
    mixer.playSfx("ding");
    expect(ctx().sources).toHaveLength(AUDIO_LIMITS.sfxMaxVoices);
    expect(mixer.snapshot().sfx).toBe(AUDIO_LIMITS.sfxMaxVoices);
    ctx().sources[0]?.end();
    expect(mixer.snapshot().sfx).toBe(AUDIO_LIMITS.sfxMaxVoices - 1);
    mixer.playSfx("clap");
    expect(ctx().sources).toHaveLength(AUDIO_LIMITS.sfxMaxVoices + 1);
  });

  it("drops an SFX that decodes too late to match its action", async () => {
    const { mixer, refs, library, ctx } = setup();
    await mixer.unlock();
    const release = library.gate(refs.clap.url);
    mixer.playSfx("clap");
    ctx().currentTime += AUDIO_LIMITS.sfxMaxLatencyS + 0.1;
    release();
    await flush();
    expect(ctx().sources).toHaveLength(0);
  });
});

describe("audio mixer: songs and the bed", () => {
  it("waits for unlock, then loops the bed; crossfades and stops it", async () => {
    const { mixer, ctx, contexts } = setup();
    mixer.setBed("meadowBed");
    await flush();
    expect(contexts).toHaveLength(0);
    await mixer.unlock();
    await flush();
    const first = ctx().sources[0];
    if (!first) throw new Error("bed did not start");
    expect(first.loop).toBe(true);
    expect(first.playing).toBe(true);
    expect(busOf(first).gain.value).toBe(AUDIO_LEVELS.bed);
    expect(mixer.snapshot().bedId).toBe("meadowBed");
    mixer.setBed("meadowBed");
    await flush();
    expect(ctx().sources).toHaveLength(1);
    mixer.setBed("homeBed");
    await flush();
    expect(first.playing).toBe(false);
    expect(ctx().sources).toHaveLength(2);
    expect(ctx().sources[1]?.playing).toBe(true);
    expect(mixer.snapshot().bedId).toBe("homeBed");
    mixer.setBed(null);
    expect(ctx().sources.every((source) => !source.playing)).toBe(true);
    expect(mixer.snapshot().bedId).toBeNull();
  });

  it("plays one song at a time, mutes the bed under it and brings the bed back after", async () => {
    const { mixer, refs, ctx, latest } = setup();
    await mixer.unlock();
    mixer.setBed("meadowBed");
    await flush();
    expect(mixer.playSong("hello")).toBe(refs.hello.durationMs);
    await flush();
    const hello = latest();
    expect(hello.playing).toBe(true);
    expect(mixer.snapshot()).toMatchObject({ songId: "hello", levels: { bed: AUDIO_LEVELS.bedUnderSong } });
    expect(mixer.playSong("ballRolls")).toBe(refs.ballRolls.durationMs);
    await flush();
    const ballRolls = latest();
    expect(hello.playing).toBe(false);
    expect(ballRolls.playing).toBe(true);
    expect(ctx().sources.filter((source) => source.playing && !source.loop)).toHaveLength(1);
    ballRolls.end();
    expect(mixer.snapshot()).toMatchObject({ songId: null, levels: { bed: AUDIO_LEVELS.bed } });
    expect(mixer.playSong("abc")).toBe(0);
  });

  it("starts a late-decoded song at the matching offset so it stays on the beat", async () => {
    const { mixer, refs, library, ctx, latest } = setup();
    await mixer.unlock();
    const release = library.gate(refs.ballRolls.url);
    mixer.playSong("ballRolls");
    ctx().currentTime += 1;
    release();
    await flush();
    expect(latest().started?.offset).toBeCloseTo(1, 6);
  });

  it("music off stops songs and the bed; music on brings the bed back", async () => {
    const { mixer, ctx } = setup();
    await mixer.unlock();
    mixer.setBed("meadowBed");
    mixer.playSong("hello");
    await flush();
    mixer.setMusicEnabled(false);
    expect(ctx().sources.every((source) => !source.playing)).toBe(true);
    expect(mixer.snapshot()).toMatchObject({ bedId: null, songId: null, musicEnabled: false });
    expect(mixer.playSong("hello")).toBe(0);
    mixer.setMusicEnabled(true);
    await flush();
    expect(mixer.snapshot().bedId).toBe("meadowBed");
    expect(ctx().sources.filter((source) => source.playing && source.loop)).toHaveLength(1);
  });
});

describe("audio mixer: voices", () => {
  it("plays one voice at a time and reports a natural end exactly once", async () => {
    const { mixer, refs, latest } = setup();
    await mixer.unlock();
    const ended: string[] = [];
    const a = await mixer.startVoice(refs.line, () => ended.push("a"));
    const sourceA = latest();
    expect(a?.durationMs).toBe(2000);
    expect(busOf(sourceA).gain.value).toBe(AUDIO_LEVELS.voice);
    const b = await mixer.startVoice(refs.line2, () => ended.push("b"));
    const sourceB = latest();
    expect(sourceA.playing).toBe(false);
    expect(mixer.snapshot().voices).toBe(1);
    sourceA.end();
    expect(ended).toEqual([]);
    sourceB.end();
    sourceB.end();
    expect(ended).toEqual(["b"]);
    b?.stop();
    expect(mixer.snapshot().voices).toBe(0);
    const c = await mixer.startVoice(refs.line3, () => ended.push("c"));
    c?.stop();
    latest().end();
    expect(ended).toEqual(["b"]);
  });

  it("never starts a voice request that a newer one superseded", async () => {
    const { mixer, refs, library, latest } = setup();
    await mixer.unlock();
    const release = library.gate(refs.line.url);
    const first = mixer.startVoice(refs.line, () => undefined);
    const second = await mixer.startVoice(refs.line2, () => undefined);
    const secondSource = latest();
    release();
    await expect(first).resolves.toBeNull();
    expect(second).not.toBeNull();
    expect(secondSource.playing).toBe(true);
    expect(mixer.snapshot().voices).toBe(1);
  });

  it("asks the caller's intent once the clip is ready: drop never sounds, hold waits for resume", async () => {
    const { mixer, refs, ctx, latest } = setup();
    await mixer.unlock();
    await expect(mixer.startVoice(refs.line, () => undefined, () => "drop")).resolves.toBeNull();
    await expect(
      mixer.startVoice(refs.line, () => undefined, () => {
        throw new Error("caller gone");
      })
    ).resolves.toBeNull();
    expect(ctx().sources).toHaveLength(0);
    expect(mixer.snapshot().voices).toBe(0);

    const held = await mixer.startVoice(refs.line2, () => undefined, () => "hold");
    expect(ctx().sources).toHaveLength(0);
    expect(mixer.snapshot().voices).toBe(1);
    expect(held?.positionMs()).toBe(0);
    held?.resume();
    expect(latest().playing).toBe(true);
    expect(latest().started?.offset).toBe(0);
  });

  it("returns null when sound is off so narration falls back to captions", async () => {
    const { mixer, refs } = setup({ soundEnabled: false });
    await mixer.unlock();
    expect(mixer.canPlayVoice()).toBe(false);
    await expect(mixer.startVoice(refs.line, () => undefined)).resolves.toBeNull();
  });
});

describe("audio mixer: pause, sound off, stop and dispose", () => {
  it("pauseAll freezes voice, song and bed in place; resumeAll continues them", async () => {
    const { mixer, refs, ctx } = setup();
    await mixer.unlock();
    const changes: boolean[] = [];
    mixer.onPauseChange((paused) => changes.push(paused));
    mixer.setBed("meadowBed");
    mixer.playSong("hello");
    await flush();
    const voice = await mixer.startVoice(refs.line, () => undefined);
    await mixer.preload(refs.woof);
    mixer.playSfx("woof");
    const before = ctx().sources.slice();
    expect(before.every((source) => source.playing)).toBe(true);
    ctx().currentTime = 1.5;
    mixer.pauseAll();
    expect(before.every((source) => !source.playing)).toBe(true);
    expect(mixer.snapshot()).toMatchObject({ paused: true, sfx: 0, voices: 1 });
    expect(changes).toEqual([true]);
    mixer.playSfx("pop");
    expect(mixer.playSong("ballRolls")).toBe(0);
    expect(mixer.canPlayVoice()).toBe(false);
    ctx().currentTime = 9;
    mixer.resumeAll();
    const after = ctx().sources.slice(before.length);
    expect(after).toHaveLength(3);
    for (const source of after) {
      expect(source.playing).toBe(true);
      expect(source.started?.offset).toBeCloseTo(1.5, 6);
    }
    expect(voice?.positionMs()).toBe(1500);
    expect(changes).toEqual([true, false]);
  });

  it("keeps a voice held by its own pause until its own resume", async () => {
    const { mixer, refs, ctx, latest } = setup();
    await mixer.unlock();
    const voice = await mixer.startVoice(refs.line, () => undefined);
    ctx().currentTime = 0.5;
    voice?.pause();
    const count = ctx().sources.length;
    mixer.pauseAll();
    mixer.resumeAll();
    expect(ctx().sources).toHaveLength(count);
    voice?.resume();
    expect(ctx().sources).toHaveLength(count + 1);
    expect(latest().started?.offset).toBeCloseTo(0.5, 6);
  });

  it("sound off silences the master and stops SFX and songs; a voice line runs on silently", async () => {
    const { mixer, refs, latest } = setup();
    await mixer.unlock();
    await mixer.startVoice(refs.line, () => undefined);
    const voice = latest();
    mixer.playSong("hello");
    await flush();
    const song = latest();
    await mixer.preload(refs.woof);
    mixer.playSfx("woof");
    const sfx = latest();
    mixer.setSoundEnabled(false);
    expect(masterOf(voice).gain.target).toBe(0);
    expect(mixer.snapshot().levels.master).toBe(0);
    expect(song.playing).toBe(false);
    expect(sfx.playing).toBe(false);
    expect(voice.playing).toBe(true);
    expect(mixer.canPlayVoice()).toBe(false);
    expect(mixer.playSong("hello")).toBe(0);
    mixer.setSoundEnabled(true);
    expect(masterOf(voice).gain.target).toBe(AUDIO_LEVELS.master);
  });

  it("stopAll ends every sound without callbacks", async () => {
    const { mixer, refs, ctx } = setup();
    await mixer.unlock();
    const ended: string[] = [];
    mixer.setBed("meadowBed");
    mixer.playSong("hello");
    await flush();
    await mixer.startVoice(refs.line, () => ended.push("voice"));
    mixer.stopAll();
    expect(ctx().sources.every((source) => !source.playing)).toBe(true);
    for (const source of ctx().sources) source.end();
    expect(ended).toEqual([]);
    expect(mixer.snapshot()).toMatchObject({ voices: 0, sfx: 0, bedId: null, songId: null });
  });

  it("dispose closes the one context; later calls and late decodes do nothing", async () => {
    const { mixer, refs, library, ctx } = setup();
    await mixer.unlock();
    const release = library.gate(refs.meadowBed.url);
    mixer.setBed("meadowBed");
    const changes: boolean[] = [];
    mixer.onPauseChange((paused) => changes.push(paused));
    mixer.dispose();
    release();
    await flush();
    expect(ctx().state).toBe("closed");
    expect(ctx().closeCalls).toBe(1);
    expect(ctx().sources).toHaveLength(0);
    await expect(mixer.unlock()).resolves.toBe(false);
    await expect(mixer.startVoice(refs.line, () => undefined)).resolves.toBeNull();
    mixer.playSfx("woof");
    mixer.setBed("homeBed");
    mixer.pauseAll();
    expect(mixer.playSong("hello")).toBe(0);
    await flush();
    expect(ctx().sources).toHaveLength(0);
    expect(changes).toEqual([]);
    expect(mixer.snapshot()).toMatchObject({ contextState: "closed", unlocked: false });
    mixer.dispose();
  });
});

describe("audio mixer: decode cache", () => {
  it("fetches each clip once and remembers failures until the cache is cleared", async () => {
    const { mixer, refs, library } = setup();
    await expect(mixer.preload(refs.woof)).resolves.toBe(true);
    await expect(mixer.preload(refs.woof)).resolves.toBe(true);
    await mixer.unlock();
    mixer.playSfx("woof");
    await flush();
    expect(library.count(refs.woof.url)).toBe(1);
    library.failing.add(refs.pop.url);
    await expect(mixer.preload(refs.pop)).resolves.toBe(false);
    mixer.playSfx("pop");
    await flush();
    expect(library.count(refs.pop.url)).toBe(1);
    library.failing.delete(refs.pop.url);
    mixer.clearCache();
    await expect(mixer.preload(refs.pop)).resolves.toBe(true);
    expect(library.count(refs.pop.url)).toBe(2);
  });

  it("keeps decoded audio within its memory budget", async () => {
    const lineBytes = 2 * RATE * 4;
    const { mixer, refs, library } = setup({ cacheBudgetBytes: lineBytes * 2 });
    await mixer.preload(refs.line);
    await mixer.preload(refs.line2);
    await mixer.preload(refs.line3);
    expect(mixer.snapshot().cachedBytes).toBeLessThanOrEqual(lineBytes * 2);
    await mixer.preload(refs.line3);
    expect(library.count(refs.line3.url)).toBe(1);
    await mixer.preload(refs.line);
    expect(library.count(refs.line.url)).toBe(2);
  });
});

describe("audio mixer + narration player", () => {
  it("narrates on the shared context, follows pauseAll and leaves nothing behind", async () => {
    const { mixer, manifest, timers, ctx, latest } = setup();
    await mixer.unlock();
    const ended: string[] = [];
    const player = createNarrationPlayer({
      mixer,
      clip: (key) => manifest.lines[key],
      onStart: () => undefined,
      onEnd: (key) => ended.push(key),
      estimateMs: () => 2000,
      now: () => timers.now,
      schedule: timers.schedule
    });
    player.play(LINE_1);
    await flush();
    const first = latest();
    expect(first.playing).toBe(true);
    expect(mixer.snapshot()).toMatchObject({ ducked: true, voices: 1 });
    expect(player.timing()).toMatchObject({ mode: "audio", durationMs: 2000 });

    ctx().currentTime = 0.8;
    timers.advance(800);
    mixer.pauseAll();
    expect(first.playing).toBe(false);
    expect(player.isPaused()).toBe(true);
    timers.advance(60_000);
    expect(ended).toEqual([]);
    mixer.resumeAll();
    const resumed = latest();
    expect(resumed).not.toBe(first);
    expect(resumed.started?.offset).toBeCloseTo(0.8, 6);
    resumed.end();
    expect(ended).toEqual(["e17.greet.1"]);
    expect(mixer.snapshot().ducked).toBe(false);

    player.play(LINE_2);
    await flush();
    const second = latest();
    expect(second.playing).toBe(true);
    player.dispose();
    expect(second.playing).toBe(false);
    expect(mixer.snapshot()).toMatchObject({ ducked: false, voices: 0 });
    expect(timers.pending).toBe(0);
    second.end();
    expect(ended).toEqual(["e17.greet.1"]);
    mixer.dispose();
  });

  it("never sounds a line that was stopped or paused while its clip loaded", async () => {
    const { mixer, manifest, timers, ctx, library, refs, latest } = setup();
    await mixer.unlock();
    const ended: string[] = [];
    const player = createNarrationPlayer({
      mixer,
      clip: (key) => manifest.lines[key],
      onStart: () => undefined,
      onEnd: (key) => ended.push(key),
      estimateMs: () => 2000,
      now: () => timers.now,
      schedule: timers.schedule
    });
    const releaseFirst = library.gate(refs.line.url);
    player.play(LINE_1);
    player.stop();
    releaseFirst();
    await flush();
    expect(ctx().sources).toHaveLength(0);
    expect(mixer.snapshot()).toMatchObject({ voices: 0, ducked: false });

    const releaseSecond = library.gate(refs.line2.url);
    player.play(LINE_2);
    player.pause();
    releaseSecond();
    await flush();
    expect(ctx().sources).toHaveLength(0);
    expect(mixer.snapshot().voices).toBe(1);
    player.resume();
    expect(latest().playing).toBe(true);
    expect(latest().started?.offset).toBe(0);
    latest().end();
    expect(ended).toEqual(["e17.greet.2"]);
    player.dispose();
    mixer.dispose();
  });
});
