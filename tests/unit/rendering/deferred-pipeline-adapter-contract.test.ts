import { describe, expect, it, vi } from "vitest";
import { integrateGgxDfg } from "../../../packages/rendering/src/program/DFGLutData";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Material } from "../../../packages/rendering/src/Material";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { DeferredPipeline, nativeDrawingSceneFromRenderItems, type NativeDrawingFrame } from "../../../packages/rendering/src/webgpu/DeferredPipeline";
import { MeshletPipeline } from "../../../packages/rendering/src/webgpu/MeshletPipeline";
import { VisibilityBufferPipeline } from "../../../packages/rendering/src/webgpu/VisibilityBufferPipeline";

const item = () => ({ geometry: Geometry.triangle() });
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const frame = (): NativeDrawingFrame => ({
  scene: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), triangleMaterials: new Uint32Array([0]), materials: [{ baseColor: [1, 1, 1, 1] }] },
  surface: { view: {}, width: 1, height: 1 }, viewProjection: identity
});

function mockDevice() {
  let loseDevice!: () => void;
  const lost = new Promise<void>((resolve) => { loseDevice = resolve; });
  const resources: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const uploads: { label: string | undefined; data: Float32Array }[] = [];
  const modules: string[] = [];
  const textures: { format?: string; usage?: number }[] = [];
  const pipelines: Record<string, unknown>[] = [];
  const passes: Record<string, unknown>[] = [];
  const groups: { entries: { binding: number; resource: unknown }[] }[] = [];
  const resource = () => { const value = { destroy: vi.fn() }; resources.push(value); return value; };
  const pipeline = { getBindGroupLayout: () => ({}) };
  const pass = { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} };
  const device = {
    lost,
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxStorageBuffersPerShaderStage: 8 },
    queue: { writeBuffer(buffer: { label?: string }, _offset: number, data: ArrayBufferView) { uploads.push({ label: buffer.label, data: new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) }); }, submit() {}, onSubmittedWorkDone: vi.fn<() => Promise<void>>() },
    createBuffer: ({ label }: { label?: string }) => ({ ...resource(), label }),
    createTexture: (descriptor: { format?: string; usage?: number }) => { textures.push(descriptor); return { ...resource(), createView: () => ({}) }; },
    createShaderModule: ({ code }: { code: string }) => { modules.push(code); return {}; },
    createRenderPipeline: (descriptor: Record<string, unknown>) => { pipelines.push(descriptor); return pipeline; },
    createBindGroup: (descriptor: { entries: { binding: number; resource: unknown }[] }) => { groups.push(descriptor); return {}; },
    createCommandEncoder: () => ({ beginRenderPass: (descriptor: Record<string, unknown>) => { passes.push(descriptor); return pass; }, finish: () => ({}) })
  };
  return { device, resources, uploads, modules, textures, pipelines, passes, groups, loseDevice };
}

async function settle(): Promise<void> { await Promise.resolve(); await Promise.resolve(); }

describe("native drawing adapter contracts", () => {
  it("reads base metadata and effective parameters from MaterialInstance, including structural wrappers", () => {
    const base = new UnlitMaterial({ color: [0.1, 0.2, 0.3, 1] });
    const instance = new MaterialInstance(base);
    instance.setOverride("u_baseColor", [0.8, 0.4, 0.2, 1]);
    expect(nativeDrawingSceneFromRenderItems([{ ...item(), material: base }]).materials[0]!.baseColor).toEqual([0.1, 0.2, 0.3, 1]);
    expect(nativeDrawingSceneFromRenderItems([{ ...item(), material: instance }]).materials[0]!.baseColor).toEqual([0.8, 0.4, 0.2, 1]);
    const foreignWrapper = { baseMaterial: base, getParameter: instance.getParameter.bind(instance), getParameters: instance.getParameters.bind(instance) } as unknown as MaterialInstance;
    expect(nativeDrawingSceneFromRenderItems([{ ...item(), material: foreignWrapper }]).materials[0]!.baseColor).toEqual([0.8, 0.4, 0.2, 1]);
    instance.setOverride("u_alphaCutoff", 0.5);
    expect(() => nativeDrawingSceneFromRenderItems([{ ...item(), material: instance }])).toThrow(/alpha masks/);
    instance.clearOverride("u_alphaCutoff");
    instance.setOverride("u_instanceCount", 2);
    expect(() => nativeDrawingSceneFromRenderItems([{ ...item(), material: instance }])).toThrow(/material-driven instances/);
    expect(() => nativeDrawingSceneFromRenderItems([{ ...item(), material: new UnlitMaterial({ roundPoints: true }) }])).toThrow(/round points/);
    expect(() => nativeDrawingSceneFromRenderItems([{ ...item(), material: new MaterialInstance(new Material({ shaderKey: "other" })) }])).toThrow(/standard unlit/);
    const transparent = new MaterialInstance(new UnlitMaterial({ renderState: { blend: true, depthWrite: false } }));
    expect(() => nativeDrawingSceneFromRenderItems([{ ...item(), material: transparent }])).toThrow(/renderState/);
    expect(nativeDrawingSceneFromRenderItems([item()]).materials[0]!.baseColor).toEqual([1, 1, 1, 1]);
  });

  it("reads separate vertex streams and shader-decoded normalized values", () => {
    const format = new VertexFormat([
      { semantic: "normal", components: 3, offset: 0 },
      { semantic: "position", components: 3, offset: 0, type: "int16", normalized: true, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 6 }]);
    const normals = new VertexBuffer(format, 3);
    const positions = new VertexBuffer(format, 3, 1);
    for (let index = 0; index < 3; index++) normals.setAttribute(index, "normal", [0, 0, 1]);
    positions.setAttribute(0, "position", [32767, 0, 0]);
    positions.setAttribute(1, "position", [0, 32767, 0]);
    positions.setAttribute(2, "position", [-32768, 0, 0]);
    const geometry = new Geometry(normals, null, "triangles", undefined, [positions]);
    const scene = nativeDrawingSceneFromRenderItems([{ geometry, material: new UnlitMaterial() }]);
    expect(Array.from(scene.positions)).toEqual([1, 0, 0, 0, 1, 0, -1, 0, 0]);
    expect(Array.from(scene.normals!)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("rejects vertex colors and instance counts it cannot reproduce", () => {
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: "color", components: 4, offset: 12 }], 28);
    const vertices = new VertexBuffer(format, 3);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((position, index) => {
      vertices.setAttribute(index, "position", position);
      vertices.setAttribute(index, "color", [0.5, 1, 1, 1]);
    });
    const geometry = new Geometry(vertices);
    expect(() => nativeDrawingSceneFromRenderItems([{ geometry, material: new UnlitMaterial() }])).toThrow(/vertex color/);
    expect(() => nativeDrawingSceneFromRenderItems([{ ...item(), instanceCount: 2 }])).toThrow(/instanced/);
    const tagged = { ...item(), [Symbol.for("@aura3d/rendering/advanced-lighting-bindings")]: {} };
    expect(() => nativeDrawingSceneFromRenderItems([tagged])).toThrow(/advanced lighting/);
  });

  it("rejects position layouts that do not satisfy the forward shader input", () => {
    const integerFormat = new VertexFormat([{ semantic: "position", components: 3, offset: 0, type: "int32", integer: true }], 12);
    const wrongLocation = new VertexFormat([{ semantic: "position", components: 3, offset: 0, shaderLocation: 3 }], 12);
    for (const format of [integerFormat, wrongLocation]) {
      const vertices = new VertexBuffer(format, 3);
      expect(() => nativeDrawingSceneFromRenderItems([{ geometry: new Geometry(vertices) }])).toThrow(/floating-point position input/);
    }
  });

  it("rejects reflected and geometry-local transforms instead of changing forward draw behavior", () => {
    const reflected = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const geometryMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1];
    expect(() => nativeDrawingSceneFromRenderItems([{ ...item(), modelMatrix: reflected }])).toThrow(/reflected/);
    expect(() => nativeDrawingSceneFromRenderItems([{ ...item(), geometryMatrix }])).toThrow(/geometryMatrix/);
    expect(nativeDrawingSceneFromRenderItems([{ ...item(), geometryMatrix: identity }]).triangleMaterials).toHaveLength(1);
  });

  it("admits only explicitly requested, untextured generated physical materials", () => {
    const base = new PBRMaterial({ baseColor: [0.5, 0.25, 0.75, 1], metallic: 0.6, roughness: 0.3, emissiveColor: [0.2, 0.1, 0], emissiveStrength: 0.5, sheenRoughnessFactor: 0.3 });
    const instance = new MaterialInstance(base);
    instance.setOverride("u_metallic", 0.8);
    const input = { geometry: Geometry.litTriangle(), material: instance };
    expect(() => nativeDrawingSceneFromRenderItems([input])).toThrow(/standard unlit/);
    const converted = nativeDrawingSceneFromRenderItems([input], { physicalModel: "generated-metallic-roughness" });
    expect(converted.materials[0]).toEqual({ baseColor: [0.5, 0.25, 0.75, 1], shading: "physical", metallic: 0.8, roughness: 0.3, emissive: [0.1, 0.05, 0] });
    instance.setOverride("u_clearcoatFactor", 0.4);
    expect(() => nativeDrawingSceneFromRenderItems([input], { physicalModel: "generated-metallic-roughness" })).toThrow(/physical extensions/);
    instance.clearOverride("u_clearcoatFactor");
    instance.setOverride("u_specularAntialiasing", 0);
    expect(() => nativeDrawingSceneFromRenderItems([input], { physicalModel: "generated-metallic-roughness" })).toThrow(/physical extensions/);
    instance.clearOverride("u_specularAntialiasing");
    instance.setOverride("u_specularIntensity", 0.5);
    expect(() => nativeDrawingSceneFromRenderItems([input], { physicalModel: "generated-metallic-roughness" })).toThrow(/physical extensions/);
    instance.setOverride("u_specularIntensity", 1);
    expect(nativeDrawingSceneFromRenderItems([input], { physicalModel: "generated-metallic-roughness" }).materials[0]).toEqual(converted.materials[0]);
    instance.setOverride("u_materialEnvironmentIntensity", 0.5);
    expect(() => nativeDrawingSceneFromRenderItems([input], { physicalModel: "generated-metallic-roughness" })).toThrow(/physical extensions/);
    expect(() => nativeDrawingSceneFromRenderItems([{ geometry: Geometry.triangle(), material: base }], { physicalModel: "generated-metallic-roughness" })).toThrow(/normal/);
    class CustomPBRMaterial extends PBRMaterial {}
    expect(() => nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new CustomPBRMaterial() }], { physicalModel: "generated-metallic-roughness" })).toThrow(/custom physical material/);
    expect(() => nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new Material({ shaderKey: "aura3d/pbr-direct" }) }], { physicalModel: "generated-metallic-roughness" })).toThrow(/custom physical material/);
  });
});

describe("native drawing resource lifetime", () => {
  it("uploads physical material and DFG data, inverse projection and a sampleable depth attachment", () => {
    const mock = mockDevice();
    mock.device.queue.onSubmittedWorkDone.mockImplementation(() => new Promise<void>(() => {}));
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba8unorm" });
    const physicalScene = nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new PBRMaterial({ baseColor: [0.5, 0.25, 0.75, 1], metallic: 0.5, roughness: 0.25 }) }], { physicalModel: "generated-metallic-roughness" });
    const projection = [2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 5, 0, 0, 0, 0, 1];
    const result = pipeline.render({ ...frame(), scene: physicalScene, viewProjection: projection, physical: { cameraPosition: [0, 0, 3] }, light: { direction: [0, 0, 1], color: [2, 1, 0.5], ambient: [0.2, 0.1, 0.05] } });
    expect(result).toMatchObject({ active: "deferred", triangles: 1 });
    const materialData = mock.uploads.find((upload) => upload.label === "aura-native-materials")!.data;
    expect(Array.from(materialData)).toEqual([0.5, 0.25, 0.75, 0.5, 0, 0, 0, 3.25]);
    const frameData = mock.uploads.find((upload) => upload.label === "aura-native-frame")!.data;
    expect(Array.from(frameData.slice(32, 48))).toEqual([0.5, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, Math.fround(0.2), 0, 0, 0, 0, 1]);
    const lookup = mock.uploads.find((upload) => upload.label === "aura-native-dfg")!.data;
    expect(lookup).toHaveLength(512);
    // 5.0 independence rule: the DFG table is Aura3D's own GGX split-sum integration
    // (program/DFGLutData.ts, replacing the r185 table, 26eae82e2); each RG texel is
    // that integral at the texel centre, stored as binary16.
    for (const [x, y] of [[0, 0], [4, 8], [15, 15]] as const) {
      const [a, b] = integrateGgxDfg((x + 0.5) / 16, (y + 0.5) / 16);
      const offset = (y * 16 + x) * 2;
      expect(Math.abs(lookup[offset]! - a)).toBeLessThan(Math.max(a, 2 ** -14) * 2 ** -10);
      expect(Math.abs(lookup[offset + 1]! - b)).toBeLessThan(Math.max(b, 2 ** -14) * 2 ** -10);
    }
    expect(mock.textures.find((texture) => texture.format === "depth32float")?.usage).toBe(0x14);
    expect(mock.modules.some((code) => code.includes("a3dPhysicalDirect") && code.includes("textureLoad(sceneDepth"))).toBe(true);
    pipeline.dispose();
  });

  it("rejects invalid physical camera contracts before submission", () => {
    const mock = mockDevice();
    const submit = vi.spyOn(mock.device.queue, "submit");
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba8unorm" });
    const physicalScene = nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new PBRMaterial() }], { physicalModel: "generated-metallic-roughness" });
    expect(() => pipeline.render({ ...frame(), scene: physicalScene })).toThrow(/explicit camera/);
    expect(() => pipeline.render({ ...frame(), scene: physicalScene, viewProjection: new Float32Array(16), physical: { cameraPosition: [0, 0, 3] }, light: { direction: [0, 0, 1], color: [1, 1, 1], ambient: [0, 0, 0] } })).toThrow(/invertible/);
    expect(submit).not.toHaveBeenCalled();
  });

  it("shades all four G-buffer samples before resolving to the one-sample surface", () => {
    const mock = mockDevice();
    mock.device.queue.onSubmittedWorkDone.mockImplementation(() => new Promise<void>(() => {}));
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba8unorm", sampleCount: 4 });
    const physicalScene = nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new PBRMaterial() }], { physicalModel: "generated-metallic-roughness" });
    const surface = { view: {}, width: 4, height: 4 };
    pipeline.render({ scene: physicalScene, viewProjection: identity, surface, physical: { cameraPosition: [0, 0, 3] }, light: { direction: [0, 0, 1], color: [1, 1, 1], ambient: [0, 0, 0] } });
    expect(mock.pipelines.every((descriptor) => (descriptor.multisample as { count: number }).count === 4)).toBe(true);
    expect(mock.textures).toHaveLength(5);
    expect(mock.textures.every((texture) => (texture as { sampleCount?: number }).sampleCount === 4)).toBe(true);
    const resolveAttachment = (mock.passes[1]!.colorAttachments as { resolveTarget?: unknown; storeOp: string }[])[0]!;
    expect(resolveAttachment.resolveTarget).toBe(surface.view);
    expect(resolveAttachment.storeOp).toBe("discard");
    expect(mock.modules.some((code) => code.includes("texture_depth_multisampled_2d") && code.includes("textureLoad(sceneDepth, xy, i32(sampleIndex))") && code.includes("@builtin(sample_index)"))).toBe(true);
    pipeline.dispose();
  });

  it.each([1, 4] as const)("preserves borrowed %i× color, depth and stencil through the owner submission", (sampleCount) => {
    const mock = mockDevice();
    mock.device.queue.onSubmittedWorkDone.mockImplementation(() => new Promise<void>(() => {}));
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba16float", sampleCount });
    const colorView = { destroy: vi.fn() }, depthAttachmentView = { destroy: vi.fn() }, depthSampleView = { destroy: vi.fn() };
    const resolveView = sampleCount === 4 ? { destroy: vi.fn() } : undefined;
    const outputView = resolveView ?? colorView;
    const submit = vi.fn();
    const clearColor = [0.2, 0.3, 0.4, 1] as const;
    const scene = nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new PBRMaterial() }], { physicalModel: "generated-metallic-roughness" });
    const shared = { colorView, ...(resolveView ? { resolveView } : {}), depthAttachmentView, depthSampleView, colorFormat: "rgba16float", depthFormat: "depth24plus-stencil8" as const, width: 4, height: 4, sampleCount, loadOp: "load" as const, clearColor, depthClearValue: 1, stencilClearValue: 7, submit };
    const queueSubmit = vi.spyOn(mock.device.queue, "submit");
    pipeline.render({ scene, viewProjection: identity, surface: { view: outputView, width: 4, height: 4 }, physical: { cameraPosition: [0, 0, 3] }, light: { direction: [0, 0, 1], color: [1, 1, 1], ambient: [0, 0, 0] }, deferredAttachments: shared });
    expect(submit).toHaveBeenCalledOnce();
    expect(queueSubmit).not.toHaveBeenCalled();
    expect(mock.textures).toHaveLength(3); // The G-buffer is transient; all target attachments are borrowed.
    expect(mock.passes[0]!.depthStencilAttachment).toEqual({ view: depthAttachmentView, depthClearValue: 1, depthLoadOp: "load", depthStoreOp: "store", stencilClearValue: 7, stencilLoadOp: "load", stencilStoreOp: "store" });
    expect((mock.passes[1]!.colorAttachments as unknown[])[0]).toEqual({ view: colorView, ...(resolveView ? { resolveTarget: resolveView } : {}), loadOp: "load", clearValue: clearColor, storeOp: "store" });
    expect(mock.groups.at(-1)!.entries.find((entry) => entry.binding === 4)?.resource).toBe(depthSampleView);
    expect(mock.pipelines.find((descriptor) => descriptor.label === "aura-deferred-shared-depth-geometry")?.depthStencil).toMatchObject({ format: "depth24plus-stencil8" });
    expect(mock.modules.some((code) => code.includes("if (frame.viewport.z > 0.5) { discard; }"))).toBe(true);
    expect(mock.uploads.find((upload) => upload.label === "aura-native-frame")!.data[54]).toBe(1);
    pipeline.dispose();
    for (const view of [colorView, depthAttachmentView, depthSampleView, resolveView]) if (view) expect(view.destroy).not.toHaveBeenCalled();
  });

  it("uses the borrowed clear values and rejects an inconsistent output before submission", () => {
    const mock = mockDevice();
    mock.device.queue.onSubmittedWorkDone.mockImplementation(() => new Promise<void>(() => {}));
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba16float" });
    const colorView = {};
    const submit = vi.fn();
    const shared = { colorView, depthAttachmentView: {}, depthSampleView: {}, colorFormat: "rgba16float", depthFormat: "depth24plus-stencil8" as const, width: 1, height: 1, sampleCount: 1 as const, loadOp: "clear" as const, clearColor: [0.25, 0.5, 0.75, 1] as const, depthClearValue: 1, stencilClearValue: 3, submit };
    expect(() => pipeline.render({ ...frame(), deferredAttachments: shared })).toThrow(/deferredAttachments/);
    expect(() => pipeline.render({ ...frame(), surface: { view: colorView, width: 1, height: 1 }, deferredAttachments: { ...shared, depthClearValue: 0 } })).toThrow(/standard depth/);
    expect(submit).not.toHaveBeenCalled();
    pipeline.render({ ...frame(), surface: { view: colorView, width: 1, height: 1 }, clearColor: [1, 1, 1, 1], deferredAttachments: shared });
    expect(mock.uploads.find((upload) => upload.label === "aura-native-frame")!.data.slice(28, 32)).toEqual(new Float32Array(shared.clearColor));
    expect(mock.passes[0]!.depthStencilAttachment).toMatchObject({ depthClearValue: 1, depthLoadOp: "clear", stencilClearValue: 3, stencilLoadOp: "clear" });
    expect((mock.passes[1]!.colorAttachments as { clearValue: readonly number[] }[])[0]!.clearValue).toEqual(shared.clearColor);
    expect(submit).toHaveBeenCalledOnce();
    pipeline.dispose();
  });

  it("binds a borrowed probe and records its texture as a fenced submission read", () => {
    const mock = mockDevice();
    mock.device.queue.onSubmittedWorkDone.mockImplementation(() => new Promise<void>(() => {}));
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba16float", sampleCount: 4 });
    const colorView = {}, resolveView = {}, resource = { destroy: vi.fn() }, view = { destroy: vi.fn() }, sampler = { destroy: vi.fn() };
    const assertUsable = vi.fn();
    const submit = vi.fn();
    const shared = { colorView, resolveView, depthAttachmentView: {}, depthSampleView: {}, colorFormat: "rgba16float", depthFormat: "depth24plus-stencil8", width: 4, height: 4, sampleCount: 4, loadOp: "load" as const, clearColor: [0, 0, 0, 1] as const, depthClearValue: 1, stencilClearValue: 0, submit };
    const scene = nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new PBRMaterial() }], { physicalModel: "generated-metallic-roughness" });
    const probe = { lease: { device: mock.device, resource, view, sampler, assertUsable }, sh: new Float32Array(28), mipCount: 4, rotation: 0.25, diffuseIntensity: 1, specularIntensity: 2, ambient: [0.1, 0.2, 0.3] as const, hemiSky: [0, 0, 0] as const, hemiGround: [0, 0, 0] as const, hemiDirection: [0, 1, 0] as const };
    const physicalFrame = { scene, viewProjection: identity, surface: { view: resolveView, width: 4, height: 4 }, physical: { cameraPosition: [0, 0, 3] as const, probe, indirectFraction: true }, light: { direction: [0, 0, 1] as const, color: [0, 0, 0] as const, ambient: [0, 0, 0] as const } };
    expect(() => pipeline.render(physicalFrame)).toThrow(/submission lease/);
    expect(submit).not.toHaveBeenCalled();
    pipeline.render({ ...physicalFrame, deferredAttachments: shared });
    expect(assertUsable).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(expect.any(Array), [resource]);
    const group = mock.groups.at(-1)!;
    expect(group.entries.find((entry) => entry.binding === 7)?.resource).toBe(sampler);
    expect(group.entries.find((entry) => entry.binding === 8)?.resource).toBe(view);
    const uniforms = mock.uploads.find((upload) => upload.label === "aura-deferred-probe")!.data;
    expect(Array.from(uniforms.slice(28, 32))).toEqual([4, 0.25, 1, 2]);
    expect(mock.uploads.find((upload) => upload.label === "aura-native-frame")!.data[55]).toBe(1);
    expect(mock.modules.some((code) => code.includes("a3dDeferredProbeIndirect(n, view, material") && code.includes("texture_depth_multisampled_2d") && code.includes("@builtin(sample_index)"))).toBe(true);
    expect(mock.modules.some((code) => code.includes("alpha = 2.0 + clamp(dot(ambient, luma) / max(dot(color, luma), 0.0001)"))).toBe(true);
    pipeline.dispose();
    for (const borrowed of [resource, view, sampler]) expect(borrowed.destroy).not.toHaveBeenCalled();
  });

  it("fails closed when the HDR indirect-fraction tag cannot match the target or material", () => {
    const mock = mockDevice();
    const physicalScene = nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new PBRMaterial() }], { physicalModel: "generated-metallic-roughness" });
    const physical = { cameraPosition: [0, 0, 3] as const, indirectFraction: true };
    const light = { direction: [0, 0, 1] as const, color: [0, 0, 0] as const, ambient: [0, 0, 0] as const };
    expect(() => new DeferredPipeline(mock.device, { outputFormat: "rgba8unorm" }).render({ ...frame(), scene: physicalScene, physical, light })).toThrow(/HDR target/);
    expect(() => new DeferredPipeline(mock.device, { outputFormat: "rgba16float" }).render({ ...frame(), physical, light })).toThrow(/physical materials/);
  });

  it("releases only transient allocations, after the fence, when the owner rejects submission", async () => {
    const mock = mockDevice();
    let finish!: () => void;
    const fence = new Promise<void>((resolve) => { finish = resolve; });
    mock.device.queue.onSubmittedWorkDone.mockImplementation(() => fence);
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba16float" });
    const colorView = { destroy: vi.fn() }, depthAttachmentView = { destroy: vi.fn() }, depthSampleView = { destroy: vi.fn() };
    const shared = { colorView, depthAttachmentView, depthSampleView, colorFormat: "rgba16float", depthFormat: "depth24plus-stencil8", width: 1, height: 1, sampleCount: 1, loadOp: "clear" as const, clearColor: [0, 0, 0, 1] as const, depthClearValue: 1, stencilClearValue: 0, submit: () => { throw new Error("stale lease"); } };
    expect(() => pipeline.render({ ...frame(), surface: { view: colorView, width: 1, height: 1 }, deferredAttachments: shared })).toThrow(/stale lease/);
    expect(mock.resources.length).toBeGreaterThan(0);
    // A throwing owner submit does not prove nothing was enqueued: transient
    // allocations stay pending until the queue fence, then are destroyed once.
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 0)).toBe(true);
    finish();
    await settle();
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
    for (const borrowed of [colorView, depthAttachmentView, depthSampleView]) expect(borrowed.destroy).not.toHaveBeenCalled();
    pipeline.dispose();
    await settle();
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("does not silently shade physical materials as Lambert in other native paths", () => {
    const mock = mockDevice();
    const submit = vi.spyOn(mock.device.queue, "submit");
    const physicalScene = nativeDrawingSceneFromRenderItems([{ geometry: Geometry.litTriangle(), material: new PBRMaterial() }], { physicalModel: "generated-metallic-roughness" });
    const physicalFrame = { ...frame(), scene: physicalScene, physical: { cameraPosition: [0, 0, 3] as const }, light: { direction: [0, 0, 1] as const, color: [1, 1, 1] as const, ambient: [0, 0, 0] as const } };
    expect(() => new VisibilityBufferPipeline(mock.device, { outputFormat: "rgba8unorm" }).render(physicalFrame)).toThrow(/physical materials require the deferred renderer/);
    // This mock lacks compute, so meshlet uses its explicit forward fallback.
    expect(() => new MeshletPipeline(mock.device, { outputFormat: "rgba8unorm", allowFallback: true }).render(physicalFrame)).toThrow(/physical materials require the deferred renderer/);
    expect(submit).not.toHaveBeenCalled();
  });

  it("retains submitted allocations after a failed or throwing fence and releases them on device loss", async () => {
    const mock = mockDevice();
    mock.device.queue.onSubmittedWorkDone.mockImplementationOnce(() => Promise.reject(new Error("fence failed"))).mockImplementation(() => { throw new Error("fence unavailable"); });
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba8unorm" });
    pipeline.render(frame());
    await settle();
    pipeline.dispose();
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 0)).toBe(true);
    mock.loseDevice();
    await settle();
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("releases earlier failed-fence allocations after a later successful queue fence", async () => {
    const mock = mockDevice();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    mock.device.queue.onSubmittedWorkDone.mockImplementationOnce(() => Promise.reject(new Error("fence failed"))).mockImplementation(() => pending);
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba8unorm" });
    pipeline.render(frame());
    await settle();
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 0)).toBe(true);
    finish();
    await settle();
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
    pipeline.dispose();
    mock.loseDevice();
    await settle();
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("does not release resources from later frames when an earlier fence finishes", async () => {
    const mock = mockDevice();
    const finishes: (() => void)[] = [];
    mock.device.queue.onSubmittedWorkDone.mockImplementation(() => new Promise<void>((resolve) => { finishes.push(resolve); }));
    const pipeline = new DeferredPipeline(mock.device, { outputFormat: "rgba8unorm" });
    pipeline.render(frame());
    const firstFrameCount = mock.resources.length;
    pipeline.render(frame());
    expect(finishes).toHaveLength(4);
    finishes[0]!();
    await settle();
    expect(mock.resources.slice(0, 4).every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
    expect(mock.resources.slice(4).every((resource) => resource.destroy.mock.calls.length === 0)).toBe(true);
    finishes[1]!();
    await settle();
    expect(mock.resources.slice(0, firstFrameCount).every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
    expect(mock.resources.slice(firstFrameCount).every((resource) => resource.destroy.mock.calls.length === 0)).toBe(true);
    finishes[3]!();
    await settle();
    expect(mock.resources.every((resource) => resource.destroy.mock.calls.length === 1)).toBe(true);
  });
});
