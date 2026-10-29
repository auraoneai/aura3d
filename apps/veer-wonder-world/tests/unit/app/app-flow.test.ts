/// <reference types="node" />
// App shell flow (PRD 04 A06 and B12; PRD 03 sections 3-4 and 6; PRD 06
// QA-E02..E05, QA-E09, QA-E10, QA-A03, QA-A09, QA-P04): the director effect
// routing and the per-story runner of src/app.ts, driven with plain-object
// fakes for the stage, the mixer, the narration player and the captions. No DOM
// and no clock: story time moves only through tick().

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CANVAS_TAP_DEBOUNCE_MS,
  LINE_GRACE_MS,
  RUN_TO_END_DEFAULT_MS,
  STEP_MS,
  TAP_DEBOUNCE_MS,
  createStoryClock,
  createStoryRunner,
  findStory,
  routeDirectorEffect,
  routeDirectorEffects,
  spokenLineMs,
  stepsFor,
  storyLineKeys,
  storyMusic,
  talkingActorFor,
  type FinishReason,
  type StoryRunner,
  type StorySinks
} from "../../../src/app.js";
import { AUDIO_MANIFEST } from "../../../src/audio-manifest.generated.js";
import { ACTIVITIES, EPISODES, STORIES } from "../../../src/content/catalog.js";
import { estimateLineMs } from "../../../src/content/schema.js";
import { en } from "../../../src/localization/en/index.js";
import { MAX_TARGETS, beatWaits } from "../../../src/runtime/beat-runner.js";
import { bindCanvasTaps, type TapListener, type TapSurface } from "../../../src/runtime/touch-router.js";
import { LOOK_HDRI_FILES } from "../../../src/scenes/looks.js";
import type { DirectorEffect, LineRef, PlayMode, StageAction, StorySpec } from "../../../src/types.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Call {
  readonly sink: string;
  readonly method: string;
  readonly args: readonly unknown[];
}

interface Harness {
  readonly runner: StoryRunner;
  readonly calls: Call[];
  readonly offline: string[];
  readonly finished: FinishReason[];
  readonly mediaPaused: boolean[];
  /** Calls of one sink method, in order. */
  of(sink: string, method: string): Call[];
  /** Ticks until the story ends or `limitMs` of story time passed; returns the story time used. */
  runSilently(limitMs?: number): number;
  /** Ticks until `until()` holds (or the story ends); returns whether it held. */
  tickUntil(until: () => boolean, limitMs?: number): boolean;
}

interface HarnessOptions {
  readonly mode?: PlayMode;
  readonly followNarration?: boolean;
  /** The fake narration calls lineStarted synchronously from play(), like the real player's onStart. */
  readonly echoStart?: boolean;
  readonly waitMs?: number;
  readonly reducedMotion?: boolean;
}

const lineMs = (key: string): number => spokenLineMs(en.lines[key] ?? "", AUDIO_MANIFEST.lines[key]);

/** Plain-object sinks that record every call. */
function recordingSinks(calls: Call[], extra: Partial<Pick<StorySinks, "onMediaPaused" | "onFinished" | "onOffline" | "onTurn">> = {}, onPlay?: (line: LineRef) => void): StorySinks {
  const record =
    (sink: string, method: string) =>
    (...args: unknown[]): void => {
      calls.push({ sink, method, args });
    };
  return {
    stage: { apply: record("stage", "apply"), setTalking: record("stage", "setTalking"), setTargets: record("stage", "setTargets") },
    audio: {
      playSfx: record("audio", "playSfx"),
      playSong: (...args: unknown[]) => {
        calls.push({ sink: "audio", method: "playSong", args });
        return 0;
      },
      setBed: record("audio", "setBed"),
      pauseAll: record("audio", "pauseAll"),
      resumeAll: record("audio", "resumeAll"),
      stopAll: record("audio", "stopAll")
    },
    narration: {
      play: (line: LineRef) => {
        calls.push({ sink: "narration", method: "play", args: [line] });
        onPlay?.(line);
      },
      stop: record("narration", "stop"),
      pause: record("narration", "pause"),
      resume: record("narration", "resume")
    },
    captions: { show: record("captions", "show"), clear: record("captions", "clear"), setTip: record("captions", "setTip") },
    text: { line: (key: string) => en.lines[key] ?? key, str: (key: string) => en.strings[key] ?? key },
    ...extra
  };
}

function harness(story: StorySpec, options: HarnessOptions = {}): Harness {
  const calls: Call[] = [];
  const offline: string[] = [];
  const finished: FinishReason[] = [];
  const mediaPaused: boolean[] = [];
  let runner: StoryRunner | null = null;
  const sinks = recordingSinks(
    calls,
    {
      onMediaPaused: (paused) => mediaPaused.push(paused),
      onFinished: (reason) => finished.push(reason),
      onOffline: (key) => offline.push(key)
    },
    options.echoStart ? (line) => runner?.lineStarted(line) : undefined
  );
  const created = createStoryRunner({
    story,
    mode: options.mode ?? "play-together",
    sinks,
    lineMs,
    followNarration: options.followNarration ?? false,
    reducedMotion: options.reducedMotion === true,
    ...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {})
  });
  runner = created;
  const self: Harness = {
    runner: created,
    calls,
    offline,
    finished,
    mediaPaused,
    of: (sink, method) => calls.filter((call) => call.sink === sink && call.method === method),
    runSilently(limitMs = RUN_TO_END_DEFAULT_MS) {
      let used = 0;
      while (created.finishReason() === null && used < limitMs) {
        created.tick(STEP_MS);
        used += STEP_MS;
      }
      return used;
    },
    tickUntil(until, limitMs = RUN_TO_END_DEFAULT_MS) {
      let used = 0;
      while (!until() && created.finishReason() === null && used < limitMs) {
        created.tick(STEP_MS);
        used += STEP_MS;
      }
      return until();
    }
  };
  return self;
}

function storyOf(id: string): StorySpec {
  const story = findStory(id);
  if (!story) throw new Error(`missing story ${id}`);
  return story;
}

const golden = storyOf("sheru-big-adventure");
const ballGame = storyOf("sheru-ball");

function fakeRouter(calls: Call[]): { setTargets(ids: readonly string[] | null): void; reset(): void } {
  return {
    setTargets: (ids) => calls.push({ sink: "router", method: "setTargets", args: [ids] }),
    reset: () => calls.push({ sink: "router", method: "reset", args: [] })
  };
}

describe("director effect routing", () => {
  it("sends stage actions to the stage and their sounds and music to the mixer, in order", () => {
    const calls: Call[] = [];
    const actions: StageAction[] = [
      { do: "enter", actor: "momo", at: "left", from: "offLeft" },
      { do: "sfx", sound: "woof" },
      { do: "song", song: "goStop" },
      { do: "music", bed: "meadowBed" },
      { do: "camera", preset: "wide" },
      { do: "music", bed: null }
    ];
    routeDirectorEffect({ type: "stage", actions }, recordingSinks(calls), fakeRouter(calls));
    expect(calls.map((c) => `${c.sink}.${c.method}`)).toEqual([
      "stage.apply",
      "audio.playSfx",
      "audio.playSong",
      "audio.setBed",
      "audio.setBed"
    ]);
    expect(calls[0]?.args[0]).toBe(actions);
    expect(calls.slice(1).map((c) => c.args[0])).toEqual(["woof", "goStop", "meadowBed", null]);
  });

  it("plays a line on the narration player; stopSpeech stops it, the talking pulse and the caption", () => {
    const calls: Call[] = [];
    const sinks = recordingSinks(calls);
    const line: LineRef = { speaker: "momo", key: "e17.hook.1" };
    routeDirectorEffect({ type: "speak", line }, sinks, fakeRouter(calls));
    expect(calls).toEqual([{ sink: "narration", method: "play", args: [line] }]);
    calls.length = 0;
    routeDirectorEffect({ type: "stopSpeech" }, sinks, fakeRouter(calls));
    expect(calls.map((c) => `${c.sink}.${c.method}`)).toEqual(["narration.stop", "stage.setTalking", "captions.clear"]);
    expect(calls[1]?.args).toEqual([null]);
  });

  it("gives tap targets to both the touch router and the stage highlights; null clears both", () => {
    const calls: Call[] = [];
    const sinks = recordingSinks(calls);
    routeDirectorEffect({ type: "targets", targets: ["ball"] }, sinks, fakeRouter(calls));
    routeDirectorEffect({ type: "targets", targets: null }, sinks, fakeRouter(calls));
    expect(calls).toEqual([
      { sink: "router", method: "setTargets", args: [["ball"]] },
      { sink: "stage", method: "setTargets", args: [["ball"]] },
      { sink: "router", method: "setTargets", args: [null] },
      { sink: "stage", method: "setTargets", args: [null] }
    ]);
  });

  it("tells the grown-up controls when a turn waits, and when it stops waiting or the story ends", () => {
    const calls: Call[] = [];
    const turns: boolean[] = [];
    const sinks = recordingSinks(calls, { onTurn: (waiting) => turns.push(waiting) });
    routeDirectorEffects(
      [
        { type: "targets", targets: ["ball"] },
        { type: "targets", targets: null },
        { type: "targets", targets: ["ball", "sheru"] },
        { type: "finished", reason: "all-done" }
      ],
      sinks,
      fakeRouter(calls)
    );
    expect(turns).toEqual([true, false, true, false]);
  });

  it("turns caregiver keys into the parent tip text, and null hides the tip", () => {
    const calls: Call[] = [];
    const sinks = recordingSinks(calls);
    routeDirectorEffect({ type: "caregiver", key: "e17.tip.1" }, sinks, fakeRouter(calls));
    routeDirectorEffect({ type: "caregiver", key: null }, sinks, fakeRouter(calls));
    const tip = en.strings["e17.tip.1"];
    expect(typeof tip).toBe("string");
    expect(calls).toEqual([
      { sink: "captions", method: "setTip", args: [tip] },
      { sink: "captions", method: "setTip", args: [null] }
    ]);
  });

  it("pauses and resumes the mixer and the narration together", () => {
    const calls: Call[] = [];
    const paused: boolean[] = [];
    const sinks = recordingSinks(calls, { onMediaPaused: (p) => paused.push(p) });
    routeDirectorEffects([{ type: "pauseMedia" }, { type: "resumeMedia" }], sinks, fakeRouter(calls));
    expect(calls.map((c) => `${c.sink}.${c.method}`)).toEqual(["audio.pauseAll", "narration.pause", "narration.resume", "audio.resumeAll"]);
    expect(paused).toEqual([true, false]);
  });

  it("stops every sound when a story finishes, leaves nothing paused, and only asks for the offline card", () => {
    const calls: Call[] = [];
    const finished: FinishReason[] = [];
    const offline: string[] = [];
    const sinks = recordingSinks(calls, { onFinished: (r) => finished.push(r), onOffline: (k) => offline.push(k) });
    routeDirectorEffects(
      [
        { type: "finished", reason: "complete" },
        { type: "offline", key: "e17.offline" }
      ],
      sinks,
      fakeRouter(calls)
    );
    const names = calls.map((c) => `${c.sink}.${c.method}`);
    expect(names).toEqual([
      "router.reset",
      "stage.setTargets",
      "stage.setTalking",
      "narration.stop",
      "audio.stopAll",
      "narration.resume",
      "audio.resumeAll",
      "captions.clear",
      "captions.setTip"
    ]);
    // Nothing that could start content (no line, song, sound or bed) is called at the end.
    expect(names.some((n) => n === "narration.play" || n === "audio.playSong" || n === "audio.playSfx" || n === "audio.setBed")).toBe(false);
    expect(finished).toEqual(["complete"]);
    expect(offline).toEqual(["e17.offline"]);
  });

  it("handles every effect type the director can emit", () => {
    const effects: DirectorEffect[] = [
      { type: "stage", actions: [] },
      { type: "speak", line: { speaker: "narrator", key: "e17.greet.1" } },
      { type: "stopSpeech" },
      { type: "targets", targets: ["ball"] },
      { type: "caregiver", key: null },
      { type: "pauseMedia" },
      { type: "resumeMedia" },
      { type: "finished", reason: "all-done" },
      { type: "offline", key: "e17.offline" }
    ];
    const calls: Call[] = [];
    expect(() => routeDirectorEffects(effects, recordingSinks(calls), fakeRouter(calls))).not.toThrow();
  });
});

describe("story clock", () => {
  it("runs timers in due order once story time reaches them, never synchronously", () => {
    const clock = createStoryClock();
    const order: string[] = [];
    clock.schedule(() => order.push("b@120"), 120);
    clock.schedule(() => order.push("a@50"), 50);
    clock.schedule(() => order.push("c@120"), 120);
    expect(order).toEqual([]);
    clock.advance(50);
    expect(order).toEqual(["a@50"]);
    expect(clock.now()).toBe(50);
    clock.advance(50);
    expect(order).toEqual(["a@50"]);
    clock.advance(50);
    expect(order).toEqual(["a@50", "b@120", "c@120"]);
    expect(clock.pending()).toBe(0);
  });

  it("cancels timers, runs zero-delay timers on the next advance and runs timers added while firing", () => {
    const clock = createStoryClock(1000);
    const order: string[] = [];
    const cancel = clock.schedule(() => order.push("cancelled"), 10);
    cancel();
    clock.schedule(() => {
      order.push("first");
      clock.schedule(() => order.push("chained"), 0);
    }, 0);
    expect(order).toEqual([]);
    clock.advance(0);
    expect(order).toEqual(["first", "chained"]);
    clock.advance(STEP_MS);
    expect(order).toEqual(["first", "chained"]);
    expect(clock.now()).toBe(1000 + STEP_MS);
  });

  it("bounds a timer that keeps re-arming itself, so a step always ends", () => {
    const clock = createStoryClock();
    let runs = 0;
    const again = (): void => {
      runs += 1;
      clock.schedule(again, 0);
    };
    clock.schedule(again, 0);
    clock.advance(STEP_MS);
    expect(runs).toBeGreaterThan(0);
    expect(runs).toBeLessThanOrEqual(1000);
  });
});

describe("shell helpers", () => {
  it("times a line by its recorded clip, else by its caption estimate", () => {
    expect(spokenLineMs("Ball! A ball.", { url: "/x.mp3", sha256: "0", durationMs: 1234 })).toBe(1234);
    expect(spokenLineMs("Ball! A ball.", undefined)).toBe(estimateLineMs("Ball! A ball."));
    expect(spokenLineMs("Ball! A ball.", { url: "/x.mp3", sha256: "0", durationMs: 0 })).toBe(estimateLineMs("Ball! A ball."));
    // Live runs give the narration player's end-of-line a grace period before the director moves on by itself.
    expect(LINE_GRACE_MS).toBeGreaterThanOrEqual(1000);
  });

  it("gives the talking pulse to the speaking cast member or prop, never to the off-screen narrator", () => {
    expect(talkingActorFor(golden, "momo")).toBe("momo");
    expect(talkingActorFor(golden, "narrator")).toBeNull();
    expect(talkingActorFor(golden, "lulu")).toBeNull();
    const robotStory = storyOf("silly-robot-factory");
    const robotProp = robotStory.props.find((p) => p.asset === "robot");
    expect(robotProp).toBeDefined();
    expect(talkingActorFor(robotStory, "robot")).toBe(robotProp?.id);
  });

  it("finds stories by slug or code and lists their lines and music in play order", () => {
    expect(findStory("e17")).toBe(golden);
    expect(findStory("G03")).toBe(ballGame);
    expect(findStory("sheru-big-adventure")).toBe(golden);
    expect(findStory("no-such-story")).toBeUndefined();
    const keys = storyLineKeys(golden);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.startsWith("e17."))).toBe(true);
    expect(keys.every((key) => typeof en.lines[key] === "string")).toBe(true);
    const music = storyMusic(golden);
    expect(music.beds).toContain("meadowBed");
    for (const song of music.songs) expect(AUDIO_MANIFEST.songs[song]).toBeDefined();
  });

  it("turns QA milliseconds into whole 50 ms steps", () => {
    expect(stepsFor(0)).toBe(0);
    expect(stepsFor(-5)).toBe(0);
    expect(stepsFor(Number.NaN)).toBe(0);
    expect(stepsFor(10)).toBe(1);
    expect(stepsFor(1000)).toBe(20);
    expect(stepsFor(Number.POSITIVE_INFINITY)).toBe(0);
    expect(stepsFor(10 * RUN_TO_END_DEFAULT_MS)).toBe(RUN_TO_END_DEFAULT_MS / STEP_MS);
  });
});

describe("story runner", () => {
  it("finishes every episode and activity with zero input in both modes and ends on its offline card", () => {
    expect(EPISODES).toHaveLength(20);
    expect(ACTIVITIES).toHaveLength(12);
    for (const story of STORIES) {
      for (const mode of ["watch-sing", "play-together"] as const) {
        const h = harness(story, { mode });
        h.runner.start();
        const used = h.runSilently();
        const label = `${story.id} (${mode})`;
        expect(h.runner.finishReason(), label).toBe("complete");
        expect(h.finished, label).toEqual(["complete"]);
        expect(h.offline, label).toEqual([story.offlinePlayKey]);
        // A finite, short session: well under the 20-minute QA bound.
        expect(used, label).toBeLessThan(10 * 60 * 1000);
        // No autoplay-next: after the end nothing starts, however long it is left.
        const before = h.calls.length;
        for (let i = 0; i < 200; i += 1) h.runner.tick(STEP_MS);
        expect(h.calls.length, label).toBe(before);
      }
    }
  });

  it("never shows more than two tap targets, and the stage and touch router always agree", () => {
    for (const story of STORIES) {
      const h = harness(story);
      h.runner.start();
      let maxTargets = 0;
      let waits = 0;
      while (h.runner.finishReason() === null) {
        h.runner.tick(STEP_MS);
        const active = h.runner.activeTargets();
        maxTargets = Math.max(maxTargets, active.length);
        if (active.length > 0) waits += 1;
        const lastStage = h.of("stage", "setTargets").at(-1)?.args[0];
        if (active.length > 0) expect(lastStage, story.id).toEqual(active);
      }
      expect(maxTargets, story.id).toBeLessThanOrEqual(MAX_TARGETS);
      expect(waits, `${story.id} offers at least one turn`).toBeGreaterThan(0);
      for (const call of h.of("stage", "setTargets")) {
        const ids = call.args[0];
        if (Array.isArray(ids)) expect(ids.length, story.id).toBeLessThanOrEqual(MAX_TARGETS);
      }
    }
  });

  it("takes a tap on an active target as the turn and ignores inactive, missing and repeated taps", () => {
    const h = harness(golden);
    h.runner.start();
    expect(h.runner.tap("ball", 0)).toBe(false); // nothing is waiting yet
    expect(h.tickUntil(() => h.runner.activeTargets().includes("ball"))).toBe(true);
    const at = h.runner.snapshot().elapsedMs;
    expect(h.runner.tap("momo", at)).toBe(false); // not a target of this beat
    expect(h.runner.tap("no-such-node", at)).toBe(false);
    expect(h.runner.tap("ball", at)).toBe(true);
    expect(h.runner.snapshot().taps).toBe(1);
    expect(h.runner.activeTargets()).toEqual([]);
    expect(h.runner.tap("ball", at + 10)).toBe(false); // the double tap does not count twice
    expect(h.runner.snapshot().taps).toBe(1);
    expect(h.runner.snapshot().phase).toBe("responding");
  });

  it("does not let a tap refused while paused swallow the first tap after Resume", () => {
    const h = harness(golden);
    h.runner.start();
    expect(h.tickUntil(() => h.runner.snapshot().phase === "waiting")).toBe(true);
    const at = h.runner.snapshot().elapsedMs;
    h.runner.pause();
    expect(h.runner.tap("ball", at)).toBe(false);
    expect(h.runner.confirm(at)).toBe(false);
    h.runner.resume();
    // Same story time: the paused tap was never taken, so this one is not a "double tap".
    expect(h.runner.tap("ball", at)).toBe(true);
    expect(h.runner.snapshot().taps).toBe(1);
  });

  it("wires canvas taps so one refused while paused does not swallow the first tap after Resume", () => {
    // The app binds the canvas with CANVAS_TAP_DEBOUNCE_MS; the runner's router keeps the real debounce.
    expect(CANVAS_TAP_DEBOUNCE_MS).toBe(0);
    expect(TAP_DEBOUNCE_MS).toBeGreaterThan(0);
    const h = harness(golden);
    h.runner.start();
    expect(h.tickUntil(() => h.runner.snapshot().phase === "waiting")).toBe(true);
    // Story time is frozen while paused, so both presses happen at the same story time.
    const at = h.runner.snapshot().elapsedMs;
    let listener: TapListener | null = null;
    const surface: TapSurface = {
      addEventListener: (_type, added) => {
        listener = added;
      },
      removeEventListener: () => {
        listener = null;
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    };
    const taken: boolean[] = [];
    const unbind = bindCanvasTaps(surface, () => "ball", (id) => taken.push(h.runner.tap(id, at)), () => at, { debounceMs: CANVAS_TAP_DEBOUNCE_MS });
    const press = (): void => listener?.({ clientX: 400, clientY: 300, button: 0, preventDefault: () => undefined });
    h.runner.pause();
    press();
    h.runner.resume();
    press();
    // A real double tap is still one turn: the wait has closed and the router refuses the repeat.
    press();
    unbind();
    expect(taken).toEqual([false, true, false]);
    expect(h.runner.snapshot().taps).toBe(1);
  });

  it("takes a parent confirm on a waiting beat like a tap, and only then", () => {
    const h = harness(golden);
    h.runner.start();
    expect(h.runner.confirm(0)).toBe(false);
    expect(h.tickUntil(() => h.runner.snapshot().phase === "waiting")).toBe(true);
    const beat = h.runner.snapshot().beatId;
    expect(h.runner.confirm(h.runner.snapshot().elapsedMs)).toBe(true);
    expect(h.runner.snapshot().phase).not.toBe("waiting");
    expect(h.runner.snapshot().beatId).toBe(beat);
    expect(h.runner.snapshot().taps).toBe(0); // a confirm is not a counted tap
  });

  it("offers the grown-up's confirm exactly while each turn waits, in every story", () => {
    for (const story of STORIES) {
      const calls: Call[] = [];
      const turns: boolean[] = [];
      let waits = 0;
      let wasWaiting = false;
      const sinks = recordingSinks(calls, { onTurn: (waiting) => turns.push(waiting) });
      const runner = createStoryRunner({ story, mode: "play-together", sinks, lineMs, followNarration: false });
      runner.start();
      while (runner.finishReason() === null) {
        const waiting = runner.snapshot().phase === "waiting";
        if (waiting && !wasWaiting) waits += 1;
        wasWaiting = waiting;
        const offered = turns[turns.length - 1] === true;
        expect(offered, `${story.id} ${runner.snapshot().beatId ?? ""}: confirm offered only while waiting`).toBe(waiting);
        runner.tick(STEP_MS);
      }
      expect(turns.filter((t) => t).length, story.id).toBe(waits);
      expect(turns[turns.length - 1], `${story.id}: the confirm is withdrawn at the end`).toBe(false);
    }
  });

  it("ends calmly on the offline card when All done is pressed at any beat", () => {
    for (const story of [golden, ballGame]) {
      const total = harness(story);
      total.runner.start();
      total.runSilently();
      const beats = total.runner.snapshot().beatIndex + 1;
      for (let k = 0; k < beats; k += 1) {
        const h = harness(story);
        h.runner.start();
        h.tickUntil(() => h.runner.snapshot().beatIndex >= k);
        h.runner.tick(STEP_MS);
        h.runner.allDone();
        const label = `${story.id} beat ${k}`;
        expect(h.runner.finishReason(), label).toBe("all-done");
        expect(h.offline, label).toEqual([story.offlinePlayKey]);
        expect(h.of("narration", "stop").length, label).toBeGreaterThan(0);
        expect(h.of("audio", "stopAll").length, label).toBe(1);
        expect(h.runner.activeTargets(), label).toEqual([]);
        const before = h.calls.length;
        h.runner.tick(10_000);
        h.runner.allDone();
        expect(h.runner.tap("ball", 99_999), label).toBe(false);
        expect(h.calls.length, label).toBe(before);
      }
    }
  });

  it("freezes the story and its media on pause and continues from the same place on resume", () => {
    const h = harness(golden);
    h.runner.start();
    h.tickUntil(() => h.runner.snapshot().elapsedMs >= 1000);
    h.runner.pause();
    expect(h.runner.snapshot().phase).toBe("paused");
    expect(h.of("audio", "pauseAll")).toHaveLength(1);
    expect(h.of("narration", "pause")).toHaveLength(1);
    expect(h.mediaPaused).toEqual([true]);
    const frozen = h.runner.snapshot();
    for (let i = 0; i < 100; i += 1) h.runner.tick(STEP_MS);
    expect(h.runner.snapshot()).toEqual(frozen);
    h.runner.resume();
    expect(h.of("narration", "resume")).toHaveLength(1);
    expect(h.of("audio", "resumeAll")).toHaveLength(1);
    expect(h.mediaPaused).toEqual([true, false]);
    h.runner.tick(STEP_MS);
    expect(h.runner.snapshot().elapsedMs).toBe(frozen.elapsedMs + STEP_MS);
    expect(h.runSilently()).toBeGreaterThan(0);
    expect(h.runner.finishReason()).toBe("complete");
  });

  it("shows each line's caption and talking pulse, and follows the narration's end only when asked", () => {
    const followed = harness(golden, { followNarration: true, echoStart: true });
    followed.runner.start();
    const first = followed.runner.speakingLine();
    expect(first).not.toBeNull();
    if (!first) return;
    expect(followed.of("captions", "show").at(-1)?.args).toEqual([first.speaker, en.lines[first.key]]);
    expect(followed.of("stage", "setTalking").at(-1)?.args).toEqual([talkingActorFor(golden, first.speaker)]);
    const lineIndex = followed.runner.snapshot().lineIndex;
    followed.runner.lineEnded(first.key);
    expect(followed.of("stage", "setTalking").at(-2)?.args).toEqual([null]);
    expect(followed.runner.snapshot().lineIndex !== lineIndex || followed.runner.snapshot().phase !== "speaking").toBe(true);

    const manual = harness(golden, { followNarration: false, echoStart: true });
    manual.runner.start();
    const line = manual.runner.speakingLine();
    expect(line).not.toBeNull();
    if (!line) return;
    const before = manual.runner.snapshot();
    manual.runner.lineEnded(line.key);
    // Manual QA runs end lines on story time only: the caption and pulse stop, the story does not move.
    expect(manual.runner.snapshot()).toEqual(before);
    expect(manual.runner.speakingLine()).toBeNull();
    expect(manual.of("captions", "clear").length).toBeGreaterThan(0);
  });

  it("plays the same story in watch-sing and play-together when nobody taps", () => {
    const watch = harness(golden, { mode: "watch-sing" });
    const play = harness(golden, { mode: "play-together" });
    watch.runner.start();
    play.runner.start();
    expect(watch.runSilently()).toBe(play.runSilently());
    expect({ ...watch.runner.snapshot(), mode: null }).toEqual({ ...play.runner.snapshot(), mode: null });
  });

  it("uses the parent's waiting time for every turn", () => {
    const short = harness(golden, { waitMs: 3000 });
    const long = harness(golden, { waitMs: 8000 });
    short.runner.start();
    long.runner.start();
    const shortMs = short.runSilently();
    const longMs = long.runSilently();
    // Every turn (E17 has its invite and repeat waits) waits 5 s longer.
    const turns = golden.kind === "episode" ? golden.beats.filter((beat) => beatWaits(beat)).length : 0;
    expect(turns).toBeGreaterThan(0);
    expect(longMs - shortMs).toBe(turns * 5000);
  });

  it("keeps finishing when audio is unavailable, and skip moves on a beat", () => {
    const h = harness(ballGame);
    h.runner.start();
    h.runner.audioUnavailable();
    const first = h.runner.snapshot().beatIndex;
    h.runner.skipBeat();
    expect(h.runner.snapshot().beatIndex).toBe(first + 1);
    h.runSilently();
    expect(h.runner.finishReason()).toBe("complete");
    expect(h.offline).toEqual([ballGame.offlinePlayKey]);
  });

  it("stops speech and targets on dispose and ignores every late callback", () => {
    const h = harness(golden, { followNarration: true, echoStart: true });
    h.runner.start();
    h.tickUntil(() => h.runner.activeTargets().length > 0);
    const line = h.runner.speakingLine();
    h.runner.dispose();
    expect(h.of("narration", "stop").length).toBeGreaterThan(0);
    expect(h.of("stage", "setTargets").at(-1)?.args).toEqual([null]);
    expect(h.runner.activeTargets()).toEqual([]);
    const before = h.calls.length;
    h.runner.tick(STEP_MS);
    h.runner.lineEnded(line?.key ?? "e17.invite.1");
    h.runner.lineStarted({ speaker: "momo", key: "e17.hook.1" });
    expect(h.runner.tap("ball", 0)).toBe(false);
    expect(h.runner.confirm(0)).toBe(false);
    h.runner.allDone();
    h.runner.pause();
    expect(h.calls.length).toBe(before);
    expect(h.offline).toEqual([]);
  });

  it("starts once and plays nothing before start", () => {
    const h = harness(golden);
    h.runner.tick(5000);
    expect(h.calls).toEqual([]);
    h.runner.start();
    const afterStart = h.of("narration", "play").length;
    h.runner.start();
    expect(h.of("narration", "play").length).toBe(afterStart);
    expect(h.of("stage", "apply").length).toBeGreaterThan(0);
  });
});

describe("shell sources", () => {
  const read = (rel: string): string => readFileSync(join(appRoot, rel), "utf8");

  it("serves and copies every look HDRI, keeps assets un-inlined, and builds relative to ./", () => {
    const config = read("vite.config.ts");
    expect(LOOK_HDRI_FILES.length).toBeGreaterThan(0);
    for (const file of LOOK_HDRI_FILES) expect(config).toContain(`"${file}"`);
    expect(config).toContain('base: "./"');
    expect(config).toContain("assetsInlineLimit: 0");
    expect(config).toContain("fonts/local.css");
    expect(config).toMatch(/import rootConfig from "\.\.\/\.\.\/vite\.config"/);
  });

  it("records the provenance of every look HDRI the build copies from the repo's public/hdri/", () => {
    const record = JSON.parse(read("provenance/hdri.json")) as { files: Record<string, { sha256: string; sizeBytes: number; license: string }> };
    expect(Object.keys(record.files).sort()).toEqual([...LOOK_HDRI_FILES].sort());
    for (const file of LOOK_HDRI_FILES) {
      const entry = record.files[file];
      const bytes = readFileSync(join(appRoot, "..", "..", "public", "hdri", file));
      expect(entry?.sha256, file).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(entry?.sizeBytes, file).toBe(bytes.length);
      expect(entry?.license, file).toMatch(/CC0/);
    }
  });

  it("main.ts installs the safety net without automatic reloads and never logs", () => {
    const main = read("src/main.ts");
    expect(main).toMatch(/installSafetyNet\(/);
    expect(main).toMatch(/selfHeal:\s*false/);
    expect(main).not.toMatch(/installBlackFrameGuard\(/);
    expect(main).toMatch(/installWonderQaHooks\(/);
  });

  it("the shell reads no wall clock, no randomness and no three.js, and logs nothing", () => {
    for (const rel of ["src/main.ts", "src/app.ts", "src/qa/install-hooks.ts"]) {
      const source = read(rel);
      expect(source, rel).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/);
      expect(source, rel).not.toMatch(/from\s+["']three["']|GLTFLoader|\bas any\b|\bas never\b/);
      expect(source, rel).not.toMatch(/\bconsole\.\w+\s*\(/);
      expect(source, rel).not.toMatch(/effects\.vignette\s*\(/);
    }
    // createGame comes only from the game kit (through the stage), never from the root stub.
    expect(read("src/app.ts")).not.toMatch(/import\s*\{[^}]*\bcreateGame\b[^}]*\}\s*from\s*"@aura3d\/engine"/);
    expect(read("src/scenes/stage.ts")).toMatch(/import\s*\{[^}]*\bcreateGame\b[^}]*\}\s*from\s*"@aura3d\/engine\/game"/);
  });
});
