import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { skySpec as duneSkySpec } from "../../../examples/silt-and-signal-port/world.js";
import { allProgramSpecs as lamplightPrograms } from "../../../examples/last-train-port/materials.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

const dune = [0, 1, 3, 6].flatMap((chapter) => [
  [`duneglide-sky-ch${chapter}`, duneSkySpec(chapter) as AuraCustomMaterialSpec, false] as const,
  [`duneglide-sky-ink-ch${chapter}`, duneSkySpec(chapter, "inked") as AuraCustomMaterialSpec, false] as const
]);
const lamplight = lamplightPrograms().map(({ name, spec }) => [`lamplight-${name}`, spec as AuraCustomMaterialSpec, false] as const);
const specs = [...dune, ...lamplight];

describe("Duneglide (silt-and-signal-port) sky and Lamplight Line (last-train-port) WGSL twins", () => {
  it("every Lamplight Line custom program carries a WGSL twin", () => {
    expect(lamplightPrograms().filter(({ spec }) => !spec.wgsl).map(({ name }) => name)).toEqual([]);
  });
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("the weather / mote points twin opts in to one-pixel WebGPU points", () => {
    expect(lamplightPrograms().find(({ name }) => name === "snow")!.spec.wgsl?.vertex).toMatch(/@aura3d-point-list\b/);
    expect(lamplightPrograms().find(({ name }) => name === "snow-quads")!.spec.wgsl?.vertex).not.toMatch(/@aura3d-point-list\b/);
  });
});
