import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { allProgramSpecs } from "../../../apps/showcase-number-surge/src/world.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

/** Every distinct program Number Surge draws (runner-kit toon/flat/shadow/sky, canvas labels, synthwave sky, grid, mountains, towers, deck, strips, rocks, glyphs, halos, edge glow, motes). */
const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] =
  allProgramSpecs().map(({ name, spec }) => [name, spec as AuraCustomMaterialSpec, false] as const);

describe("Number Surge WGSL twins (A3/W6)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("leaves no program without a twin, so ?backend=webgpu passes the engine's custom-shader pre-check", () => {
    expect(specs.filter(([, spec]) => !spec.wgsl).map(([name]) => name)).toEqual([]);
    const nodes = specs.map(([name, spec]) => ({ kind: "primitive", name, material: { kind: "custom", custom: spec } }));
    expect(webgpuCustomShaderGap({ nodes })).toBeUndefined();
  });
});
