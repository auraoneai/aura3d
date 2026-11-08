import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { texture } from "../../../packages/engine/src/index.js";
import { allProgramSpecs } from "../../../examples/ninja-runner-port/materials.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

const flame = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]), format: "rgba8", colorSpace: "srgb" });
/** Every distinct program Shadowstep Gauntlet (examples/ninja-runner-port) draws. */
const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] =
  allProgramSpecs(flame as never).map(({ name, spec }) => [name, spec as AuraCustomMaterialSpec, false] as const);

describe("Shadowstep Gauntlet WGSL twins (A3/W6: sky, river, falls, solids, orb, aura, sparks, flames, particles)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("leaves no program without a twin, so ?backend=webgpu passes the engine's custom-shader pre-check", () => {
    expect(specs.filter(([, spec]) => !spec.wgsl).map(([name]) => name)).toEqual([]);
    const nodes = specs.map(([name, spec]) => ({ kind: "primitive", name, material: { kind: "custom", custom: spec } }));
    expect(webgpuCustomShaderGap({ nodes })).toBeUndefined();
  });
  it("custom point attributes sit at the geometry's pool locations (names sorted: 3, 5, 6)", () => {
    const particles = specs.find(([name]) => name === "particles")![1];
    expect(particles.wgsl!.vertex).toMatch(/@location\(3\) aAlpha: f32, @location\(5\) aSize: f32, @location\(6\) tone: vec3<f32>/);
  });
});
