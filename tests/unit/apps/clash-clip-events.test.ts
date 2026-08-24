import { describe, expect, it } from "vitest";
import {
  auraClashAttackPresentationEvents,
  type AuraClashClipPresentationEvent
} from "../../../apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps";
import {
  auraClashActionFrameData,
  auraClashMoveTable
} from "../../../apps/aura-clash-showcase/src/playable/combat/auraClashMoveData";
import {
  createAuraClashClipEventBridge,
  type AuraClashPresentationEventInvocation
} from "../../../apps/aura-clash-showcase/src/playable/combat/clipEventBridge";

type MoveId = keyof typeof auraClashMoveTable;
const MOVES: MoveId[] = ["light", "heavy", "special"];

/** Collect everything a bridge fires into a plain array (listener under test). */
function record(bridge: ReturnType<typeof createAuraClashClipEventBridge>): AuraClashPresentationEventInvocation[] {
  const seen: AuraClashPresentationEventInvocation[] = [];
  bridge.onEvent((event) => seen.push(event));
  return seen;
}

describe("AC-A1 authored presentation metadata", () => {
  it("derives every cue time from frame data inside the move window", () => {
    for (const id of MOVES) {
      const frames = auraClashActionFrameData[id];
      const events = auraClashAttackPresentationEvents[id];
      // Three lanes per attack: sfx, vfx, camera.impulse.
      expect(events.map((event) => event.name).sort()).toEqual(["camera.impulse", "sfx", "vfx"]);
      for (const event of events) {
        expect(event.time).toBeGreaterThanOrEqual(0);
        expect(event.time).toBeLessThanOrEqual(frames.duration);
      }
      // The vfx/camera lanes land exactly on the active window's opening frame.
      const vfx = events.find((event) => event.name === "vfx")!;
      const impulse = events.find((event) => event.name === "camera.impulse")!;
      expect(vfx.time).toBeCloseTo(frames.activeStart, 6);
      expect(impulse.time).toBeCloseTo(frames.activeStart, 6);
    }
  });

  it("scales camera impulse strength with move weight without touching move data", () => {
    const strength = (id: MoveId): number =>
      Number(auraClashAttackPresentationEvents[id].find((event) => event.name === "camera.impulse")!.payload.strength);
    expect(strength("light")).toBeLessThan(strength("heavy"));
    expect(strength("heavy")).toBeLessThan(strength("special"));
    expect(strength("special")).toBeLessThanOrEqual(1);
    // Frame data itself stays the sole authority and unchanged.
    expect(auraClashMoveTable.light.damage).toBeGreaterThan(0);
  });
});

describe("AC-A1 clip-event bridge", () => {
  it("fires each metadata cue exactly once when an attack plays through", () => {
    for (const id of MOVES) {
      const bridge = createAuraClashClipEventBridge();
      const seen = record(bridge);
      const fired = bridge.advance("player", id, auraClashMoveTable[id].duration);
      expect(fired).toBe(3);
      expect(seen.map((event) => event.name).sort()).toEqual(["camera.impulse", "sfx", "vfx"]);
      // Re-advancing to the same clock must not re-fire anything (cursor discipline).
      expect(bridge.advance("player", id, auraClashMoveTable[id].duration)).toBe(0);
      expect(seen.length).toBe(3);
      // A fresh attack instance restarts the clocks.
      bridge.resetFighter("player");
      expect(bridge.advance("player", id, auraClashMoveTable[id].duration)).toBe(3);
      expect(seen.length).toBe(6);
    }
  });

  it("lands cues on exact metadata frames, not frame-count guesses", () => {
    const bridge = createAuraClashClipEventBridge();
    const seen = record(bridge);
    const metadata: readonly AuraClashClipPresentationEvent[] = auraClashAttackPresentationEvents.heavy;
    const swing = metadata.find((event) => event.name === "sfx")!;
    // Nothing fires up to (but excluding) the authored frame.
    const epsilon = 1e-6;
    expect(bridge.advance("player", "heavy", swing.time - epsilon)).toBe(0);
    expect(seen.length).toBe(0);
    // Crossing the frame fires exactly that cue, stamped with its authored time.
    expect(bridge.advance("player", "heavy", swing.time + epsilon)).toBe(1);
    expect(seen[0]!.name).toBe("sfx");
    expect(seen[0]!.time).toBe(swing.time);
    expect(seen[0]!.payload.cue).toBe("swing");
    expect(seen[0]!.moveId).toBe("heavy");
    expect(seen[0]!.fighterId).toBe("player");
  });

  it("routes deliveries through onEvent and stops after unsubscribe", () => {
    const bridge = createAuraClashClipEventBridge();
    const seen: AuraClashPresentationEventInvocation[] = [];
    const unsubscribe = bridge.onEvent((event) => seen.push(event));
    bridge.advance("rival", "special", auraClashMoveTable.special.duration);
    const countWhileSubscribed = seen.length;
    expect(countWhileSubscribed).toBe(3);
    unsubscribe();
    bridge.resetFighter("rival");
    bridge.advance("rival", "special", auraClashMoveTable.special.duration);
    expect(seen.length).toBe(countWhileSubscribed);
  });

  it("keeps fighter cursors independent and never rewinds silently", () => {
    const bridge = createAuraClashClipEventBridge();
    const seen = record(bridge);
    // Rival's play-through stamps rival events and does not consume the player's clocks.
    expect(bridge.advance("rival", "light", auraClashMoveTable.light.duration)).toBe(3);
    expect(seen.every((event) => event.fighterId === "rival")).toBe(true);
    expect(seen.length).toBe(3);
    // Player's first play-through still fires fully — clocks are per fighter AND per move.
    expect(bridge.advance("player", "light", auraClashMoveTable.light.duration)).toBe(3);
    expect(seen.filter((event) => event.fighterId === "player").length).toBe(3);
    // Rewinding below an already-consumed cursor fires nothing.
    expect(bridge.advance("player", "light", 0.01)).toBe(0);
    expect(seen.length).toBe(6);
    bridge.reset();
    // After an explicit reset the same play-through fires fully again (new round).
    expect(bridge.advance("player", "light", auraClashMoveTable.light.duration)).toBe(3);
    expect(seen.length).toBe(9);
  });

  it("exposes only presentation surface — no combat window authority", () => {
    const bridge = createAuraClashClipEventBridge();
    expect(Object.keys(bridge).sort()).toEqual(["advance", "onEvent", "reset", "resetFighter"]);
  });
});
