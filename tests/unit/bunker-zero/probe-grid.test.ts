import { describe, expect, it } from "vitest";
import { planFloorProbes, probesRequested, PROBE_MAX_AXIS } from "../../../apps/showcase-bunker-zero/src/art/probeGrid";

describe("bunker-zero A5 lab: probe grid", () => {
  it("is off unless ?lighting=probes is present", () => {
    expect(probesRequested("")).toBe(false);
    expect(probesRequested("?lighting=ibl")).toBe(false);
    expect(probesRequested("?floor=1")).toBe(false);
    expect(probesRequested("?lighting=probes")).toBe(true);
  });

  it("plans a deterministic, bounded, non-negative grid for every floor slot", () => {
    for (let slot = 0; slot <= 6; slot++) {
      const a = planFloorProbes(slot), b = planFloorProbes(slot);
      expect(a).toEqual(b);
      expect(a.dimensions.every((n) => n >= 2 && n <= PROBE_MAX_AXIS)).toBe(true);
      expect(a.irradiance.length).toBe(a.dimensions[0] * a.dimensions[1] * a.dimensions[2]);
      for (const rgb of a.irradiance) expect(rgb.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
      expect(a.irradiance.some((rgb) => rgb[0] + rgb[1] + rgb[2] > 0)).toBe(true);
    }
  });
});
