import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { allProgramSpecs } from "../../../examples/strange-orbit-port/materials.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

const specs = allProgramSpecs().map(({ name, spec }) => [name, spec as AuraCustomMaterialSpec, false] as const);

describe("Craterline GP (strange-orbit-port) WGSL twins", () => {
  it("every program the scene draws carries a WGSL twin", () => {
    expect(allProgramSpecs().filter(({ spec }) => !spec.wgsl).map(({ name }) => name)).toEqual([]);
  });
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("the point twins opt in to one-pixel WebGPU points", () => {
    for (const [name, spec] of specs) if (name.startsWith("points")) expect(spec.wgsl?.vertex).toMatch(/@aura3d-point-list\b/);
  });
});
