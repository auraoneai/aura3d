import { describe, expect, it } from "vitest";
import {
  directScene,
  PERFORMANCE_VOCABULARY,
  type DirectorSceneInput
} from "../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics";

/**
 * Phase 4.1: the Director must emit per-beat clip intents from the FIXED standard
 * performance vocabulary (idle/talk/gesture/point/nod/walk/run/react), chosen by the
 * beat's ROLE — never a fictional / asset-specific clip name. These tests pin that
 * contract on a 2-character dialogue scene.
 */
describe("director per-beat clip intents (standard vocabulary)", () => {
  const VOCAB = new Set<string>(PERFORMANCE_VOCABULARY);

  // A 2-character, dialogue-driven scene: 3 shots (establishing / two-shot / close-up).
  // "hero" speaks first and last; "sidekick" only ever speaks the middle window is silent
  // staging. Shots 0..3 tile [0,3],[3,6],[6,9].
  const scene: DirectorSceneInput = {
    duration: 9,
    characters: [
      { id: "hero", entersFrom: "left" },
      { id: "sidekick", entersFrom: "none" }
    ],
    shots: [
      { shotId: "s0", startTime: 0, endTime: 3 },
      { shotId: "s1", startTime: 3, endTime: 6 },
      { shotId: "s2", startTime: 6, endTime: 9 }
    ],
    dialogue: [
      // hero is the active speaker in the opening AND the close-up.
      { lineId: "l0", speakerId: "hero", startTime: 0.2, endTime: 2.8 },
      { lineId: "l2", speakerId: "hero", startTime: 6.2, endTime: 8.8 }
    ],
    walkableBounds: { min: [-4, 0, -4], max: [4, 0, 4] },
    props: []
  };

  it("emits ONLY vocabulary clips for every beat", () => {
    const directed = directScene("clip-intents", scene);
    const clips = directed.blocking.flatMap((b) => b.shots.map((s) => s.clip));
    expect(clips.length).toBeGreaterThan(0);
    for (const clip of clips) {
      expect(VOCAB.has(clip)).toBe(true);
    }
  });

  it("the active speaker talks during dialogue and gestures on the close-up emphasis", () => {
    const directed = directScene("clip-intents", scene);
    const hero = directed.blocking.find((b) => b.characterId === "hero")!;
    const beat = (shotId: string) => hero.shots.find((s) => s.shotId === shotId)!;

    // Opening beat: hero enters from the left → a traversal (walk/run), not a talk hold.
    expect(["walk", "run"]).toContain(beat("s0").clip);

    // Close-up (last shot) where hero is the active speaker → emphasis gesture.
    expect(beat("s2").clip).toBe("gesture");
  });

  it("a non-speaking addressed character reacts / nods rather than talking", () => {
    const directed = directScene("clip-intents", scene);
    const sidekick = directed.blocking.find((b) => b.characterId === "sidekick")!;
    const beat = (shotId: string) => sidekick.shots.find((s) => s.shotId === shotId)!;

    // Close-up: hero is speaking, sidekick is being addressed → nod (active listening),
    // definitely not talk/gesture.
    expect(beat("s2").clip).toBe("nod");
    expect(beat("s2").clip).not.toBe("talk");
  });

  it("a sub-walking-speed middle beat HOLDS + performs (no walk-in-place micro-traverse)", () => {
    // REGRESSION: the director used to emit a tiny converge as a 2-waypoint 'walk' on the middle
    // beat (e.g. ~0.65m over the shot ≈ 0.2 m/s) — an imperceptible drift that rendered as the
    // character WALKING IN PLACE while standing still. It must instead hold its mark and perform.
    const directed = directScene("clip-intents", scene);
    for (const b of directed.blocking) {
      const s1 = b.shots.find((s) => s.shotId === "s1")!;
      // Held mark — NOT a 2-waypoint micro-traverse.
      expect(s1.waypoints.length).toBe(1);
      // A performance/idle clip from the vocabulary (s1 has no dialogue → idle/react), never a
      // walk-in-place. (A REAL entrance traverse still walks — see the s0 test above.)
      expect(VOCAB.has(s1.clip)).toBe(true);
    }
  });

  it("a genuine long traverse still emits a real 2-waypoint walk", () => {
    // A character that must cross a real distance (entrance from the side) walks — proving the
    // velocity gate suppresses only the imperceptible drift, not real locomotion.
    const directed = directScene("clip-intents", scene);
    const hero = directed.blocking.find((b) => b.characterId === "hero")!;
    const entrance = hero.shots.find((s) => s.shotId === "s0")!;
    expect(["walk", "run"]).toContain(entrance.clip);
    expect(entrance.waypoints.length).toBe(2); // a real path with a start + destination
  });

  it("talk is used somewhere when a speaker holds (not entering, not traversing)", () => {
    // Make the active speaker NOT enter, so the opening hold beat is a pure talk.
    const stationary: DirectorSceneInput = {
      ...scene,
      characters: [
        { id: "hero", entersFrom: "none" },
        { id: "sidekick", entersFrom: "none" }
      ]
    };
    const directed = directScene("clip-intents-stationary", stationary);
    const hero = directed.blocking.find((b) => b.characterId === "hero")!;
    const opening = hero.shots.find((s) => s.shotId === "s0")!;
    expect(opening.clip).toBe("talk");
  });
});
