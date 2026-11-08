import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { allProgramSpecs } from "../../../apps/showcase-shape-shift-sprint/src/world.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

/** Every distinct program Shape Shift Sprint draws (scenery toy toon/sky/contact/drift, ring, kit flat and shadow). */
const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] =
  allProgramSpecs().map(({ name, spec }) => [name, spec as AuraCustomMaterialSpec, false] as const);

describe("Shape Shift Sprint WGSL twins (A3/W6)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("leaves no program without a twin, so ?backend=webgpu passes the engine's custom-shader pre-check", () => {
    expect(specs.filter(([, spec]) => !spec.wgsl).map(([name]) => name)).toEqual([]);
    const nodes = specs.map(([name, spec]) => ({ kind: "primitive", name, material: { kind: "custom", custom: spec } }));
    expect(webgpuCustomShaderGap({ nodes })).toBeUndefined();
  });
  it("the drift layer reads anchor, drift and tone at the geometry's pool locations 3, 5, 6", () => {
    const drift = specs.find(([name]) => name === "drift")![1];
    expect(drift.wgsl!.vertex).toMatch(/@location\(3\) anchor: vec4<f32>, @location\(5\) drift: vec4<f32>, @location\(6\) tone: vec3<f32>/);
  });
});
