import { describe, expect, it } from "vitest";
import {
  initialOxygenState,
  computeOxygenDrainRate,
  updateOxygen,
  applyCollisionImpact,
  patchBreach,
  refuelAtSurface,
  MAX_OXYGEN,
  MAX_HULL,
  OXYGEN_WARN_THRESHOLD
} from "../../../apps/showcase-deep-recovery/src/oxygen";
import { getDepthZone } from "../../../apps/showcase-deep-recovery/src/reef";

describe("Deep Recovery — Oxygen & Hull Mechanics", () => {
  it("initializes with full oxygen and full hull", () => {
    const state = initialOxygenState();
    expect(state.oxygen).toBe(MAX_OXYGEN);
    expect(state.hull).toBe(MAX_HULL);
    expect(state.breached).toBe(false);
    expect(state.blackout).toBe(false);
    expect(state.warningActive).toBe(false);
  });

  it("calculates depth-scaled oxygen drain rates", () => {
    // Zone 1: Shallow (0 to -15m)
    const z1 = getDepthZone(-5);
    expect(z1.id).toBe(1);
    const rate1 = computeOxygenDrainRate(-5, false, 0, false);
    expect(rate1).toBe(0.8);

    // Zone 2: Mid Wreck (-15m to -35m)
    const z2 = getDepthZone(-25);
    expect(z2.id).toBe(2);
    const rate2 = computeOxygenDrainRate(-25, false, 0, false);
    expect(rate2).toBe(1.2);

    // Zone 3: Abyssal (-35m to -60m)
    const z3 = getDepthZone(-45);
    expect(z3.id).toBe(3);
    const rate3 = computeOxygenDrainRate(-45, false, 0, false);
    expect(rate3).toBe(1.8);
  });

  it("applies sprint, towing, and breach penalties", () => {
    const baseRate = computeOxygenDrainRate(-10, false, 0, false); // 0.8
    const sprintRate = computeOxygenDrainRate(-10, true, 0, false); // 0.8 * 1.5 = 1.2
    expect(sprintRate).toBeCloseTo(1.2);

    const towRate = computeOxygenDrainRate(-10, false, 2, false); // 0.8 + 2 * 0.3 = 1.4
    expect(towRate).toBeCloseTo(1.4);

    const breachRate = computeOxygenDrainRate(-10, false, 0, true); // 0.8 + 1.6 = 2.4
    expect(breachRate).toBeCloseTo(2.4);
  });

  it("triggers warning threshold and blackout state on depletion", () => {
    let state = initialOxygenState();
    // Drain to 20%
    state = updateOxygen(state, -10, false, 0, 100); // drains 80 units -> 20%
    expect(state.oxygen).toBeLessThanOrEqual(OXYGEN_WARN_THRESHOLD);
    expect(state.warningActive).toBe(true);
    expect(state.blackout).toBe(false);

    // Drain past 0%
    state = updateOxygen(state, -10, false, 0, 30);
    expect(state.oxygen).toBe(0);
    expect(state.blackout).toBe(true);
  });

  it("applies collision damage and breaches hull on high-speed impact", () => {
    const state = initialOxygenState();
    // Low speed bump -> no damage
    const lowImpact = applyCollisionImpact(state, 2.0);
    expect(lowImpact.nextState.hull).toBe(100);
    expect(lowImpact.nextState.breached).toBe(false);

    // High speed slam -> hull damage & breach
    const highImpact = applyCollisionImpact(state, 7.5);
    expect(highImpact.nextState.hull).toBeLessThan(70);
    expect(highImpact.nextState.breached).toBe(true);
    expect(highImpact.breachedJustNow).toBe(true);
  });

  it("refuels and patches breaches at surface buoy", () => {
    let state = initialOxygenState();
    state = updateOxygen(state, -50, false, 0, 40); // oxygen drained
    state = { ...state, breached: true, hull: 50 };

    state = refuelAtSurface(state);
    expect(state.oxygen).toBe(MAX_OXYGEN);
    expect(state.warningActive).toBe(false);

    state = patchBreach(state);
    expect(state.breached).toBe(false);
    expect(state.hull).toBe(70);
  });
});
