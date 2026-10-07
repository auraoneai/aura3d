import { beforeEach, describe, expect, it, vi } from "vitest";

import { guardPostprocessPlan, resetPostprocessGuardWarnings } from "../../../../packages/rendering/src/quality/PostprocessGuard";
import { registerPostPass } from "../../../../packages/rendering/src/contracts/post";
import { RenderDeviceError } from "../../../../packages/rendering/src/RenderDevice";

function pass(name: string): { readonly name: string } {
  return { name };
}

const gpu = { mode: "drop", gpuFusable: true, hasDepthTexture: false, cpuDeterministic: false } as const;
const cpu = { ...gpu, gpuFusable: false };
const depth = { ...gpu, hasDepthTexture: true };

describe("guardPostprocessPlan (PRD 11 §6.8)", () => {
  beforeEach(() => {
    resetPostprocessGuardWarnings();
    vi.restoreAllMocks();
  });

  it("keeps a fusable chain when the device presents natively", () => {
    const plan = [pass("bloom"), pass("tone-mapping"), pass("fxaa")];
    const result = guardPostprocessPlan(plan, gpu);
    expect(result.passes).toEqual(plan);
    expect(result.dropped).toEqual([]);
  });

  it("drops every pass when gpuFusable is false (no presentLdrPostprocess)", () => {
    const plan = [pass("tone-mapping"), pass("fxaa")];
    const result = guardPostprocessPlan(plan, cpu);
    expect(result.passes).toEqual([]);
    expect(result.dropped).toEqual(["tone-mapping", "fxaa"]);
  });

  it("drops non-fusable CPU kernels (volumetric-light, film-grain, chromatic-aberration, contact-shadow)", () => {
    const plan = [pass("tone-mapping"), pass("volumetric-light"), pass("film-grain"), pass("chromatic-aberration"), pass("contact-shadow")];
    const result = guardPostprocessPlan(plan, gpu);
    expect(result.passes.map((p) => p.name)).toEqual(["tone-mapping"]);
    expect(result.dropped).toEqual(["volumetric-light", "film-grain", "chromatic-aberration", "contact-shadow"]);
  });

  it("keeps depth-sampling passes only with a sampleable depth attachment", () => {
    const plan = [pass("tone-mapping"), pass("ssao"), pass("depth-of-field")];
    expect(guardPostprocessPlan(plan, depth).passes).toHaveLength(3);
    const without = guardPostprocessPlan(plan, gpu);
    expect(without.passes.map((p) => p.name)).toEqual(["tone-mapping"]);
    expect(without.dropped).toEqual(["ssao", "depth-of-field"]);
  });

  it("passes the plan through unchanged under cpu-deterministic", () => {
    const plan = [pass("film-grain"), pass("volumetric-light"), pass("tone-mapping")];
    const result = guardPostprocessPlan(plan, { mode: "drop", gpuFusable: false, hasDepthTexture: false, cpuDeterministic: true });
    expect(result.passes).toEqual(plan);
    expect(result.dropped).toEqual([]);
  });

  it("throws POSTPROCESS_PASS_CPU_ONLY in strict mode", () => {
    const plan = [pass("tone-mapping"), pass("film-grain")];
    expect(() => guardPostprocessPlan(plan, { ...gpu, mode: "throw" })).toThrowError(RenderDeviceError);
    expect(() => guardPostprocessPlan(plan, { ...gpu, mode: "throw" })).toThrowError(/no GPU implementation|POSTPROCESS_PASS_CPU_ONLY/);
  });

  it("warns POSTPROCESS_PASS_DROPPED once per pass name in drop mode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plan = [pass("film-grain"), pass("film-grain")];
    guardPostprocessPlan(plan, gpu);
    guardPostprocessPlan(plan, gpu);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("POSTPROCESS_PASS_DROPPED:film-grain");
  });

  it("keeps C-13 gpuOnly registered passes regardless of fusion rules", () => {
    const dispose = registerPostPass({
      id: "prd11.test-glow",
      insertAt: "after-tonemap",
      space: "display",
      inputs: ["color"],
      gpuOnly: true,
      fragment: { glsl: "void main() {}" }
    });
    try {
      const plan = [pass("prd11.test-glow")];
      const result = guardPostprocessPlan(plan, cpu);
      expect(result.passes).toEqual(plan);
    } finally {
      dispose();
    }
  });
});
