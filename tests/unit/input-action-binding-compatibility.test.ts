import { describe, expect, it } from "vitest";
import {
  processInputValue,
  type InputValueProcessor
} from "../../packages/input/src/index";
import { createInputActionBindingDiagnostic } from "../fixtures/input-action-binding";

describe("input value processors", () => {
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

  it("keeps diagnostic composition outside the public runtime package", () => {
    const sample = createInputActionBindingDiagnostic();
    expect(sample.processedAxis).toBe(0.756);
    expect(sample.deadzoneFilteredAxis).toBe(0);
    expect(sample.compositeMagnitude).toBe(1.4142);
    expect(sample.modifierChordPressed).toBe(true);
    expect(sample.scope).toBe("test-only-diagnostic");
  });
});
