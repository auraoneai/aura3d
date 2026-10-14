/**
 * Gravity Post unit evidence — flyby beat gating.
 *
 * Pins the first-visit contract of requestFlyby: one beat per body per
 * campaign, sun excluded, reduced-motion records the visit without running
 * the beat, and skipFlyby ends an active beat early.
 */
import { describe, expect, it } from "vitest";
import { FLYBY_SECONDS, createFlybyState, flybyBody, requestFlyby, skipFlyby, updateFlyby } from "../../../apps/showcase-gravity-post/src/flyby";

describe("gravity post flyby beats", () => {
  it("runs exactly one first-visit beat per body and ignores repeats", () => {
    const state = createFlybyState();
    expect(requestFlyby(state, "verdance")).toBe(true);
    expect(state.active).toBe(true);
    expect(state.beatsRun).toBe(1);
    // Still active -> repeat requests are refused while the beat runs.
    expect(requestFlyby(state, "verdance")).toBe(false);
    expect(updateFlyby(state, FLYBY_SECONDS)).toBeNull(); // finish the beat
    expect(state.active).toBe(false);
    // Visited bodies never trigger a second campaign beat.
    expect(requestFlyby(state, "verdance")).toBe(false);
    expect(state.beatsRun).toBe(1);
  });

  it("excludes the sun and unknown bodies", () => {
    const state = createFlybyState();
    expect(requestFlyby(state, "sol")).toBe(false);
    expect(requestFlyby(state, "not-a-body")).toBe(false);
    expect(state.visited.size).toBe(0);
    expect(state.beatsRun).toBe(0);
  });

  it("records reduced-motion visits without ever activating a beat", () => {
    const state = createFlybyState();
    expect(requestFlyby(state, "gale", { reducedMotion: true })).toBe(false);
    expect(state.visited.has("gale")).toBe(true);
    expect(state.beatsSkippedReducedMotion).toBe(1);
    expect(state.active).toBe(false);
    expect(updateFlyby(state, 1 / 60)).toBeNull();
  });

  it("skipFlyby ends the beat immediately and reports null progress", () => {
    const state = createFlybyState();
    expect(requestFlyby(state, "aquaria")).toBe(true);
    expect(updateFlyby(state, 0.4)).toBeGreaterThan(0);
    skipFlyby(state);
    expect(updateFlyby(state, 0.1)).toBeNull();
    expect(state.active).toBe(false);
    expect(flybyBody("aquaria")?.name).toBe("Aquaria");
    expect(flybyBody(null)).toBeUndefined();
  });
});
