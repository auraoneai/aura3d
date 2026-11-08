import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { assignCustomAttributeLocations, globalShaderSource } from "../../../packages/rendering/src/index.js";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection.js";
import { allProgramSpecs, pointsSpec } from "../../../examples/heatsink-port/materials.js";
import { expandToCorners, pointQuadArrays, quadUpdater } from "../../../examples/heatsink-port/point-quads.js";
import { checkGlslUnchanged } from "../apps/wgslTwinChecks.js";

/** Renderer-supplied members of the portable `aura` struct (always present). */
const RENDERER_BUILTINS = new Set(["u_modelViewProjection", "u_modelMatrix", "u_normalMatrix"]);
/** Fixed WebGPU stream locations of the engine geometry semantics. */
const FIXED: Readonly<Record<string, number>> = { a_position: 0, a_normal: 1, a_uv: 2 };

function locations(text: string): Map<string, { location: number; type: string }> {
  const out = new Map<string, { location: number; type: string }>();
  for (const match of text.matchAll(/@location\((\d+)\)\s+(\w+)\s*:\s*([\w<>]+)/g)) out.set(match[2]!, { location: Number(match[1]), type: match[3]! });
  return out;
}

const specs = allProgramSpecs().filter(({ spec }) => spec.wgsl).map(({ name, spec }) => [name, spec as AuraCustomMaterialSpec] as const);

describe("Ion Circuit (heatsink-port) WGSL twins", () => {
  it("every program the WebGPU path draws has a WGSL twin (the gl_PointSize sprites are replaced by quads there)", () => {
    const missing = allProgramSpecs().filter(({ spec }) => !spec.wgsl).map(({ name }) => name);
    expect(missing).toEqual(["points"]);
    expect(specs.length).toBe(allProgramSpecs().length - 1);
  });

  it.each(specs)("%s: inputs at the geometry's WebGPU locations, matching stages, bound and GLSL-declared uniforms", (name, spec) => {
    const materialObject = createCustomShaderMaterial(spec, `ion-${name}`);
    try {
      const pair = globalShaderSource(materialObject.shaderKey)!;
      expect(pair.webgpu).toBeDefined();
      const reflection = reflectShaderSources({ label: name, marker: name, vertex: pair.vertex, fragment: pair.fragment });
      const glslInputs = [...reflection.attributes.keys()];
      const custom = assignCustomAttributeLocations(glslInputs.filter((input) => !(input in FIXED)));
      const vsHeader = /@vertex\s+fn\s+vs_main\s*\(([\s\S]*?)\)\s*->/.exec(pair.webgpu!.vertex)![1]!;
      const inputs = locations(vsHeader);
      // Same input names as the GLSL program, each at the location the geometry stream binds on WebGPU.
      expect([...inputs.keys()].sort()).toEqual([...glslInputs].sort());
      for (const [input, { location }] of inputs) expect([input, location]).toEqual([input, FIXED[input] ?? custom.get(input)]);
      // Inter-stage: every fragment input is a vertex output at the same location with the same type.
      const outputs = new Map([...locations(pair.webgpu!.vertex.split("@vertex")[0]!)].map(([, value]) => [value.location, value.type]));
      const fsHeader = /@fragment\s+fn\s+fs_main\s*\(([\s\S]*?)\)\s*->/.exec(pair.webgpu!.fragment)![1]!;
      for (const { location, type } of locations(fsHeader).values()) expect(outputs.get(location)).toBe(type);
      // Every `aura.<member>` read is bound and declared by the GLSL program (so the forward pass fills it).
      const bound = new Set([...(pair.portableBindings ?? []).map((binding) => binding.name), ...RENDERER_BUILTINS]);
      const read = new Set([...`${pair.webgpu!.vertex}\n${pair.webgpu!.fragment}`.matchAll(/\baura\.(\w+)/g)].map((match) => match[1]!));
      for (const member of read) expect([member, bound.has(member)]).toEqual([member, true]);
      for (const member of read) if (!RENDERER_BUILTINS.has(member)) expect([member, reflection.uniforms.has(member)]).toEqual([member, true]);
      // The shadow map is sampled only by the receiveShadow programs, through the portable texture binding.
      const samplesShadow = /u_shadowMapTextureTexture/.test(pair.webgpu!.fragment);
      expect(samplesShadow).toBe(spec.receiveShadow === true);
      if (samplesShadow) expect(bound.has("u_shadowMapTexture")).toBe(true);
    } finally {
      materialObject.dispose();
    }
  });

  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));

  it("the default points program is unchanged; the quad variant is opt-in", () => {
    const points = pointsSpec();
    expect(points.wgsl).toBeUndefined();
    expect(points.glsl.vertex).toContain("gl_PointSize = size;");
    expect(pointsSpec(true).glsl.vertex).not.toContain("gl_PointSize");
  });

  it("quad geometry and corner expansion: four corners per point, two triangles each", () => {
    const q = pointQuadArrays(2);
    expect(q.positions.length).toBe(24);
    expect([...q.uvs.slice(0, 8)]).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect([...q.indices]).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect([...expandToCorners([1, 2, 3, 4, 5, 6], 3, new Float32Array(24))]).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 4, 5, 6, 4, 5, 6, 4, 5, 6, 4, 5, 6]);
    const writes: [string, number[], number][] = [];
    const updater = quadUpdater({ updateAttribute: (name, update) => writes.push([name, [...update.array], update.offset]) }, { position: 3, size: 1 });
    updater.updateAttribute!("size", { array: Float32Array.from([7, 0]), offset: 0 });
    expect(writes).toEqual([["size", [7, 7, 7, 7, 0, 0, 0, 0], 0]]);
  });
});
