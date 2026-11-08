import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { assignCustomAttributeLocations, globalShaderSource } from "../../../packages/rendering/src/index.js";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection.js";
import { allProgramSpecs, glowSpec, puffSpec, scenerySpec } from "../../../examples/kid-goku-beyond-the-clouds-port/materials.js";
import { lookRow } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look.js";
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

describe("Cumulus Dash (kid-goku-beyond-the-clouds-port) WGSL twins", () => {
  it("every program the WebGPU path draws has a WGSL twin (the gl_PointSize sprites are replaced by quads there)", () => {
    const missing = allProgramSpecs().filter(({ spec }) => !spec.wgsl).map(({ name }) => name);
    expect(missing).toEqual(["glow", "puff"]);
  });

  it.each(specs)("%s: inputs at the geometry's WebGPU locations, matching stages, bound and GLSL-declared uniforms", (name, spec) => {
    const materialObject = createCustomShaderMaterial(spec, `cumulus-${name}`);
    try {
      const pair = globalShaderSource(materialObject.shaderKey)!;
      expect(pair.webgpu).toBeDefined();
      const reflection = reflectShaderSources({ label: `cumulus-${name}`, marker: pair.marker, vertex: pair.vertex, fragment: pair.fragment });
      const glslInputs = [...reflection.attributes.keys()];
      const custom = assignCustomAttributeLocations(glslInputs.filter((input) => !(input in FIXED)));
      const vsHeader = /@vertex\s+fn\s+vs_main\s*\(([\s\S]*?)\)\s*->/.exec(pair.webgpu!.vertex)![1]!;
      const inputs = locations(vsHeader);
      expect([...inputs.keys()].sort()).toEqual([...glslInputs].sort());
      for (const [input, { location }] of inputs) expect([input, location]).toEqual([input, FIXED[input] ?? custom.get(input)]);
      const outputs = new Map([...locations(pair.webgpu!.vertex.split("@vertex")[0]!)].map(([, value]) => [value.location, value.type]));
      const fsHeader = /@fragment\s+fn\s+fs_main\s*\(([\s\S]*?)\)\s*->/.exec(pair.webgpu!.fragment)![1]!;
      for (const { location, type } of locations(fsHeader).values()) expect(outputs.get(location)).toBe(type);
      const bound = new Set([...(pair.portableBindings ?? []).map((binding) => binding.name), ...RENDERER_BUILTINS]);
      const read = new Set([...`${pair.webgpu!.vertex}\n${pair.webgpu!.fragment}`.matchAll(/\baura\.(\w+)/g)].map((match) => match[1]!));
      for (const member of read) expect([member, bound.has(member)]).toEqual([member, true]);
      for (const member of read) if (!RENDERER_BUILTINS.has(member)) expect([member, reflection.uniforms.has(member)]).toEqual([member, true]);
      // The sun shadow and the image-based light are read only by the storm row's receiveShadow scenery.
      const samplesShadow = /u_shadowMapTextureTexture/.test(pair.webgpu!.fragment);
      expect(samplesShadow).toBe(spec.receiveShadow === true);
      if (samplesShadow) {
        expect(bound.has("u_shadowMapTexture")).toBe(true);
        expect(bound.has("u_a3dEnvMap")).toBe(true);
        expect(bound.has("u_a3dEnvSh")).toBe(true);
      }
    } finally {
      materialObject.dispose();
    }
  });

  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));

  it("the default glow / puff points are unchanged; the quad variants are opt-in", () => {
    for (const spec of [glowSpec(), puffSpec()]) {
      expect(spec.wgsl).toBeUndefined();
      expect(spec.glsl.vertex).toContain("gl_PointSize");
      expect(spec.glsl.fragment).toContain("gl_PointCoord");
    }
    for (const spec of [glowSpec(true), puffSpec(true)]) {
      expect(spec.glsl.vertex).not.toContain("gl_PointSize");
      expect(spec.glsl.fragment).not.toContain("gl_PointCoord");
      expect(spec.wgsl?.vertex).toContain("aSize");
    }
  });

  it("both scenery rows (textured storm row with shadow and IBL, plain original row) carry their own twin", () => {
    expect(scenerySpec({}, lookRow("storm-washed")).wgsl?.fragment).toContain("a3dSunShadow");
    expect(scenerySpec({}, lookRow("original")).wgsl?.fragment).not.toContain("a3dSunShadow");
  });
});
