import { describe, expect, it } from "vitest";
import {
  estimateSpeechDuration,
  type EpisodeDocument
} from "../../../packages/create-aura3d/templates/animation-studio/src/episode-document";
import {
  retimeDialogue,
  setDialogueLine
} from "../../../packages/create-aura3d/templates/animation-studio/src/studio/scene-tools";

/**
 * Phase C1: caption windows must come from the SPEECH DURATION of the text, not a fixed
 * window — short interjections don't linger, long lines get proportional time, and
 * multi-line / multi-speaker dialogue is sequenced back-to-back with no overlap.
 */

const SHORT = "Hi!";
const MEDIUM = "Hey, are you coming with us to the festival tonight?";
const LONG =
  "I have been thinking about this for a very long time, and I really believe " +
  "that if we work together, carefully and patiently, we can finish the whole thing.";

/** Minimal but shape-valid skeleton document (one shot covering t=0). */
function baseDoc(): EpisodeDocument {
  return {
    id: "test",
    duration: 60,
    assets: { characters: [], props: [] },
    set: {
      clearColor: [0, 0, 0, 1],
      studioLightingScale: 1,
      environment: {
        color: [0, 0, 0],
        intensity: 1,
        proceduralMap: {
          skyColor: [0, 0, 0],
          horizonColor: [0, 0, 0],
          groundColor: [0, 0, 0],
          specularColor: [0, 0, 0],
          intensity: 1,
          specularIntensity: 1
        }
      },
      pieces: [],
      lights: []
    },
    shots: [{ shotId: "s1", presetId: "two-shot" as never, startTime: 0, endTime: 60, cameraSubject: [0, 0, 0] }],
    blocking: [],
    setDressing: [],
    worldState: { glowSpanSeconds: 60 }
  };
}

describe("estimateSpeechDuration", () => {
  it("gives a short interjection a short duration (no lingering)", () => {
    const d = estimateSpeechDuration(SHORT);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1.5);
  });

  it("gives a long sentence proportionally more time than a short one", () => {
    expect(estimateSpeechDuration(LONG)).toBeGreaterThan(estimateSpeechDuration(MEDIUM));
    expect(estimateSpeechDuration(MEDIUM)).toBeGreaterThan(estimateSpeechDuration(SHORT));
  });

  it("is monotonic in word count", () => {
    let prev = estimateSpeechDuration("one");
    let words = "one";
    for (let i = 0; i < 30; i += 1) {
      words += " word";
      const next = estimateSpeechDuration(words);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });

  it("never returns below the short-interjection floor and respects a sane cap", () => {
    expect(estimateSpeechDuration("")).toBeGreaterThan(0);
    expect(estimateSpeechDuration("Oh.")).toBeGreaterThanOrEqual(0.9);
    const huge = Array.from({ length: 500 }, () => "word.").join(" ");
    expect(estimateSpeechDuration(huge)).toBeLessThanOrEqual(22);
  });

  it("adds pause time for punctuation", () => {
    expect(estimateSpeechDuration("Yes. No. Maybe.")).toBeGreaterThan(estimateSpeechDuration("Yes No Maybe"));
  });
});

describe("setDialogueLine auto-timing", () => {
  it("auto-computes endTime from speech duration when not provided", () => {
    const doc = setDialogueLine(baseDoc(), { lineId: "l1", speakerId: "a", text: MEDIUM, startTime: 2 });
    const line = doc.dialogue!.lines[0]!;
    expect(line.startTime).toBe(2);
    expect(line.endTime).toBeCloseTo(2 + estimateSpeechDuration(MEDIUM), 5);
  });

  it("treats endTime <= startTime (CLI unset sentinel of 0) as not provided", () => {
    const doc = setDialogueLine(baseDoc(), { lineId: "l1", speakerId: "a", text: SHORT, startTime: 0, endTime: 0 });
    const line = doc.dialogue!.lines[0]!;
    expect(line.endTime).toBeCloseTo(estimateSpeechDuration(SHORT), 5);
    expect(line.endTime).toBeGreaterThan(line.startTime);
  });

  it("honors an explicit endTime when given", () => {
    const doc = setDialogueLine(baseDoc(), { lineId: "l1", speakerId: "a", text: SHORT, startTime: 0, endTime: 9 });
    expect(doc.dialogue!.lines[0]!.endTime).toBe(9);
  });
});

describe("retimeDialogue", () => {
  it("sequences multi-line dialogue back-to-back with no overlap", () => {
    let doc = baseDoc();
    doc = setDialogueLine(doc, { lineId: "l1", speakerId: "a", text: SHORT, startTime: 0 });
    doc = setDialogueLine(doc, { lineId: "l2", speakerId: "b", text: MEDIUM, startTime: 5 });
    doc = setDialogueLine(doc, { lineId: "l3", speakerId: "a", text: LONG, startTime: 30 });
    doc = retimeDialogue(doc);
    const lines = doc.dialogue!.lines;

    expect(lines[0]!.startTime).toBe(0);
    for (let i = 0; i < lines.length; i += 1) {
      expect(lines[i]!.endTime).toBeGreaterThan(lines[i]!.startTime);
    }
    for (let i = 1; i < lines.length; i += 1) {
      // No overlap: each line begins only after the previous ends.
      expect(lines[i]!.startTime).toBeGreaterThanOrEqual(lines[i - 1]!.endTime);
    }
  });

  it("paces speaker turns sequentially with a small inter-line gap", () => {
    let doc = baseDoc();
    doc = setDialogueLine(doc, { lineId: "l1", speakerId: "alice", text: "Hello there." });
    doc = setDialogueLine(doc, { lineId: "l2", speakerId: "bob", text: "Hi Alice, good to see you." });
    doc = retimeDialogue(doc);
    const [a, b] = doc.dialogue!.lines;
    // Bob's turn starts after Alice finishes, with a small breath gap (~0.15s).
    expect(b!.startTime).toBeCloseTo(a!.endTime + 0.15, 5);
    expect(b!.speakerId).toBe("bob");
  });

  it("durations reflect text length after retiming (short < long)", () => {
    let doc = baseDoc();
    doc = setDialogueLine(doc, { lineId: "l1", speakerId: "a", text: SHORT });
    doc = setDialogueLine(doc, { lineId: "l2", speakerId: "a", text: LONG });
    doc = retimeDialogue(doc);
    const [s, l] = doc.dialogue!.lines;
    expect(l!.endTime - l!.startTime).toBeGreaterThan(s!.endTime - s!.startTime);
  });
});
