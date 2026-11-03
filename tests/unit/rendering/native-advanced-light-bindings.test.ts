import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd04";
import { ForwardPass, registerForwardDrawHook } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type RenderDevice, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { advancedLightingFeatures, advancedLightingItemBinding, stampAdvancedLightingBinding, type AdvancedLightingFrame, type AdvancedLightingSource } from "../../../packages/rendering/src/lighting/AdvancedLightingBindings";
import { NativeLightmapBake, type NativeBakeLight } from "../../../packages/rendering/src/lighting/NativeLightBaking";
import { NativeLightProbeGrid } from "../../../packages/rendering/src/lighting/NativeLightProbeGrid";
import { VoxelIndirectLighting } from "../../../packages/rendering/src/lighting/VoxelIndirectLighting";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { PRD02_ITEM_IRRADIANCE_BINDINGS } from "../../../packages/rendering/src/probes/ProbeBoxProjection";

class CaptureDevice extends MockRenderDevice {
  readonly sources: ShaderSources[] = [];
  readonly byProgram = new Map<number, ShaderSources>();
  override createShaderProgram(source: ShaderSources): RenderShaderProgram {
    this.sources.push(source);
    const program = super.createShaderProgram(source);
    this.byProgram.set(program.id, source);
    return program;
  }
}
const flags = { values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true },
  on: (name: string) => name === "A3D_QR_CORE" || name === "A3D_QR_CORE_GENERATOR" };
const ticket = () => {};
const frameFor = (device: RenderDevice): AdvancedLightingFrame => ({ device, postScopeId: {}, viewId: "main", frameIndex: 4 });
const grid = () => new NativeLightProbeGrid({ min: [0, -2, 0], max: [4, 2, 6], dimensions: [2, 1, 2] });
const volume = () => new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [3, 1, 1] }, quality: "low", resolution: [3, 1, 1] });
function baked(uvChannel: 0 | 1, lights: readonly NativeBakeLight[] = []) {
  const task = new NativeLightmapBake({ atlas: { width: 2, height: 2, uvChannel, gutter: 0, texelDensity: 2,
    charts: [{ x: 0, y: 0, width: 2, height: 2, triangles: [0] }] },
  mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] },
  lights, indirect: () => [0.25, 0.5, 0.75] });
  while (task.status !== "complete") task.step(16);
  return task.createRenderData();
}
function uvGeometry(): Geometry {
  const format = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
    { semantic: "uv", components: 2, offset: 24 }, { semantic: "uv1", components: 2, offset: 32 }
  ], 40);
  return new Geometry(new VertexBuffer(format, 3), null, "triangles");
}
function draw(device: CaptureDevice, frame: AdvancedLightingFrame, item: Parameters<typeof stampAdvancedLightingBinding>[0]) {
  new ForwardPass({ items: [item], frameContext: frame as FrameContributorContext }).execute({ device, width: 8, height: 8 });
  const raw = device.drawCommands[device.drawCommands.length - 1]!;
  const command = { ...raw, uniforms: new Map(raw.uniforms) };
  const source = device.byProgram.get(command.shader!.id)!;
  return { command, source };
}

describe("advanced-light draw bindings", () => {
  it("stamps and draws the exact grid and voxel packets, with distinct generated programs", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial(), probe = grid(), voxels = volume();
    const frame = frameFor(device);
    setRendererQrFlags(flags, device);
    try {
      const probeItem = stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "probe-grid", data: probe.renderData(), intensity: 1.5, outside: "clamp", assertCurrent: ticket });
      const voxelItem = stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "voxel", data: voxels.renderData(), intensity: 2, maxDistance: 3, assertCurrent: ticket });
      device.beginFrame(8, 8);
      const first = draw(device, frame, probeItem), second = draw(device, frame, voxelItem);
      expect(first.source.generatedProgram?.features.features).toMatchObject({ "a3d.nativeProbeGrid": true });
      expect(second.source.generatedProgram?.features.features).toMatchObject({ "a3d.nativeVoxelIndirect": true });
      expect(first.command.shader?.id).not.toBe(second.command.shader?.id);
      const probeTexture = first.command.uniforms?.get("u_a3dNativeProbeTexture") as TextureBinding;
      expect(probeTexture.texture).toBe(probe.renderData().texture);
      expect(probeTexture.sampler.minFilter).toBe("nearest");
      expect(first.command.uniforms?.get("u_a3dNativeProbeOutside")).toBe(1);
      expect(Array.from(first.command.uniforms?.get("u_a3dNativeProbeDimensions") as Float32Array)).toEqual([2, 1, 2, 0]);
      expect((second.command.uniforms?.get("u_a3dNativeVoxelTexture") as TextureBinding).texture).toBe(voxels.renderData().texture);
      expect(Array.from(second.command.uniforms?.get("u_a3dNativeVoxelLevels") as Float32Array).slice(0, 12))
        .toEqual([3, 1, 1, 0, 2, 1, 1, 3, 1, 1, 1, 5]);
      expect(Array.from(second.command.uniforms?.get("u_a3dNativeVoxelConfig") as Float32Array)).toEqual([3, 32, 1, 3]);
      expect(first.source.fragment).toContain("mix(globalIrradiance, sampleValue.rgb * u_a3dNativeProbeIntensity, sampleValue.a)");
      expect(second.source.fragment).toContain("a3dNativeVoxelIrradiance(u_a3dNativeVoxelTexture");
      expect(first.source.fragment).not.toContain("uniform highp sampler2D u_a3dNativeVoxelTexture;");
    } finally { probe.dispose(); voxels.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses the authored bake UV and preserves distinct replacement and additive diffuse semantics", () => {
    const device = new CaptureDevice(), geometry = uvGeometry(), material = new PBRMaterial();
    const map0 = baked(0), map1 = baked(1), frame = frameFor(device);
    setRendererQrFlags(flags, device);
    try {
      device.beginFrame(8, 8);
      const replacement = draw(device, frame, stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "lightmap", data: map1, intensity: 2, composition: "replace-diffuse", assertCurrent: ticket }));
      const additive = draw(device, frame, stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "lightmap", data: map0, intensity: 1, composition: "add-indirect", assertCurrent: ticket }));
      expect(replacement.source.generatedProgram?.features.features).toMatchObject({ "a3d.nativeBakedLightmap": "replace-diffuse", "a3d.nativeLightmapUv": 1 });
      expect(additive.source.generatedProgram?.features.features).toMatchObject({ "a3d.nativeBakedLightmap": "add-indirect", "a3d.nativeLightmapUv": 0 });
      expect(replacement.source.fragment).toContain("a3dNativeLightmapIrradiance(u_a3dNativeLightmapTexture, v_uv1)");
      expect(replacement.source.fragment).toContain("directDiffuse *= 1.0 - a3dNativeLightmap.a");
      expect(additive.source.fragment).toContain("a3dNativeLightmapIrradiance(u_a3dNativeLightmapTexture, v_uv)");
      expect(additive.source.fragment).toContain("indirectDiffuse += a3dNativeBakedDiffuse * a3dNativeLightmap.a");
      expect(additive.source.fragment).not.toContain("directDiffuse *= 1.0 - a3dNativeLightmap.a");
      expect((replacement.command.uniforms?.get("u_a3dNativeLightmapTexture") as TextureBinding).texture).toBe(map1.texture);
    } finally { map0.texture.dispose(); map1.texture.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects stale frame, owner, view, device and attachment tickets", () => {
    const device = new CaptureDevice(), foreign = new CaptureDevice(), geometry = Geometry.box(), probe = grid(), frame = frameFor(device);
    let current = true;
    try {
      const item = stampAdvancedLightingBinding({ geometry }, frame,
        { kind: "probe-grid", data: probe.renderData(), intensity: 1, outside: "null", assertCurrent: () => { if (!current) throw new Error("ticket stale"); } });
      expect(advancedLightingFeatures(advancedLightingItemBinding(item, frame)!)).toEqual({ "a3d.nativeProbeGrid": true });
      for (const changed of [{ ...frame, frameIndex: 5 }, { ...frame, postScopeId: {} }, { ...frame, viewId: "other" }, { ...frame, device: foreign }]) {
        expect(() => advancedLightingItemBinding(item, changed)).toThrow(/does not belong/);
      }
      expect(() => advancedLightingItemBinding(item)).toThrow(/frame is unavailable/);
      expect(() => stampAdvancedLightingBinding(item, frame, { kind: "probe-grid", data: probe.renderData(), intensity: 1, outside: "null", assertCurrent: ticket }))
        .toThrow(/multiple advanced diffuse sources/);
      current = false;
      expect(() => advancedLightingItemBinding(item, frame)).toThrow(/ticket stale/);
    } finally { geometry.dispose(); probe.dispose(); device.dispose(); foreign.dispose(); }
  });

  it("rechecks the attachment after draw hooks and before submission", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial(), probe = grid(), frame = frameFor(device);
    let current = true;
    const remove = registerForwardDrawHook({ id: "advanced-test-invalidate", bind: () => { current = false; } });
    setRendererQrFlags(flags, device);
    try {
      const item = stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "probe-grid", data: probe.renderData(), intensity: 1, outside: "null", assertCurrent: () => { if (!current) throw new Error("ticket changed"); } });
      device.beginFrame(8, 8);
      expect(() => draw(device, frame, item)).toThrow(/ticket changed/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { remove(); probe.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("checks lightmap provenance, UV availability and competing volume before drawing", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial(), frame = frameFor(device), probe = grid();
    const map = baked(1), lit = baked(0, [{ type: "ambient", color: [1, 1, 1], intensity: 0 }]);
    setRendererQrFlags(flags, device);
    try {
      const source = { kind: "lightmap", data: map, intensity: 1, composition: "replace-diffuse", assertCurrent: ticket } as const;
      const item = stampAdvancedLightingBinding({ geometry, material }, frame, source);
      expect(() => stampAdvancedLightingBinding({ geometry, material }, frame, { ...source, data: lit })).toThrow(/authored lights/);
      device.beginFrame(8, 8);
      expect(() => draw(device, frame, item)).toThrow(/UV channel is missing or incompatible/);
      const probeItem = stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "probe-grid", data: probe.renderData(), intensity: 1, outside: "null", assertCurrent: ticket });
      const competing = { ...probeItem, [PRD02_ITEM_IRRADIANCE_BINDINGS]: { device, owner: {}, volume: { textures: [] }, uniforms: {} } };
      expect(() => draw(device, frame, competing)).toThrow(/cannot combine advanced and volume diffuse/);
      (map.texture.getMipLevel(0)!.data as Float32Array)[0]! += 1;
      expect(advancedLightingItemBinding(item, frame, { deferLightmapContentCheck: true })?.kind).toBe("lightmap");
      expect(() => advancedLightingItemBinding(item, frame)).toThrow(/unmodified completed bake/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { map.texture.dispose(); lit.texture.dispose(); probe.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects voxel extents and trace distances that cannot be represented safely on the GPU", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), voxels = volume(), frame = frameFor(device);
    const data = voxels.renderData();
    const make = (bounds: typeof data.bounds, maxDistance: number): AdvancedLightingSource =>
      ({ kind: "voxel", data: { ...data, bounds }, intensity: 1, maxDistance, assertCurrent: ticket });
    try {
      expect(() => stampAdvancedLightingBinding({ geometry }, frame, make({ min: [0, 0, 0], max: [1e38, 1e38, 1e38] }, 1)))
        .toThrow(/float32 tracing range/);
      expect(() => stampAdvancedLightingBinding({ geometry }, frame, make({ min: [0, 0, 0], max: [1e-40, 1, 1] }, 1)))
        .toThrow(/float32 precision/);
      expect(() => stampAdvancedLightingBinding({ geometry }, frame, make(data.bounds, 100)))
        .toThrow(/four volume diagonals/);
    } finally { voxels.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("does not fall back to legacy when generated lighting is disabled", () => {
    const geometry = Geometry.box(), material = new PBRMaterial(), probe = grid();
    try {
      const device = new CaptureDevice(), frame = frameFor(device);
      const item = stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "probe-grid", data: probe.renderData(), intensity: 1, outside: "null", assertCurrent: ticket });
      try {
        device.beginFrame(8, 8);
        expect(() => draw(device, frame, item)).toThrow(/generated lit physical program/);
        expect(device.drawCommands).toHaveLength(0);
      } finally { device.dispose(); }
    } finally { probe.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("submits all three scoped sources through the generated WebGPU device route", async () => {
    const modules: string[] = [], bindings: number[][] = [];
    let draws = 0;
    const native: WebGPUDeviceLike = {
      queue: { submit() {}, writeBuffer() {}, writeTexture() {}, onSubmittedWorkDone: async () => {} },
      createBuffer: () => ({ destroy() {} }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createSampler: () => ({}),
      createShaderModule: ({ code }) => { modules.push(code); return {}; },
      createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createBindGroupLayout: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroup: ({ entries }) => { bindings.push(entries.map((entry) => entry.binding)); return {}; },
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setViewport() {}, setScissorRect() {}, setVertexBuffer() {},
        setBindGroup() {}, draw() { draws += 1; }, end() {} }), finish: () => ({}) })
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native, requireNativeRendering: true });
    const geometry = uvGeometry(), material = new PBRMaterial(), probe = grid(), voxels = volume(), map = baked(1), frame = frameFor(device);
    const target = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false });
    setRendererQrFlags(flags, device);
    try {
      device.beginFrame(8, 8); device.setRenderTarget(target);
      const sources: AdvancedLightingSource[] = [
        { kind: "probe-grid", data: probe.renderData(), intensity: 1, outside: "clamp", assertCurrent: ticket },
        { kind: "voxel", data: voxels.renderData(), intensity: 1, maxDistance: 3, assertCurrent: ticket },
        { kind: "lightmap", data: map, intensity: 1, composition: "replace-diffuse", assertCurrent: ticket }
      ];
      for (const source of sources) {
        const item = stampAdvancedLightingBinding({ geometry, material }, frame, source);
        new ForwardPass({ items: [item], frameContext: frame as FrameContributorContext }).execute({ device, width: 8, height: 8 });
      }
      expect(draws).toBe(3);
      for (const slot of [56, 57, 58]) expect(bindings.some((entry) => entry.includes(slot))).toBe(true);
      expect(modules.some((source) => source.includes("a3dNativeProbeIrradiance"))).toBe(true);
      expect(modules.some((source) => source.includes("a3dNativeVoxelIrradiance"))).toBe(true);
      expect(modules.some((source) => source.includes("a3dNativeLightmapIrradiance"))).toBe(true);
      device.endFrame();
    } finally { target.dispose(); probe.dispose(); voxels.dispose(); map.texture.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("reports a pending generated program instead of silently skipping a tagged draw", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial(), probe = grid(), frame = frameFor(device);
    Object.defineProperty(device, "probe", { value: { parallelShaderCompile: true } });
    Object.defineProperty(device, "compileAsync", { value: () => new Promise<RenderShaderProgram>(() => {}) });
    setRendererQrFlags(flags, device);
    try {
      const item = stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "probe-grid", data: probe.renderData(), intensity: 1, outside: "null", assertCurrent: ticket });
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [item], frameContext: frame as FrameContributorContext }).execute({ device, width: 8, height: 8 }))
        .toThrow(/advanced-lighting program is not ready/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { probe.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("reports generated compilation failure instead of dropping advanced lighting", () => {
    class RejectingDevice extends CaptureDevice {
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        if (source.generatedProgram) throw new Error("injected compilation failure");
        return super.createShaderProgram(source);
      }
    }
    const device = new RejectingDevice(), geometry = Geometry.box(), material = new PBRMaterial(), probe = grid(), frame = frameFor(device);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setRendererQrFlags(flags, device);
    try {
      const item = stampAdvancedLightingBinding({ geometry, material }, frame,
        { kind: "probe-grid", data: probe.renderData(), intensity: 1, outside: "null", assertCurrent: ticket });
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [item], frameContext: frame as FrameContributorContext }).execute({ device, width: 8, height: 8 }))
        .toThrow(/generated program failed to compile/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { log.mockRestore(); probe.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects invalid source combinations in the generator", () => {
    const generate = (features: Record<string, string | number | boolean>) => generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", features }));
    expect(() => generate({ "a3d.nativeProbeGrid": true, "a3d.nativeVoxelIndirect": true })).toThrow(/SOURCE_CONFLICT/);
    expect(() => generate({ "a3d.nativeProbeGrid": true, "prd02.irradianceVolume": true })).toThrow(/SOURCE_CONFLICT/);
    expect(() => generate({ "a3d.nativeBakedLightmap": "replace-diffuse", "a3d.nativeLightmapUv": 2 })).toThrow(/FEATURE_INVALID/);
  });

  it("keeps iridescent multiscattering when the only environment is local diffuse irradiance", () => {
    const materials = { values: { A3D_QR_MATERIALS: true }, on: (name: string) => name === "A3D_QR_MATERIALS" };
    const program = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", environment: "none", features: { "a3d.nativeProbeGrid": true },
      extensions: [{ lobe: "iridescence", bits: { film: true }, maps: [] }] }), { flags: materials });
    expect(program.fragment).toContain("defined(A3D_LOCAL_DIFFUSE_IRRADIANCE)");
    expect(program.fragment).toContain("a3dIrMulti * ( a3dLobeIrradiance * RECIPROCAL_PI )");
    if (spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0) {
      const directory = mkdtempSync(join(tmpdir(), "aura3d-advanced-iridescence-"));
      try {
        const vertex = join(directory, "source.vert"), fragment = join(directory, "source.frag");
        writeFileSync(vertex, program.vertex); writeFileSync(fragment, program.fragment);
        execFileSync("glslangValidator", ["-l", vertex, fragment], { stdio: "pipe" });
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  });

  it.skipIf(spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status !== 0)("links all selected generated GLSL sources", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura3d-advanced-"));
    const vertex = join(directory, "source.vert"), fragment = join(directory, "source.frag");
    try {
      for (const features of [{ "a3d.nativeProbeGrid": true }, { "a3d.nativeVoxelIndirect": true },
        { "a3d.nativeBakedLightmap": "replace-diffuse", "a3d.nativeLightmapUv": 1 },
        { "a3d.nativeBakedLightmap": "add-indirect", "a3d.nativeLightmapUv": 0 }] as Record<string, string | number | boolean>[]) {
        for (const useIbl of [false, true]) {
          const selected = useIbl ? { ...features, "prd02.ibl": true } : features;
          const lightingFlags = { values: {}, on: (name: string) => name === "A3D_QR_COMPILER" || name === "A3D_QR_LIGHTING" };
          const program = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", environment: useIbl ? "pmrem-cube" : "none", features: selected }), { flags: lightingFlags });
          writeFileSync(vertex, program.vertex); writeFileSync(fragment, program.fragment);
          execFileSync("glslangValidator", ["-l", vertex, fragment], { stdio: "pipe" });
        }
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
