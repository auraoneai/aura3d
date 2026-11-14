// Unit tests for PRD 09 B3.1-B3.5:
// - WP01 (B3.1): Broadcast mode (?broadcast=1, &aspect=9:16), 1920x1080 / 1080x1920 framing, zero UI, welcomeName stripped, input disabled
// - WP02 (B3.2): Invite -> PAUSE beat (pauseMs, face viewer, wait gesture, target glow, 50% bed duck, auto-response, deterministic activity rounds)
// - WP03-runtime (B3.3): Multi-segment ShowSpec playback (stage.load seg 0, stage.swapSegment seg 1+, bed transitions, continuous eventLog, segmentId/segmentIndex)
// - WP04 (B3.4): Sub-step presentation advanceTo(tMs) at 30 fps (exact fractional stage presentation, zero double-advance, byte-identical traceRow() determinism)
// - WP05 (B3.5): Deterministic audio eventLog() + viseme sampling hook (even with ?audio=0)

import { describe, expect, it } from "vitest";
import { createApp, segmentToEpisodeSpec } from "../../../src/app.js";
import { QA_GLOBAL_NAME, TRACE_COLUMNS, installWonderQaHooks, type WonderQaHooks } from "../../../src/qa/install-hooks.js";
import { AUDIO_LEVELS, createAudioMixer } from "../../../src/runtime/audio-mixer.js";
import { createEpisodeDirector } from "../../../src/runtime/episode-director.js";
import { readFlags } from "../../../src/runtime/feature-flags.js";
import { sampleVisemeTrack } from "../../../src/runtime/narration-player.js";
import type {
  ActivitySpec,
  AudioClipRef,
  EpisodeSpec,
  SegmentTransition,
  ShowSpec,
  StageAction,
  StageAdapter,
  StorySpec,
  VisemeCode
} from "../../../src/types.js";
import { defaultSettings } from "../../../src/ui/settings-store.js";

// ---------------------------------------------------------------- test harness helpers

interface MockDom {
  readonly uiRoot: HTMLElement;
  readonly stageHost: HTMLElement;
  readonly docElement: {
    readonly dataset: Record<string, string>;
    readonly style: { readonly width: string; readonly height: string; getPropertyValue(k: string): string };
  };
  readonly uiChildren: readonly { getAttribute(k: string): string | null }[];
  readonly stageListeners: ReadonlyMap<string, number>;
  readonly docListeners: ReadonlyMap<string, number>;
  readonly winListeners: ReadonlyMap<string, number>;
}

function createMockDom(withBootSplash = true): MockDom {
  const stageListeners = new Map<string, number>();
  const docListeners = new Map<string, number>();
  const winListeners = new Map<string, number>();

  interface MockNodeStyle {
    width: string;
    height: string;
    setProperty(k: string, v: string): void;
    getPropertyValue(k: string): string;
    removeProperty(k: string): string;
  }

  interface MockNode {
    readonly tagName: string;
    readonly dataset: Record<string, string>;
    readonly style: MockNodeStyle;
    readonly children: MockNode[];
    textContent: string;
    readonly classList: {
      add(): void;
      remove(): void;
      toggle(): boolean;
      contains(): boolean;
    };
    setAttribute(k: string, v: string): void;
    getAttribute(k: string): string | null;
    appendChild(child: MockNode): MockNode;
    remove(): void;
    querySelectorAll(selector: string): MockNode[];
    addEventListener(type: string): void;
    removeEventListener(): void;
    parent: { children: MockNode[] } | null;
    ownerDocument: Document;
  }

  const makeNode = (tag: string, counter?: Map<string, number>): MockNode => {
    const attrs = new Map<string, string>();
    const styleMap = new Map<string, string>();
    const dataset: Record<string, string> = {};
    const children: MockNode[] = [];
    let parent: { children: MockNode[] } | null = null;
    const style: MockNodeStyle = {
      width: "",
      height: "",
      setProperty(k: string, v: string) {
        styleMap.set(k, v);
        if (k === "width") style.width = v;
        if (k === "height") style.height = v;
      },
      getPropertyValue(k: string) {
        return styleMap.get(k) ?? "";
      },
      removeProperty(k: string) {
        const prev = styleMap.get(k) ?? "";
        styleMap.delete(k);
        return prev;
      }
    };
    const node: MockNode = {
      tagName: tag.toUpperCase(),
      dataset,
      style,
      children,
      textContent: "",
      classList: {
        add: () => undefined,
        remove: () => undefined,
        toggle: () => false,
        contains: () => false
      },
      setAttribute(k: string, v: string) {
        attrs.set(k, v);
      },
      getAttribute(k: string) {
        return attrs.get(k) ?? null;
      },
      appendChild(child: MockNode) {
        child.parent = node;
        children.push(child);
        return child;
      },
      remove() {
        if (!parent) return;
        const idx = parent.children.indexOf(node);
        if (idx >= 0) parent.children.splice(idx, 1);
        parent = null;
      },
      querySelectorAll(selector: string) {
        return children.filter((c: MockNode) => selector.includes('data-ui="boot"') && c.getAttribute("data-ui") === "boot");
      },
      addEventListener(type: string) {
        if (counter) counter.set(type, (counter.get(type) ?? 0) + 1);
      },
      removeEventListener: () => undefined,
      get parent() {
        return parent;
      },
      set parent(next: { children: MockNode[] } | null) {
        parent = next;
      },
      ownerDocument: null as unknown as Document
    };
    return node;
  };

  const docEl = makeNode("html");
  const headEl = makeNode("head");
  const uiRoot = makeNode("div");
  const stageHost = makeNode("div", stageListeners);
  const boot = makeNode("div");
  boot.setAttribute("id", "ww-boot");
  boot.setAttribute("data-ui", "boot");
  if (withBootSplash) uiRoot.appendChild(boot);

  const win = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener(type: string) {
      winListeners.set(type, (winListeners.get(type) ?? 0) + 1);
    },
    removeEventListener: () => undefined,
    matchMedia: () => ({ matches: false })
  };

  const doc = {
    defaultView: win,
    documentElement: docEl,
    head: headEl,
    visibilityState: "visible",
    createElement(tag: string) {
      const n = makeNode(tag);
      n.ownerDocument = doc as unknown as Document;
      return n;
    },
    createTextNode: (t: string) => ({ textContent: t }),
    getElementById: (id: string) => (id === "ww-boot" && uiRoot.children.includes(boot) ? boot : null),
    querySelector: () => null,
    addEventListener(type: string) {
      docListeners.set(type, (docListeners.get(type) ?? 0) + 1);
    },
    removeEventListener: () => undefined
  };

  docEl.ownerDocument = doc as unknown as Document;
  uiRoot.ownerDocument = doc as unknown as Document;
  stageHost.ownerDocument = doc as unknown as Document;
  boot.ownerDocument = doc as unknown as Document;

  return {
    uiRoot: uiRoot as unknown as HTMLElement,
    stageHost: stageHost as unknown as HTMLElement,
    docElement: docEl,
    uiChildren: uiRoot.children,
    stageListeners,
    docListeners,
    winListeners
  };
}

interface RecordedStage extends StageAdapter {
  readonly loads: { readonly storyId: string; readonly world: string }[];
  readonly swaps: { readonly storyId: string; readonly world: string; readonly transition: SegmentTransition }[];
  readonly actions: StageAction[];
  readonly updatesSec: number[];
  readonly visemeCalls: { readonly viseme: VisemeCode | null; readonly openness: number | null }[];
  readonly energyCalls: (number | null)[];
  totalTimeSec(): number;
}

function createRecordedStage(options: { readonly withSwap?: boolean } = {}): RecordedStage {
  const loads: { readonly storyId: string; readonly world: string }[] = [];
  const swaps: { readonly storyId: string; readonly world: string; readonly transition: SegmentTransition }[] = [];
  const actions: StageAction[] = [];
  const updatesSec: number[] = [];
  const visemeCalls: { readonly viseme: VisemeCode | null; readonly openness: number | null }[] = [];
  const energyCalls: (number | null)[] = [];

  const adapter: RecordedStage = {
    loads,
    swaps,
    actions,
    updatesSec,
    visemeCalls,
    energyCalls,
    totalTimeSec: () => updatesSec.reduce((acc, v) => acc + v, 0),
    async load(story: StorySpec) {
      loads.push({ storyId: story.id, world: story.world });
    },
    ...(options.withSwap !== false
      ? {
          async swapSegment(story: StorySpec, transition: SegmentTransition) {
            swaps.push({ storyId: story.id, world: story.world, transition });
          }
        }
      : {}),
    apply(batch: readonly StageAction[]) {
      actions.push(...batch);
    },
    setTalking: () => undefined,
    setSpeechEnergy(energy: number | null) {
      energyCalls.push(energy);
    },
    setSpeechViseme(viseme: VisemeCode | null, openness?: number | null) {
      visemeCalls.push({ viseme, openness: openness ?? null });
    },
    setTargets: () => undefined,
    pick: () => "ball",
    update(dtSeconds: number) {
      updatesSec.push(dtSeconds);
    },
    setReducedMotion: () => undefined,
    dispose: () => undefined
  };
  return adapter;
}

const REVIEW = {
  language: "approved",
  rights: "approved",
  reviewer: "test-agent",
  date: "2026-11-13"
} as const;

function makeTestShow(): ShowSpec {
  return {
    kind: "show",
    id: "ep99-test-show",
    code: "ep99",
    version: 1,
    band: "toddler",
    aspect: "16:9",
    titleKey: "e01.title",
    host: "momo",
    targetWords: ["ball", "go"],
    supportWords: ["look"],
    pauseMs: 2200,
    estimatedDurationSec: 18,
    offlinePlayKey: "e01.offline",
    caregiverBridgeKey: "e01.bridge",
    chapters: [
      { segmentId: "cold-open", titleKey: "e01.title", atSec: 0 },
      { segmentId: "word-game", titleKey: "e01.title", atSec: 4 },
      { segmentId: "goodbye", titleKey: "e01.title", atSec: 12 }
    ],
    segments: [
      {
        id: "cold-open",
        template: "coldOpen",
        world: "meadow",
        music: "meadowBed",
        transitionIn: "none",
        cast: [{ id: "momo", at: "center" }],
        props: [{ id: "ball", asset: "ball", at: "front" }],
        beats: [
          {
            id: "co-1",
            kind: "greeting",
            stage: [
              { do: "gesture", actor: "momo", gesture: "wave" },
              { do: "sfx", sound: "sparkle" }
            ],
            lines: [{ speaker: "momo", key: "test.co.1" }],
            holdMs: 300
          }
        ]
      },
      {
        id: "word-game",
        template: "wordGame",
        world: "peekaboo-barn",
        music: "barnBed",
        transitionIn: "train",
        cast: [
          { id: "momo", at: "left" },
          { id: "lulu", at: "right" }
        ],
        props: [{ id: "ball", asset: "ball", at: "center" }],
        beats: [
          {
            id: "wg-invite",
            kind: "invite",
            stage: [{ do: "gesture", actor: "lulu", gesture: "point" }],
            lines: [
              { speaker: "lulu", key: "test.wg.ask" },
              { speaker: "narrator", key: "test.wg.narr" }
            ],
            holdMs: 200,
            input: { type: "tap", targets: ["ball"] },
            pauseCaptionKey: "test.pause.sayBall",
            response: {
              stage: [
                { do: "object", target: "ball", action: "bounce" },
                { do: "sfx", sound: "boing" }
              ],
              lines: [{ speaker: "lulu", key: "test.wg.yes" }],
              holdMs: 250
            }
          }
        ]
      },
      {
        id: "goodbye",
        template: "goodbye",
        world: "meadow",
        music: null,
        transitionIn: "fade",
        cast: [{ id: "momo", at: "center" }],
        props: [],
        beats: [
          {
            id: "gb-song",
            kind: "song",
            stage: [{ do: "song", song: "wonderThemeShort" }],
            lines: [{ speaker: "momo", key: "test.gb.bye" }],
            holdMs: 200
          }
        ]
      }
    ],
    review: REVIEW
  };
}

const TEST_AUDIO_CLIPS: Readonly<Record<string, AudioClipRef>> = {
  "test.co.1": {
    url: "/test/co1.mp3",
    sha256: "00",
    durationMs: 700,
    visemes: [
      { tMs: 0, endMs: 200, viseme: "MBP", openness: 0.15 },
      { tMs: 200, endMs: 550, viseme: "AA", openness: 0.85 }
    ]
  },
  "test.wg.ask": { url: "/test/wg-ask.mp3", sha256: "01", durationMs: 600 },
  "test.wg.narr": { url: "/test/wg-narr.mp3", sha256: "02", durationMs: 500 },
  "test.wg.yes": { url: "/test/wg-yes.mp3", sha256: "03", durationMs: 650 },
  "test.gb.bye": { url: "/test/gb-bye.mp3", sha256: "04", durationMs: 550 }
};

// ---------------------------------------------------------------- WP01: B3.1 Broadcast Mode

describe("WP01 (B3.1): broadcast mode flags, framing, zero UI, welcomeName & input suppression", () => {
  it("parses ?broadcast=1, ?broadcast=true and ?aspect=9:16 vs default 16:9", () => {
    expect(readFlags("")).toMatchObject({ broadcast: false, aspect: "16:9" });
    expect(readFlags("?broadcast=1")).toMatchObject({ broadcast: true, aspect: "16:9" });
    expect(readFlags("?broadcast=true&aspect=9:16")).toMatchObject({ broadcast: true, aspect: "9:16" });
    expect(readFlags("?broadcast=0&aspect=invalid")).toMatchObject({ broadcast: false, aspect: "16:9" });
  });

  it("frames 1920x1080 in 16:9 and 1080x1920 in 9:16, dismisses #ww-boot and mounts zero overlays", async () => {
    const dom16x9 = createMockDom(true);
    const stage16x9 = createRecordedStage();
    const app16x9 = createApp({
      uiRoot: dom16x9.uiRoot,
      stageHost: dom16x9.stageHost,
      flags: readFlags("?broadcast=1&audio=0"),
      query: { autostart: false, manual: true },
      settings: { ...defaultSettings(), mode: "play-together" },
      storage: null,
      welcomeName: "TestName",
      stage: stage16x9
    });
    await app16x9.whenReady();

    expect(dom16x9.uiChildren).toHaveLength(0);
    expect(dom16x9.stageHost.style.width).toBe("1920px");
    expect(dom16x9.stageHost.style.height).toBe("1080px");
    expect(dom16x9.stageHost.dataset["broadcast"]).toBe("true");
    expect(dom16x9.stageHost.dataset["aspect"]).toBe("16:9");
    expect(app16x9.state().screen).toBe("idle");
    expect(app16x9.state().settings.mode).toBe("broadcast");
    expect([...dom16x9.stageListeners.keys()]).toEqual([]);
    expect([...dom16x9.docListeners.keys()]).toEqual([]);
    expect([...dom16x9.winListeners.keys()]).toEqual([]);
    app16x9.dispose();

    const dom9x16 = createMockDom(true);
    const show = makeTestShow();
    const app9x16 = createApp({
      uiRoot: dom9x16.uiRoot,
      stageHost: dom9x16.stageHost,
      flags: readFlags("?broadcast=1&aspect=9:16&audio=0"),
      query: { show: show.id, autostart: false, manual: true },
      settings: defaultSettings(),
      storage: null,
      welcomeName: "TestName",
      stage: createRecordedStage(),
      shows: [show],
      audioClips: TEST_AUDIO_CLIPS
    });
    await app9x16.whenReady();

    expect(dom9x16.stageHost.style.width).toBe("1080px");
    expect(dom9x16.stageHost.style.height).toBe("1920px");
    expect(dom9x16.stageHost.dataset["aspect"]).toBe("9:16");
    expect(dom9x16.uiChildren).toHaveLength(0);
    expect(app9x16.state().screen).toBe("playing");
    expect(app9x16.state().storyId).toBe(show.id);
    expect(JSON.stringify(app9x16.state())).not.toContain("TestName");
    app9x16.dispose();
  });
});

// ---------------------------------------------------------------- WP02: B3.2 Invite -> PAUSE Beat

describe("WP02 (B3.2): invite -> PAUSE beat in broadcast mode", () => {
  it("holds pauseMs, faces viewer, plays wait gesture, glows targets, ignores taps and auto-plays response", () => {
    const episode: EpisodeSpec = {
      kind: "episode",
      id: "ep-pause-test",
      number: 1,
      version: 1,
      phase: "P1",
      titleKey: "e01.title",
      world: "meadow",
      host: "momo",
      cast: [
        { id: "momo", at: "left" },
        { id: "lulu", at: "right" }
      ],
      props: [
        { id: "ball", asset: "ball", at: "center" },
        { id: "drum", asset: "drum", at: "front" }
      ],
      targetWords: ["ball"],
      supportWords: [],
      offlinePlayKey: "e01.offline",
      caregiverBridgeKey: "e01.bridge",
      estimatedDurationSec: 120,
      review: REVIEW,
      beats: [
        {
          id: "b-invite",
          kind: "invite",
          stage: [{ do: "gesture", actor: "lulu", gesture: "wave" }],
          lines: [
            { speaker: "lulu", key: "ask.1" },
            { speaker: "narrator", key: "ask.2" }
          ],
          holdMs: 100,
          pauseMs: 1800,
          pauseCaptionKey: "pause.pointBall",
          input: { type: "tap", targets: ["ball", "drum"] },
          response: {
            stage: [{ do: "gesture", actor: "lulu", gesture: "cheer" }],
            lines: [{ speaker: "lulu", key: "ans.1" }],
            holdMs: 150
          }
        }
      ]
    };

    const director = createEpisodeDirector(episode, {
      pauseMsOverride: 2500,
      lineMs: () => 500
    });

    director.send({ type: "START", mode: "broadcast" });
    // Advance through 2 lines (2 * 500 = 1000ms) + 100ms hold = 1100ms -> enters broadcast PAUSE
    const enterPauseEffects = director.send({ type: "TICK", dtMs: 1100 });
    expect(director.snapshot().phase).toBe("waiting");

    expect(enterPauseEffects).toContainEqual({
      type: "stage",
      actions: [
        { do: "face", actor: "lulu", toward: "viewer" },
        { do: "gesture", actor: "lulu", gesture: "wait" },
        { do: "object", target: "ball", action: "glow" },
        { do: "object", target: "drum", action: "glow" }
      ]
    });
    expect(enterPauseEffects).toContainEqual({
      type: "broadcastPause",
      active: true,
      captionKey: "pause.pointBall",
      targets: ["ball", "drum"]
    });

    // TAP and PARENT_CONFIRM are ignored in broadcast mode
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([]);
    expect(director.send({ type: "PARENT_CONFIRM" })).toEqual([]);
    expect(director.snapshot().phase).toBe("waiting");

    // Advance 1750ms -> still waiting (1750 < 1800)
    director.send({ type: "TICK", dtMs: 1750 });
    expect(director.snapshot().phase).toBe("waiting");
    expect(director.snapshot().waitedMs).toBe(1750);

    // Advance remaining 50ms -> exits broadcast PAUSE and plays response!
    const exitPauseEffects = director.send({ type: "TICK", dtMs: 50 });
    expect(exitPauseEffects).toContainEqual({
      type: "broadcastPause",
      active: false,
      captionKey: null,
      targets: []
    });
    expect(exitPauseEffects).toContainEqual({
      type: "stage",
      actions: [{ do: "gesture", actor: "lulu", gesture: "cheer" }]
    });
    expect(exitPauseEffects).toContainEqual({
      type: "speak",
      line: { speaker: "lulu", key: "ans.1" }
    });
  });

  it("advances activity more-or-done rounds deterministically up to roundLimit then outro in broadcast mode", () => {
    const activity: ActivitySpec = {
      kind: "activity",
      id: "act-rounds-test",
      number: 1,
      version: 1,
      phase: "P1",
      titleKey: "g01.title",
      world: "meadow",
      host: "momo",
      cast: [{ id: "momo", at: "center" }],
      props: [{ id: "ball", asset: "ball", at: "front" }],
      targetWords: ["ball"],
      supportWords: [],
      offlinePlayKey: "g01.offline",
      caregiverBridgeKey: "g01.bridge",
      roundLimit: 3,
      options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false },
      review: REVIEW,
      intro: [{ id: "intro-1", kind: "greeting", stage: [], lines: [], holdMs: 100 }],
      round: [
        {
          id: "round-more",
          kind: "repeat",
          stage: [],
          lines: [],
          holdMs: 100,
          input: { type: "more-or-done", targets: ["ball"] },
          response: { stage: [], lines: [], holdMs: 100 }
        }
      ],
      outro: [{ id: "outro-1", kind: "outro", stage: [], lines: [], holdMs: 100 }]
    };

    const director = createEpisodeDirector(activity, { pauseMsOverride: 400, lineMs: () => 200 });
    director.send({ type: "START", mode: "broadcast" });

    const seenRounds: number[] = [];
    for (let step = 0; step < 60 && director.snapshot().phase !== "finished"; step += 1) {
      const snap = director.snapshot();
      if (snap.beatId === "round-more" && !seenRounds.includes(snap.round)) {
        seenRounds.push(snap.round);
      }
      director.send({ type: "TICK", dtMs: 100 });
    }
    expect(seenRounds).toEqual([1, 2, 3]);
    expect(director.snapshot().phase).toBe("finished");
    expect(director.snapshot().finishedReason).toBe("complete");
  });

  it("ducks live AudioMixer bed bus to 50% during setPauseDuck(true)", () => {
    const mixer = createAudioMixer({
      manifest: { lines: {}, songs: {}, sfx: {}, beds: {} } as never,
      musicEnabled: true,
      soundEnabled: true
    });
    expect(mixer.snapshot().levels.bed).toBeCloseTo(AUDIO_LEVELS.bed, 5);
    mixer.setPauseDuck(true);
    expect(mixer.snapshot().levels.bed).toBeCloseTo(AUDIO_LEVELS.bed * 0.5, 5);
    mixer.setPauseDuck(false);
    expect(mixer.snapshot().levels.bed).toBeCloseTo(AUDIO_LEVELS.bed, 5);
    mixer.dispose();
  });
});

// ---------------------------------------------------------------- WP03-runtime: B3.3 Multi-Segment ShowSpec Runner

describe("WP03-runtime (B3.3): multi-segment ShowSpec playback", () => {
  it("loads seg 0 via stage.load, swaps seg 1+ via stage.swapSegment, transitions beds and preserves continuous eventLog", async () => {
    const dom = createMockDom();
    const stage = createRecordedStage({ withSwap: true });
    const show = makeTestShow();
    const app = createApp({
      uiRoot: dom.uiRoot,
      stageHost: dom.stageHost,
      flags: readFlags("?broadcast=1&audio=0"),
      query: { autostart: false, manual: true },
      settings: defaultSettings(),
      storage: null,
      stage,
      shows: [show],
      audioClips: TEST_AUDIO_CLIPS
    });
    await app.whenReady();

    // Verify startStory seamlessly falls back to showById/shows when storyById is undefined
    await app.startStory("ep99");
    expect(app.state().storyId).toBe(show.id);
    expect(app.state().segmentId).toBe("cold-open");
    expect(app.state().segmentIndex).toBe(0);
    expect(stage.loads).toEqual([{ storyId: "ep99-test-show__cold-open", world: "meadow" }]);
    expect(stage.swaps).toEqual([]);

    const seenSegments: string[] = [];
    for (let i = 0; i < 200 && app.state().director?.phase !== "finished"; i += 1) {
      const seg = `${app.state().segmentIndex}:${app.state().segmentId ?? ""}`;
      if (!seenSegments.includes(seg)) seenSegments.push(seg);
      app.advance(50);
    }

    expect(seenSegments).toEqual(["0:cold-open", "1:word-game", "2:goodbye"]);
    expect(stage.loads).toHaveLength(1);
    expect(stage.swaps).toEqual([
      { storyId: "ep99-test-show__word-game", world: "peekaboo-barn", transition: "train" },
      { storyId: "ep99-test-show__goodbye", world: "meadow", transition: "fade" }
    ]);

    const log = app.eventLog();
    // Timestamps in eventLog must be monotonically non-decreasing across all 3 segments (never reset!)
    for (let i = 1; i < log.length; i += 1) {
      expect(log[i]!.t).toBeGreaterThanOrEqual(log[i - 1]!.t);
    }

    const bedEvents = log.filter((e) => e.type === "bed");
    expect(bedEvents).toEqual([
      { t: 0, type: "bed", action: "start", id: "meadowBed" },
      { t: 1000, type: "bed", action: "stop", id: "meadowBed" },
      { t: 1000, type: "bed", action: "start", id: "barnBed" },
      { t: 5400, type: "bed", action: "stop", id: "barnBed" }
    ]);

    app.dispose();
  });

  it("falls back to stage.load on segment transitions when stage.swapSegment is undefined", async () => {
    const dom = createMockDom();
    const stage = createRecordedStage({ withSwap: false });
    const show = makeTestShow();
    const app = createApp({
      uiRoot: dom.uiRoot,
      stageHost: dom.stageHost,
      flags: readFlags("?broadcast=1&audio=0"),
      query: { autostart: false, manual: true },
      settings: defaultSettings(),
      storage: null,
      stage,
      shows: [show],
      audioClips: TEST_AUDIO_CLIPS
    });
    await app.whenReady();
    await app.startShow(show.id);
    const res = app.runToEnd();
    expect(res.finished).toBe(true);
    expect(stage.loads.map((l) => l.storyId)).toEqual([
      "ep99-test-show__cold-open",
      "ep99-test-show__word-game",
      "ep99-test-show__goodbye"
    ]);
    app.dispose();
  });

  it("builds synthetic EpisodeSpec cleanly via segmentToEpisodeSpec", () => {
    const show = makeTestShow();
    const ep = segmentToEpisodeSpec(show, show.segments[0]!);
    expect(ep.id).toBe("ep99-test-show__cold-open");
    expect(ep.kind).toBe("episode");
    expect(ep.host).toBe("momo");
    expect(ep.music).toBe("meadowBed");
    expect(ep.phase).toBe("P1");
    expect(ep.estimatedDurationSec).toBe(120);
  });
});

// ---------------------------------------------------------------- WP04: B3.4 Sub-Step Presentation (advanceTo)

describe("WP04 (B3.4): advanceTo(tMs) fractional sub-step presentation & 30 fps determinism", () => {
  it("presents exact fractional stage deltas at 30 fps without double-advancing across 50 ms boundaries", async () => {
    const dom = createMockDom();
    const stage = createRecordedStage();
    const show = makeTestShow();
    const app = createApp({
      uiRoot: dom.uiRoot,
      stageHost: dom.stageHost,
      flags: readFlags("?broadcast=1&audio=0"),
      query: { autostart: false, manual: true },
      settings: defaultSettings(),
      storage: null,
      stage,
      shows: [show],
      audioClips: TEST_AUDIO_CLIPS
    });
    await app.whenReady();
    await app.startShow(show.id);
    stage.updatesSec.length = 0;

    // Frame 1: t = 33.333333ms -> 0 fixed 50ms ticks, +33.333333ms stage presentation
    app.advanceTo(1000 / 30);
    expect(app.state().director?.elapsedMs).toBe(0);
    expect(stage.totalTimeSec() * 1000).toBeCloseTo(1000 / 30, 6);

    // Frame 2: t = 66.666667ms -> 1 fixed 50ms tick + 16.666667ms remainder (stage total = exact 66.666667ms, NOT 83.333ms!)
    app.advanceTo(2000 / 30);
    expect(app.state().director?.elapsedMs).toBe(50);
    expect(stage.totalTimeSec() * 1000).toBeCloseTo(2000 / 30, 6);

    // Frame 3: t = 100.000000ms -> 2nd fixed 50ms tick + 0ms remainder (stage total = exact 100ms, zero drift!)
    app.advanceTo(3000 / 30);
    expect(app.state().director?.elapsedMs).toBe(100);
    expect(stage.totalTimeSec() * 1000).toBeCloseTo(100, 9);

    app.dispose();
  });

  it("produces byte-identical traceRow() sequences across two independent 30 fps runs via QA hooks", async () => {
    expect(TRACE_COLUMNS).toContain("segmentId");
    expect(TRACE_COLUMNS).toContain("segmentIndex");

    const runOnce = async (): Promise<{ readonly rowsJson: string; readonly logJson: string; readonly stageMs: number }> => {
      const dom = createMockDom();
      const stage = createRecordedStage();
      const show = makeTestShow();
      const targetGlobal: Record<string, unknown> = {};
      const app = createApp({
        uiRoot: dom.uiRoot,
        stageHost: dom.stageHost,
        flags: readFlags("?broadcast=1&audio=0"),
        query: { autostart: false, manual: true },
        settings: defaultSettings(),
        storage: null,
        stage,
        shows: [show],
        audioClips: TEST_AUDIO_CLIPS
      });
      const qaHandle: WonderQaHooks = installWonderQaHooks(app, { target: targetGlobal });
      expect(targetGlobal[QA_GLOBAL_NAME]).toBe(qaHandle.hooks);
      const qa = qaHandle.hooks;

      await app.whenReady();
      await qa.startShow(show.id);
      stage.updatesSec.length = 0;

      const rows: unknown[] = [];
      // 210 frames at 30 fps = 7000 ms (spans all 3 segments + invite PAUSE + song sting)
      for (let k = 1; k <= 210; k += 1) {
        qa.advanceTo((k * 1000) / 30);
        rows.push(qa.traceRow());
      }
      const logJson = JSON.stringify(qa.eventLog());
      const stageMs = Math.round(stage.totalTimeSec() * 1000 * 1000) / 1000;
      qaHandle.uninstall();
      app.dispose();
      return { rowsJson: JSON.stringify(rows), logJson, stageMs };
    };

    const runA = await runOnce();
    const runB = await runOnce();
    expect(runA.rowsJson).toBe(runB.rowsJson);
    expect(runA.logJson).toBe(runB.logJson);
    expect(runA.stageMs).toBe(runB.stageMs);
  });
});

// ---------------------------------------------------------------- WP05: B3.5 Deterministic Audio Event Log + Visemes

describe("WP05 (B3.5): deterministic eventLog() within 1 step with audio=0 + viseme sampling hook", () => {
  it("stamps line, duck, sfx, song, bed and pause events within 1 step (<= 50 ms) of deterministic beat times even when audio=0", async () => {
    const dom = createMockDom();
    const stage = createRecordedStage();
    const show = makeTestShow();
    const app = createApp({
      uiRoot: dom.uiRoot,
      stageHost: dom.stageHost,
      flags: readFlags("?broadcast=1&audio=0"),
      query: { autostart: false, manual: true },
      settings: defaultSettings(),
      storage: null,
      stage,
      shows: [show],
      audioClips: TEST_AUDIO_CLIPS
    });
    await app.whenReady();
    await app.startShow(show.id);
    const done = app.runToEnd();
    expect(done.finished).toBe(true);

    const log = app.eventLog();
    // Expected deterministic schedule:
    // t=0: bed start (meadowBed), sfx start (sparkle), line start (test.co.1, 700ms), duck start (speech, 0.25)
    // t=700: line stop (test.co.1), duck stop (speech, 1)
    // t=1000 (700 + 300 hold): seg 0 -> seg 1: bed stop (meadowBed), bed start (barnBed), line start (test.wg.ask, 600ms)
    // t=1600: line stop (test.wg.ask), line start (test.wg.narr, 500ms)
    // t=2100: line stop (test.wg.narr), duck stop (speech, 1)
    // t=2300 (2100 + 200 hold): pause start (test.pause.sayBall), duck start (pause, 0.5)
    // t=4500 (2300 + 2200 show.pauseMs): pause stop, duck stop (pause, 1), sfx start (boing), line start (test.wg.yes, 650ms)
    // t=5150: line stop (test.wg.yes), duck stop (speech, 1)
    // t=5400 (5150 + 250 hold): seg 1 -> seg 2: bed stop (barnBed), song start (wonderThemeShort), line start (test.gb.bye, 550ms)
    // t=5950: line stop (test.gb.bye), duck stop (speech, 1)
    // t=6150 (5950 + 200 hold): show finishes -> song stop (wonderThemeShort)

    const findEntry = (type: string, action: "start" | "stop", id: string) =>
      log.find((e) => e.type === type && e.action === action && e.id === id);

    const co1Start = findEntry("line", "start", "test.co.1");
    expect(co1Start).toMatchObject({ type: "line", action: "start", id: "test.co.1", speaker: "momo", durationMs: 700 });
    expect(Math.abs((co1Start?.t ?? -999) - 0)).toBeLessThanOrEqual(50);

    const co1Stop = findEntry("line", "stop", "test.co.1");
    expect(Math.abs((co1Stop?.t ?? -999) - 700)).toBeLessThanOrEqual(50);

    const speechDuckStart = log.find((e) => e.type === "duck" && e.action === "start" && e.id === "speech");
    expect(speechDuckStart?.gain).toBe(0.25);
    const speechDuckStop = log.find((e) => e.type === "duck" && e.action === "stop" && e.id === "speech");
    expect(speechDuckStop?.gain).toBe(1);

    const sparkle = findEntry("sfx", "start", "sparkle");
    expect(Math.abs((sparkle?.t ?? -999) - 0)).toBeLessThanOrEqual(50);
    expect(sparkle?.durationMs).toBeGreaterThan(0);

    const pauseStart = findEntry("pause", "start", "test.pause.sayBall");
    const pauseStop = findEntry("pause", "stop", "test.pause.sayBall");
    expect(Math.abs((pauseStart?.t ?? -999) - 2300)).toBeLessThanOrEqual(50);
    expect(Math.abs((pauseStop?.t ?? -999) - 4500)).toBeLessThanOrEqual(50);

    const pauseDuckStart = log.find((e) => e.type === "duck" && e.action === "start" && e.id === "pause");
    const pauseDuckStop = log.find((e) => e.type === "duck" && e.action === "stop" && e.id === "pause");
    expect(pauseDuckStart?.gain).toBe(0.5);
    expect(pauseDuckStop?.gain).toBe(1);

    const songStart = findEntry("song", "start", "wonderThemeShort");
    const songStop = findEntry("song", "stop", "wonderThemeShort");
    expect(Math.abs((songStart?.t ?? -999) - 5400)).toBeLessThanOrEqual(50);
    expect(songStart?.durationMs).toBeGreaterThan(0);
    expect(Math.abs((songStop?.t ?? -999) - 6150)).toBeLessThanOrEqual(50);

    // Starting a new show resets eventLog()
    await app.startShow(show.id);
    expect(app.eventLog().every((e) => e.t === 0)).toBe(true);
    app.dispose();
  });

  it("samples clip.visemes via stage.setSpeechViseme and falls back to (null, null) when visemes is undefined", async () => {
    expect(sampleVisemeTrack(undefined, 100)).toBeNull();
    const cues = TEST_AUDIO_CLIPS["test.co.1"]!.visemes!;
    expect(sampleVisemeTrack(cues, 50)).toEqual({ viseme: "MBP", openness: 0.15 });
    expect(sampleVisemeTrack(cues, 300)).toEqual({ viseme: "AA", openness: 0.85 });
    expect(sampleVisemeTrack(cues, 600)).toEqual({ viseme: "rest", openness: 0 });

    const dom = createMockDom();
    const stage = createRecordedStage();
    const show = makeTestShow();
    const app = createApp({
      uiRoot: dom.uiRoot,
      stageHost: dom.stageHost,
      flags: readFlags("?broadcast=1&audio=0"),
      query: { autostart: false, manual: true },
      settings: defaultSettings(),
      storage: null,
      stage,
      shows: [show],
      audioClips: TEST_AUDIO_CLIPS
    });
    await app.whenReady();
    await app.startShow(show.id);

    // At t=0..200 on test.co.1 -> MBP (0.15)
    app.advanceTo(100);
    expect(stage.visemeCalls).toContainEqual({ viseme: "MBP", openness: 0.15 });

    // At t=250 on test.co.1 -> AA (0.85)
    app.advanceTo(250);
    expect(stage.visemeCalls).toContainEqual({ viseme: "AA", openness: 0.85 });

    // At t=600 on test.co.1 (after 550ms cue end, before 700ms line end) -> rest (0)
    app.advanceTo(600);
    expect(stage.visemeCalls).toContainEqual({ viseme: "rest", openness: 0 });

    // Advance into segment 1's test.wg.ask (1000..1600 ms, where clip.visemes is undefined)
    app.advanceTo(1050);
    stage.visemeCalls.length = 0;
    app.advanceTo(1250);
    expect(stage.visemeCalls.length).toBeGreaterThan(0);
    expect(stage.visemeCalls.every((c) => c.viseme === null && c.openness === null)).toBe(true);

    app.dispose();
  });
});
