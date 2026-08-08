import { describe, expect, it } from "vitest";
import {
  processInputValue,
  sampleInputActionBindingFixture,
  type InputValueProcessor
} from "../../packages/input/src/index";

describe("published v1 input-action compatibility", () => {
  it("keeps the processor export deterministic", () => {
    const processors: readonly InputValueProcessor[] = [
      { type: "deadzone", threshold: 0.2 },
      { type: "scale", factor: 1.8 },
      { type: "clamp", min: -1, max: 1 }
    ];
    expect(processInputValue(0.08, processors)).toBe(0);
    expect(processInputValue(0.42, processors)).toBe(0.756);
    expect(processInputValue(-0.5, [{ type: "invert" }, { type: "exponential", exponent: 2 }])).toBe(0.25);
  });

  it("retains the diagnostic sample without promoting it to runtime parity", () => {
    const sample = sampleInputActionBindingFixture();
    expect(sample.processedAxis).toBe(0.756);
    expect(sample.deadzoneFilteredAxis).toBe(0);
    expect(sample.modifierChordPressed).toBe(true);
    expect(sample.claimBoundary).toMatch(/bounded deterministic/i);
    expect(sample.claimBoundary).toMatch(/does not claim/i);
  });
});
