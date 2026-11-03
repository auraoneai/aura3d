import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, effects, lights, primitives, scene, type AuraCreateAppOptions } from "../../../packages/engine/src/public/index";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { packEnvSH } from "../../../packages/rendering/src/environment/EnvUniforms";
import { NativeLightProbeGrid } from "../../../packages/rendering/src/lighting/NativeLightProbeGrid";
import { stampAdvancedLightingBinding } from "../../../packages/rendering/src/lighting/AdvancedLightingBindings";
import { GENERATED_PBR_MATERIAL_LAYOUT, GENERATED_PBR_MATERIAL_OFFSETS } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import type { WebGPUResourceInterop } from "../../../packages/rendering/src/webgpu/ResourceInterop";
import type { WebGPUDevice } from "../../../packages/rendering/src/WebGPUDevice";
import { DeferredPipeline, type NativeDrawingScene } from "../../../packages/rendering/src/webgpu/DeferredPipeline";

type MockBindGroup = { entries?: { binding: number; resource: unknown }[] };
type MockDraw = { readonly pipeline?: string; readonly count: number; readonly indexed: boolean; readonly groups: readonly MockBindGroup[] };

/** Exercises orchestration and bindings only; the mock does not execute WGSL. */
function rootDevice() {
  const labels: string[] = [];
  const submissions: unknown[] = [];
  const textures: Record<string, unknown>[] = [];
  const passes: Record<string, unknown>[] = [];
  const textureResources: { descriptor: Record<string, unknown>; resource: ReturnType<typeof makeTexture> }[] = [];
  const textureUploads: { texture: unknown; data: ArrayBufferView }[] = [];
  const bindGroups: MockBindGroup[] = [];
  const uploads: { buffer: object; label?: string; data: Uint8Array }[] = [];
  function makeTexture() {
    const resource = { createView: (descriptor?: Record<string, unknown>) => ({ texture: resource, descriptor }), destroy: vi.fn() };
    return resource;
  }
  const native = {
    features: new Set<string>(),
    queue: { submit(commands: readonly unknown[]) { submissions.push(...commands); }, writeBuffer(buffer: { label?: string }, _offset: number, data: ArrayBufferView) { uploads.push({ buffer, label: buffer.label, data: new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) }); }, writeTexture(destination: { texture: unknown }, data: ArrayBufferView) { textureUploads.push({ texture: destination.texture, data }); }, onSubmittedWorkDone: async () => {} },
    createBuffer({ size, usage, label }: { size: number; usage: number; label?: string }) {
      const bytes = new ArrayBuffer(size);
      return { size, usage, label, destroy() {}, mapAsync: async () => {}, getMappedRange: () => bytes, unmap() {} };
    },
    createTexture: (descriptor: Record<string, unknown>) => { const resource = makeTexture(); textures.push(descriptor); textureResources.push({ descriptor, resource }); return resource; },
    createSampler: () => ({}),
    createShaderModule: () => ({}),
    createRenderPipeline: ({ label }: { label?: string }) => ({ label, getBindGroupLayout: () => ({}) }),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: (descriptor: MockBindGroup) => { bindGroups.push(descriptor); return descriptor; },
    createCommandEncoder: () => {
      const draws: MockDraw[] = [];
      return {
        beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
        beginRenderPass: (descriptor: Record<string, unknown>) => {
          passes.push(descriptor);
          let pipeline: string | undefined;
          const groups = new Map<number, MockBindGroup>();
          const record = (count: number, indexed: boolean) => draws.push({ pipeline, count, indexed, groups: [...groups.values()] });
          return {
            setPipeline(value: { label?: string }) { pipeline = value.label; if (pipeline) labels.push(pipeline); },
            setBindGroup(index: number, group: MockBindGroup) { groups.set(index, group); },
            setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw(count: number) { record(count, false); }, drawIndexed(count: number) { record(count, true); }, end() {}
          };
        },
        copyBufferToBuffer() {}, copyTextureToBuffer() {}, copyTextureToTexture() {}, finish: () => ({ draws })
      };
    },
    destroy() {}
  };
  const canvasContext = { configure() {}, unconfigure() {}, getCurrentTexture: makeTexture };
  class MockCanvas {
    width = 64; height = 64; clientWidth = 64; clientHeight = 64;
    style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
    getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
    hasAttribute() { return true; }
    getContext(kind: string) { return kind === "webgpu" ? canvasContext : null; }
    addEventListener() {} removeEventListener() {}
  }
  vi.stubGlobal("HTMLCanvasElement", MockCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: async () => native }), getPreferredCanvasFormat: () => "rgba8unorm" } });
  return { canvas: new MockCanvas() as unknown as HTMLCanvasElement, native, labels, submissions, uploads, textures, passes, textureResources, textureUploads, bindGroups };
}

afterEach(() => vi.unstubAllGlobals());

describe("root-app native drawing selection", () => {
  it("accepts a drawing-path option through the public renderer type", () => {
    const options: NonNullable<AuraCreateAppOptions["renderer"]> = { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback: false } };
    expect(options.drawingPath).toEqual({ mode: "deferred", allowFallback: false });
  });

  it.each([
    { mode: "off" as const, sampleCount: 1, expectedAa: "off" },
    { mode: undefined, sampleCount: 4, expectedAa: "msaa" }
  ])("preserves authored and default postprocess sampling ($expectedAa)", async ({ mode, sampleCount, expectedAa }) => {
    const fixture = rootDevice();
    const sync = vi.spyOn(Renderer.prototype, "render");
    const asyncRender = vi.spyOn(Renderer.prototype, "renderAsync");
    const authored = scene().add(lights.ambient({ intensity: 1 })).add(primitives.box({ name: "box" }));
    if (mode) authored.add(effects.antiAlias({ mode }));
    const app = createAuraApp(fixture.canvas, {
      scene: authored, renderer: { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback: true }, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: true
    });
    try {
      await app.ready(); await app.stepAsync(0);
      const input = (asyncRender.mock.calls.at(-1) ?? sync.mock.calls.at(-1))?.[0] as { source?: Record<string, unknown> } | undefined;
      const source = input?.source ?? input as Record<string, unknown>;
      expect(source.postprocess).toMatchObject({ sampleCount, v2: true, pipeline: { antiAliasing: expectedAa, exposure: 1, toneMapping: "aces", outputColorSpace: "srgb", alphaMode: "opaque", dither: true } });
    } finally { app.dispose(); sync.mockRestore(); asyncRender.mockRestore(); }
  });

  it.each([{ mode: "off" as const, sampleCount: 1 }, { mode: undefined, sampleCount: 4 }])("selects deferred with default root flags and $sampleCount× sampling for an ambient-only opaque primitive", async ({ mode, sampleCount }) => {
    const fixture = rootDevice();
    const authored = scene().add(lights.ambient({ intensity: 1 })).add(primitives.box({ name: "box" }));
    if (mode) authored.add(effects.antiAlias({ mode }));
    const app = createAuraApp(fixture.canvas, {
      scene: authored, renderer: { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback: false }, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: false
    });
    try {
      await app.ready();
      await app.stepAsync(0);
      const renderer = (app as unknown as Record<symbol, { drawingPathDiagnostics: unknown }>)[Symbol.for("a3d.prd01.renderer")];
      expect(renderer.drawingPathDiagnostics).toMatchObject({ requested: "deferred", active: "deferred", triangles: 12 });
      expect(fixture.labels.some((label) => label === "aura-deferred-physical-resolve" || label === "aura-deferred-probe-resolve")).toBe(true);
      const frameUpload = fixture.uploads.filter((entry) => entry.label === "aura-native-frame").at(-1)!;
      expect(new Float32Array(frameUpload.data.buffer)[55]).toBe(1); // Default PRD-03 indirect-fraction tag.
      expect(fixture.textures.filter((texture) => texture.format === "rgba16float" && texture.usage === 0x14 && texture.sampleCount === sampleCount).length).toBeGreaterThanOrEqual(3);
      if (sampleCount === 4) expect(fixture.passes.some((pass) => (pass.colorAttachments as { resolveTarget?: unknown; storeOp?: string }[] | undefined)?.some((attachment) => attachment.resolveTarget && attachment.storeOp === "store"))).toBe(true);
      expect(fixture.submissions.length).toBeGreaterThan(0);
    } finally { app.dispose(); }
  });

  it("preserves opaque renderOrder in the native triangle stream", async () => {
    const fixture = rootDevice();
    const app = createAuraApp(fixture.canvas, {
      scene: scene().add(lights.ambient({ intensity: 1 })).add(effects.antiAlias({ mode: "off" }))
        .add(primitives.box({ name: "red", renderOrder: 2, material: { color: "#ff0000" } }))
        .add(primitives.box({ name: "green", renderOrder: 1, material: { color: "#00ff00" } })),
      renderer: { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback: false }, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: false
    });
    try {
      await app.ready();
      await app.stepAsync(0);
      const upload = fixture.uploads.filter((entry) => entry.label === "aura-native-materials").at(-1)!;
      const materials = new Float32Array(upload.data.buffer);
      expect(Array.from(materials.slice(0, 3))).toEqual([0, 1, 0]);
      expect(Array.from(materials.slice(8, 11))).toEqual([1, 0, 0]);
    } finally { app.dispose(); }
  });

  it.each([{ unsupported: false, route: "native" }, { unsupported: true, route: "fallback" }])("runs contributor collection and after-opaque exactly once on a $route frame", async ({ unsupported }) => {
    const fixture = rootDevice();
    const events: string[] = [];
    const marker = {};
    const unregister = registerFrameContributor({
      id: "prd01.deferred-root-contract", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect", "after-opaque"],
      collect(items, context) { events.push("collect"); context.blackboard.set("prd01.deferred-root-contract", marker); return items; },
      passes(phase, context) {
        if (phase !== "after-opaque") return [];
        return [{ name: "prd01.deferred-root-contract", reads: [], writes: [], execute() {
          events.push(context.blackboard.get("prd01.deferred-root-contract") === marker ? "after-opaque:same-blackboard" : "after-opaque:wrong-blackboard");
          events.push(fixture.labels.some((label) => label === "aura-deferred-geometry" || label === "aura-deferred-shared-depth-geometry") ? "deferred-drawn" : "forward-drawn");
        } }];
      }
    });
    const authored = scene().add(lights.ambient({ intensity: 1 })).add(effects.antiAlias({ mode: "off" }))
      .add(primitives.box({ name: "box", ...(unsupported ? { material: { color: "#ffffff", opacity: 0.5 } } : {}) }));
    const app = createAuraApp(fixture.canvas, {
      scene: authored, renderer: { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback: true }, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: true
    });
    try {
      await app.ready(); events.length = 0; fixture.labels.length = 0;
      await app.stepAsync(0);
      const renderer = (app as unknown as Record<symbol, { drawingPathDiagnostics: unknown }>)[Symbol.for("a3d.prd01.renderer")];
      expect(renderer.drawingPathDiagnostics).toMatchObject({ requested: "deferred", active: unsupported ? "forward" : "deferred" });
      expect(events).toEqual(["collect", "after-opaque:same-blackboard", unsupported ? "forward-drawn" : "deferred-drawn"]);
    } finally { app.dispose(); unregister(); }
  });

  it("binds the actual implicit-studio probe through a fenced native read", async () => {
    const fixture = rootDevice();
    const app = createAuraApp(fixture.canvas, {
      scene: scene().add(primitives.box({ name: "box" })),
      renderer: { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback: false }, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: false
    });
    const renderSpy = vi.spyOn(Renderer.prototype, "renderAsync");
    try {
      await app.ready();
      const renderer = (app as unknown as Record<symbol, { drawingPathDiagnostics: unknown; device: { resourceInterop: WebGPUResourceInterop; releaseNativeSampledTexture(texture: Texture): void } }>)[Symbol.for("a3d.prd01.renderer")];
      const submit = vi.spyOn(renderer.device.resourceInterop, "submit");
      let finishFence!: () => void;
      const fence = new Promise<void>((resolve) => { finishFence = resolve; });
      fixture.native.queue.onSubmittedWorkDone = () => fence;
      await app.stepAsync(0);
      expect(renderer.drawingPathDiagnostics).toMatchObject({ requested: "deferred", active: "deferred", triangles: 12 });
      expect(fixture.labels).toContain("aura-deferred-probe-resolve");
      const resolveIndex = fixture.labels.lastIndexOf("aura-deferred-probe-resolve");
      const toneIndex = fixture.labels.lastIndexOf("webgpu-tone-pipeline");
      const presentIndex = fixture.labels.lastIndexOf("webgpu-post-present-pipeline");
      expect(toneIndex).toBeGreaterThan(resolveIndex);
      expect(presentIndex).toBeGreaterThan(toneIndex);
      expect(fixture.textures.filter((texture) => texture.format === "rgba16float" && texture.usage === 0x14 && texture.sampleCount === 4).length).toBeGreaterThanOrEqual(3);
      expect(fixture.passes.some((pass) => (pass.colorAttachments as { resolveTarget?: unknown; storeOp?: string }[] | undefined)?.some((attachment) => attachment.resolveTarget && attachment.storeOp === "store"))).toBe(true);
      expect(new Float32Array(fixture.uploads.filter((entry) => entry.label === "aura-native-frame").at(-1)!.data.buffer)[55]).toBe(1);
      type ProbeSource = { environmentProbe?: { specularCube: Texture; sh9: Float32Array; mipCount: number }; environmentProbeRotation?: number };
      const input = renderSpy.mock.calls.at(-1)?.[0] as ({ source?: ProbeSource } & ProbeSource) | undefined;
      const source = input?.source ?? input;
      const probe = source?.environmentProbe;
      expect(probe).toBeDefined();
      const nativeProbe = fixture.textureResources.filter(({ descriptor }) => descriptor.label === probe!.specularCube.label).at(-1)!.resource;
      const bound = fixture.bindGroups.some((group) => group.entries?.some((entry) => entry.binding === 8 && (entry.resource as { texture?: unknown }).texture === nativeProbe));
      expect(bound).toBe(true);
      expect(submit.mock.calls.some(([, accesses]) => accesses?.some((access) => access.resource === nativeProbe && access.mode === "read"))).toBe(true);
      const upload = fixture.uploads.filter((entry) => entry.label === "aura-deferred-probe").at(-1)!;
      const values = new Float32Array(upload.data.buffer);
      expect(Array.from(values.slice(0, 28))).toEqual(Array.from(packEnvSH(probe!.sh9)));
      expect(values[28]).toBe(probe!.mipCount);
      expect(values[29]).toBe(Math.fround(source?.environmentProbeRotation ?? 0));
      expect(Array.from(values.slice(30, 32))).toEqual([1, 1]);
      expect(values.slice(0, 27).some((value) => value !== 0)).toBe(true);
      renderer.device.releaseNativeSampledTexture(probe!.specularCube);
      expect(nativeProbe.destroy).not.toHaveBeenCalled();
      finishFence();
      await Promise.resolve(); await Promise.resolve();
      expect(nativeProbe.destroy).toHaveBeenCalledOnce();
      submit.mockRestore();
    } finally { app.dispose(); renderSpy.mockRestore(); }
  });

  it("applies live PRD-07 wetness to native deferred materials without a forward fallback", async () => {
    const fixture = rootDevice();
    const app = createAuraApp(fixture.canvas, {
      scene: scene().add(primitives.box({ name: "box" })),
      renderer: { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback: false }, shaderFailures: "throw" },
      qualityRebuild: { flags: ["vfx"] },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: false
    });
    const render = vi.spyOn(DeferredPipeline.prototype, "render");
    const material = () => (render.mock.calls.at(-1)![0] as { scene: NativeDrawingScene }).scene.materials[0]!;
    try {
      await app.ready();
      await app.stepAsync(0);
      const dry = material();
      expect(dry.shading).toBe("physical");
      app.atmosphere!.setWetness(1);
      await app.stepAsync(0);
      const renderer = (app as unknown as Record<symbol, { drawingPathDiagnostics: unknown }>)[Symbol.for("a3d.prd01.renderer")];
      expect(renderer.drawingPathDiagnostics).toMatchObject({ requested: "deferred", active: "deferred" });
      const wet = material();
      // wet = 1, porosity 1: albedo * 0.55; neutral puddle noise: roughness -> 0.06.
      for (let index = 0; index < 3; index += 1) expect(wet.baseColor[index]).toBeCloseTo(dry.baseColor[index]! * 0.55, 6);
      expect(wet.baseColor[3]).toBe(1);
      expect(wet.roughness).toBeCloseTo(0.06, 6);
      expect(wet.metallic).toBe(dry.metallic);
    } finally { app.dispose(); render.mockRestore(); }
  });

  it("submits the live wetness packet to the native forward PBR material", async () => {
    const fixture = rootDevice();
    const app = createAuraApp(fixture.canvas, {
      scene: scene().add(primitives.box({ name: "box" })),
      renderer: { backend: "webgpu", shaderFailures: "throw" },
      qualityRebuild: { flags: ["vfx"] },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: false
    });
    try {
      await app.ready();
      expect(app.diagnostics().errors.join(" ")).toBe("");
      app.atmosphere!.setWetness(0.6);
      await app.stepAsync(0);
      const offset = GENERATED_PBR_MATERIAL_OFFSETS.wetness!;
      const wetness = fixture.uploads.filter((upload) => upload.data.byteLength === GENERATED_PBR_MATERIAL_LAYOUT.size)
        .map((upload) => new DataView(upload.data.buffer, upload.data.byteOffset, upload.data.byteLength).getFloat32(offset, true));
      expect(wetness.length).toBeGreaterThan(0);
      expect(wetness.at(-1)).toBeCloseTo(0.6, 6);
    } finally { app.dispose(); }
  });

  it.each([true, false])("reports the per-item cube probe as unsupported (fallback=%s)", async (allowFallback) => {
    const fixture = rootDevice();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cube = new Texture({ width: 1, height: 1, dimension: "cube", colorSpace: "linear", cubeFaces: (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face) => ({ face, mipLevels: [{ width: 1, height: 1, data: new Uint8Array([32, 64, 96, 255]) }] })) });
    const binding = new TextureBinding({ name: "u_environmentCubeMapTexture", texture: cube, expectedColorSpace: "linear", expectedDimension: "cube", required: true });
    const unregister = registerFrameContributor({ id: "prd01.deferred-local-cube-contract", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"], collect: (items) => items.map((item) => ({ ...item, environmentCube: binding })) });
    const app = createAuraApp(fixture.canvas, {
      scene: scene().add(primitives.box({ name: "box" })),
      renderer: { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback }, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: false
    });
    try {
      await app.ready();
      const mountError = app.diagnostics().errors.join(" ");
      if (allowFallback) {
        expect(mountError).toBe("");
        await app.stepAsync(0);
        const renderer = (app as unknown as Record<symbol, { drawingPathDiagnostics: unknown }>)[Symbol.for("a3d.prd01.renderer")];
        expect(renderer.drawingPathDiagnostics).toMatchObject({ requested: "deferred", active: "forward", fallbackReason: expect.stringMatching(/environment bindings require the forward renderer/) });
      } else if (mountError) {
        expect(mountError).toMatch(/deferred.*environment bindings require the forward renderer/i);
        await expect(app.stepAsync(0)).rejects.toThrow(/asynchronous submission unavailable/i);
      } else {
        await expect(app.stepAsync(0)).rejects.toThrow(/deferred.*environment bindings require the forward renderer/i);
      }
    } finally { app.dispose(); unregister(); cube.dispose(); log.mockRestore(); }
  });

  it.each([false, true])("routes an actual advanced probe-grid binding with fallback=%s", async (allowFallback) => {
    const fixture = rootDevice();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const grid = new NativeLightProbeGrid({ min: [-1, -1, -1], max: [1, 1, 1], dimensions: [1, 1, 1], backend: "webgpu" });
    grid.setProbeIrradiance(0, 0, 0, [0.2, 0.3, 0.4]);
    const data = grid.renderData();
    const source = { kind: "probe-grid" as const, data, intensity: 1, outside: "clamp" as const, assertCurrent: () => { if (grid.revision !== data.revision) throw new Error("probe changed"); }, current: () => grid.renderData() };
    const unregister = registerFrameContributor({ id: "prd01.deferred-advanced-light-contract", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"], collect: (items, context) => items.map((item) => stampAdvancedLightingBinding(item, context, source)) });
    const app = createAuraApp(fixture.canvas, {
      scene: scene().add(lights.ambient({ intensity: 1 })).add(effects.antiAlias({ mode: "off" })).add(primitives.box({ name: "box" })),
      renderer: { backend: "webgpu", drawingPath: { mode: "deferred", allowFallback }, shaderFailures: "throw" },
      autoStart: false, resize: false, diagnostics: false, pixelRatio: 1, strict: false
    });
    try {
      await app.ready();
      const mountError = app.diagnostics().errors.join(" ");
      if (allowFallback) {
        expect(mountError).toBe("");
        const renderer = (app as unknown as Record<symbol, { drawingPathDiagnostics: unknown; device: WebGPUDevice }>)[Symbol.for("a3d.prd01.renderer")];
        const interop = (renderer.device as unknown as { resourceInterop: WebGPUResourceInterop }).resourceInterop;
        const submit = vi.spyOn(interop, "submit");
        await app.stepAsync(0);
        expect(renderer.drawingPathDiagnostics).toMatchObject({ requested: "deferred", active: "forward", fallbackReason: expect.stringMatching(/advanced lighting/i) });
        const nativeGrid = fixture.textureResources.filter(({ descriptor }) => descriptor.label === data.texture.label).at(-1)!.resource;
        const draw = submit.mock.calls.flatMap(([commands, accesses]) => {
          if (!accesses?.some((access) => access.resource === nativeGrid && access.mode === "read")) return [];
          return commands.flatMap((command) => (command as { draws?: MockDraw[] }).draws ?? []);
        }).find((entry) => entry.count > 0 && entry.groups.some((group) => group.entries?.some((binding) => binding.binding === 56 && (binding.resource as { texture?: unknown }).texture === nativeGrid)));
        expect(draw).toBeDefined();
        const materialGroup = draw!.groups.find((group) => group.entries?.some((binding) => binding.binding === 56))!;
        const materialBuffer = (materialGroup.entries!.find((binding) => binding.binding === 0)!.resource as { buffer: object }).buffer;
        const material = fixture.uploads.find((upload) => upload.buffer === materialBuffer)!.data;
        const view = new DataView(material.buffer, material.byteOffset, material.byteLength);
        const readVec4 = (name: string) => Array.from({ length: 4 }, (_, index) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS[name]! + index * 4, true));
        expect(readVec4("advancedMin")).toEqual([-1, -1, -1, 0]);
        expect(readVec4("advancedMax")).toEqual([1, 1, 1, 0]);
        expect(readVec4("advancedDimensions")).toEqual([1, 1, 1, 0]);
        expect(readVec4("advancedIntensity")).toEqual([1, 1, 0, 0]);
        const textureUpload = fixture.textureUploads.find((upload) => upload.texture === nativeGrid)!.data;
        expect(Array.from(new Float32Array(textureUpload.buffer, textureUpload.byteOffset, textureUpload.byteLength / 4))).toEqual(Array.from(data.texture.data as Float32Array));
        submit.mockRestore();
      } else if (mountError) {
        expect(mountError).toMatch(/deferred.*advanced lighting/i);
        await expect(app.stepAsync(0)).rejects.toThrow(/asynchronous submission unavailable/i);
      } else {
        await expect(app.stepAsync(0)).rejects.toThrow(/deferred.*advanced lighting/i);
      }
    } finally { app.dispose(); unregister(); grid.dispose(); log.mockRestore(); }
  });
});
