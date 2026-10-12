import { describe, expect, it } from "vitest";
import { vignetteColorRgb } from "../../../../packages/rendering/src/post/v2Stages";

/**
 * effects.vignette() blacked out the frame: the post bridge emits the colour as
 * { r, g, b } but the S10b/S12 uniform upload indexed it as an array, so
 * u_vignetteColor became NaN and mix(1, NaN, t) zeroed every pixel.
 */
describe("v2 vignette colour uniform", () => {
  it("accepts the post bridge { r, g, b } form", () => {
    expect(vignetteColorRgb({ r: 0.1, g: 0.2, b: 0.3 })).toEqual([0.1, 0.2, 0.3]);
  });
  it("accepts the array form", () => {
    expect(vignetteColorRgb([0.4, 0.5, 0.6])).toEqual([0.4, 0.5, 0.6]);
  });
  it("defaults to black and never yields NaN", () => {
    expect(vignetteColorRgb(undefined)).toEqual([0, 0, 0]);
    expect(vignetteColorRgb({ r: Number.NaN, g: "x", b: undefined })).toEqual([0, 0, 0]);
    expect(vignetteColorRgb([1])).toEqual([1, 0, 0]);
  });
});
