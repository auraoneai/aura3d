// Song choreography on the stage clock (PRD 04 C06; 07 B20): lyric line i
// starts at songCueTimesMs(song, recorded duration)[i]; its motion plays on
// every performer and its cues apply once, in order. Runs the real stage on a
// headless engine app (no canvas), stepping the story clock in the app's 50 ms
// steps, so every time below is exact.

import { describe, expect, it } from "vitest";
import { AUDIO_MANIFEST } from "../../../src/audio-manifest.js";
import { GESTURES, isGesture } from "../../../src/characters/character-registry.js";
import { SONGS, SONG_IDS, songCueTimesMs, songLengthSec } from "../../../src/content/songs.js";
import { CALM_GESTURES, calmGesture } from "../../../src/runtime/animation-director.js";
import { createStage, type SongCueEvent, type StageNodeSnapshot, type WonderStage } from "../../../src/scenes/stage.js";
import type { EpisodeSpec, SongId, StageAction } from "../../../src/types.js";

const STEP_MS = 50;

const probe: EpisodeSpec = {
  kind: "episode",
  id: "probe-song",
  version: 1,
  phase: "P1",
  number: 1,
  host: "momo",
  titleKey: "e01.title",
  world: "meadow",
  cast: [
    { id: "momo", at: "left" },
    { id: "sheru", at: "right" },
    // Off stage (not entered yet) and hidden: neither performs by default.
    { id: "lulu", at: "offRight" },
    { id: "peeko", at: "back", hidden: true }
  ],
  props: [
    { id: "ball", asset: "ball", at: "front", size: 0.3, hidden: true },
    // A character-shaped prop is never a default performer.
    { id: "teddy", asset: "teddy", at: "frontLeft" }
  ],
  targetWords: ["ball"],
  supportWords: [],
  offlinePlayKey: "e01.offline",
  caregiverBridgeKey: "e01.bridge",
  review: { language: "approved", rights: "approved", reviewer: "test", date: "2026-10-29" },
  beats: [],
  estimatedDurationSec: 150
};

const other: EpisodeSpec = { ...probe, id: "probe-song-2", cast: [{ id: "momo", at: "center" }], props: [{ id: "ball", asset: "ball", at: "front", size: 0.3 }] };

interface Harness {
  readonly stage: WonderStage;
  readonly cues: Array<SongCueEvent & { readonly atMs: number }>;
  /** Story time stepped so far (ms). */
  now(): number;
  /** Steps the story clock in 50 ms steps. */
  run(ms: number): void;
  node(id: string): StageNodeSnapshot;
  warnings(): readonly string[];
}

async function open(reducedMotion = false): Promise<Harness> {
  let now = 0;
  const cues: Array<SongCueEvent & { readonly atMs: number }> = [];
  const stage = await createStage({
    target: null,
    reducedMotion,
    models: false,
    mountTimeoutMs: 50,
    onSongCue: (cue) => cues.push({ ...cue, atMs: now })
  });
  await stage.load(probe);
  return {
    stage,
    cues,
    now: () => now,
    run(ms) {
      for (let i = 0; i < Math.round(ms / STEP_MS); i += 1) {
        now += STEP_MS;
        stage.update(STEP_MS / 1000);
      }
    },
    node(id) {
      const found = stage.snapshot().nodes.find((n) => n.id === id);
      if (!found) throw new Error(`no node ${id}`);
      return found;
    },
    // Headless only ever notes that no frame was drawn.
    warnings: () => stage.diagnostics().warnings.filter((w) => !w.startsWith("first frame:"))
  };
}

/** The 50 ms step at which a line starting at `ms` starts (the first step whose end reaches it). */
const stepOf = (ms: number): number => Math.ceil(ms / STEP_MS) * STEP_MS;

const recordedStarts = (song: SongId): number[] => songCueTimesMs(song, AUDIO_MANIFEST.songs[song]?.durationMs);

describe("song timing", () => {
  it("starts each lyric line at songCueTimesMs of the recorded song, not of the generated length", async () => {
    const recorded = AUDIO_MANIFEST.songs.hello?.durationMs;
    expect(recorded, "hello is recorded").toBeGreaterThan(0);
    const starts = recordedStarts("hello");
    const generated = songCueTimesMs("hello");
    expect(generated[1]).toBe(Math.round(songLengthSec(SONGS.hello) * 1000 / 3));
    // The two disagree about which 50 ms step line 1 starts in, so the test tells them apart.
    expect(stepOf(generated[1] ?? 0)).toBeLessThan(stepOf(starts[1] ?? 0));
    const h = await open();
    try {
      h.stage.apply([{ do: "song", song: "hello" }]);
      // Line 0 starts with the action itself.
      expect(h.stage.snapshot().song).toMatchObject({ id: "hello", line: 0, lines: 3 });
      expect(h.node("momo").gesture).toBe("wave");
      for (let line = 1; line < starts.length; line += 1) {
        const at = stepOf(starts[line] ?? 0);
        h.run(at - STEP_MS - h.now());
        expect(h.stage.snapshot().song?.line, `line ${line} has not started at ${h.now()} ms`).toBe(line - 1);
        h.run(STEP_MS);
        expect(h.stage.snapshot().song?.line, `line ${line} starts at ${h.now()} ms`).toBe(line);
        expect(h.node("momo").gesture).toBe(SONGS.hello.motions[line]);
      }
      // The run ends once the song's recorded length has passed.
      h.run(stepOf(recorded ?? 0) - h.now() - STEP_MS);
      expect(h.stage.snapshot().song).not.toBeNull();
      h.run(STEP_MS);
      expect(h.stage.snapshot().song).toBeNull();
      expect(h.warnings()).toEqual([]);
    } finally {
      h.stage.dispose();
    }
  });

  it("plays every song's motion on its line, in order, for every catalog song", async () => {
    const h = await open();
    try {
      for (const song of SONG_IDS) {
        const starts = recordedStarts(song);
        h.stage.apply([{ do: "song", song }]);
        const begun = h.now();
        SONGS[song].motions.forEach((motion, line) => {
          expect(isGesture(motion), `${song} line ${line}: "${motion}"`).toBe(true);
          h.run(begun + stepOf(starts[line] ?? 0) - h.now());
          expect(h.stage.snapshot().song?.line, `${song} line ${line}`).toBe(line);
          expect(h.node("momo").gesture, `${song} line ${line}`).toBe(motion);
          expect(h.node("sheru").gesture, `${song} line ${line}`).toBe(motion);
        });
      }
      expect(h.warnings()).toEqual([]);
    } finally {
      h.stage.dispose();
    }
  });
});

describe("performers", () => {
  it("default to the cast characters on stage and shown when the song starts", async () => {
    const h = await open();
    try {
      h.stage.apply([{ do: "song", song: "hello" }]);
      expect(h.stage.snapshot().song?.performers).toEqual(["momo", "sheru"]);
      expect(h.node("momo").gesture).toBe("wave");
      expect(h.node("sheru").gesture).toBe("wave");
      // Off stage, hidden, and props: not performers.
      expect(h.node("lulu").gesture).toBeNull();
      expect(h.node("peeko").gesture).toBeNull();
      expect(h.node("teddy").gesture).toBeNull();
      // Who performs is fixed when the song starts: Lulu entering later does not join in.
      h.stage.apply([{ do: "enter", actor: "lulu", at: "center" }]);
      h.run(stepOf(recordedStarts("hello")[1] ?? 0));
      expect(h.node("momo").gesture).toBe("hop");
      expect(h.node("lulu").gesture).toBeNull();
      // Once Lulu is on stage, the next song counts her in; one fading out does not count.
      h.run(4000);
      h.stage.apply([{ do: "hide", actor: "sheru" }, { do: "song", song: "allDone" }]);
      expect(h.stage.snapshot().song?.performers).toEqual(["momo", "lulu"]);
    } finally {
      h.stage.dispose();
    }
  });

  it("follows an explicit list (unknown ids are reported, never thrown)", async () => {
    const h = await open();
    try {
      h.stage.apply([{ do: "song", song: "hello", performers: ["teddy", "lulu", "nobody", "teddy"] }]);
      expect(h.stage.snapshot().song?.performers).toEqual(["teddy", "lulu"]);
      expect(h.node("teddy").gesture).toBe("wave");
      expect(h.node("lulu").gesture).toBe("wave");
      expect(h.node("momo").gesture).toBeNull();
      expect(h.warnings()).toEqual(['song hello: no performer node "nobody"']);
    } finally {
      h.stage.dispose();
    }
  });

  it("an empty list keeps the beat's own gestures through every line", async () => {
    const h = await open();
    try {
      h.stage.apply([{ do: "gesture", actor: "momo", gesture: "dance", loop: true }, { do: "song", song: "hello", performers: [] }]);
      expect(h.stage.snapshot().song?.performers).toEqual([]);
      const starts = recordedStarts("hello");
      h.run(stepOf(starts[2] ?? 0));
      expect(h.stage.snapshot().song?.line).toBe(2);
      expect(h.node("momo").gesture).toBe("dance");
      expect(h.node("sheru").gesture).toBeNull();
    } finally {
      h.stage.dispose();
    }
  });

  it("the song's motions follow its action: actions after it in the same list come after line 0", async () => {
    const h = await open();
    try {
      h.stage.apply([{ do: "song", song: "hello" }, { do: "gesture", actor: "momo", gesture: "sway", loop: true }]);
      expect(h.node("momo").gesture).toBe("sway");
      expect(h.node("sheru").gesture).toBe("wave");
      h.run(stepOf(recordedStarts("hello")[1] ?? 0));
      // Line 1's motion takes over from the beat's gesture.
      expect(h.node("momo").gesture).toBe("hop");
    } finally {
      h.stage.dispose();
    }
  });
});

describe("cues", () => {
  it("applies each line's cues once, in order, when the line starts (line 0 at once)", async () => {
    const h = await open();
    try {
      const starts = recordedStarts("hello");
      h.stage.apply([{
        do: "song",
        song: "hello",
        cues: [
          { line: 0, stage: [{ do: "show", actor: "ball" }] },
          { line: 2, stage: [{ do: "object", target: "ball", action: "bounce" }, { do: "gesture", actor: "sheru", gesture: "wag" }] },
          { line: 2, stage: [{ do: "sfx", sound: "pop" }] }
        ]
      }]);
      expect(h.cues.map((c) => [c.line, c.atMs])).toEqual([[0, 0]]);
      expect(h.node("ball").visible).toBe(true);
      // Nothing more until line 2: line 1 has no cues.
      h.run(stepOf(starts[2] ?? 0) - STEP_MS);
      expect(h.cues).toHaveLength(1);
      h.run(STEP_MS);
      expect(h.cues).toHaveLength(2);
      const line2 = h.cues[1];
      expect(line2?.line).toBe(2);
      expect(line2?.atMs).toBe(stepOf(starts[2] ?? 0));
      expect(line2?.actions.map((a) => a.do)).toEqual(["object", "gesture", "sfx"]);
      // The line's motion plays first, then its cues: Sheru wags instead of waving.
      expect(h.node("sheru").gesture).toBe("wag");
      expect(h.node("momo").gesture).toBe("wave");
      // To the end of the song and well past it: nothing applies twice.
      h.run(20_000);
      expect(h.cues.map((c) => c.line)).toEqual([0, 2]);
      expect(h.stage.snapshot().song).toBeNull();
      expect(h.warnings()).toEqual([]);
    } finally {
      h.stage.dispose();
    }
  });

  it("never starts a song from a cue, and reports cues on unknown nodes or lines (warnings, not throws)", async () => {
    const h = await open();
    try {
      const starts = recordedStarts("hello");
      const actions: StageAction[] = [{
        do: "song",
        song: "hello",
        cues: [
          { line: 1, stage: [{ do: "song", song: "goStop" }, { do: "show", actor: "ball" }] },
          { line: 1, stage: [{ do: "move", actor: "nobody", to: "left" }, { do: "face", actor: "momo", toward: "nowhere" }] },
          { line: 7, stage: [{ do: "hide", actor: "momo" }] },
          { line: -1, stage: [{ do: "hide", actor: "momo" }] }
        ]
      }];
      expect(() => h.stage.apply(actions)).not.toThrow();
      expect(h.warnings()).toEqual([
        'song hello: a cue on line 1 starts song "goStop"; a cue never starts a song (skipped)',
        'song hello: a cue on line 1 (move) names no node "nobody"',
        'song hello: a cue on line 1 (face) names no node "nowhere"',
        "song hello: cue line 7 is not one of its 3 lyric lines",
        "song hello: cue line -1 is not one of its 3 lyric lines"
      ]);
      h.run(stepOf(starts[1] ?? 0));
      // Still the same song; only the valid cue applied.
      expect(h.stage.snapshot().song?.id).toBe("hello");
      expect(h.cues.map((c) => [c.line, c.actions.map((a) => a.do)])).toEqual([[1, ["show"]]]);
      expect(h.node("ball").visible).toBe(true);
      h.run(20_000);
      expect(h.node("momo").visible).toBe(true);
    } finally {
      h.stage.dispose();
    }
  });
});

describe("cancelling", () => {
  const withCue = (song: SongId, line: number): StageAction => ({ do: "song", song, cues: [{ line, stage: [{ do: "show", actor: "ball" }] }] });

  it("a new song cancels the running one", async () => {
    const h = await open();
    try {
      h.stage.apply([withCue("hello", 2)]);
      h.run(1000);
      h.stage.apply([{ do: "song", song: "goStop" }]);
      expect(h.stage.snapshot().song).toMatchObject({ id: "goStop", line: 0 });
      expect(h.node("momo").gesture).toBe(SONGS.goStop.motions[0]);
      h.run(30_000);
      // hello's line 2 never came.
      expect(h.cues).toEqual([]);
      expect(h.node("ball").visible).toBe(false);
    } finally {
      h.stage.dispose();
    }
  });

  it("a story load cancels the running song, and the new story starts with none", async () => {
    const h = await open();
    try {
      h.stage.apply([withCue("hello", 1)]);
      const loading = h.stage.load(other);
      expect(h.stage.snapshot().song).toBeNull();
      await loading;
      expect(h.stage.snapshot().storyId).toBe("probe-song-2");
      h.run(15_000);
      expect(h.cues).toEqual([]);
      expect(h.stage.snapshot().song).toBeNull();
    } finally {
      h.stage.dispose();
    }
  });

  it("dispose cancels the running song", async () => {
    const h = await open();
    h.stage.apply([withCue("hello", 1)]);
    h.stage.dispose();
    h.run(15_000);
    expect(h.cues).toEqual([]);
    expect(h.stage.snapshot().song).toBeNull();
  });
});

describe("reduced motion", () => {
  it("maps the bouncy gestures to calm ones, and every calm variant is its own", () => {
    expect(CALM_GESTURES).toEqual({ hop: "nod", happy: "nod", cheer: "clap", dance: "sway" });
    for (const gesture of GESTURES) {
      expect(calmGesture(calmGesture(gesture)), gesture).toBe(calmGesture(gesture));
      if (!(gesture in CALM_GESTURES)) expect(calmGesture(gesture)).toBe(gesture);
    }
  });

  it("performers play the calm variant of each line's motion", async () => {
    const calm = await open(true);
    const full = await open(false);
    try {
      for (const h of [calm, full]) h.stage.apply([{ do: "song", song: "goStop" }]);
      const starts = recordedStarts("goStop");
      for (let line = 0; line < starts.length; line += 1) {
        for (const h of [calm, full]) h.run(stepOf(starts[line] ?? 0) - h.now());
        const motion = SONGS.goStop.motions[line] ?? "";
        expect(full.node("momo").gesture, `full line ${line}`).toBe(motion);
        expect(calm.node("momo").gesture, `calm line ${line}`).toBe(isGesture(motion) ? calmGesture(motion) : null);
      }
      // goStop's "Go, go, go!" is a dance; reduced motion sways instead.
      expect(SONGS.goStop.motions[2]).toBe("dance");
      expect(calmGesture("dance")).toBe("sway");
      // Switching reduced motion on mid-song applies from the next line on.
      full.stage.apply([{ do: "song", song: "hello" }]);
      expect(full.node("momo").gesture).toBe("wave");
      full.stage.setReducedMotion(true);
      full.run(stepOf(recordedStarts("hello")[1] ?? 0));
      expect(full.node("momo").gesture).toBe("nod");
    } finally {
      calm.stage.dispose();
      full.stage.dispose();
    }
  });
});

describe("determinism", () => {
  it("the same song, cues and steps give the same frames", async () => {
    const play = async (): Promise<string> => {
      const h = await open();
      try {
        h.stage.apply([{
          do: "song",
          song: "ballRolls",
          cues: [
            { line: 1, stage: [{ do: "show", actor: "ball" }, { do: "object", target: "ball", action: "roll" }] },
            { line: 3, stage: [{ do: "move", actor: "sheru", to: "center", style: "run" }] }
          ]
        }]);
        const frames: string[] = [];
        for (let i = 0; i < 340; i += 1) {
          h.run(STEP_MS);
          if (i % 10 === 0) frames.push(JSON.stringify(h.stage.snapshot()));
        }
        frames.push(JSON.stringify(h.cues));
        return frames.join("\n");
      } finally {
        h.stage.dispose();
      }
    };
    expect(await play()).toBe(await play());
  });
});
