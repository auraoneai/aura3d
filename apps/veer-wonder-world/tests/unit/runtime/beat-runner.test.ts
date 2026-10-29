// B02 beat runner: beat order, stage selection and timing math come from the
// authored content, and the silent-path estimate matches the director.
import { describe, expect, it } from "vitest";
import type { ActivitySpec, BeatSpec, EpisodeSpec, StorySpec } from "../../../src/types.js";
import {
  beatAt,
  beatStage,
  beatTargets,
  beatWaitMs,
  beatWaits,
  DEFAULT_LINE_MS,
  estimateBeatMs,
  estimateStoryMs,
  finiteMs,
  firstCursor,
  lineDurationMs,
  MAX_TARGETS,
  nextCursor,
  roundLimitOf,
  sectionBeats,
  storyBeats,
  type BeatCursor
} from "../../../src/runtime/beat-runner.js";
import { createEpisodeDirector } from "../../../src/runtime/episode-director.js";
import { DEFAULT_WAIT_MS, MAX_WAIT_MS } from "../../../src/runtime/turn-taking.js";

const REVIEW = { language: "approved", rights: "approved", reviewer: "agent:test fixture", date: "2026-10-29" } as const;

function beat(id: string, extra: Partial<BeatSpec> = {}): BeatSpec {
  return { id, kind: "event", stage: [], lines: [{ speaker: "momo", key: `t06.${id}.1` }], holdMs: 1000, ...extra };
}

const tapBeat = beat("tap", {
  kind: "invite",
  input: { type: "tap", targets: ["ball"] },
  waitMs: 4000,
  response: { stage: [], lines: [{ speaker: "momo", key: "t06.tap.r1" }, { speaker: "narrator", key: "t06.tap.r2" }], holdMs: 500 }
});

function makeEpisode(beats: readonly BeatSpec[]): EpisodeSpec {
  return {
    kind: "episode",
    id: "runner-episode",
    number: 1,
    version: 1,
    phase: "P1",
    titleKey: "t06.title",
    world: "meadow",
    host: "momo",
    cast: [{ id: "momo", at: "center" }],
    props: [{ id: "ball", asset: "ball", at: "right" }],
    targetWords: ["ball"],
    supportWords: [],
    offlinePlayKey: "t06.offline",
    caregiverBridgeKey: "t06.bridge",
    review: REVIEW,
    estimatedDurationSec: 120,
    beats
  };
}

function makeActivity(parts: { intro?: readonly BeatSpec[]; round?: readonly BeatSpec[]; roundLimit?: number; outro?: readonly BeatSpec[] } = {}): ActivitySpec {
  return {
    kind: "activity",
    id: "runner-activity",
    number: 1,
    version: 1,
    phase: "P1",
    titleKey: "t07.title",
    world: "meadow",
    host: "momo",
    cast: [{ id: "momo", at: "center" }],
    props: [{ id: "ball", asset: "ball", at: "right" }],
    targetWords: ["ball", "more"],
    supportWords: [],
    offlinePlayKey: "t07.offline",
    caregiverBridgeKey: "t07.bridge",
    review: REVIEW,
    intro: parts.intro ?? [beat("intro")],
    round: parts.round ?? [beat("r1"), beat("more", { kind: "repeat", input: { type: "more-or-done", targets: ["ball"] } })],
    roundLimit: parts.roundLimit ?? 2,
    outro: parts.outro ?? [beat("bye")],
    options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false }
  };
}

describe("timing helpers", () => {
  it("line durations: the known length, else the 2600 ms fallback", () => {
    expect(DEFAULT_LINE_MS).toBe(2600);
    expect(lineDurationMs("k")).toBe(2600);
    expect(lineDurationMs("k", () => undefined)).toBe(2600);
    expect(lineDurationMs("k", () => Number.NaN)).toBe(2600);
    expect(lineDurationMs("k", () => Number.POSITIVE_INFINITY)).toBe(2600);
    expect(lineDurationMs("k", () => -40)).toBe(0);
    expect(lineDurationMs("k", (key) => (key === "k" ? 1234 : undefined))).toBe(1234);
  });

  it("finiteMs keeps only non-negative finite values", () => {
    expect(finiteMs(250)).toBe(250);
    expect(finiteMs(0)).toBe(0);
    expect(finiteMs(-1)).toBe(0);
    expect(finiteMs(Number.NaN)).toBe(0);
    expect(finiteMs(Number.POSITIVE_INFINITY)).toBe(0);
    expect(finiteMs(undefined)).toBe(0);
  });

  it("waits: parent override, then beat waitMs, then 5000 ms; always finite", () => {
    expect(beatWaitMs(tapBeat)).toBe(4000);
    expect(beatWaitMs(tapBeat, 6000)).toBe(6000);
    expect(beatWaitMs(tapBeat, Number.NaN)).toBe(4000);
    expect(beatWaitMs(beat("plain", { input: { type: "tap", targets: ["ball"] } }))).toBe(DEFAULT_WAIT_MS);
    expect(beatWaitMs(beat("endless", { waitMs: Number.POSITIVE_INFINITY }))).toBe(DEFAULT_WAIT_MS);
    expect(beatWaitMs(beat("long", { waitMs: 120000 }))).toBe(MAX_WAIT_MS);
  });
});

describe("beat inputs and stage", () => {
  it("only tap and more-or-done beats wait", () => {
    expect(beatWaits(beat("none"))).toBe(false);
    expect(beatWaits(beat("explicit-none", { input: { type: "none" } }))).toBe(false);
    expect(beatWaits(tapBeat)).toBe(true);
    expect(beatWaits(beat("more", { input: { type: "more-or-done", targets: [] } }))).toBe(true);
  });

  it("targets are unique, non-empty and at most two, in authored order", () => {
    expect(MAX_TARGETS).toBe(2);
    expect(beatTargets(beat("none"))).toEqual([]);
    expect(beatTargets(tapBeat)).toEqual(["ball"]);
    expect(beatTargets(beat("many", { input: { type: "tap", targets: ["", "door", "door", "duck", "cow"] } }))).toEqual(["door", "duck"]);
    expect(beatTargets(beat("more", { input: { type: "more-or-done", targets: ["bubble", "wand"] } }))).toEqual(["bubble", "wand"]);
  });

  it("stage: camera first, reduced-motion variant when asked", () => {
    const moving = beat("moving", {
      camera: "close",
      stage: [{ do: "move", actor: "sheru", to: "left", style: "run" }],
      reducedMotionStage: [{ do: "move", actor: "sheru", to: "left", style: "walk" }]
    });
    expect(beatStage(moving)).toEqual([
      { do: "camera", preset: "close" },
      { do: "move", actor: "sheru", to: "left", style: "run" }
    ]);
    expect(beatStage(moving, true)).toEqual([
      { do: "camera", preset: "close" },
      { do: "move", actor: "sheru", to: "left", style: "walk" }
    ]);
    const calm = beat("calm", { stage: [{ do: "gesture", actor: "momo", gesture: "wave" }] });
    expect(beatStage(calm, true)).toBe(calm.stage);
  });
});

describe("beat order", () => {
  const episode = makeEpisode([beat("a"), beat("b"), beat("c")]);
  const activity = makeActivity();

  function walk(story: StorySpec, more: (cursor: BeatCursor) => boolean): string[] {
    const out: string[] = [];
    let cursor = firstCursor(story);
    for (let guard = 0; cursor && guard < 100; guard += 1) {
      out.push(`${beatAt(story, cursor)?.id ?? "?"}@${cursor.round}`);
      cursor = nextCursor(story, cursor, more(cursor));
    }
    return out;
  }

  it("episodes play their beats in order and end", () => {
    expect(walk(episode, () => false)).toEqual(["a@0", "b@0", "c@0"]);
    expect(walk(episode, () => true)).toEqual(["a@0", "b@0", "c@0"]);
    expect(firstCursor(makeEpisode([]))).toBeNull();
  });

  it("activities: intro, rounds while 'more' up to roundLimit, then outro", () => {
    expect(walk(activity, () => false)).toEqual(["intro@0", "r1@1", "more@1", "bye@1"]);
    expect(walk(activity, () => true)).toEqual(["intro@0", "r1@1", "more@1", "r1@2", "more@2", "bye@2"]);
    expect(walk(makeActivity({ roundLimit: 0 }), () => true)).toEqual(["intro@0", "bye@0"]);
    expect(walk(makeActivity({ intro: [], outro: [] }), () => false)).toEqual(["r1@1", "more@1"]);
    expect(walk(makeActivity({ intro: [], round: [], outro: [] }), () => true)).toEqual([]);
  });

  it("round limits are whole, non-negative numbers", () => {
    expect(roundLimitOf(episode)).toBe(0);
    expect(roundLimitOf(makeActivity({ roundLimit: 2.7 }))).toBe(2);
    expect(roundLimitOf(makeActivity({ roundLimit: -3 }))).toBe(0);
    expect(roundLimitOf(makeActivity({ roundLimit: Number.NaN }))).toBe(0);
  });

  it("sections and storyBeats list beats in play order", () => {
    expect(sectionBeats(episode, "beats").map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(sectionBeats(episode, "round")).toEqual([]);
    expect(sectionBeats(activity, "round").map((b) => b.id)).toEqual(["r1", "more"]);
    expect(sectionBeats(activity, "beats")).toEqual([]);
    expect(storyBeats(episode).map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(storyBeats(activity).map((b) => b.id)).toEqual(["intro", "r1", "more", "r1", "more", "bye"]);
    expect(storyBeats(activity, 1).map((b) => b.id)).toEqual(["intro", "r1", "more", "bye"]);
    expect(storyBeats(activity, 0).map((b) => b.id)).toEqual(["intro", "bye"]);
    expect(storyBeats(activity, 9).map((b) => b.id)).toEqual(storyBeats(activity).map((b) => b.id));
    expect(storyBeats(activity, -1).map((b) => b.id)).toEqual(["intro", "bye"]);
    expect(storyBeats(activity, Number.NaN)).toHaveLength(6);
  });
});

describe("silent-path estimates", () => {
  const lineMs = (key: string): number | undefined => (key.endsWith(".r2") ? undefined : 1000);

  it("a beat costs its lines, hold, wait and response", () => {
    // 1000 line + 1000 hold + 4000 wait + (1000 + 2600 fallback) response + 500 hold.
    expect(estimateBeatMs(tapBeat, lineMs)).toBe(10100);
    expect(estimateBeatMs(tapBeat, lineMs, 3000)).toBe(9100);
    expect(estimateBeatMs(beat("plain"))).toBe(DEFAULT_LINE_MS + 1000);
    expect(estimateBeatMs(beat("bad-hold", { holdMs: Number.NaN }), lineMs)).toBe(1000);
  });

  it("matches the director's running time with no input, for episodes and activities", () => {
    const stories: StorySpec[] = [
      makeEpisode([beat("a"), tapBeat, beat("c", { lines: [] })]),
      makeActivity(),
      makeActivity({ round: [tapBeat, beat("more", { input: { type: "more-or-done", targets: ["ball"] }, waitMs: 2500 })], roundLimit: 3 })
    ];
    for (const story of stories) {
      for (const waitMs of [undefined, 3000]) {
        const director = createEpisodeDirector(story, { lineMs, waitMs });
        director.send({ type: "START", mode: "watch-sing" });
        for (let t = 0; t < 600000 && director.snapshot().phase !== "finished"; t += 20) director.send({ type: "TICK", dtMs: 20 });
        expect(director.snapshot().phase).toBe("finished");
        expect(director.snapshot().elapsedMs).toBe(estimateStoryMs(story, lineMs, waitMs));
      }
    }
  });

  it("an activity estimate counts one round (silence ends the rounds)", () => {
    const activity = makeActivity();
    const oneRound = storyBeats(activity, 1).reduce((sum, b) => sum + estimateBeatMs(b), 0);
    expect(estimateStoryMs(activity)).toBe(oneRound);
  });
});
