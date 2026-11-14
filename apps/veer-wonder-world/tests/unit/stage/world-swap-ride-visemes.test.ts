import { describe, expect, it } from "vitest";
import { songCueTimesMs } from "../../../src/content/songs.js";
import {
  createCharacterDirector,
  locomotionSubParts,
  sampleCharacterSubParts,
  sampleVisemeAtMs,
  visemeSubParts
} from "../../../src/scenes/articulated-actors.js";
import {
  VEIL_COLOR,
  VEIL_NIGHT_COLOR,
  VEIL_TRAIN_COLOR,
  createStage,
  resolveTransitionVeilColor,
  type SongCueEvent
} from "../../../src/scenes/stage.js";
import type { EpisodeSpec } from "../../../src/types.js";
import { alignmentToVisemes, type CharacterAlignment } from "../../../tools/gen-visemes.js";

function makeStory(overrides: Partial<EpisodeSpec> & Pick<EpisodeSpec, "id" | "world">): EpisodeSpec {
  return {
    kind: "episode",
    version: 1,
    phase: "P2",
    number: 1,
    host: "momo",
    titleKey: "e01.title",
    cast: [
      { id: "momo", at: "center" },
      { id: "lulu", at: "left" },
      { id: "sheru", at: "right" }
    ],
    props: [],
    targetWords: [],
    supportWords: [],
    offlinePlayKey: "e01.offline",
    caregiverBridgeKey: "e01.bridge",
    review: {
      language: "approved",
      rights: "approved",
      reviewer: "unit-test",
      date: "2026-11-13"
    },
    beats: [],
    estimatedDurationSec: 180,
    ...overrides
  };
}

describe("B3.6 timed visemes, alignmentToVisemes, and tiko articulation", () => {
  it("maps phonetic grapheme clusters and inter-word pauses into compact rounded-ms VisemeCue tracks", () => {
    // Phrase: "momo, peeko! vijf? no" -> exercise MBP, OH, pause, EE, WQ/OH, FV, LTH, AA
    // Let's use clear English child words: "mama, five! woo? the ah"
    const text = "mama, five! woo? the ah";
    const chars = [...text];
    const starts: number[] = [];
    const ends: number[] = [];
    let cursor = 0.08;
    for (const ch of chars) {
      if (ch === " ") {
        // 90 ms inter-word silence (> 60 ms threshold)
        starts.push(cursor);
        ends.push(cursor + 0.09);
        cursor += 0.09;
      } else if (ch === "," || ch === "!" || ch === "?") {
        starts.push(cursor);
        ends.push(cursor + 0.07);
        cursor += 0.07;
      } else {
        starts.push(cursor);
        ends.push(cursor + 0.06);
        cursor += 0.06;
      }
    }

    const alignment: CharacterAlignment = {
      characters: chars,
      character_start_times_seconds: starts,
      character_end_times_seconds: ends
    };

    const cues = alignmentToVisemes(alignment);
    expect(cues.length).toBeGreaterThan(6);

    for (const cue of cues) {
      expect(Number.isInteger(cue.tMs)).toBe(true);
      expect(Number.isInteger(cue.dMs ?? 0)).toBe(true);
      expect(cue.dMs ?? 0).toBeGreaterThan(0);
    }

    const codes = new Set(cues.map((c) => c.viseme));
    expect(codes.has("MBP")).toBe(true);
    expect(codes.has("AA")).toBe(true);
    expect(codes.has("FV")).toBe(true);
    expect(codes.has("EE")).toBe(true);
    expect(codes.has("WQ")).toBe(true);
    expect(codes.has("LTH")).toBe(true);
    expect(codes.has("rest")).toBe(true);

    // Every rest cue has openness === 0 and produces a 100% closed mouth (undefined sub-parts)
    const restCues = cues.filter((c) => c.viseme === "rest");
    expect(restCues.length).toBeGreaterThanOrEqual(3);
    for (const rest of restCues) {
      expect(rest.openness).toBe(0);
      const midRestMs = rest.tMs + Math.floor((rest.dMs ?? rest.endMs - rest.tMs) * 0.5);
      const sampled = sampleVisemeAtMs(cues, midRestMs);
      expect(sampled).toEqual({ viseme: "rest", openness: 0 });
      expect(visemeSubParts("momo", sampled.viseme, sampled.openness, midRestMs / 1000)).toBeUndefined();
    }

    // Before first cue and after last cue, mouth is closed at rest
    expect(sampleVisemeAtMs(cues, 10)).toEqual({ viseme: "rest", openness: 0 });
    const lastCue = cues[cues.length - 1]!;
    expect(sampleVisemeAtMs(cues, lastCue.endMs + 120)).toEqual({ viseme: "rest", openness: 0 });
  });

  it("maps o/oa/ow/au to OH and ph/qu/ea digraphs accurately with >60 ms gap rest insertion", () => {
    const alignment: CharacterAlignment = {
      characters: ["b", "o", "a", "t", "p", "h", "o", "n", "e", "q", "u", "e", "a"],
      character_start_times_seconds: [
        0.0, 0.05, 0.1, 0.16,
        // 120 ms gap before "phone" (no space char, pure timestamp gap > 60 ms)
        0.34, 0.39, 0.45, 0.52, 0.58,
        // 100 ms gap before "quea"
        0.74, 0.79, 0.85, 0.91
      ],
      character_end_times_seconds: [
        0.05, 0.1, 0.16, 0.22,
        0.39, 0.45, 0.52, 0.58, 0.64,
        0.79, 0.85, 0.91, 0.98
      ]
    };
    const cues = alignmentToVisemes(alignment);
    expect(cues.some((c) => c.viseme === "OH")).toBe(true);
    expect(cues.some((c) => c.viseme === "FV")).toBe(true);
    expect(cues.some((c) => c.viseme === "WQ")).toBe(true);
    expect(cues.some((c) => c.viseme === "EE")).toBe(true);

    // Timestamp gap 220..340 ms produces an inter-word rest
    const gapSample = sampleVisemeAtMs(cues, 280);
    expect(gapSample).toEqual({ viseme: "rest", openness: 0 });
  });

  it("coarticulates smoothly over 35 ms ramps and shapes AA, OH, EE, MBP, FV, peeko beak, gogo chimney, and tiko jaw", () => {
    const cues = [
      { tMs: 100, endMs: 300, dMs: 200, viseme: "AA" as const, openness: 0.9 },
      { tMs: 400, endMs: 580, dMs: 180, viseme: "OH" as const, openness: 0.8 }
    ];

    const earlyRamp = sampleVisemeAtMs(cues, 110);
    const fullMid = sampleVisemeAtMs(cues, 200);
    expect(earlyRamp.viseme).toBe("AA");
    expect(earlyRamp.openness).toBeGreaterThan(0);
    expect(earlyRamp.openness).toBeLessThan(fullMid.openness);
    expect(fullMid.openness).toBeCloseTo(0.9, 2);

    // Closed at rest / near-zero openness
    expect(visemeSubParts("momo", "rest", 0.8, 0.5)).toBeUndefined();
    expect(visemeSubParts("momo", "AA", 0.01, 0.5)).toBeUndefined();

    // MBP: pressed lips (~0.02 jaw pitch, subtle cheekPuff X ~1.05)
    const mbp = visemeSubParts("momo", "MBP", 0.8, 0.5);
    expect(mbp?.jaw?.rotation?.[0]).toBeCloseTo(0.02, 3);
    expect(mbp?.cheekPuff?.scale?.[0]).toBeCloseTo(1.05, 3);

    // AA: wide open jaw (0.48 * openness pitch, -0.028 * openness drop) + cheekPuff + head nod
    const aa = visemeSubParts("tiko", "AA", 1, 0.5);
    expect(aa?.jaw?.rotation?.[0]).toBeCloseTo(0.48, 3);
    expect(aa?.jaw?.offset?.[1]).toBeCloseTo(-0.028, 3);
    expect(aa?.cheekPuff).toBeDefined();
    expect(aa?.head).toBeDefined();

    // OH / WQ: rounded open jaw (0.36 * openness pitch, narrowed X & forward Z cheekPuff)
    const oh = visemeSubParts("momo", "OH", 1, 0.5);
    expect(oh?.jaw?.rotation?.[0]).toBeCloseTo(0.36, 3);
    expect(oh?.cheekPuff?.scale?.[0] ?? 1).toBeLessThan(1);
    expect(oh?.cheekPuff?.scale?.[2] ?? 1).toBeGreaterThan(1);

    // EE: wide smile (0.22 * openness pitch, wider cheekPuff X = 1 + 0.15 * openness)
    const ee = visemeSubParts("lulu", "EE", 1, 0.5);
    expect(ee?.jaw?.rotation?.[0]).toBeCloseTo(0.22, 3);
    expect(ee?.cheekPuff?.scale?.[0]).toBeCloseTo(1.15, 3);

    // FV / LTH: half-open consonant (0.16 * openness pitch)
    const fv = visemeSubParts("sheru", "FV", 1, 0.5);
    expect(fv?.jaw?.rotation?.[0]).toBeCloseTo(0.16, 3);

    // Peeko beakLower, GoGo chimney + jaw, Lumi shimmer + jaw
    const peekoPose = visemeSubParts("peeko", "AA", 0.9, 0.4);
    expect(peekoPose?.beakLower?.rotation?.[0]).toBeGreaterThan(0.3);
    expect(peekoPose?.jaw).toBeUndefined();

    const gogoPose = visemeSubParts("gogo", "OH", 0.85, 0.4);
    expect(gogoPose?.chimney?.scale?.[0] ?? 1).toBeGreaterThan(1.05);
    expect(gogoPose?.chimney?.scale?.[1] ?? 1).toBeLessThan(0.95);
    expect(gogoPose?.jaw?.rotation?.[0]).toBeGreaterThan(0.15);

    const lumiPose = visemeSubParts("lumi", "EE", 0.8, 0.4);
    expect(lumiPose?.body?.scale?.[0] ?? 1).toBeGreaterThan(1.015);
    expect(lumiPose?.petals?.scale?.[0] ?? 1).toBeGreaterThan(1.02);
    expect(lumiPose?.jaw?.rotation?.[0]).toBeGreaterThan(0.1);
  });

  it("drives CharacterDirector with timed visemes when non-null and preserves 20 Hz RMS fallback when null", () => {
    const charDirector = createCharacterDirector();
    charDirector.setTalking("tiko");
    charDirector.setSpeechEnergy(0.75);

    // Fallback RMS mode when speechViseme is null
    charDirector.setSpeechViseme(null);
    const rmsPose = charDirector.sample({ id: "tiko", timeSec: 0.12 });
    expect(rmsPose?.jaw?.rotation?.[0] ?? 0).toBeGreaterThan(0.05);

    // Timed viseme "rest" overrides RMS energy so inter-word pauses stay 100% closed
    charDirector.setSpeechViseme("rest", 0);
    const restPose = charDirector.sample({ id: "tiko", timeSec: 0.12 });
    expect(restPose?.jaw).toBeUndefined();

    // Timed viseme "AA" drives full wide jaw opening
    charDirector.setSpeechViseme("AA", 0.95);
    const aaPose = charDirector.sample({ id: "tiko", timeSec: 0.12 });
    expect(aaPose?.jaw?.rotation?.[0]).toBeCloseTo(0.48 * 0.95, 3);

    // Clearing speechViseme back to null restores RMS envelope
    charDirector.setSpeechViseme(null);
    const restoredPose = charDirector.sample({ id: "tiko", timeSec: 0.12 });
    expect(restoredPose?.jaw?.rotation?.[0] ?? 0).toBeGreaterThan(0.05);
  });

  it("articulates tiko locomotion and cosy shell hide/peek/nod/point gestures", () => {
    const walk = locomotionSubParts("tiko", "walk", 0.35, false, 0.6);
    expect(walk?.armL).toBeDefined();
    expect(walk?.armR).toBeDefined();
    expect(walk?.footL).toBeDefined();
    expect(walk?.footR).toBeDefined();
    expect(walk?.tail).toBeDefined();

    const hidePose = sampleCharacterSubParts({
      id: "tiko",
      gesture: "hide",
      gestureElapsedSec: 0.6,
      gestureDurationSec: 1.4,
      loop: false,
      holding: false,
      locomotion: null,
      speechEnergy: 0,
      reducedMotion: false,
      timeSec: 0.6
    });
    expect(hidePose?.head?.offset?.[1] ?? 0).toBeLessThan(-0.02);
    expect(hidePose?.eyelidL?.scale?.[1] ?? 1).toBeCloseTo(0.12, 2);

    const peekPose = sampleCharacterSubParts({
      id: "tiko",
      gesture: "peek",
      gestureElapsedSec: 0.6,
      gestureDurationSec: 1.4,
      loop: false,
      holding: false,
      locomotion: null,
      speechEnergy: 0,
      reducedMotion: false,
      timeSec: 0.6
    });
    expect(peekPose?.head?.offset?.[2] ?? 0).toBeGreaterThan(0.02);

    const pointPose = sampleCharacterSubParts({
      id: "tiko",
      gesture: "point",
      gestureElapsedSec: 0.5,
      gestureDurationSec: 1.4,
      loop: false,
      holding: false,
      locomotion: null,
      speechEnergy: 0,
      reducedMotion: false,
      timeSec: 0.5
    });
    expect(pointPose?.armR?.rotation?.[0] ?? 0).toBeLessThan(-0.4);
  });
});

describe("E.8 SongCue.offsetMs, do: 'ride', and B3.3 swapSegment", () => {
  const nonHeadlessWarnings = (warnings: readonly string[]): readonly string[] =>
    warnings.filter((w) => !w.startsWith("first frame:"));

  it("fires zero-offset song cues on the line beat and offsetMs cues after startsMs[line] + offsetMs", async () => {
    const cueEvents: SongCueEvent[] = [];
    const stage = await createStage({
      target: null,
      reducedMotion: false,
      mountTimeoutMs: 25,
      onSongCue: (cue) => cueEvents.push(cue)
    });

    try {
      await stage.load(makeStory({ id: "test-song-offset", world: "meadow" }));
      const startsMs = songCueTimesMs("goStop");
      const line2Ms = startsMs[2]!;

      stage.apply([
        {
          do: "song",
          song: "goStop",
          performers: ["momo", "lulu", "sheru"],
          cues: [
            {
              line: 2,
              stage: [
                { do: "gesture", actor: "momo", gesture: "freeze" },
                { do: "gesture", actor: "sheru", gesture: "freeze" }
              ]
            },
            {
              line: 2,
              offsetMs: 600,
              stage: [{ do: "gesture", actor: "lulu", gesture: "freeze" }]
            }
          ]
        }
      ]);

      // Advance in 50 ms ticks right up to line2Ms + 100 ms (before +600 ms offset)
      let advancedMs = 0;
      while (advancedMs < line2Ms + 100) {
        const stepMs = Math.min(50, line2Ms + 100 - advancedMs);
        stage.update(stepMs / 1000);
        advancedMs += stepMs;
      }

      const snapBeforeOffset = stage.snapshot();
      const momoBefore = snapBeforeOffset.nodes.find((n) => n.id === "momo");
      const sheruBefore = snapBeforeOffset.nodes.find((n) => n.id === "sheru");
      const luluBefore = snapBeforeOffset.nodes.find((n) => n.id === "lulu");

      expect(momoBefore?.gesture).toBe("freeze");
      expect(sheruBefore?.gesture).toBe("freeze");
      expect(luluBefore?.gesture).not.toBe("freeze");
      expect(cueEvents).toHaveLength(1);
      expect(cueEvents[0]?.line).toBe(2);
      expect(cueEvents[0]?.offsetMs).toBeUndefined();

      // Advance past line2Ms + 600 ms so Lulu's +600 ms delayed freeze fires
      while (advancedMs < line2Ms + 650) {
        const stepMs = Math.min(50, line2Ms + 650 - advancedMs);
        stage.update(stepMs / 1000);
        advancedMs += stepMs;
      }

      const snapAfterOffset = stage.snapshot();
      const luluAfter = snapAfterOffset.nodes.find((n) => n.id === "lulu");
      expect(luluAfter?.gesture).toBe("freeze");
      expect(cueEvents).toHaveLength(2);
      expect(cueEvents[1]?.line).toBe(2);
      expect(cueEvents[1]?.offsetMs).toBe(600);
      expect(nonHeadlessWarnings(stage.diagnostics().warnings)).toEqual([]);
    } finally {
      stage.dispose();
    }
  });

  it("mounts riders onto gogo and gogoCarriage seats, moves coupled carriages on drive, and dismounts cleanly", async () => {
    const stage = await createStage({ target: null, reducedMotion: false, mountTimeoutMs: 25 });

    try {
      await stage.load(
        makeStory({
          id: "test-train-ride",
          world: "station",
          cast: [
            { id: "momo", at: "frontLeft" },
            { id: "lulu", at: "frontRight" },
            { id: "gogo", at: "center" }
          ],
          props: [
            { id: "carriage1", asset: "gogoCarriage", at: "left" },
            { id: "carriage2", asset: "gogoCarriage", at: "farLeft" }
          ]
        })
      );

      // Also verify stage.setSpeechViseme works cleanly through WonderStage
      stage.setTalking("momo");
      stage.setSpeechEnergy?.(0.8);
      stage.setSpeechViseme("AA", 0.9);
      stage.update(0.05);
      stage.setSpeechViseme("rest", 0);
      stage.update(0.05);
      stage.setSpeechViseme(null);
      stage.setTalking(null);

      // Board Momo onto carriage1 and Lulu onto GoGo's cab
      stage.apply([
        { do: "ride", actor: "momo", on: "carriage1" },
        { do: "ride", actor: "lulu", on: "gogo" }
      ]);
      for (let i = 0; i < 8; i += 1) stage.update(0.05);

      const boarded = stage.spatialState();
      const momoSeated = boarded.find((n) => n.id === "momo")!;
      const luluSeated = boarded.find((n) => n.id === "lulu")!;
      const carriageBefore = boarded.find((n) => n.id === "carriage1")!;
      const gogoBefore = boarded.find((n) => n.id === "gogo")!;

      expect(momoSeated.carriedBy).toBe("carriage1");
      expect(luluSeated.carriedBy).toBe("gogo");
      // Seated above ground on the carriage bench / GoGo cab floor without clipping to y=0
      expect(momoSeated.position[1]).toBeGreaterThan(carriageBefore.position[1] + 0.15);
      expect(luluSeated.position[1]).toBeGreaterThan(gogoBefore.position[1] + 0.15);

      // Drive GoGo to "right": carriage1 and Momo ride along in lockstep
      stage.apply([{ do: "move", actor: "gogo", to: "right", style: "drive" }]);
      for (let i = 0; i < 30; i += 1) stage.update(0.08);

      const driven = stage.spatialState();
      const carriageAfter = driven.find((n) => n.id === "carriage1")!;
      const momoAfterDrive = driven.find((n) => n.id === "momo")!;
      expect(carriageAfter.position[0]).toBeGreaterThan(carriageBefore.position[0] + 0.4);
      expect(Math.abs(momoAfterDrive.position[0] - carriageAfter.position[0])).toBeLessThan(0.25);

      // Dismount Momo cleanly onto the station ground/platform
      stage.apply([{ do: "ride", actor: "momo", on: null }]);
      stage.update(0.05);

      const dismounted = stage.spatialState().find((n) => n.id === "momo")!;
      expect(dismounted.carriedBy).toBeNull();
      expect(dismounted.position[1]).toBeLessThan(momoSeated.position[1]);
      expect(Math.abs(dismounted.position[0] - carriageAfter.position[0])).toBeLessThan(0.65);
      expect(nonHeadlessWarnings(stage.diagnostics().warnings)).toEqual([]);
    } finally {
      stage.dispose();
    }
  });

  it("swaps segments across cut, train, and fade transitions without recreating the AuraApp or losing warm shaders", async () => {
    const meadowSeg = makeStory({
      id: "seg-1-meadow",
      world: "meadow",
      cast: [
        { id: "momo", at: "center" },
        { id: "gogo", at: "left" }
      ]
    });
    const stationSeg = makeStory({
      id: "seg-2-station",
      world: "station",
      cast: [
        { id: "momo", at: "left" },
        { id: "gogo", at: "center" }
      ]
    });
    const homeSeg = makeStory({
      id: "seg-3-home",
      world: "home-nook",
      cast: [
        { id: "momo", at: "center" },
        { id: "peeko", at: "right" }
      ]
    });
    const nurserySeg = makeStory({
      id: "seg-4-nursery",
      world: "moonlit-nursery",
      sleepCategory: "bedtime",
      cast: [
        { id: "lumi", at: "highLeft" },
        { id: "momo", at: "center" }
      ]
    });

    // Verify transition veil colour policy (never #000000 black; null on cut/none)
    expect(resolveTransitionVeilColor(stationSeg, "cut")).toBeNull();
    expect(resolveTransitionVeilColor(stationSeg, "none")).toBeNull();
    expect(resolveTransitionVeilColor(stationSeg, "train")).toBe(VEIL_TRAIN_COLOR);
    expect(resolveTransitionVeilColor(homeSeg, "fade")).toBe(VEIL_COLOR);
    expect(resolveTransitionVeilColor(nurserySeg, "fade")).toBe(VEIL_NIGHT_COLOR);

    const stage = await createStage({ target: null, reducedMotion: true, mountTimeoutMs: 25 });
    try {
      const initialApp = stage.game().app;
      await stage.load(meadowSeg);
      expect(stage.diagnostics().warmed).toBe(true);
      expect(stage.diagnostics().swapCount).toBe(0);
      expect(stage.snapshot().world).toBe("meadow");

      // 1. "train" swap -> station
      await stage.swapSegment(stationSeg, "train");
      expect(stage.game().app).toBe(initialApp);
      expect(stage.snapshot().storyId).toBe("seg-2-station");
      expect(stage.snapshot().world).toBe("station");
      expect(stage.diagnostics().warmed).toBe(true);
      expect(stage.diagnostics().swapCount).toBe(1);

      // 2. "cut" swap -> home-nook (zero veil frames)
      await stage.swapSegment(homeSeg, "cut");
      expect(stage.game().app).toBe(initialApp);
      expect(stage.snapshot().storyId).toBe("seg-3-home");
      expect(stage.snapshot().world).toBe("home-nook");
      expect(stage.diagnostics().warmed).toBe(true);
      expect(stage.diagnostics().swapCount).toBe(2);

      // 3. "fade" swap -> moonlit-nursery
      await stage.swapSegment(nurserySeg, "fade", { nightVeil: true });
      expect(stage.game().app).toBe(initialApp);
      expect(stage.snapshot().storyId).toBe("seg-4-nursery");
      expect(stage.snapshot().world).toBe("moonlit-nursery");
      expect(stage.diagnostics().warmed).toBe(true);
      expect(stage.diagnostics().swapCount).toBe(3);
      expect(nonHeadlessWarnings(stage.diagnostics().warnings)).toEqual([]);
    } finally {
      stage.dispose();
    }
  });
});
