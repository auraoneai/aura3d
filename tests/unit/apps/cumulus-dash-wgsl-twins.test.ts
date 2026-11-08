import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { allProgramSpecs, skySpec, valleySpec } from "../../../examples/kid-goku-beyond-the-clouds-port/materials.js";
import { lookRow } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] = [
  ["sky-storm", skySpec(lookRow("storm-washed")) as AuraCustomMaterialSpec, false],
  ["sky-original", skySpec(lookRow("original")) as AuraCustomMaterialSpec, false],
  ["valley", valleySpec() as AuraCustomMaterialSpec, false]
];

describe("Cumulus Dash WGSL twins (A3/W6: sky dome and cloud-shadowed valley)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("lists the programs still without a twin (they keep ?backend=webgpu on the WebGL2 fallback)", () => {
    const missing = allProgramSpecs().filter(({ spec }) => !spec.wgsl).map(({ name }) => name);
    expect(missing).toEqual(["puddle", "water", "waterfall", "ball", "scenery", "scenery-original", "warn", "shadow", "glow", "puff"]);
  });
});
