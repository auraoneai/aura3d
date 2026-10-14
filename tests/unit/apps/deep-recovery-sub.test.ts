import { describe, expect, it } from "vitest";
import { initialSubmarineState, updateSubmarine } from "../../../apps/showcase-deep-recovery/src/sub";

const forward = { throttle: 1, heave: 0, turn: 0, pitch: 0, sprint: false } as const;

describe("Deep Recovery — authored submarine motion", () => {
  it("integrates thrust and water drag deterministically", () => {
    let state = initialSubmarineState();
    for (let frame = 0; frame < 120; frame += 1) state = updateSubmarine(state, forward, 0, 1 / 60);
    expect(state.z).toBeGreaterThan(3);
    expect(state.speed).toBeGreaterThan(0);
    expect(state.speed).toBeLessThanOrEqual(12);
  });

  it("reduces acceleration and speed cap according to tow drag", () => {
    let free = initialSubmarineState();
    let heavyTow = initialSubmarineState();
    for (let frame = 0; frame < 120; frame += 1) {
      free = updateSubmarine(free, forward, 0, 1 / 60);
      heavyTow = updateSubmarine(heavyTow, forward, 0.42, 1 / 60);
    }
    expect(heavyTow.speed).toBeLessThan(free.speed);
    expect(heavyTow.z).toBeLessThan(free.z);
  });

  it("reports a high-speed world-bound impact for breach ownership", () => {
    let state = { ...initialSubmarineState(), z: 54.9, vz: 8 };
    state = updateSubmarine(state, forward, 0, 1 / 60);
    expect(state.z).toBe(55);
    expect(state.impactSpeedLastFrame).toBeGreaterThan(3.5);
  });
});
