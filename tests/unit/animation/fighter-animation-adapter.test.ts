import { describe, expect, it } from "vitest";
import { fighterCrossfadeWeights, resolveFighterClip } from "../../../packages/animation/src";

describe("resolveFighterClip", () => {
  it("KO overrides everything", () => {
    expect(resolveFighterClip({ action: "run", grounded: true, knockedOut: true, attackClipKey: "heavy" })).toEqual({ clipKey: "ko", speed: 1 });
  });

  it("active attack overrides locomotion with modulated speed", () => {
    expect(resolveFighterClip({ action: "walk", grounded: true, attackClipKey: "light" })).toEqual({ clipKey: "light", speed: 1.45 });
    expect(resolveFighterClip({ action: "idle", grounded: true, attackClipKey: "heavy" })).toEqual({ clipKey: "heavy", speed: 1.06 });
    expect(resolveFighterClip({ action: "idle", grounded: true, attackClipKey: "special" })).toEqual({ clipKey: "special", speed: 0.94 });
  });

  it("airborne overrides locomotion", () => {
    expect(resolveFighterClip({ action: "run", grounded: false })).toEqual({ clipKey: "air", speed: 1 });
  });

  it("maps locomotion actions and modulates run speed", () => {
    expect(resolveFighterClip({ action: "idle", grounded: true })).toEqual({ clipKey: "idle", speed: 1 });
    expect(resolveFighterClip({ action: "walk", grounded: true })).toEqual({ clipKey: "walk", speed: 1 });
    expect(resolveFighterClip({ action: "run", grounded: true })).toEqual({ clipKey: "run", speed: 1.18 });
    expect(resolveFighterClip({ action: "guard", grounded: true })).toEqual({ clipKey: "guard", speed: 1 });
    expect(resolveFighterClip({ action: "down", grounded: true })).toEqual({ clipKey: "down", speed: 1 });
    expect(resolveFighterClip({ action: "hurt", grounded: true })).toEqual({ clipKey: "hurt", speed: 1 });
  });

  it("unknown actions fall back to idle", () => {
    expect(resolveFighterClip({ action: "taunt", grounded: true })).toEqual({ clipKey: "idle", speed: 1 });
  });

  it("respects a custom speed table", () => {
    expect(resolveFighterClip({ action: "run", grounded: true }, { run: 2 })).toEqual({ clipKey: "run", speed: 2 });
  });
});

describe("fighterCrossfadeWeights", () => {
  it("returns a full target weight when from === to", () => {
    expect(fighterCrossfadeWeights("walk", "walk", 0, 0.2)).toEqual({ from: "walk", to: "walk", weights: [0, 1], done: true });
  });

  it("blends linearly across the window with weights summing to 1", () => {
    const mid = fighterCrossfadeWeights("idle", "walk", 0.1, 0.2);
    expect(mid.weights[0]).toBeCloseTo(0.5, 6);
    expect(mid.weights[1]).toBeCloseTo(0.5, 6);
    expect(mid.weights[0] + mid.weights[1]).toBeCloseTo(1, 6);
    expect(mid.done).toBe(false);
  });

  it("clamps and completes at/after the window", () => {
    const done = fighterCrossfadeWeights("idle", "run", 0.5, 0.2);
    expect(done.weights).toEqual([0, 1]);
    expect(done.done).toBe(true);
  });
});
