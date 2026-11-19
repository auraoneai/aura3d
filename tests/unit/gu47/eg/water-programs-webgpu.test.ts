/**
 * Aura Links on WebGPU logged `prd10.water: water program "0" failed to build; the water surface is not drawn. No WGSL
 * program for shader` (WGSL_PROGRAM_MISSING): `waterShaderSources` / `underwaterShaderSources` shipped `webgpu: undefined`.
 * They now carry a portable WGSL twin. This pins: (1) every variant builds on the WebGPU device; (2) the portable bindings
 * are the GLSL program's uniforms, every `aura.*` / texture the WGSL reads is bound, and every binding is a name
 * WaterRuntime puts in its uniform map; (3) a draw with WaterRuntime's full uniform map (including the extra caustic and
 * SH values) is accepted; (4) the vertex inputs sit at the WebGPU locations of WaterRuntime's vertex format.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../../packages/rendering/src/WebGPUDevice";
import { reflectShaderSources } from "../../../../packages/rendering/src/ShaderReflection";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import type { UniformValue } from "../../../../packages/rendering/src/RenderDevice";
import { underwaterShaderSources, waterShaderSources } from "../../../../packages/rendering/src/world/water/WaterMaterial";

const programs = {
  "water (scene copy)": waterShaderSources({ hasScene: true, planar: false }),
  "water (scene copy, planar)": waterShaderSources({ hasScene: true, planar: true }),
  "water (Low)": waterShaderSources({ hasScene: false, planar: false }),
  underwater: underwaterShaderSources()
};

/** The uniform names WaterRuntime binds (read from its `new Map<string, UniformValue>([...])` literal). */
// invariant: WaterRuntime.ts's uniform/texture tables are what the WebGPU twins must bind; the not.toContain check is on generated WGSL, not source text.
const runtimeSource = readFileSync(new URL("../../../../packages/engine/src/production-runtime/world/WaterRuntime.ts", import.meta.url), "utf8");
const runtimeUniforms = new Set([...runtimeSource.matchAll(/^\s*\["(u_\w+)",/gm)].map((match) => match[1]!));
const runtimeTextures = new Set([...runtimeSource.matchAll(/\["(u_\w+)", new TextureBinding/g)].map((match) => match[1]!));

/** Mirrors WaterRuntime's WATER_FORMAT (not exported): a_shore rides the `uv` semantic. */
const WATER_FORMAT = new VertexFormat([
  { semantic: "position", components: 3, offset: 0, shaderName: "a_position" },
  { semantic: "uv", components: 1, offset: 12, shaderName: "a_shore" }
]);

async function fixture() {
  const modules: string[] = [];
  const native = {
    queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: ({ size }: { readonly size: number }) => ({ size, destroy() {} }),
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createShaderModule: (descriptor: { readonly code: string }) => { modules.push(descriptor.code); return { descriptor }; },
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, draw() {}, drawIndexed() {}, end() {} }), finish: () => ({}) }),
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike }, device: native as unknown as WebGPUDeviceLike });
  return { device, modules };
}

/** WaterRuntime's uniform map shape: every name it binds, with the same value kinds. */
function runtimeUniformMap(texture: Texture): Map<string, UniformValue> {
  const vec = (n: number) => new Float32Array(n).fill(0.5);
  const sizes: Record<string, number> = {
    u_viewProjection: 16, u_worldOffset: 3, u_waves: 32, u_waveSpeed: 32, u_cameraPosition: 3, u_viewport: 2, u_flow0: 2, u_flow1: 2,
    u_absorption: 3, u_scatterColor: 3, u_deepColor: 3, u_shallowColor: 3, u_sunDirection: 3, u_sunColor: 3, u_skyHorizonColor: 3,
    u_shIrradiance: 36, u_fogColor: 3, u_fogNearFar: 2, u_ambientSH: 3, u_surfaceColor: 3, u_deepGradient: 3
  };
  const map = new Map<string, UniformValue>();
  for (const name of runtimeUniforms) {
    if (runtimeTextures.has(name)) map.set(name, new TextureBinding({ name, texture }));
    else map.set(name, sizes[name] ? vec(sizes[name]!) : 1);
  }
  return map;
}

describe("world.water programs on the WebGPU backend", () => {
  it("WaterRuntime's uniform map was read", () => {
    expect(runtimeUniforms.size).toBeGreaterThan(30);
    expect(runtimeTextures).toEqual(new Set(["u_normal0", "u_normal1", "u_sceneDepth", "u_sceneColor", "u_planarReflection", "u_foam", "u_causticAtlas"]));
  });

  it.each(Object.entries(programs))("%s: builds a portable WGSL program (no WGSL_PROGRAM_MISSING)", async (_name, sources) => {
    const { device, modules } = await fixture();
    try {
      expect(sources.webgpu).toBeDefined();
      const shader = device.createShaderProgram(sources);
      expect(shader).toBeDefined();
      const code = modules.join("\n");
      expect(code).toMatch(/@vertex fn vs_main/);
      expect(code).toMatch(/@fragment fn fs_main/);
      expect(code).toMatch(/var<uniform> aura\s*:/);
      expect(code).not.toContain("@aura3d-bindings");
    } finally { device.dispose(); }
  });

  it.each(Object.entries(programs))("%s: binds the GLSL program's uniforms, all of them names WaterRuntime sets", (name, sources) => {
    const bound = new Set((sources.portableBindings ?? []).map((binding) => binding.name));
    const glsl = reflectShaderSources(sources).uniforms;
    // Every uniform the GLSL program declares has a portable binding of the same name...
    for (const uniform of glsl) expect([uniform, bound.has(uniform)]).toEqual([uniform, true]);
    // ...and the shared binding list adds only the underwater gradient to the surface programs.
    const extra = [...bound].filter((binding) => !glsl.has(binding)).sort();
    expect(extra).toEqual(name === "underwater" ? [] : ["u_deepGradient", "u_surfaceColor"]);
    // Every binding is filled by WaterRuntime, with the same texture-vs-value kind.
    for (const binding of sources.portableBindings ?? []) {
      expect([binding.name, runtimeUniforms.has(binding.name)]).toEqual([binding.name, true]);
      expect([binding.name, binding.kind === "texture2d"]).toEqual([binding.name, runtimeTextures.has(binding.name)]);
    }
    // Every `aura.*` member and `<name>Texture` the WGSL reads is bound.
    const wgsl = `${sources.webgpu!.vertex}\n${sources.webgpu!.fragment}`;
    for (const [, member] of wgsl.matchAll(/\baura\.(\w+)/g)) expect([member, bound.has(member!)]).toEqual([member, true]);
    for (const [, texture] of wgsl.matchAll(/\b(u_\w+)Texture\b/g)) expect([texture, bound.has(texture!)]).toEqual([texture, true]);
  });

  it("vertex inputs sit at the WebGPU locations of WaterRuntime's vertex format", () => {
    const header = /@vertex fn vs_main\(([\s\S]*?)\)\s*->/.exec(programs.underwater.webgpu!.vertex)![1]!;
    const inputs = Object.fromEntries([...header.matchAll(/@location\((\d+)\)\s+(\w+)\s*:\s*([\w<>]+)/g)].map((m) => [m[2]!, [Number(m[1]), m[3]!]]));
    const formatLocation = (shaderName: string) => WATER_FORMAT.attributes.find((attribute) => attribute.shaderName === shaderName)!.shaderLocation;
    expect(inputs).toEqual({ a_position: [formatLocation("a_position"), "vec3<f32>"], a_shore: [formatLocation("a_shore"), "f32"] });
  });

  it.each(Object.entries(programs))("%s: accepts a draw with WaterRuntime's full uniform map", async (_name, sources) => {
    const { device } = await fixture();
    try {
      const shader = device.createShaderProgram(sources);
      const texture = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array(4) });
      const vertexBuffer = device.createBuffer("vertex", 16 * 3);
      const target = device.createRenderTarget({ width: 2, height: 2, depth: true });
      device.beginFrame(2, 2); device.setRenderTarget(target);
      expect(() => device.draw({ label: "prd10.water.test", topology: "triangles", vertexBuffer, vertexFormat: WATER_FORMAT, vertexCount: 3, shader,
        renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "back", blend: true },
        uniforms: runtimeUniformMap(texture) })).not.toThrow();
      device.endFrame();
    } finally { device.dispose(); }
  });
});
