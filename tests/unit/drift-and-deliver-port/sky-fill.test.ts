import { describe, expect, it } from "vitest";
import { SKY_FILL, skyFillIntensity } from "../../../examples/drift-and-deliver-port/look";

// LIGHT-05 retune (audit lane G18, wave 2): the engine now adds the authored hemisphere next to the HDRI, so the
// HDRI frame takes a small fill and the lights-only (`env=0`, heal rung no-env) path keeps the original 1.7.
describe("gridlock courier sky fill", () => {
  it("keeps the fill small next to the HDRI and 1.7 on the lights-only path", () => {
    expect(skyFillIntensity(true)).toBe(SKY_FILL.withEnv);
    expect(SKY_FILL.withEnv).toBeLessThan(0.5);
    expect(skyFillIntensity(false)).toBe(1.7);
  });

  it("honours a valid skyfill= override and ignores an invalid one", () => {
    expect(skyFillIntensity(true, 1.7)).toBe(1.7);
    expect(skyFillIntensity(false, 0)).toBe(0);
    expect(skyFillIntensity(true, Number.NaN)).toBe(SKY_FILL.withEnv);
    expect(skyFillIntensity(true, -1)).toBe(SKY_FILL.withEnv);
  });
});
