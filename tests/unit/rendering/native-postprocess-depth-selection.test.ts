import { describe, expect, it } from "vitest";
import { postprocessRequiresDepthTexture } from "../../../packages/rendering/src/renderer/PostprocessExecution";

describe("v2 postprocess depth selection", () => {
  it("requests depth when an enabled effect follows disabled effects", () => {
    expect(postprocessRequiresDepthTexture({ v2: true, pipeline: { ao: false, godRays: false, dof: {} } })).toBe(true);
    expect(postprocessRequiresDepthTexture({ v2: true, pipeline: { ao: false, godRays: false, dof: false, motionBlur: false, ssr: {} } })).toBe(true);
    expect(postprocessRequiresDepthTexture({ v2: true, pipeline: { ao: false, godRays: false, dof: false, motionBlur: false, ssr: false, taa: {} } })).toBe(true);
    expect(postprocessRequiresDepthTexture({ v2: true, pipeline: { ao: false, dof: false, antiAliasing: "taa" } })).toBe(true);
  });

  it("does not request a depth attachment for disabled effects alone", () => {
    expect(postprocessRequiresDepthTexture({ v2: true, pipeline: { ao: false, godRays: false, dof: false, motionBlur: false, ssr: false, taa: false } })).toBe(false);
    expect(postprocessRequiresDepthTexture({ v2: false, pipeline: { dof: {} } })).toBe(false);
  });
});
