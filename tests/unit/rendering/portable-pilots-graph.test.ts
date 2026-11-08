import { describe, expect, it } from "vitest";
import { shaderGraph } from "@aura3d/engine/shader-graph-runtime";
import { parsePortableFlag } from "../../../apps/showcase-port-shared/portable-flag";
import { cloudSeaGraph, portableCloudMaterial } from "../../../examples/last-train-port/portable";
import { cloudSpec } from "../../../examples/last-train-port/materials";
import { waterGraph, portableWaterMaterial } from "../../../examples/silt-and-signal-port/portable-water";
import { waterSpec } from "../../../examples/silt-and-signal-port/world";

describe("A4 portable pilots: on by default, ?portable=0 opts out", () => {
  it("is on unless the value is exactly 0", () => {
    expect(parsePortableFlag(undefined)).toBe(true);
    expect(parsePortableFlag("")).toBe(true);
    expect(parsePortableFlag("?portable=0")).toBe(false);
    expect(parsePortableFlag("?portable=true")).toBe(true);
    expect(parsePortableFlag("?portable=1")).toBe(true);
    expect(parsePortableFlag(new URLSearchParams("backend=webgpu&portable=0"))).toBe(false);
  });
});

describe("A4 portable pilots: graphs compile for both backends", () => {
  it.each([["cloud sea", cloudSeaGraph], ["water", waterGraph]] as const)("%s validates and compiles to GLSL and WGSL", (_name, build) => {
    const graph = build();
    expect(shaderGraph.validate(graph)).toEqual([]);
    const glsl = shaderGraph.compile(graph, "glsl");
    const wgsl = shaderGraph.compile(graph, "wgsl");
    expect(glsl.fragment).toContain("void main()");
    expect(wgsl.fragment).toContain("@fragment");
  });

  it("the cloud-sea material declares exactly the GLSL material's uniforms", () => {
    const portable = portableCloudMaterial() as { custom: { uniformAliases?: Record<string, string> } };
    expect(Object.keys(portable.custom.uniformAliases ?? {}).sort()).toEqual(Object.keys(cloudSpec().uniforms ?? {}).sort());
  });

  it.each(["original", "inked"] as const)("the water material (%s) declares the GLSL material's uniforms and render state", (look) => {
    const spec = waterSpec(0, look);
    const portable = portableWaterMaterial(spec) as { custom: { uniformAliases?: Record<string, string>; transparent?: boolean; depthWrite?: boolean; side?: string } };
    expect(Object.keys(portable.custom.uniformAliases ?? {}).sort()).toEqual(Object.keys(spec.uniforms ?? {}).sort());
    expect(portable.custom.transparent).toBe(true);
    expect(portable.custom.depthWrite).toBe(false);
    expect(portable.custom.side).toBe("double");
  });
});
