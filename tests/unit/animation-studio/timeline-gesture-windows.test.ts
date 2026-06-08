import { describe, expect, it } from "vitest";
import {
  mapDocument,
  type RuntimeDocument
} from "../../../apps/animation-studio-web/src/state/mapDocument";

/**
 * Phase C2: the Timeline view must show REAL beat timing — speech-duration windows for
 * dialogue AND gesture windows for the gesture/reaction clips the director assigned per
 * beat. `mapDocument` is the single mapping the Timeline reads, so these tests pin that
 * both the dialogue (`beats`) and gesture (`gestures`) tracks come from the real document
 * timing (dialogue line start/end + the shot window each blocking beat plays over) — not a
 * fixed or fabricated window.
 */

/** A 2-character scene: 3 shots tiling [0,4][4,8][8,12], hero gestures on the close-up,
 * sidekick reacts there; hero just talks in the opening. */
function scene(): RuntimeDocument {
  return {
    id: "c2",
    duration: 12,
    assets: { characters: [{ id: "hero" }, { id: "sidekick" }], props: [] },
    set: {},
    shots: [
      { shotId: "s0", presetId: "establishing", startTime: 0, endTime: 4 },
      { shotId: "s1", presetId: "two-shot", startTime: 4, endTime: 8 },
      { shotId: "s2", presetId: "close-up", startTime: 8, endTime: 12 }
    ],
    blocking: [
      {
        characterId: "hero",
        shots: [
          { shotId: "s0", clip: "talk" },
          { shotId: "s1", clip: "walk" },
          { shotId: "s2", clip: "gesture" }
        ]
      },
      {
        characterId: "sidekick",
        shots: [
          { shotId: "s0", clip: "idle" },
          { shotId: "s2", clip: "react" }
        ]
      }
    ],
    dialogue: {
      language: "en",
      lines: [
        { lineId: "l0", speakerId: "hero", startTime: 0.3, endTime: 3.1, text: "Hi." },
        { lineId: "l1", speakerId: "hero", startTime: 8.2, endTime: 11.4, text: "Listen!" }
      ]
    }
  };
}

describe("mapDocument timeline tracks (Phase C2)", () => {
  it("derives dialogue beats from real speech windows (line start/end)", () => {
    const ui = mapDocument(scene());
    expect(ui.beats).toHaveLength(2);
    const l0 = ui.beats.find((b) => b.id === "l0")!;
    expect(l0.start).toBe(0.3);
    expect(l0.dur).toBeCloseTo(2.8, 5);
  });

  it("derives gesture windows ONLY from gesture/reaction blocking clips", () => {
    const ui = mapDocument(scene());
    // talk / walk / idle are NOT gestures → only hero's `gesture` and sidekick's `react`.
    expect(ui.gestures).toHaveLength(2);
    const labels = ui.gestures.map((g) => g.text).sort();
    expect(labels).toEqual(["Hero · Gesture", "Sidekick · React"]);
  });

  it("a gesture window spans the real shot window it plays over", () => {
    const ui = mapDocument(scene());
    const heroGesture = ui.gestures.find((g) => g.text === "Hero · Gesture")!;
    // s2 is [8,12] → start 8, duration 4.
    expect(heroGesture.start).toBe(8);
    expect(heroGesture.dur).toBe(4);
  });

  it("has no gesture windows when no character ever gestures", () => {
    const doc = scene();
    const flat: RuntimeDocument = {
      ...doc,
      blocking: [{ characterId: "hero", shots: [{ shotId: "s0", clip: "talk" }, { shotId: "s2", clip: "idle" }] }]
    };
    expect(mapDocument(flat).gestures).toHaveLength(0);
  });
});

/**
 * Phase F1 — the per-beat DIRECTOR PLAN surfaced to the UI. Each dialogue beat must carry the
 * director's inspectable acting intents (speaker action, listener + listener reaction, camera
 * framing), pulled from the real `blocking` clips, so the Inspector's per-beat preview reads the
 * director's plan rather than just the line text. Never frozen: the listener always has a reaction.
 */
describe("mapDocument per-beat director plan (F1)", () => {
  it("each beat carries the speaker action, listener + reaction, and camera from the real doc", () => {
    const ui = mapDocument(scene());
    const l1 = ui.beats.find((b) => b.id === "l1")!;
    // l1 is spoken by hero in shot s2 (close-up). Speaker action = hero's real s2 clip ("gesture").
    expect(l1.who).toBe("hero");
    expect(l1.speakingIntent).toBe("gesture");
    // The listener is the other cast member (sidekick), with sidekick's real s2 clip ("react").
    expect(l1.listener).toBe("sidekick");
    expect(l1.listenerIntent).toBe("react");
    // The camera framing is the shot's preset label.
    expect(l1.camera).toBe("Close-up");
  });

  it("the listener is never frozen — a non-idle reaction is shown even without a director clip", () => {
    // No blocking at all → intents are INFERRED from the line text (F1 rules), still non-idle.
    const doc = scene();
    const noBlocking: RuntimeDocument = { ...doc, blocking: [] };
    const ui = mapDocument(noBlocking);
    const l1 = ui.beats.find((b) => b.id === "l1")!; // "Listen!" → emphasis
    expect(l1.speakingIntent).toBe("gesture"); // emphasis → gesture
    expect(l1.listenerIntent).toBe("react"); // emphasis → listener reacts
    expect(l1.listenerIntent).not.toBe("idle");
  });
});
