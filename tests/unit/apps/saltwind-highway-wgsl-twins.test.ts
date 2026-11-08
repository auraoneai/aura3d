import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { allProgramSpecs } from "../../../examples/roadster-hours-port/materials.js";
import { LOOKS, ORIGINAL_LOOKS } from "../../../examples/roadster-hours-port/look.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

/** Every distinct program Saltwind Highway (examples/roadster-hours-port) draws, on every look (GU47 rows and originals). */
const looks = [...Object.values(LOOKS), ...Object.values(ORIGINAL_LOOKS)];
const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] = looks.flatMap((look) =>
  allProgramSpecs(look).map(({ name, spec }) => [`${look.id}${look.row ? "" : "-original"}-${name}`, spec as AuraCustomMaterialSpec, false] as const));

describe("Saltwind Highway WGSL twins (A3/W6: road, sea, city, sky, terrain, solids, towers, ramps, town, beam, blob, plumes, spray)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("leaves no program without a twin, so ?backend=webgpu passes the engine's custom-shader pre-check", () => {
    expect(specs.filter(([, spec]) => !spec.wgsl).map(([name]) => name)).toEqual([]);
    const nodes = specs.map(([name, spec]) => ({ kind: "primitive", name, material: { kind: "custom", custom: spec } }));
    expect(webgpuCustomShaderGap({ nodes })).toBeUndefined();
  });
  it("lit twins that receive shadows read the a3d_shadow frame bindings the GLSL program declares", () => {
    const road = specs.find(([name]) => name.endsWith("-road"))![1];
    expect(road.receiveShadow).toBe(true);
    expect(road.wgsl!.fragment).toMatch(/aura\.u_shadowMapMatrix/);
    expect(road.wgsl!.fragment).toMatch(/u_shadowMapTextureTexture/);
    expect(road.wgsl!.fragment).toMatch(/u_roadDetailTexture/);
  });
});
