import { describe, it, expect } from "vitest";
import { resolveIntent } from "../../../packages/create-aura3d/templates/animation-studio/src/animation-performance";

/**
 * Treadmill / moonwalk regression: a shot whose authored clip is `walk` (or `run`) must NOT keep
 * cycling the legs in place once the character has reached its mark (moving=false). Locomotion is
 * VELOCITY-gated — it plays only while the root is actually translating; when stopped the character
 * falls through to the dialogue/idle performance state.
 */
describe("resolveIntent — locomotion is velocity-gated (treadmill fix)", () => {
  it("plays walk ONLY while moving", () => {
    expect(resolveIntent({ clip: "walk", moving: true, running: false, speaking: false, anyDialogue: true })).toBe("walk");
  });

  it("does NOT keep walking in place once stopped — a stopped speaker talks", () => {
    expect(resolveIntent({ clip: "walk", moving: false, running: false, speaking: true, anyDialogue: true })).toBe("talk");
  });

  it("does NOT keep walking in place once stopped — a stopped listener reacts", () => {
    expect(resolveIntent({ clip: "walk", moving: false, running: false, speaking: false, anyDialogue: true })).toBe("react");
  });

  it("does NOT keep walking in place once stopped — fully idle scene goes idle", () => {
    expect(resolveIntent({ clip: "walk", moving: false, running: false, speaking: false, anyDialogue: false })).toBe("idle");
  });

  it("a `run` clip also stops when not moving", () => {
    expect(resolveIntent({ clip: "run", moving: false, running: false, speaking: false, anyDialogue: false })).toBe("idle");
  });

  it("run plays while running", () => {
    expect(resolveIntent({ clip: "run", moving: true, running: true, speaking: false, anyDialogue: false })).toBe("run");
  });

  it("still honors a NON-locomotion performance clip when stopped (gesture/point/nod/react)", () => {
    expect(resolveIntent({ clip: "gesture", moving: false, running: false, speaking: false, anyDialogue: true })).toBe("gesture");
    expect(resolveIntent({ clip: "point", moving: false, running: false, speaking: false, anyDialogue: true })).toBe("point");
    expect(resolveIntent({ clip: "nod", moving: false, running: false, speaking: false, anyDialogue: true })).toBe("nod");
  });
});
