import { describe, expect, it } from "vitest";
import { turboAcceptanceExcursionInput } from "../../../apps/showcase-turbo-drift-circuit/src/acceptance-driver";

describe("Turbo acceptance excursion input", () => {
  it("steers toward the local outside normal on a straight", () => {
    const input = turboAcceptanceExcursionInput(
      { progress: 0.2, heading: 0, signedTrackOffset: 0 },
      () => ({ heading: 0 })
    );
    expect(input).toEqual({ throttle: 1, brake: 0, drift: true, steer: 1 });
  });

  it("recomputes steering from the current tangent around a closed circuit", () => {
    const first = turboAcceptanceExcursionInput(
      { progress: 0.1, heading: Math.PI / 2, signedTrackOffset: 0.2 },
      () => ({ heading: Math.PI / 2 })
    );
    const second = turboAcceptanceExcursionInput(
      { progress: 0.6, heading: -Math.PI / 2, signedTrackOffset: 0.2 },
      () => ({ heading: -Math.PI / 2 })
    );
    expect(first.steer).toBe(1);
    expect(second.steer).toBe(1);
  });

  it("continues outward on the already selected negative side", () => {
    const input = turboAcceptanceExcursionInput(
      { progress: 0.5, heading: 0, signedTrackOffset: -0.2 },
      () => ({ heading: 0 })
    );
    expect(input.steer).toBe(-1);
  });

  it("wraps heading error at the +/-pi seam", () => {
    const input = turboAcceptanceExcursionInput(
      { progress: 0.3, heading: -3, signedTrackOffset: 0.2 },
      () => ({ heading: 2 })
    );
    expect(input.steer).toBeGreaterThan(0);
  });
});
