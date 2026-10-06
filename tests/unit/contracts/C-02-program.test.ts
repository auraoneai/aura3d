import { describe, expect, it } from "vitest";
import { computeProgramKey, registerShaderChunk, shaderChunk } from "@aura3d/rendering/contracts";

describe("C-02 program", () => {
  it("key is deterministic for equal features", () => {
    const features = { chunks: ["x", "y"], features: ["f"] } as never;
    expect(computeProgramKey(features)).toBe(computeProgramKey(features));
  });
  it("feature bits enter the key", () => {
    const a = computeProgramKey({ chunks: ["x"], features: [] } as never);
    const b = computeProgramKey({ chunks: ["x"], features: ["f"] } as never);
    expect(a).not.toBe(b);
  });
  it("duplicate chunk name is rejected", () => {
    registerShaderChunk({ name: "a3d_test_dup", owner: "prd15", glsl: "", stage: "both" });
    expect(() => registerShaderChunk({ name: "a3d_test_dup", owner: "prd15", glsl: "", stage: "both" })).toThrow(/SHADER_CHUNK_DUPLICATE/);
    expect(shaderChunk("a3d_test_dup")).toBeTruthy();
  });
});
