import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { globalShaderSource } from "../../../packages/rendering/src/index.js";
import { reflectShaderSources } from "../../../packages/rendering/src/ShaderReflection.js";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { skySpec } from "../../../apps/showcase-roadster-rush/src/art/sky.js";
import { groundSpec } from "../../../apps/showcase-roadster-rush/src/art/ground.js";
import { shieldSpec } from "../../../apps/showcase-roadster-rush/src/art/shield.js";
import { APEX_PLUMES, plumeSpec } from "../../../apps/showcase-roadster-rush/src/art/plume.js";
import { TOWER_VARIANTS, towerGlassSpec } from "../../../apps/showcase-roadster-rush/src/render/towers.js";
import { decalSpec } from "../../../apps/showcase-roadster-rush/src/render/decals.js";
import { wakeSpec } from "../../../apps/showcase-roadster-rush/src/render/wakes.js";

/** Renderer-supplied members of the portable `aura` struct (always present). */
const RENDERER_BUILTINS = new Set(["u_modelViewProjection", "u_modelMatrix", "u_normalMatrix"]);

const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] = [
  ["sky", skySpec() as AuraCustomMaterialSpec, false],
  ["ground", groundSpec() as AuraCustomMaterialSpec, false],
  ["shield", shieldSpec() as AuraCustomMaterialSpec, false],
  ["plume", plumeSpec(APEX_PLUMES.rear, false) as AuraCustomMaterialSpec, false],
  ["plume-instanced", plumeSpec(APEX_PLUMES.sky, false, true) as AuraCustomMaterialSpec, true],
  ...TOWER_VARIANTS.map((variant) => [`tower-${variant}`, towerGlassSpec(variant) as AuraCustomMaterialSpec, true] as const),
  ["decal", decalSpec() as AuraCustomMaterialSpec, true],
  ["wake", wakeSpec("#4df0ff", 0.2, [40, 90]) as AuraCustomMaterialSpec, true]
];

/** `@location(N) name: type` pairs of a WGSL entry point's parameter list (or of a struct body). */
function locations(text: string): Map<string, { location: number; type: string }> {
  const out = new Map<string, { location: number; type: string }>();
  for (const match of text.matchAll(/@location\((\d+)\)\s+(\w+)\s*:\s*([\w<>]+)/g)) out.set(match[2]!, { location: Number(match[1]), type: match[3]! });
  return out;
}

describe("Roadster Rush WGSL twins (A3/W6)", () => {
  it.each(specs)("%s: every custom shader carries a WGSL twin that matches the GLSL program's inputs and bindings", (_name, spec, instanced) => {
    expect(spec.wgsl?.vertex).toBeTruthy();
    expect(spec.wgsl?.fragment).toBeTruthy();
    const materialObject = createCustomShaderMaterial(spec, `rr-${_name}`);
    try {
      const pair = globalShaderSource(materialObject.shaderKey)!;
      expect(pair.webgpu).toBeDefined();
      const reflection = reflectShaderSources({ vertex: pair.vertex, fragment: pair.fragment });
      // Vertex inputs: same names at the locations the device binds from the GLSL reflection.
      const vsHeader = /@vertex\s+fn\s+vs_main\s*\(([\s\S]*?)\)\s*->/.exec(pair.webgpu!.vertex)![1]!;
      // (the shield's earlier twin names its position input `position`)
      const inputs = new Map([...locations(vsHeader)].map(([name, value]) => [name === "position" ? "a_position" : name, value]));
      expect(inputs.has("a_position")).toBe(true);
      for (const [name, { location }] of inputs) expect([name, reflection.attributes.get(name)]).toEqual([name, location]);
      const instanceInputs = [...inputs.keys()].filter((name) => name.startsWith("a_instanceMatrix"));
      expect(instanceInputs.length).toBe(instanced ? 4 : 0);
      // Inter-stage: every fragment input is a vertex output at the same location with the same type.
      const outputs = new Map([...locations(pair.webgpu!.vertex.split("@vertex")[0]!)].map(([, value]) => [value.location, value.type]));
      const fsHeader = /@fragment\s+fn\s+fs_main\s*\(([\s\S]*?)\)\s*->/.exec(pair.webgpu!.fragment)![1]!;
      const fsInputs = fsHeader.includes("@location") ? locations(fsHeader)
        : locations(/struct\s+\w+\s*\{([\s\S]*?)\}/.exec(pair.webgpu!.fragment)?.[1] ?? "");
      for (const { location, type } of fsInputs.values()) expect(outputs.get(location)).toBe(type);
      // Every `aura.<member>` the twin reads is a member of the generated binding struct.
      const bound = new Set([...(pair.portableBindings ?? []).map((binding) => binding.name), ...RENDERER_BUILTINS]);
      const read = new Set([...`${pair.webgpu!.vertex}\n${pair.webgpu!.fragment}`.matchAll(/\baura\.(\w+)/g)].map((match) => match[1]!));
      for (const name of read) expect([name, bound.has(name)]).toEqual([name, true]);
      // Each WGSL uniform read is also declared by the GLSL program, so the forward pass fills it for the twin.
      for (const name of read) if (!RENDERER_BUILTINS.has(name)) expect([name, reflection.uniforms.has(name)]).toEqual([name, true]);
    } finally {
      materialObject.dispose();
    }
  });

  it("keeps the GLSL stages the WebGL2 backend draws byte for byte (the twin is WebGPU-only)", () => {
    for (const [, spec] of specs) {
      const { wgsl: _wgsl, ...glslOnly } = spec;
      const a = createCustomShaderMaterial(glslOnly as AuraCustomMaterialSpec, "rr-glsl-a");
      const b = createCustomShaderMaterial(spec, "rr-glsl-b");
      try {
        const pa = globalShaderSource(a.shaderKey)!;
        const pb = globalShaderSource(b.shaderKey)!;
        expect(pb.vertex.replace(pb.marker, "")).toBe(pa.vertex.replace(pa.marker, ""));
        expect(pb.fragment.replace(pb.marker, "")).toBe(pa.fragment.replace(pa.marker, ""));
      } finally {
        a.dispose();
        b.dispose();
      }
    }
  });
});
