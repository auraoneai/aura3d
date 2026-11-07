import { describe, it, expect } from "vitest";
import { modelUrls, modelProgressFraction, modelLabel, MODEL_PROGRESS_CEIL, MODEL_PROGRESS_FLOOR } from "../src/game/loadingUx";

describe("loading progress helpers", () => {
  it("lists the distinct GLB urls of the manifest", () => {
    const urls = modelUrls({ a: { url: "x/a.1.glb" }, b: { url: "x/a.1.glb" }, c: { url: "x/c.2.glb?v=1" }, d: { url: "x/s.svg" }, e: null });
    expect(urls).toEqual(["x/a.1.glb", "x/c.2.glb?v=1"]);
  });
  it("is monotone and stays inside the model range", () => {
    let prev = -1;
    for (let d = 0; d <= 26; d++) {
      const f = modelProgressFraction(d, 26);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(modelProgressFraction(0, 26)).toBe(MODEL_PROGRESS_FLOOR);
    expect(modelProgressFraction(26, 26)).toBeCloseTo(MODEL_PROGRESS_CEIL);
    expect(modelProgressFraction(5, 0)).toBe(MODEL_PROGRESS_FLOOR);
  });
  it("labels the count", () => {
    expect(modelLabel(3, 26)).toBe("Loading Cross Hop (3/26 models)");
  });
});
