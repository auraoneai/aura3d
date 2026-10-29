// PRD 04 J04 (B05): narration queue, stop, duck, mute, pause/resume and
// disposal, with a fake mixer, fake voice handles and a manual scheduler.
import { describe, expect, it } from "vitest";
import type { VoiceHandle, VoiceIntent } from "../../../src/runtime/audio-mixer.js";
import {
  FALLBACK_LINE_MS,
  SAFETY_MS,
  createNarrationPlayer,
  type NarrationMixer
} from "../../../src/runtime/narration-player.js";
import type { AudioClipRef, LineRef } from "../../../src/types.js";

class FakeVoice implements VoiceHandle {
  readonly durationMs: number;
  position = 0;
  paused = false;
  stopped = false;
  pauses = 0;
  resumes = 0;
  private readonly onEnded: () => void;

  constructor(durationMs: number, onEnded: () => void) {
    this.durationMs = durationMs;
    this.onEnded = onEnded;
  }

  positionMs(): number {
    return this.position;
  }

  pause(): void {
    this.pauses += 1;
    this.paused = true;
  }

  resume(): void {
    this.resumes += 1;
    this.paused = false;
  }

  stop(): void {
    this.stopped = true;
  }

  /** The clip reaches its end (the real mixer never reports a stopped voice). */
  finish(): void {
    if (!this.stopped) this.onEnded();
  }

  /** A stray end report that arrives anyway (late or duplicate callback). */
  lateEnd(): void {
    this.onEnded();
  }
}

interface VoiceRequest {
  readonly clip: AudioClipRef;
  readonly onEnded: () => void;
  readonly intent: (() => VoiceIntent) | undefined;
  readonly resolve: (handle: VoiceHandle | null) => void;
  readonly reject: (error: Error) => void;
}

class FakeMixer implements NarrationMixer {
  canPlay = true;
  paused = false;
  readonly ducks: boolean[] = [];
  readonly requests: VoiceRequest[] = [];
  readonly voices: FakeVoice[] = [];
  private readonly listeners = new Set<(paused: boolean) => void>();

  canPlayVoice(): boolean {
    return this.canPlay && !this.paused;
  }

  startVoice(clip: AudioClipRef, onEnded: () => void, intent?: () => VoiceIntent): Promise<VoiceHandle | null> {
    return new Promise<VoiceHandle | null>((resolve, reject) => {
      this.requests.push({ clip, onEnded, intent, resolve, reject });
    });
  }

  private request(index: number): VoiceRequest {
    const request = this.requests[index];
    if (!request) throw new Error(`no voice request ${index}`);
    return request;
  }

  /** What request `index` would do if its clip were ready now (the real mixer asks this). */
  intentOf(index: number): VoiceIntent {
    return this.request(index).intent?.() ?? "play";
  }

  /**
   * The clip of request `index` is ready. Like the real mixer, asks the
   * request's intent first: "drop" resolves null (returned here as null),
   * "hold" hands back a voice that is held until resume().
   */
  async ready(index = this.requests.length - 1): Promise<FakeVoice | null> {
    const request = this.request(index);
    const intent = this.intentOf(index);
    if (intent === "drop") {
      request.resolve(null);
      await flush();
      return null;
    }
    const voice = new FakeVoice(request.clip.durationMs, request.onEnded);
    voice.paused = intent === "hold";
    this.voices.push(voice);
    request.resolve(voice);
    await flush();
    return voice;
  }

  /** `ready()` for a request that must produce a voice. */
  async grant(index = this.requests.length - 1): Promise<FakeVoice> {
    const voice = await this.ready(index);
    if (!voice) throw new Error(`voice request ${index} was dropped`);
    return voice;
  }

  /** Resolves request `index` with a playing voice without asking its intent (a stale callback). */
  async grantAnyway(index: number): Promise<FakeVoice> {
    const request = this.request(index);
    const voice = new FakeVoice(request.clip.durationMs, request.onEnded);
    this.voices.push(voice);
    request.resolve(voice);
    await flush();
    return voice;
  }

  duck(on: boolean): void {
    this.ducks.push(on);
  }

  isPaused(): boolean {
    return this.paused;
  }

  onPauseChange(listener: (paused: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** What pauseAll()/resumeAll() do from the narration player's point of view. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    for (const listener of [...this.listeners]) listener(paused);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  get ducked(): boolean {
    return this.ducks.at(-1) ?? false;
  }

  get audible(): FakeVoice[] {
    return this.voices.filter((voice) => !voice.stopped && !voice.paused);
  }
}

class FakeClock {
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

const clipRef = (durationMs: number, name: string): AudioClipRef => ({
  url: `/audio/lines/${name}.mp3`,
  sha256: "0".repeat(64),
  durationMs
});

const LINE_A: LineRef = { speaker: "momo", key: "e17.greet.1" };
const LINE_B: LineRef = { speaker: "momo", key: "e17.greet.2" };
/** No recorded clip: always caption timing. */
const LINE_X: LineRef = { speaker: "narrator", key: "e17.hook.1" };

interface SetupOptions {
  readonly estimate?: number;
  readonly onStart?: (line: LineRef) => void;
}

function setup(options: SetupOptions = {}) {
  const clock = new FakeClock();
  const mixer = new FakeMixer();
  const events: string[] = [];
  const clips: Readonly<Record<string, AudioClipRef | undefined>> = {
    [LINE_A.key]: clipRef(3000, LINE_A.key),
    [LINE_B.key]: clipRef(2000, LINE_B.key)
  };
  const player = createNarrationPlayer({
    mixer,
    clip: (key) => clips[key],
    onStart: (line) => {
      events.push(`start:${line.key}`);
      options.onStart?.(line);
    },
    onEnd: (key) => events.push(`end:${key}`),
    estimateMs: () => options.estimate ?? 2500,
    now: () => clock.now,
    schedule: clock.schedule
  });
  const ends = (): string[] => events.filter((event) => event.startsWith("end:"));
  return { clock, mixer, events, ends, player };
}

describe("narration player: recorded lines", () => {
  it("plays a line, ducks music while it plays and ends exactly once", async () => {
    const { player, mixer, clock, events, ends } = setup();
    player.play(LINE_A);
    expect(events).toEqual(["start:e17.greet.1"]);
    expect(mixer.ducks).toEqual([true]);
    expect(mixer.requests).toHaveLength(1);
    expect(player.timing()).toMatchObject({ mode: "loading", key: LINE_A.key, speaker: "momo" });
    const voice = await mixer.grant();
    expect(player.current()).toEqual(LINE_A);
    expect(player.timing()).toMatchObject({ mode: "audio", durationMs: 3000, paused: false });
    clock.advance(2900);
    voice.finish();
    expect(events).toEqual(["start:e17.greet.1", "end:e17.greet.1"]);
    expect(mixer.ducks).toEqual([true, false]);
    expect(player.current()).toBeNull();
    expect(clock.pending).toBe(0);
    voice.lateEnd();
    clock.advance(60_000);
    expect(ends()).toEqual(["end:e17.greet.1"]);
  });

  it("never lets two lines overlap", async () => {
    const { player, mixer, ends } = setup();
    player.play(LINE_A);
    const a = await mixer.grant();
    player.play(LINE_B);
    expect(a.stopped).toBe(true);
    const b = await mixer.grant();
    expect(mixer.audible).toEqual([b]);
    a.lateEnd();
    expect(ends()).toEqual([]);
    b.finish();
    expect(ends()).toEqual(["end:e17.greet.2"]);
  });

  it("stops a voice whose request resolves after its line was replaced", async () => {
    const { player, mixer, ends } = setup();
    player.play(LINE_A);
    player.play(LINE_B);
    expect(mixer.intentOf(0)).toBe("drop");
    // A mixer that resolves the stale request anyway still gets its voice stopped.
    const stale = await mixer.grantAnyway(0);
    expect(stale.stopped).toBe(true);
    const fresh = await mixer.grant(1);
    expect(fresh.stopped).toBe(false);
    expect(mixer.audible).toEqual([fresh]);
    stale.lateEnd();
    fresh.finish();
    expect(ends()).toEqual(["end:e17.greet.2"]);
  });

  it("ends a clip that never reports its end with the safety timer", async () => {
    const { player, mixer, clock, ends } = setup();
    player.play(LINE_A);
    const voice = await mixer.grant();
    clock.advance(3000 + SAFETY_MS - 1);
    expect(ends()).toEqual([]);
    clock.advance(1);
    expect(ends()).toEqual(["end:e17.greet.1"]);
    expect(voice.stopped).toBe(true);
    expect(mixer.ducked).toBe(false);
  });

  it("gives a clip that starts late a fresh safety deadline", async () => {
    const { player, mixer, clock, ends } = setup();
    player.play(LINE_A);
    clock.advance(4000);
    const voice = await mixer.grant();
    clock.advance(3000 + SAFETY_MS - 1);
    expect(ends()).toEqual([]);
    voice.finish();
    expect(ends()).toEqual(["end:e17.greet.1"]);
  });

  it("never starts a clip that finishes loading after its line was stopped, muted or timed out", async () => {
    const { player, mixer, clock, ends } = setup({ estimate: 2500 });
    player.play(LINE_A);
    player.stop();
    expect(await mixer.ready(0)).toBeNull();

    player.play(LINE_B);
    player.setMuted(true);
    expect(await mixer.ready(1)).toBeNull();
    clock.advance(2500);
    expect(ends()).toEqual(["end:e17.greet.2"]);
    player.setMuted(false);

    // Slow network: the safety deadline ends the line before its clip arrives.
    player.play(LINE_A);
    clock.advance(3000 + SAFETY_MS);
    expect(ends()).toEqual(["end:e17.greet.2", "end:e17.greet.1"]);
    expect(await mixer.ready(2)).toBeNull();
    expect(mixer.voices).toEqual([]);
    expect(mixer.ducked).toBe(false);
  });

  it("holds a clip that finishes loading while the line is paused, and plays it on resume", async () => {
    const { player, mixer, clock, ends } = setup();
    player.play(LINE_A);
    player.pause();
    const voice = await mixer.grant();
    expect(voice.paused).toBe(true);
    expect(mixer.audible).toEqual([]);
    clock.advance(60_000);
    expect(ends()).toEqual([]);
    player.resume();
    expect(mixer.audible).toEqual([voice]);
    expect(player.timing()).toMatchObject({ mode: "audio", paused: false });
    voice.finish();
    expect(ends()).toEqual(["end:e17.greet.1"]);
  });
});

describe("narration player: caption timing fallback", () => {
  it("runs a line with no recorded clip on caption timing, without ducking", () => {
    const { player, mixer, clock, events } = setup({ estimate: 2400 });
    player.play(LINE_X);
    expect(mixer.requests).toHaveLength(0);
    expect(mixer.ducks).toEqual([]);
    expect(player.timing()).toMatchObject({ mode: "caption", durationMs: 2400 });
    clock.advance(2399);
    expect(events).toEqual(["start:e17.hook.1"]);
    clock.advance(1);
    expect(events).toEqual(["start:e17.hook.1", "end:e17.hook.1"]);
  });

  it("uses caption timing when muted or when audio is locked", () => {
    const { player, mixer, clock, ends } = setup({ estimate: 2500 });
    player.setMuted(true);
    player.play(LINE_A);
    expect(mixer.requests).toHaveLength(0);
    clock.advance(2500);
    expect(ends()).toEqual(["end:e17.greet.1"]);
    player.setMuted(false);
    mixer.canPlay = false;
    player.play(LINE_B);
    expect(mixer.requests).toHaveLength(0);
    clock.advance(2499);
    expect(ends()).toEqual(["end:e17.greet.1"]);
    clock.advance(1);
    expect(ends()).toEqual(["end:e17.greet.1", "end:e17.greet.2"]);
  });

  it("falls back to captions when audio fails, keeping the time already spent", async () => {
    const { player, mixer, clock, ends } = setup({ estimate: 2500 });
    player.play(LINE_A);
    clock.advance(1000);
    mixer.requests[0]?.resolve(null);
    await flush();
    expect(player.timing()?.mode).toBe("caption");
    expect(mixer.ducked).toBe(false);
    clock.advance(1499);
    expect(ends()).toEqual([]);
    clock.advance(1);
    expect(ends()).toEqual(["end:e17.greet.1"]);

    player.play(LINE_B);
    mixer.requests[1]?.reject(new Error("decode failed"));
    await flush();
    clock.advance(2500);
    expect(ends()).toEqual(["end:e17.greet.1", "end:e17.greet.2"]);
  });

  it("uses the fallback length when the estimate is unusable", () => {
    const { player, clock, ends } = setup({ estimate: Number.NaN });
    player.play(LINE_X);
    clock.advance(FALLBACK_LINE_MS - 1);
    expect(ends()).toEqual([]);
    clock.advance(1);
    expect(ends()).toEqual(["end:e17.hook.1"]);
  });

  it("never calls onEnd synchronously from play()", () => {
    const { player, clock, events } = setup({ estimate: 0 });
    player.play(LINE_X);
    expect(events).toEqual(["start:e17.hook.1"]);
    clock.advance(0);
    expect(events).toEqual(["start:e17.hook.1", "end:e17.hook.1"]);
  });

  it("still ends a line whose onStart throws", () => {
    let throwOnce = true;
    const { player, clock, ends } = setup({
      onStart: () => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error("caption layer failed");
        }
      }
    });
    expect(() => player.play(LINE_X)).toThrow("caption layer failed");
    clock.advance(2500);
    expect(ends()).toEqual(["end:e17.hook.1"]);
  });
});

describe("narration player: pause, resume, mute", () => {
  it("continues a caption line where it stopped", () => {
    const { player, clock, ends } = setup({ estimate: 3000 });
    player.play(LINE_X);
    clock.advance(1000);
    player.pause();
    expect(player.isPaused()).toBe(true);
    expect(player.timing()).toMatchObject({ paused: true, elapsedMs: 1000 });
    clock.advance(60_000);
    expect(ends()).toEqual([]);
    player.resume();
    clock.advance(1999);
    expect(ends()).toEqual([]);
    clock.advance(1);
    expect(ends()).toEqual(["end:e17.hook.1"]);
  });

  it("continues a recorded line from its position instead of restarting it", async () => {
    const { player, mixer, clock, events } = setup();
    player.play(LINE_A);
    const voice = await mixer.grant();
    clock.advance(1000);
    voice.position = 1000;
    player.pause();
    expect(voice.paused).toBe(true);
    clock.advance(30_000);
    expect(events).toEqual(["start:e17.greet.1"]);
    player.resume();
    expect(voice.resumes).toBe(1);
    expect(mixer.requests).toHaveLength(1);
    expect(events).toEqual(["start:e17.greet.1"]);
    voice.finish();
    expect(events).toEqual(["start:e17.greet.1", "end:e17.greet.1"]);
  });

  it("follows the mixer's pauseAll and resumeAll", async () => {
    const { player, mixer, clock, ends } = setup({ estimate: 3000 });
    player.play(LINE_X);
    clock.advance(500);
    mixer.setPaused(true);
    expect(player.isPaused()).toBe(true);
    clock.advance(60_000);
    expect(ends()).toEqual([]);
    mixer.setPaused(false);
    clock.advance(2499);
    expect(ends()).toEqual([]);
    clock.advance(1);
    expect(ends()).toEqual(["end:e17.hook.1"]);

    player.play(LINE_A);
    const voice = await mixer.grant();
    mixer.setPaused(true);
    expect(voice.paused).toBe(true);
    mixer.setPaused(false);
    expect(voice.paused).toBe(false);
    expect(voice.resumes).toBe(1);
  });

  it("stays paused until both the caller and the mixer resume", () => {
    const { player, mixer, clock, ends } = setup({ estimate: 1000 });
    player.play(LINE_X);
    player.pause();
    mixer.setPaused(true);
    mixer.setPaused(false);
    clock.advance(10_000);
    expect(ends()).toEqual([]);
    player.resume();
    clock.advance(1000);
    expect(ends()).toEqual(["end:e17.hook.1"]);
  });

  it("starts a line played while paused only on resume", () => {
    const { player, mixer, clock, events } = setup();
    player.pause();
    player.play(LINE_A);
    expect(events).toEqual(["start:e17.greet.1"]);
    expect(mixer.requests).toHaveLength(0);
    expect(player.timing()).toMatchObject({ mode: "waiting", paused: true });
    clock.advance(60_000);
    expect(events).toEqual(["start:e17.greet.1"]);
    player.resume();
    expect(mixer.requests).toHaveLength(1);
    expect(mixer.ducked).toBe(true);
  });

  it("muting mid-line keeps the line's remaining time", async () => {
    const { player, mixer, clock, ends } = setup();
    player.play(LINE_A);
    const voice = await mixer.grant();
    clock.advance(1000);
    voice.position = 1000;
    player.setMuted(true);
    expect(voice.stopped).toBe(true);
    expect(mixer.ducked).toBe(false);
    expect(player.timing()?.mode).toBe("caption");
    clock.advance(1999);
    expect(ends()).toEqual([]);
    clock.advance(1);
    expect(ends()).toEqual(["end:e17.greet.1"]);
    voice.lateEnd();
    expect(ends()).toEqual(["end:e17.greet.1"]);
  });
});

describe("narration player: stop, replay and dispose", () => {
  it("stop() cancels without onEnd and ignores late callbacks", async () => {
    const { player, mixer, clock, events } = setup();
    player.play(LINE_A);
    const voice = await mixer.grant();
    player.stop();
    expect(voice.stopped).toBe(true);
    expect(mixer.ducked).toBe(false);
    expect(player.current()).toBeNull();
    expect(clock.pending).toBe(0);
    voice.lateEnd();
    clock.advance(60_000);
    expect(events).toEqual(["start:e17.greet.1"]);
  });

  it("replay() restarts the current line from the beginning", async () => {
    const { player, mixer, clock, events, ends } = setup();
    expect(player.replay()).toBe(false);
    player.play(LINE_A);
    const first = await mixer.grant();
    clock.advance(1000);
    expect(player.replay()).toBe(true);
    expect(first.stopped).toBe(true);
    expect(events).toEqual(["start:e17.greet.1", "start:e17.greet.1"]);
    expect(mixer.requests).toHaveLength(2);
    const second = await mixer.grant(1);
    first.lateEnd();
    second.finish();
    expect(ends()).toEqual(["end:e17.greet.1"]);
    expect(player.replay()).toBe(true);
    expect(mixer.requests).toHaveLength(3);
  });

  it("dispose() leaves no timer, audio, duck or subscription behind", async () => {
    const { player, mixer, clock, events } = setup();
    player.play(LINE_A);
    expect(mixer.listenerCount).toBe(1);
    player.dispose();
    expect(clock.pending).toBe(0);
    expect(mixer.ducked).toBe(false);
    expect(mixer.listenerCount).toBe(0);
    expect(mixer.intentOf(0)).toBe("drop");
    const late = await mixer.grantAnyway(0);
    expect(late.stopped).toBe(true);
    late.lateEnd();
    clock.advance(60_000);
    player.play(LINE_B);
    player.resume();
    player.setMuted(true);
    expect(player.replay()).toBe(false);
    expect(player.current()).toBeNull();
    expect(events).toEqual(["start:e17.greet.1"]);
    expect(mixer.requests).toHaveLength(1);
    player.dispose();
  });
});
