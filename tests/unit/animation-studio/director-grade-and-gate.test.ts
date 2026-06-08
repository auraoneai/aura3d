import { afterEach, describe, expect, it, vi } from "vitest";
import {
  directScene,
  gradeAwareIntent,
  PERFORMANCE_VOCABULARY,
  type DirectorBeat,
  type DirectorSceneInput,
  type PerformanceClip,
  type RigGrade
} from "../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics";

/**
 * GAP 1 (F1) — the director validation gate is now wired into the REAL generation pipeline:
 * generateSceneFromPrompt calls validateDirectedActing on the directed beats and THROWS on a
 * degenerate (un-actable) plan. We prove that by forcing directBeats to return a degenerate
 * (all idle/talk, no gesture, no reaction) plan — generation must throw — while the four
 * STANDARD prompts (real, un-mocked director) still generate cleanly.
 *
 * GAP 2 (B5) — gradeAwareIntent restricts acting intents by rig grade so a D-grade rig (no
 * usable skeleton) never gets a gesture/walk it cannot perform.
 */

describe("F1 gate is wired into generateSceneFromPrompt (throws on degenerate, passes on normal)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock(
      "../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics"
    );
  });

  it("THROWS when the directed acting plan is degenerate (forced all-idle/talk)", async () => {
    // Force directBeats to return a degenerate plan (no gesture, no reaction, all idle/talk) while
    // keeping directScene + validateDirectedActing REAL — this is exactly the dead-scene the gate
    // must catch in the product, not just in the gate's own unit test.
    vi.doMock(
      "../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics",
      async () => {
        const actual = await vi.importActual<
          typeof import("../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics")
        >("../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics");
        const degenerate: DirectorBeat[] = [
          { lineId: "d0", speaker: "alex", listener: "sam", text: "We talk.", speakingIntent: "talk", listenerIntent: "talk", gesture: "talk", cameraIntent: "establishing", durationSeconds: 4 },
          { lineId: "d1", speaker: "sam", listener: "alex", text: "We talk.", speakingIntent: "talk", listenerIntent: "talk", gesture: "talk", cameraIntent: "two-shot", durationSeconds: 4 }
        ];
        return { ...actual, directBeats: () => degenerate };
      }
    );
    const { generateSceneFromPrompt } = await import(
      "../../../packages/create-aura3d/templates/animation-studio/src/director/prompt-to-scene"
    );
    expect(() => generateSceneFromPrompt("two office workers arguing about a deadline")).toThrow(
      /degenerate \(un-actable\) scene/
    );
  });

  it("the FOUR standard prompts still generate fine (real director passes the gate)", async () => {
    const { generateSceneFromPrompt } = await import(
      "../../../packages/create-aura3d/templates/animation-studio/src/director/prompt-to-scene"
    );
    const STANDARD_PROMPTS = [
      "two robots fixing a car in a garage",
      "two office workers arguing about a deadline",
      "a chef teaching a child to bake bread",
      "a quiet moon garden at night with glowing lilies"
    ];
    for (const prompt of STANDARD_PROMPTS) {
      expect(() => generateSceneFromPrompt(prompt)).not.toThrow();
      const { document } = generateSceneFromPrompt(prompt);
      // render-shaped: cast bound, shots tiled from 0, blocking per character, dialogue present.
      expect(document.assets.characters.length).toBeGreaterThanOrEqual(1);
      expect(document.shots[0]!.startTime).toBe(0);
      expect(document.blocking.length).toBe(document.assets.characters.length);
      expect(document.dialogue?.lines.length).toBeGreaterThan(0);
    }
  });
});

describe("B5 — gradeAwareIntent restricts acting by rig grade", () => {
  const VOCAB = new Set<string>(PERFORMANCE_VOCABULARY);
  const ALL: PerformanceClip[] = [...PERFORMANCE_VOCABULARY];

  it("A and B grades (and undefined) impose NO restriction", () => {
    for (const grade of [undefined, "A", "B"] as (RigGrade | undefined)[]) {
      for (const intent of ALL) expect(gradeAwareIntent(intent, grade)).toBe(intent);
    }
  });

  it("a D-grade rig NEVER gets a gesture / point / walk / run / nod / react — talk or idle only", () => {
    const restricted = ALL.map((i) => gradeAwareIntent(i, "D"));
    // Every restricted intent is in the vocabulary and is only talk or idle (no body acting).
    for (const r of restricted) {
      expect(VOCAB.has(r)).toBe(true);
      expect(["talk", "idle"]).toContain(r);
    }
    // Specifically: body-acting intents collapse to idle; talk stays talk; idle stays idle.
    expect(gradeAwareIntent("gesture", "D")).toBe("idle");
    expect(gradeAwareIntent("point", "D")).toBe("idle");
    expect(gradeAwareIntent("walk", "D")).toBe("idle");
    expect(gradeAwareIntent("run", "D")).toBe("idle");
    expect(gradeAwareIntent("nod", "D")).toBe("idle");
    expect(gradeAwareIntent("react", "D")).toBe("idle");
    expect(gradeAwareIntent("talk", "D")).toBe("talk");
    expect(gradeAwareIntent("idle", "D")).toBe("idle");
  });

  it("a C-grade (mascot) rig keeps head/torso acting but drops limb gestures + locomotion", () => {
    // Limb gestures become a nod (head acting); locomotion becomes a hold.
    expect(gradeAwareIntent("gesture", "C")).toBe("nod");
    expect(gradeAwareIntent("point", "C")).toBe("nod");
    expect(gradeAwareIntent("walk", "C")).toBe("idle");
    expect(gradeAwareIntent("run", "C")).toBe("idle");
    // Head/torso intents pass through unchanged.
    expect(gradeAwareIntent("nod", "C")).toBe("nod");
    expect(gradeAwareIntent("react", "C")).toBe("react");
    expect(gradeAwareIntent("talk", "C")).toBe("talk");
    expect(gradeAwareIntent("idle", "C")).toBe("idle");
  });

  it("directScene CONSULTS the grade: a D-grade character never receives gesture/walk in its blocking", () => {
    const scene: DirectorSceneInput = {
      duration: 18,
      characters: [
        { id: "alex", entersFrom: "none" },
        { id: "sam", entersFrom: "none" }
      ],
      shots: [
        { shotId: "s0", startTime: 0, endTime: 6 },
        { shotId: "s1", startTime: 6, endTime: 12 },
        { shotId: "s2", startTime: 12, endTime: 18 }
      ],
      dialogue: [
        { lineId: "l0", speakerId: "alex", startTime: 0.2, endTime: 3.5, text: "Did you finish the report?" },
        { lineId: "l1", speakerId: "sam", startTime: 3.7, endTime: 5.8, text: "No, I did NOT have time!" },
        { lineId: "l2", speakerId: "alex", startTime: 6.2, endTime: 9.0, text: "That is completely unacceptable." },
        { lineId: "l3", speakerId: "sam", startTime: 9.2, endTime: 11.5, text: "Fine. Show me the summary." }
      ],
      walkableBounds: { min: [-4, 0, -4], max: [4, 0, 4] },
      props: [],
      // sam's rig is D-grade (no usable skeleton); alex is A.
      gradesByCharacter: { sam: "D", alex: "A" }
    };
    const directed = directScene("grade-aware", scene);
    const sam = directed.blocking.find((b) => b.characterId === "sam")!;
    // No hold/perform beat for the D-grade character is a gesture/point/nod/react — only talk/idle
    // (the entrance-walk locomotion path is exempt by design; sam has entersFrom:"none" so it never
    // walks here). Every clip stays in the vocabulary.
    for (const beat of sam.shots) {
      expect(VOCAB.has(beat.clip)).toBe(true);
      expect(["talk", "idle"]).toContain(beat.clip);
    }
    // The A-grade character is unaffected — it still gets real body acting (a gesture somewhere).
    const alex = directed.blocking.find((b) => b.characterId === "alex")!;
    const alexClips = alex.shots.map((s) => s.clip);
    expect(alexClips.some((c) => c === "gesture" || c === "point" || c === "nod" || c === "react")).toBe(true);
  });
});
