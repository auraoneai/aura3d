/**
 * T-1..T-5 TimeController behaviour (PRD-08 §6.2).
 */
import { describe, expect, it } from "vitest";
import { createTimeController } from "@aura3d/engine/lanes";
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";

function fakeHandle(id: string): AuraRuntimeNodeHandle & { timeScale?: number } {
  return { id } as unknown as AuraRuntimeNodeHandle & { timeScale?: number };
}

describe("T-1 scale + T-5 clamp", () => {
  it("scale clamps into [0, 4]", () => {
    const t = createTimeController();
    t.scale = 7;
    expect(t.scale).toBe(4);
    t.scale = -2;
    expect(t.scale).toBe(0);
    t.scale = Number.NaN;
    expect(t.scale).toBe(1);
  });

  it("advance returns scaled dt and accumulates sim/real time", () => {
    const t = createTimeController();
    t.scale = 0.5;
    expect(t.advance(0.016)).toBeCloseTo(0.008, 6);
    expect(t.simTime).toBeCloseTo(0.008, 6);
    expect(t.realTime).toBeCloseTo(0.016, 6);
  });
});

describe("T-3 scaleTo halflife ramp", () => {
  it("halves the remaining gap every halflife seconds", () => {
    const t = createTimeController();
    t.scaleTo(0, 0.1);
    t.advance(0.1);
    expect(t.scale).toBeCloseTo(0.5, 3);
    t.advance(0.1);
    expect(t.scale).toBeCloseTo(0.25, 3);
  });
});

describe("T-4 hit-stop", () => {
  it("global hit-stop freezes sim time while real time advances", () => {
    const t = createTimeController();
    t.hitStop(0.05);
    expect(t.advance(0.02)).toBe(0);
    expect(t.simTime).toBe(0);
    expect(t.realTime).toBeCloseTo(0.02, 6);
    expect(t.hitStopRemaining).toBeCloseTo(0.03, 6);
    t.advance(0.05);
    expect(t.advance(0.01)).toBeCloseTo(0.01, 6);
  });

  it("timeScale reads 0 during a global stop (the loop's bound source)", () => {
    const t = createTimeController();
    t.hitStop(0.05);
    expect(t.timeScale).toBe(0);
    t.advance(0.06);
    expect(t.timeScale).toBe(1);
  });

  it("scoped hit-stop zeroes and restores handle.timeScale", () => {
    const handle = fakeHandle("hero");
    handle.timeScale = 0.8;
    const t = createTimeController({ resolveHandle: (id) => (id === "hero" ? handle : undefined) });
    t.hitStop(0.05, { scope: ["hero"] });
    expect(handle.timeScale).toBe(0);
    expect(t.scopedHitStopCount).toBe(1);
    expect(t.advance(0.016)).toBeCloseTo(0.016, 6);
    t.advance(0.04);
    expect(handle.timeScale).toBe(0.8);
    expect(t.scopedHitStopCount).toBe(0);
  });

  it("overlapping scoped stops keep the pre-freeze scale", () => {
    const handle = fakeHandle("a");
    const t = createTimeController({ resolveHandle: () => handle });
    t.hitStop(0.1, { scope: ["a"] });
    t.hitStop(0.03, { scope: ["a"] });
    t.advance(0.05);
    expect(handle.timeScale).toBe(0);
    t.advance(0.06);
    expect(handle.timeScale).toBe(1);
  });
});

describe("T-4 slow-mo", () => {
  it("scales for the duration then eases back to 1", () => {
    const t = createTimeController();
    t.slowMo(0.25, 0.02, { easeOut: 0 });
    expect(t.advance(0.01)).toBeCloseTo(0.0025, 6);
    t.advance(0.02);
    expect(t.scale).toBe(1);
  });

  it("easeOut returns through a ramp, not a snap", () => {
    const t = createTimeController();
    t.slowMo(0.2, 0.01, { easeOut: 0.1 });
    t.advance(0.02); // expiry fires; ease-out ramp is armed for the next advance
    t.advance(0.05);
    expect(t.scale).toBeGreaterThan(0.2);
    expect(t.scale).toBeLessThan(1);
    t.advance(0.8); // halflife ramps converge asymptotically
    expect(t.scale).toBeGreaterThan(0.95);
  });
});
