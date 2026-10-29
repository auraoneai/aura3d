import { describe, expect, it } from "vitest";
import { LIGHTS_ONLY_NEUTRAL, SKY_FILL, neutralFillIntensity, skyFillIntensity } from "../../../examples/drift-and-deliver-port/look";

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

// LIGHT-01 game part: the lights-only rung gets the neutral-room fill 4.3.7 added implicitly.
describe("gridlock courier lights-only neutral fill", () => {
  it("adds the room probe only without the HDRI, at the 4.3.7 strength, and honours neutral=", () => {
    expect(neutralFillIntensity(true)).toBe(0);
    expect(neutralFillIntensity(true, 2)).toBe(0);
    expect(neutralFillIntensity(false)).toBe(LIGHTS_ONLY_NEUTRAL);
    expect(LIGHTS_ONLY_NEUTRAL).toBe(1);
    expect(neutralFillIntensity(false, 0)).toBe(0);
    expect(neutralFillIntensity(false, -3)).toBe(1);
  });
});
