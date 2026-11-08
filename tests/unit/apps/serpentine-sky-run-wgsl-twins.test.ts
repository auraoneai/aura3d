import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { allProgramSpecs } from "../../../examples/saiyan-snake-way-port/materials.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

const INSTANCED = new Set(["flag-instanced", "island-instanced", "glow-instanced"]);
/** Every distinct program Serpentine Sky Run (examples/saiyan-snake-way-port) draws. */
const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] =
  allProgramSpecs().map(({ name, spec }) => [name, spec as AuraCustomMaterialSpec, INSTANCED.has(name)] as const);

describe("Serpentine Sky Run WGSL twins (A3/W6: road, solids, glows, flags, islands, aura, sky, streaks, contact shadow)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("leaves no program without a twin, so ?backend=webgpu passes the engine's custom-shader pre-check", () => {
    expect(specs.filter(([, spec]) => !spec.wgsl).map(([name]) => name)).toEqual([]);
    const nodes = specs.map(([name, spec]) => ({ kind: "primitive", name, material: { kind: "custom", custom: spec } }));
    expect(webgpuCustomShaderGap({ nodes })).toBeUndefined();
  });
  it("shadow-receiving programs sample the engine sun shadow map in their twin", () => {
    for (const name of ["road", "solid"]) {
      const spec = specs.find(([n]) => n === name)![1];
      expect(spec.receiveShadow).toBe(true);
      expect(spec.wgsl!.fragment).toMatch(/gToonShadow = a3dSunShadowAuto\(vWorld, N\)/);
      expect(spec.wgsl!.fragment).toMatch(/u_shadowMapTextureTexture/);
    }
  });
});
