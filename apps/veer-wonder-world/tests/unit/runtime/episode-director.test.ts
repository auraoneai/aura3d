// J01: the episode director is a deterministic, finite story machine.
// Small inline fixture stories only (no real episodes).
import { describe, expect, it } from "vitest";
import type {
  ActivitySpec,
  BeatSpec,
  DirectorEffect,
  DirectorEvent,
  DirectorPhase,
  DirectorSnapshot,
  EpisodeSpec,
  PlayMode,
  StorySpec
} from "../../../src/types.js";
import { createEpisodeDirector, TAP_GUARD_MS, type EpisodeDirector } from "../../../src/runtime/episode-director.js";
import { DEFAULT_LINE_MS, estimateStoryMs } from "../../../src/runtime/beat-runner.js";
import { DEFAULT_WAIT_MS } from "../../../src/runtime/turn-taking.js";

const REVIEW = { language: "approved", rights: "approved", reviewer: "agent:test fixture", date: "2026-10-29" } as const;
const LINE_MS = 1000;
const lineMs = (): number => LINE_MS;

const greet: BeatSpec = {
  id: "greet",
  kind: "greeting",
  camera: "wide",
  stage: [{ do: "gesture", actor: "momo", gesture: "wave" }],
  lines: [
    { speaker: "momo", key: "t01.greet.1" },
    { speaker: "narrator", key: "t01.greet.2" }
  ],
  holdMs: 1000
};

const invite: BeatSpec = {
  id: "invite",
  kind: "invite",
  stage: [{ do: "object", target: "ball", action: "bounce" }],
  reducedMotionStage: [{ do: "object", target: "ball", action: "glow" }],
  lines: [{ speaker: "momo", key: "t01.invite.1" }],
  holdMs: 500,
  input: { type: "tap", targets: ["ball"] },
  waitMs: 4000,
  caregiverPromptKey: "t01.tip.1",
  response: {
    stage: [{ do: "object", target: "ball", action: "roll" }],
    lines: [{ speaker: "momo", key: "t01.invite.r1" }],
    holdMs: 800
  }
};

const outro: BeatSpec = {
  id: "outro",
  kind: "outro",
  stage: [{ do: "gesture", actor: "momo", gesture: "wave" }],
  lines: [{ speaker: "momo", key: "t01.outro.1" }],
  holdMs: 1000
};

function makeEpisode(beats: readonly BeatSpec[], id = "test-episode"): EpisodeSpec {
  return {
    kind: "episode",
    id,
    number: 1,
    version: 1,
    phase: "P1",
    titleKey: "t01.title",
    world: "meadow",
    host: "momo",
    cast: [{ id: "momo", at: "center" }],
    props: [
      { id: "ball", asset: "ball", at: "right" },
      { id: "drum", asset: "drum", at: "left" }
    ],
    targetWords: ["ball"],
    supportWords: ["hi"],
    offlinePlayKey: "t01.offline",
    caregiverBridgeKey: "t01.bridge",
    review: REVIEW,
    estimatedDurationSec: 120,
    beats
  };
}

const episode = makeEpisode([greet, invite, outro]);
/** greet 1000+1000+1000, invite 1000+500+4000+1000+800, outro 1000+1000. */
const SILENT_EPISODE_MS = 12300;

const hello: BeatSpec = { id: "hello", kind: "greeting", stage: [], lines: [{ speaker: "momo", key: "t02.hello.1" }], holdMs: 500 };
const roll: BeatSpec = {
  id: "roll",
  kind: "invite",
  stage: [],
  lines: [{ speaker: "momo", key: "t02.roll.1" }],
  holdMs: 0,
  input: { type: "tap", targets: ["ball"] },
  waitMs: 3000,
  response: { stage: [{ do: "object", target: "ball", action: "roll" }], lines: [{ speaker: "momo", key: "t02.roll.r1" }], holdMs: 500 }
};
const more: BeatSpec = {
  id: "more",
  kind: "repeat",
  stage: [],
  lines: [{ speaker: "momo", key: "t02.more.1" }],
  holdMs: 0,
  input: { type: "more-or-done", targets: ["ball"] },
  waitMs: 3000
};
const bye: BeatSpec = { id: "bye", kind: "outro", stage: [], lines: [{ speaker: "momo", key: "t02.bye.1" }], holdMs: 500 };

function makeActivity(parts: { intro?: readonly BeatSpec[]; round?: readonly BeatSpec[]; roundLimit?: number; outro?: readonly BeatSpec[] } = {}): ActivitySpec {
  return {
    kind: "activity",
    id: "test-activity",
    number: 1,
    version: 1,
    phase: "P1",
    titleKey: "t02.title",
    world: "meadow",
    host: "sheru",
    cast: [{ id: "sheru", at: "center" }],
    props: [{ id: "ball", asset: "ball", at: "front" }],
    targetWords: ["ball", "more"],
    supportWords: [],
    offlinePlayKey: "t02.offline",
    caregiverBridgeKey: "t02.bridge",
    review: REVIEW,
    intro: parts.intro ?? [hello],
    round: parts.round ?? [roll, more],
    roundLimit: parts.roundLimit ?? 3,
    outro: parts.outro ?? [bye],
    options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false }
  };
}

const activity = makeActivity();

// ---------------------------------------------------------------- helpers

const FRAME_MS = 10;
const LIMIT_MS = 10 * 60 * 1000;

function tickFor(director: EpisodeDirector, totalMs: number, frameMs = FRAME_MS): DirectorEffect[] {
  const out: DirectorEffect[] = [];
  let left = totalMs;
  while (left > 0) {
    const dt = Math.min(frameMs, left);
    out.push(...director.send({ type: "TICK", dtMs: dt }));
    left -= dt;
  }
  return out;
}

function tickUntil(director: EpisodeDirector, done: (snap: DirectorSnapshot) => boolean, frameMs = FRAME_MS): DirectorEffect[] {
  const out: DirectorEffect[] = [];
  for (let t = 0; t < LIMIT_MS && !done(director.snapshot()); t += frameMs) {
    out.push(...director.send({ type: "TICK", dtMs: frameMs }));
  }
  if (!done(director.snapshot())) throw new Error(`condition not reached; phase ${director.snapshot().phase}`);
  return out;
}

const untilPhase = (phase: DirectorPhase) => (snap: DirectorSnapshot): boolean => snap.phase === phase;
const untilBeat = (beatId: string, round?: number) => (snap: DirectorSnapshot): boolean =>
  snap.beatId === beatId && (round === undefined || snap.round === round);

function started(story: StorySpec, mode: PlayMode = "play-together", reducedMotion = false): { director: ReturnType<typeof createEpisodeDirector>; first: DirectorEffect[] } {
  const director = createEpisodeDirector(story, { lineMs, reducedMotion });
  const first = director.send({ type: "START", mode });
  return { director, first };
}

function storyKeys(story: StorySpec): Set<string> {
  const beats = story.kind === "episode" ? story.beats : [...story.intro, ...story.round, ...story.outro];
  const keys = new Set<string>();
  for (const beat of beats) {
    for (const line of beat.lines) keys.add(line.key);
    for (const line of beat.response?.lines ?? []) keys.add(line.key);
  }
  return keys;
}

// ------------------------------------------------------------------ tests

describe("episode director: start and lines", () => {
  it("is idle until START, then emits stage (camera first), caregiver and the first line", () => {
    const director = createEpisodeDirector(episode, { lineMs });
    expect(director.snapshot()).toEqual({
      storyId: "test-episode",
      phase: "idle",
      mode: null,
      beatIndex: -1,
      beatId: null,
      round: 0,
      lineIndex: 0,
      elapsedMs: 0,
      waitedMs: 0,
      taps: 0,
      finishedReason: null
    });
    expect(director.send({ type: "TICK", dtMs: 500 })).toEqual([]);
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([]);
    expect(director.send({ type: "LINE_DONE", key: "t01.greet.1" })).toEqual([]);
    expect(director.send({ type: "PAUSE" })).toEqual([]);
    expect(director.send({ type: "RESUME" })).toEqual([]);
    expect(director.send({ type: "SKIP_BEAT" })).toEqual([]);

    const fx = director.send({ type: "START", mode: "play-together" });
    expect(fx).toEqual([
      { type: "stage", actions: [{ do: "camera", preset: "wide" }, { do: "gesture", actor: "momo", gesture: "wave" }] },
      { type: "caregiver", key: null },
      { type: "speak", line: { speaker: "momo", key: "t01.greet.1" } }
    ]);
    expect(director.snapshot()).toMatchObject({ phase: "speaking", mode: "play-together", beatIndex: 0, beatId: "greet", lineIndex: 0 });
    expect(director.send({ type: "START", mode: "watch-sing" })).toEqual([]);
    expect(director.snapshot().mode).toBe("play-together");
  });

  it("starts the next line on LINE_DONE for the current key and ignores other keys", () => {
    const { director } = started(episode);
    expect(director.send({ type: "LINE_DONE", key: "t01.greet.2" })).toEqual([]);
    expect(director.send({ type: "LINE_DONE", key: "t01.greet.1" })).toEqual([
      { type: "speak", line: { speaker: "narrator", key: "t01.greet.2" } }
    ]);
    expect(director.snapshot()).toMatchObject({ phase: "speaking", lineIndex: 1 });
    // A late callback for the earlier line does nothing.
    expect(director.send({ type: "LINE_DONE", key: "t01.greet.1" })).toEqual([]);
    expect(director.send({ type: "LINE_DONE", key: "t01.greet.2" })).toEqual([]);
    expect(director.snapshot().phase).toBe("holding");
    expect(director.send({ type: "LINE_DONE", key: "t01.greet.2" })).toEqual([]);
    expect(tickFor(director, 990)).toEqual([]);
    expect(tickFor(director, 10)).toEqual([
      { type: "stage", actions: [{ do: "object", target: "ball", action: "bounce" }] },
      { type: "caregiver", key: "t01.tip.1" },
      { type: "speak", line: { speaker: "momo", key: "t01.invite.1" } }
    ]);
    expect(director.snapshot()).toMatchObject({ beatIndex: 1, beatId: "invite", lineIndex: 0 });
  });

  it("starts the next line after lineMs of TICK time when no LINE_DONE arrives", () => {
    const { director } = started(episode);
    expect(director.send({ type: "TICK", dtMs: 999 })).toEqual([]);
    expect(director.send({ type: "TICK", dtMs: 1 })).toEqual([{ type: "speak", line: { speaker: "narrator", key: "t01.greet.2" } }]);
    expect(director.snapshot().elapsedMs).toBe(1000);
  });

  it("uses the 2600 ms fallback when lineMs is missing or gives no valid duration", () => {
    for (const option of [undefined, () => undefined, () => Number.NaN, () => Number.POSITIVE_INFINITY]) {
      const director = createEpisodeDirector(episode, option ? { lineMs: option } : {});
      director.send({ type: "START", mode: "watch-sing" });
      expect(director.send({ type: "TICK", dtMs: DEFAULT_LINE_MS - 1 })).toEqual([]);
      expect(director.send({ type: "TICK", dtMs: 1 })).toEqual([{ type: "speak", line: { speaker: "narrator", key: "t01.greet.2" } }]);
    }
  });

  it("takes whichever comes first: LINE_DONE early restarts timing for the next line", () => {
    const { director } = started(episode);
    tickFor(director, 400);
    expect(director.send({ type: "LINE_DONE", key: "t01.greet.1" })).toHaveLength(1);
    // The second line gets its own full lineMs.
    expect(tickFor(director, 990)).toEqual([]);
    expect(director.snapshot()).toMatchObject({ phase: "speaking", lineIndex: 1 });
    tickFor(director, 10);
    expect(director.snapshot()).toMatchObject({ phase: "holding", lineIndex: 2 });
  });

  it("passes a beat with no lines and no hold straight through", () => {
    const silentBeat: BeatSpec = { id: "quiet", kind: "event", stage: [{ do: "sfx", sound: "pop" }], lines: [], holdMs: 0 };
    const director = createEpisodeDirector(makeEpisode([silentBeat, outro]), { lineMs });
    expect(director.send({ type: "START", mode: "play-together" })).toEqual([
      { type: "stage", actions: [{ do: "sfx", sound: "pop" }] },
      { type: "caregiver", key: null },
      { type: "stage", actions: [{ do: "gesture", actor: "momo", gesture: "wave" }] },
      { type: "caregiver", key: null },
      { type: "speak", line: { speaker: "momo", key: "t01.outro.1" } }
    ]);
  });

  it("finishes at once (complete + offline) for a story with no beats", () => {
    const director = createEpisodeDirector(makeEpisode([]));
    expect(director.send({ type: "START", mode: "play-together" })).toEqual([
      { type: "finished", reason: "complete" },
      { type: "offline", key: "t01.offline" }
    ]);
    expect(director.snapshot()).toMatchObject({ phase: "finished", finishedReason: "complete" });
  });
});

describe("episode director: invitations and turns", () => {
  it("shows targets after lines and hold, ignores non-targets, and plays the response on a tap", () => {
    const { director } = started(episode);
    tickUntil(director, untilBeat("invite"));
    // Taps before the wait starts do nothing: the target is not active yet.
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([]);
    expect(tickFor(director, 1000)).toEqual([]);
    expect(director.snapshot().phase).toBe("holding");
    expect(tickFor(director, 500)).toEqual([{ type: "targets", targets: ["ball"] }]);
    expect(director.snapshot()).toMatchObject({ phase: "waiting", waitedMs: 0 });

    expect(director.send({ type: "TAP", target: "drum" })).toEqual([]);
    expect(director.send({ type: "TAP", target: "momo" })).toEqual([]);
    tickFor(director, 1200);
    expect(director.snapshot().waitedMs).toBe(1200);

    expect(director.send({ type: "TAP", target: "ball" })).toEqual([
      { type: "targets", targets: null },
      { type: "stage", actions: [{ do: "object", target: "ball", action: "roll" }] },
      { type: "speak", line: { speaker: "momo", key: "t01.invite.r1" } }
    ]);
    expect(director.snapshot()).toMatchObject({ phase: "responding", taps: 1, waitedMs: 1200 });
    // The response holds, then the next beat starts.
    expect(tickFor(director, 1790)).toEqual([]);
    expect(tickFor(director, 10)[0]).toEqual({ type: "stage", actions: [{ do: "gesture", actor: "momo", gesture: "wave" }] });
    expect(director.snapshot().beatId).toBe("outro");
  });

  it("completes with no input at all (silent child), playing every response, in the estimated time", () => {
    const { director, first } = started(episode);
    const effects = [...first, ...tickUntil(director, untilPhase("finished"))];
    expect(effects.filter((fx) => fx.type === "targets")).toEqual([
      { type: "targets", targets: ["ball"] },
      { type: "targets", targets: null }
    ]);
    expect(effects.filter((fx) => fx.type === "speak").map((fx) => (fx.type === "speak" ? fx.line.key : ""))).toEqual([
      "t01.greet.1",
      "t01.greet.2",
      "t01.invite.1",
      "t01.invite.r1",
      "t01.outro.1"
    ]);
    expect(effects.slice(-2)).toEqual([
      { type: "finished", reason: "complete" },
      { type: "offline", key: "t01.offline" }
    ]);
    const snap = director.snapshot();
    expect(snap).toMatchObject({ phase: "finished", finishedReason: "complete", taps: 0 });
    expect(snap.elapsedMs).toBe(SILENT_EPISODE_MS);
    expect(estimateStoryMs(episode, lineMs)).toBe(SILENT_EPISODE_MS);
  });

  it("watch-sing plays the same story as play-together when nobody taps, and taps still work", () => {
    const watch = started(episode, "watch-sing");
    const play = started(episode, "play-together");
    const watchFx = [...watch.first, ...tickUntil(watch.director, untilPhase("finished"))];
    const playFx = [...play.first, ...tickUntil(play.director, untilPhase("finished"))];
    expect(watchFx).toEqual(playFx);
    expect(watch.director.snapshot()).toEqual({ ...play.director.snapshot(), mode: "watch-sing" });

    const tapper = started(episode, "watch-sing").director;
    tickUntil(tapper, untilPhase("waiting"));
    expect(tapper.send({ type: "TAP", target: "ball" })[0]).toEqual({ type: "targets", targets: null });
    expect(tapper.snapshot()).toMatchObject({ phase: "responding", taps: 1 });
  });

  it("ends the wait by itself after waitMs (beat value, option override, 5000 ms default)", () => {
    const { director } = started(episode);
    tickUntil(director, untilPhase("waiting"));
    expect(tickFor(director, 3990)).toEqual([]);
    expect(tickFor(director, 10)[0]).toEqual({ type: "targets", targets: null });

    const override = createEpisodeDirector(episode, { lineMs, waitMs: 6000 });
    override.send({ type: "START", mode: "play-together" });
    tickUntil(override, untilPhase("waiting"));
    expect(tickFor(override, 5990)).toEqual([]);
    expect(override.snapshot()).toMatchObject({ phase: "waiting", waitedMs: 5990 });
    expect(tickFor(override, 10)[0]).toEqual({ type: "targets", targets: null });

    const noWaitMs: BeatSpec = { ...invite, waitMs: undefined };
    const fallback = createEpisodeDirector(makeEpisode([noWaitMs]), { lineMs });
    fallback.send({ type: "START", mode: "play-together" });
    tickUntil(fallback, untilPhase("waiting"));
    expect(tickFor(fallback, DEFAULT_WAIT_MS - 10)).toEqual([]);
    expect(tickFor(fallback, 10)[0]).toEqual({ type: "targets", targets: null });
  });

  it("never waits forever, even for an endless or invalid authored wait", () => {
    for (const waitMs of [Number.POSITIVE_INFINITY, Number.NaN, 10 * 60 * 1000]) {
      const director = createEpisodeDirector(makeEpisode([{ ...invite, waitMs }]), { lineMs });
      director.send({ type: "START", mode: "watch-sing" });
      tickUntil(director, untilPhase("finished"));
      expect(director.snapshot().elapsedMs).toBeLessThanOrEqual(1000 + 500 + 30000 + 1000 + 800);
    }
  });

  it("a zero wait continues at once without flashing targets", () => {
    const director = createEpisodeDirector(makeEpisode([invite, outro]), { lineMs, waitMs: 0 });
    const effects = [...director.send({ type: "START", mode: "play-together" }), ...tickUntil(director, untilPhase("finished"))];
    expect(effects.some((fx) => fx.type === "targets")).toBe(false);
    expect(effects.some((fx) => fx.type === "speak" && fx.line.key === "t01.invite.r1")).toBe(true);
  });

  it("shows at most two targets and ignores taps on any other id", () => {
    const crowded: BeatSpec = { ...invite, input: { type: "tap", targets: ["ball", "ball", "drum", "momo"] } };
    const director = createEpisodeDirector(makeEpisode([crowded]), { lineMs });
    director.send({ type: "START", mode: "play-together" });
    expect(tickUntil(director, untilPhase("waiting"))).toContainEqual({ type: "targets", targets: ["ball", "drum"] });
    expect(director.send({ type: "TAP", target: "momo" })).toEqual([]);
    expect(director.send({ type: "TAP", target: "drum" })[0]).toEqual({ type: "targets", targets: null });
  });

  it("a parent confirm ends the wait exactly like a tap (only the tap count differs)", () => {
    const viaTap = started(episode).director;
    const viaParent = started(episode).director;
    tickUntil(viaTap, untilPhase("waiting"));
    tickUntil(viaParent, untilPhase("waiting"));
    const tapFx = viaTap.send({ type: "TAP", target: "ball" });
    const parentFx = viaParent.send({ type: "PARENT_CONFIRM" });
    expect(parentFx).toEqual(tapFx);
    expect(viaParent.snapshot()).toEqual({ ...viaTap.snapshot(), taps: 0 });
    expect([...tickUntil(viaParent, untilPhase("finished"))]).toEqual([...tickUntil(viaTap, untilPhase("finished"))]);
  });

  it("ignores a parent confirm when nothing is waiting", () => {
    const { director } = started(episode);
    expect(director.send({ type: "PARENT_CONFIRM" })).toEqual([]);
    tickUntil(director, untilPhase("holding"));
    expect(director.send({ type: "PARENT_CONFIRM" })).toEqual([]);
  });

  it("a double tap advances once; a tap after the wait has ended is ignored", () => {
    const { director } = started(episode);
    tickUntil(director, untilPhase("waiting"));
    expect(director.send({ type: "TAP", target: "ball" })).toHaveLength(3);
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([]);
    expect(director.send({ type: "PARENT_CONFIRM" })).toEqual([]);
    tickFor(director, 100);
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([]);
    expect(director.snapshot()).toMatchObject({ taps: 1, beatId: "invite", phase: "responding" });

    const late = started(episode).director;
    tickUntil(late, untilPhase("waiting"));
    tickFor(late, 4000);
    expect(late.snapshot().phase).toBe("responding");
    expect(late.send({ type: "TAP", target: "ball" })).toEqual([]);
    expect(late.snapshot().taps).toBe(0);
  });

  it("a double tap cannot answer the next beat's wait when it opens at once", () => {
    const a: BeatSpec = { id: "a", kind: "invite", stage: [], lines: [], holdMs: 0, input: { type: "tap", targets: ["ball"] }, waitMs: 4000 };
    const b: BeatSpec = { ...a, id: "b" };
    const director = createEpisodeDirector(makeEpisode([a, b]), { lineMs });
    expect(director.send({ type: "START", mode: "play-together" })).toEqual([
      { type: "stage", actions: [] },
      { type: "caregiver", key: null },
      { type: "targets", targets: ["ball"] }
    ]);
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([
      { type: "targets", targets: null },
      { type: "stage", actions: [] },
      { type: "caregiver", key: null },
      { type: "targets", targets: ["ball"] }
    ]);
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([]);
    tickFor(director, TAP_GUARD_MS - 10);
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([]);
    tickFor(director, 10);
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([
      { type: "targets", targets: null },
      { type: "finished", reason: "complete" },
      { type: "offline", key: "t01.offline" }
    ]);
    expect(director.snapshot().taps).toBe(2);
  });

  it("uses the reduced-motion stage when asked, and setReducedMotion applies from the next beat", () => {
    const calm = started(episode, "play-together", true).director;
    expect(tickUntil(calm, untilBeat("invite"))).toContainEqual({ type: "stage", actions: [{ do: "object", target: "ball", action: "glow" }] });

    const director = started(episode).director;
    director.setReducedMotion(true);
    expect(tickUntil(director, untilBeat("invite"))).toContainEqual({ type: "stage", actions: [{ do: "object", target: "ball", action: "glow" }] });
    // A beat without a reduced-motion variant keeps its stage.
    expect(tickUntil(director, untilBeat("outro"))).toContainEqual({ type: "stage", actions: [{ do: "gesture", actor: "momo", gesture: "wave" }] });
  });

  it("setWaitMs changes waits that start later", () => {
    const { director } = started(episode);
    director.setWaitMs(3000);
    tickUntil(director, untilPhase("waiting"));
    expect(tickFor(director, 2990)).toEqual([]);
    expect(tickFor(director, 10)[0]).toEqual({ type: "targets", targets: null });
  });
});

describe("episode director: pause, skip, all done, audio and dispose", () => {
  it("PAUSE freezes every timer and RESUME continues where it stopped", () => {
    const { director } = started(episode);
    tickFor(director, 600);
    expect(director.send({ type: "PAUSE" })).toEqual([{ type: "pauseMedia" }]);
    const frozen = director.snapshot();
    expect(frozen.phase).toBe("paused");
    expect(director.send({ type: "PAUSE" })).toEqual([]);
    expect(tickFor(director, 60000, 1000)).toEqual([]);
    expect(director.send({ type: "SKIP_BEAT" })).toEqual([]);
    expect(director.send({ type: "AUDIO_UNAVAILABLE" })).toEqual([]);
    expect(director.snapshot()).toEqual(frozen);
    expect(director.send({ type: "RESUME" })).toEqual([{ type: "resumeMedia" }]);
    expect(director.send({ type: "RESUME" })).toEqual([]);
    expect(director.snapshot().phase).toBe("speaking");
    expect(tickFor(director, 390)).toEqual([]);
    expect(tickFor(director, 10)).toEqual([{ type: "speak", line: { speaker: "narrator", key: "t01.greet.2" } }]);
  });

  it("a LINE_DONE that arrives while paused takes effect on RESUME", () => {
    const { director } = started(episode);
    director.send({ type: "PAUSE" });
    expect(director.send({ type: "LINE_DONE", key: "t01.greet.1" })).toEqual([]);
    expect(director.snapshot()).toMatchObject({ phase: "paused", lineIndex: 0 });
    expect(director.send({ type: "RESUME" })).toEqual([
      { type: "resumeMedia" },
      { type: "speak", line: { speaker: "narrator", key: "t01.greet.2" } }
    ]);
  });

  it("a paused wait keeps its targets, ignores taps and confirms, and continues on RESUME", () => {
    const { director } = started(episode);
    tickUntil(director, untilPhase("waiting"));
    tickFor(director, 1000);
    director.send({ type: "PAUSE" });
    expect(director.send({ type: "TAP", target: "ball" })).toEqual([]);
    expect(director.send({ type: "PARENT_CONFIRM" })).toEqual([]);
    tickFor(director, 20000, 500);
    expect(director.snapshot()).toMatchObject({ phase: "paused", waitedMs: 1000, taps: 0 });
    director.send({ type: "RESUME" });
    expect(director.snapshot().phase).toBe("waiting");
    expect(tickFor(director, 2990)).toEqual([]);
    expect(tickFor(director, 10)[0]).toEqual({ type: "targets", targets: null });
  });

  it("SKIP_BEAT stops speech and moves to the next beat from any active step", () => {
    const { director } = started(episode);
    expect(director.send({ type: "SKIP_BEAT" })).toEqual([
      { type: "stopSpeech" },
      { type: "stage", actions: [{ do: "object", target: "ball", action: "bounce" }] },
      { type: "caregiver", key: "t01.tip.1" },
      { type: "speak", line: { speaker: "momo", key: "t01.invite.1" } }
    ]);
    tickUntil(director, untilPhase("waiting"));
    // Skipping a wait clears the targets and skips the response.
    expect(director.send({ type: "SKIP_BEAT" })).toEqual([
      { type: "stopSpeech" },
      { type: "targets", targets: null },
      { type: "stage", actions: [{ do: "gesture", actor: "momo", gesture: "wave" }] },
      { type: "caregiver", key: null },
      { type: "speak", line: { speaker: "momo", key: "t01.outro.1" } }
    ]);
    tickUntil(director, untilPhase("holding"));
    expect(director.send({ type: "SKIP_BEAT" })).toEqual([
      { type: "stopSpeech" },
      { type: "finished", reason: "complete" },
      { type: "offline", key: "t01.offline" }
    ]);
    expect(director.send({ type: "SKIP_BEAT" })).toEqual([]);
  });

  it("SKIP_BEAT during a response moves on", () => {
    const { director } = started(episode);
    tickUntil(director, untilPhase("waiting"));
    director.send({ type: "PARENT_CONFIRM" });
    expect(director.snapshot().phase).toBe("responding");
    expect(director.send({ type: "SKIP_BEAT" }).slice(0, 2)).toEqual([
      { type: "stopSpeech" },
      { type: "stage", actions: [{ do: "gesture", actor: "momo", gesture: "wave" }] }
    ]);
    expect(director.snapshot().beatId).toBe("outro");
  });

  it("ALL_DONE ends at once from any state, then nothing ever happens again", () => {
    const allDoneFx: DirectorEffect[] = [
      { type: "stopSpeech" },
      { type: "targets", targets: null },
      { type: "finished", reason: "all-done" },
      { type: "offline", key: "t01.offline" }
    ];
    const setups: ((director: EpisodeDirector) => void)[] = [
      () => undefined,
      (d) => d.send({ type: "START", mode: "play-together" }),
      (d) => {
        d.send({ type: "START", mode: "play-together" });
        tickUntil(d, untilPhase("holding"));
      },
      (d) => {
        d.send({ type: "START", mode: "play-together" });
        tickUntil(d, untilPhase("waiting"));
      },
      (d) => {
        d.send({ type: "START", mode: "play-together" });
        tickUntil(d, untilPhase("waiting"));
        d.send({ type: "TAP", target: "ball" });
      },
      (d) => {
        d.send({ type: "START", mode: "watch-sing" });
        d.send({ type: "PAUSE" });
      }
    ];
    for (const setup of setups) {
      const director = createEpisodeDirector(episode, { lineMs });
      setup(director);
      expect(director.send({ type: "ALL_DONE" })).toEqual(allDoneFx);
      expect(director.snapshot()).toMatchObject({ phase: "finished", finishedReason: "all-done" });
      const after: DirectorEvent[] = [
        { type: "START", mode: "play-together" },
        { type: "TICK", dtMs: 60000 },
        { type: "LINE_DONE", key: "t01.greet.1" },
        { type: "TAP", target: "ball" },
        { type: "PARENT_CONFIRM" },
        { type: "PAUSE" },
        { type: "RESUME" },
        { type: "SKIP_BEAT" },
        { type: "ALL_DONE" },
        { type: "AUDIO_UNAVAILABLE" },
        { type: "DISPOSE" },
        { type: "START", mode: "watch-sing" }
      ];
      for (const event of after) expect(director.send(event)).toEqual([]);
    }
  });

  it("the end of a story emits finished complete and the offline card once, and nothing plays next", () => {
    const { director } = started(episode);
    const effects = tickUntil(director, untilPhase("finished"));
    expect(effects.filter((fx) => fx.type === "finished")).toEqual([{ type: "finished", reason: "complete" }]);
    expect(effects.filter((fx) => fx.type === "offline")).toEqual([{ type: "offline", key: "t01.offline" }]);
    expect(tickFor(director, 120000, 1000)).toEqual([]);
    expect(director.send({ type: "START", mode: "play-together" })).toEqual([]);
  });

  it("AUDIO_UNAVAILABLE keeps the story going on timing alone", () => {
    const quiet = started(episode).director;
    expect(quiet.send({ type: "AUDIO_UNAVAILABLE" })).toEqual([]);
    const quietFx = tickUntil(quiet, untilPhase("finished"));
    const normal = started(episode).director;
    expect(quietFx).toEqual(tickUntil(normal, untilPhase("finished")));
    expect(quiet.snapshot()).toMatchObject({ finishedReason: "complete", elapsedMs: SILENT_EPISODE_MS });
  });

  it("DISPOSE stops speech and targets once; every later event returns nothing", () => {
    const { director } = started(episode);
    tickUntil(director, untilPhase("waiting"));
    expect(director.send({ type: "DISPOSE" })).toEqual([{ type: "stopSpeech" }, { type: "targets", targets: null }]);
    expect(director.snapshot().phase).toBe("disposed");
    const later: DirectorEvent[] = [
      { type: "TICK", dtMs: 1000 },
      { type: "LINE_DONE", key: "t01.invite.1" },
      { type: "TAP", target: "ball" },
      { type: "PARENT_CONFIRM" },
      { type: "RESUME" },
      { type: "ALL_DONE" },
      { type: "DISPOSE" },
      { type: "START", mode: "play-together" }
    ];
    for (const event of later) expect(director.send(event)).toEqual([]);
    expect(director.snapshot().phase).toBe("disposed");

    const idle = createEpisodeDirector(episode);
    expect(idle.send({ type: "DISPOSE" })).toEqual([]);
    expect(idle.send({ type: "START", mode: "play-together" })).toEqual([]);

    const paused = started(episode).director;
    paused.send({ type: "PAUSE" });
    expect(paused.send({ type: "DISPOSE" })).toEqual([{ type: "stopSpeech" }, { type: "targets", targets: null }]);

    const finished = started(episode).director;
    finished.send({ type: "ALL_DONE" });
    expect(finished.send({ type: "DISPOSE" })).toEqual([]);
    expect(finished.snapshot().phase).toBe("disposed");
  });

  it("ignores ticks that are not positive finite numbers", () => {
    const { director } = started(episode);
    for (const dtMs of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) expect(director.send({ type: "TICK", dtMs })).toEqual([]);
    expect(director.snapshot().elapsedMs).toBe(0);
  });
});

describe("episode director: activity rounds", () => {
  /** Plays an activity to the end; `trail` lists beats (id@round) in the order they started. */
  function playActivity(story: ActivitySpec, answerMore: (round: number) => "tap" | "parent" | "skip" | "wait"): { trail: string[]; effects: DirectorEffect[]; director: EpisodeDirector } {
    const director = createEpisodeDirector(story, { lineMs });
    const effects: DirectorEffect[] = [];
    const trail: string[] = [];
    let lastIndex = -1;
    const send = (event: DirectorEvent): void => {
      effects.push(...director.send(event));
      const snap = director.snapshot();
      if (snap.beatIndex !== lastIndex && snap.beatId !== null) {
        trail.push(`${snap.beatId}@${snap.round}`);
        lastIndex = snap.beatIndex;
      }
    };
    send({ type: "START", mode: "play-together" });
    for (let t = 0; t < LIMIT_MS && director.snapshot().phase !== "finished"; t += FRAME_MS) {
      const snap = director.snapshot();
      if (snap.phase === "waiting" && snap.beatId === "more") {
        const answer = answerMore(snap.round);
        if (answer === "tap") send({ type: "TAP", target: "ball" });
        else if (answer === "parent") send({ type: "PARENT_CONFIRM" });
        else if (answer === "skip") send({ type: "SKIP_BEAT" });
      }
      send({ type: "TICK", dtMs: FRAME_MS });
    }
    expect(director.snapshot().phase).toBe("finished");
    return { trail, effects, director };
  }

  it("silence plays the intro, one round and the outro", () => {
    const { trail, director, effects } = playActivity(activity, () => "wait");
    expect(trail).toEqual(["hello@0", "roll@1", "more@1", "bye@1"]);
    expect(director.snapshot()).toMatchObject({ finishedReason: "complete", taps: 0 });
    expect(effects.slice(-2)).toEqual([
      { type: "finished", reason: "complete" },
      { type: "offline", key: "t02.offline" }
    ]);
    expect(director.snapshot().elapsedMs).toBe(estimateStoryMs(activity, lineMs));
  });

  it("a tap or parent confirm on more-or-done plays another round, up to roundLimit", () => {
    expect(playActivity(activity, () => "tap").trail).toEqual([
      "hello@0",
      "roll@1",
      "more@1",
      "roll@2",
      "more@2",
      "roll@3",
      "more@3",
      "bye@3"
    ]);
    expect(playActivity(activity, () => "parent").trail).toEqual([
      "hello@0",
      "roll@1",
      "more@1",
      "roll@2",
      "more@2",
      "roll@3",
      "more@3",
      "bye@3"
    ]);
  });

  it("a timeout on more-or-done goes to the outro", () => {
    expect(playActivity(activity, (round) => (round === 1 ? "tap" : "wait")).trail).toEqual([
      "hello@0",
      "roll@1",
      "more@1",
      "roll@2",
      "more@2",
      "bye@2"
    ]);
  });

  it("skipping the more-or-done beat goes to the outro (skip never adds play)", () => {
    expect(playActivity(activity, () => "skip").trail).toEqual(["hello@0", "roll@1", "more@1", "bye@1"]);
    // A "more" from an earlier round does not turn a later skip into another round.
    expect(playActivity(activity, (round) => (round === 1 ? "tap" : "skip")).trail).toEqual([
      "hello@0",
      "roll@1",
      "more@1",
      "roll@2",
      "more@2",
      "bye@2"
    ]);
  });

  it("each round asks again: an earlier 'more' does not carry over", () => {
    const trail = playActivity(activity, (round) => (round === 1 ? "parent" : "wait")).trail;
    expect(trail.filter((id) => id.startsWith("roll"))).toEqual(["roll@1", "roll@2"]);
  });

  it("handles roundLimit 0, an empty round, an empty intro and a round without more-or-done", () => {
    expect(playActivity(makeActivity({ roundLimit: 0 }), () => "tap").trail).toEqual(["hello@0", "bye@0"]);
    expect(playActivity(makeActivity({ round: [] }), () => "tap").trail).toEqual(["hello@0", "bye@0"]);
    expect(playActivity(makeActivity({ intro: [] }), () => "wait").trail).toEqual(["roll@1", "more@1", "bye@1"]);
    expect(playActivity(makeActivity({ round: [roll] }), () => "tap").trail).toEqual(["hello@0", "roll@1", "bye@1"]);
    expect(playActivity(makeActivity({ roundLimit: Number.NaN }), () => "tap").trail).toEqual(["hello@0", "bye@0"]);
  });

  it("ALL_DONE in the middle of a round ends the activity with its offline card", () => {
    const director = createEpisodeDirector(activity, { lineMs });
    director.send({ type: "START", mode: "play-together" });
    tickUntil(director, untilBeat("roll", 1));
    expect(director.send({ type: "ALL_DONE" })).toEqual([
      { type: "stopSpeech" },
      { type: "targets", targets: null },
      { type: "finished", reason: "all-done" },
      { type: "offline", key: "t02.offline" }
    ]);
  });
});

describe("episode director: determinism and invariants", () => {
  const script: DirectorEvent[] = [
    { type: "START", mode: "play-together" },
    { type: "TICK", dtMs: 450 },
    { type: "LINE_DONE", key: "t01.greet.1" },
    { type: "TICK", dtMs: 2100 },
    { type: "PAUSE" },
    { type: "TICK", dtMs: 5000 },
    { type: "RESUME" },
    { type: "TICK", dtMs: 1700 },
    { type: "TAP", target: "drum" },
    { type: "TAP", target: "ball" },
    { type: "TAP", target: "ball" },
    { type: "TICK", dtMs: 3333 },
    { type: "SKIP_BEAT" },
    { type: "TICK", dtMs: 10000 }
  ];

  it("the same events always give the same effects and snapshots", () => {
    const a = createEpisodeDirector(episode, { lineMs });
    const b = createEpisodeDirector(episode, { lineMs });
    for (const event of script) {
      expect(a.send(event)).toEqual(b.send(event));
      expect(a.snapshot()).toEqual(b.snapshot());
    }
    expect(a.snapshot().phase).toBe("finished");
  });

  /** Small seeded generator so the event fuzz is repeatable (tests only). */
  function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  const PHASES: readonly DirectorPhase[] = ["idle", "beat", "speaking", "holding", "waiting", "responding", "paused", "finished", "disposed"];

  it("random event streams never break the safety invariants and always reach an ending", () => {
    for (const story of [episode, activity]) {
      const keys = storyKeys(story);
      for (let seed = 1; seed <= 60; seed += 1) {
        const random = seeded(seed);
        const director = createEpisodeDirector(story, { lineMs: seed % 2 === 0 ? lineMs : undefined, reducedMotion: seed % 3 === 0 });
        let finishedCount = 0;
        let paused = false;
        let currentTargets: readonly string[] | null = null;
        let lastSpoken: string | null = null;
        let lastElapsed = 0;

        const check = (effects: DirectorEffect[]): void => {
          if (finishedCount > 0) expect(effects).toEqual([]);
          for (const fx of effects) {
            if (fx.type === "finished") finishedCount += 1;
            if (fx.type === "pauseMedia") paused = true;
            if (fx.type === "resumeMedia") paused = false;
            if (fx.type === "targets") {
              currentTargets = fx.targets;
              if (fx.targets) expect(fx.targets.length).toBeLessThanOrEqual(2);
            }
            if (fx.type === "speak") {
              expect(paused).toBe(false);
              expect(keys.has(fx.line.key)).toBe(true);
              lastSpoken = fx.line.key;
            }
          }
          expect(JSON.stringify(effects)).not.toMatch(/wrong|try again|incorrect|fail/i);
          const snap = director.snapshot();
          expect(PHASES).toContain(snap.phase);
          expect(snap.elapsedMs).toBeGreaterThanOrEqual(lastElapsed);
          lastElapsed = snap.elapsedMs;
          if (snap.phase === "waiting") expect(currentTargets).not.toBeNull();
          if (snap.phase !== "waiting" && snap.phase !== "paused" && snap.phase !== "finished") expect(currentTargets).toBeNull();
          expect(finishedCount).toBeLessThanOrEqual(1);
        };

        check(director.send({ type: "START", mode: random() < 0.5 ? "play-together" : "watch-sing" }));
        for (let i = 0; i < 160; i += 1) {
          const r = random();
          let event: DirectorEvent;
          if (r < 0.45) event = { type: "TICK", dtMs: Math.floor(random() * 900) };
          else if (r < 0.58) event = { type: "LINE_DONE", key: lastSpoken ?? "t01.greet.1" };
          else if (r < 0.72) event = { type: "TAP", target: random() < 0.7 ? "ball" : "drum" };
          else if (r < 0.78) event = { type: "PARENT_CONFIRM" };
          else if (r < 0.85) event = { type: "PAUSE" };
          else if (r < 0.93) event = { type: "RESUME" };
          else if (r < 0.96) event = { type: "SKIP_BEAT" };
          else if (r < 0.985) event = { type: "AUDIO_UNAVAILABLE" };
          else event = { type: "ALL_DONE" };
          check(director.send(event));
        }
        // Whatever happened, a resumed story always ends by itself.
        check(director.send({ type: "RESUME" }));
        for (let t = 0; t < LIMIT_MS && director.snapshot().phase !== "finished"; t += 250) check(director.send({ type: "TICK", dtMs: 250 }));
        expect(director.snapshot().phase).toBe("finished");
        expect(finishedCount).toBe(1);
        expect(["complete", "all-done"]).toContain(director.snapshot().finishedReason);
      }
    }
  });
});
