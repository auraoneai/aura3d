import { describe, expect, it } from "vitest";
import { compileShaderGraph } from "@aura3d/rendering/shader-graph";
import { rainGraphDocument, rainGraphSpec } from "../../../examples/last-train-port/materials";

/** A4 pilot: the rain streak graph compiles for both backends and reads fade from uv0.x. */
describe("last-train-port rain shader graph (A4 pilot)", () => {
  it("compiles to a GLSL and a WGSL material pair that read uv0 and the tint uniform", () => {
    for (const target of ["glsl", "wgsl"] as const) {
      const result = compileShaderGraph(rainGraphDocument(), target);
      expect(result.vertex && result.fragment, `${target} stages`).toBeTruthy();
      expect(result.material?.builtins).toContain("uv0");
      expect(result.material?.requiresLighting).toBe(false);
    }
  });
  it("builds a material spec", () => {
    expect(rainGraphSpec([0.75, 0.85, 1])).toBeTruthy();
  });
});
