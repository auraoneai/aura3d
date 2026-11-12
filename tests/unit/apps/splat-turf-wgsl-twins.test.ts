import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { allProgramSpecs } from "../../../apps/showcase-splat-turf/src/world.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

/** Every distinct program Splat Turf draws (sunset sky, hazed runner-kit toon variants, carnival glow, kit flat and shadow). */
const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] =
  allProgramSpecs().map(({ name, spec }) => [name, spec as AuraCustomMaterialSpec, false] as const);

describe("Splat Turf WGSL twins (A3/W6)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("draws the wet-ink splat ribbon with raised meniscus derivatives on both WebGL2 and WebGPU", () => {
    const paint = specs.find(([name]) => name === "wet-ink-ribbon")![1];
    expect(paint.glsl!.fragment).toContain("float splatField = rawAlpha");
    expect(paint.wgsl!.vertex).toContain("out.vLocal = a_position;");
    expect(paint.wgsl!.fragment).toContain("let splatField = rawAlpha");
  });
  it("leaves no program without a twin, so ?backend=webgpu passes the engine's custom-shader pre-check", () => {
    expect(specs.filter(([, spec]) => !spec.wgsl).map(([name]) => name)).toEqual([]);
    const nodes = specs.map(([name, spec]) => ({ kind: "primitive", name, material: { kind: "custom", custom: spec } }));
    expect(webgpuCustomShaderGap({ nodes })).toBeUndefined();
  });
});
