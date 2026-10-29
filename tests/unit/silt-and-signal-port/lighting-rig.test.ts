import { describe, expect, it } from "vitest";
import { rigOf } from "../../../examples/silt-and-signal-port/world";
import { CHAPTERS } from "../../../examples/silt-and-signal-port/chapters-data";

describe("Duneglide lighting rig", () => {
  it("chapter 0 uses the original measured rig (key 2.2, hemisphere 1.05)", () => {
    const rig = rigOf(0);
    expect(rig.night).toBe(false);
    expect(rig.sunIntensity).toBe(2.2);
    expect(rig.hemiIntensity).toBe(1.05);
  });

  it("no chapter's hemisphere exceeds the original 1.05 now that it adds to environments.neutral", () => {
    for (let c = 0; c < CHAPTERS.length; c += 1) {
      const rig = rigOf(c);
      expect(rig.hemiIntensity).toBeLessThanOrEqual(1.05);
      expect(rig.hemiIntensity).toBe(rig.night ? 0.85 : 1.05);
    }
  });
});
