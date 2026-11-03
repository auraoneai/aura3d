import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { camera, createAuraApp, defineAuraAssets, gaussianSplat, group, material, primitives, scene } from "../../../packages/engine/src/public/index";
import { compileScene, registerNodeHandler, updateCompiledScene, type RuntimeGaussianSplatDraw } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { asRuntimeImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { isKnownNodeKind } from "../../../packages/engine/src/agent-api/compiler/handlers";
import { analyzeProductionBridgeEligibility, declaresWebGLContent } from "../../../packages/engine/src/agent-api/compiler/observations";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { GaussianSplatRenderer, gaussianSplatGpuInstanceBytes } from "../../../packages/rendering/src/GaussianSplatRenderer";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } });
const sha = (bytes: Uint8Array) => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
const binary = () => {
  const bytes = new Uint8Array(32), view = new DataView(bytes.buffer);
  [0, 0, 0, 0.2, 0.2, 0.2].forEach((value, index) => view.setFloat32(index * 4, value, true));
  bytes.set([255, 128, 64, 255, 255, 128, 128, 128], 24);
  return bytes;
};
const instancedGlb = (single = false, multipleClouds = false) => {
  const values = [0, 0, 0, 0.2, 0.2, 0.2, 0, 0, 0, 1, 1, 0, 0, 0];
  const bin = new Uint8Array(values.length * 4), binaryView = new DataView(bin.buffer);
  values.forEach((value, i) => binaryView.setFloat32(i * 4, value, true));
  let offset = 0;
  const sizes = [3, 3, 4, 1, 3];
  const bufferViews = sizes.map((size) => { const view = { buffer: 0, byteOffset: offset, byteLength: size * 4 }; offset += size * 4; return view; });
  const accessors = sizes.map((size, i) => ({ bufferView: i, componentType: 5126, count: 1, type: size === 1 ? "SCALAR" : `VEC${size}` }));
  const prefix = "KHR_gaussian_splatting:";
  const primitive = { mode: 0, extensions: { KHR_gaussian_splatting: { kernel: "ellipse", colorSpace: "lin_rec709_display" } },
    attributes: { POSITION: 0, [`${prefix}SCALE`]: 1, [`${prefix}ROTATION`]: 2, [`${prefix}OPACITY`]: 3, [`${prefix}SH_DEGREE_0_COEF_0`]: 4 } };
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, buffers: [{ byteLength: bin.length }], bufferViews, accessors,
    meshes: multipleClouds ? [{ primitives: [primitive] }, { primitives: [primitive] }] : [{ primitives: [primitive] }],
    nodes: multipleClouds ? [{ mesh: 0, translation: [1, 0, 0] }, { mesh: 1, translation: [-2, 0, 0] }]
      : single ? [{ mesh: 0 }] : [{ translation: [1, 0, 0], children: [1] }, { mesh: 0, translation: [1, 3, 4] }, { mesh: 0, translation: [-2, 0, 0] }],
    scenes: [{ nodes: multipleClouds ? [0, 1] : single ? [0] : [0, 2] }], scene: 0
  }));
  const jsonSize = (json.length + 3) & ~3, result = new Uint8Array(12 + 8 + jsonSize + 8 + bin.length), view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.length, true);
  view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true); result.fill(32, 20, 20 + jsonSize); result.set(json, 20);
  const binHeader = 20 + jsonSize; view.setUint32(binHeader, bin.length, true); view.setUint32(binHeader + 4, 0x004e4942, true); result.set(bin, binHeader + 8);
  return result;
};
const asset = (bytes: Uint8Array, format: "splat" | "glb" = "splat") => defineAuraAssets({ cloud: {
  type: "gaussian-splat", format, url: `https://assets.example/cloud.${format}`, hash: sha(bytes),
  metadata: { sourcePath: "public/aura-assets/cloud" }
} }).cloud;
const response = (bytes: Uint8Array) => new Response(new Uint8Array(bytes).buffer, { headers: { "content-type": "application/octet-stream" } });
const draws = (source: unknown): readonly RuntimeGaussianSplatDraw[] => (source as { gaussianSplats?: readonly RuntimeGaussianSplatDraw[] }).gaussianSplats ?? [];
const anchor = (matrix: Float32Array, pivot: readonly [number, number, number] = [0, 0, 0]) => [
  matrix[12]! + matrix[0]! * pivot[0] + matrix[4]! * pivot[1] + matrix[8]! * pivot[2],
  matrix[13]! + matrix[1]! * pivot[0] + matrix[5]! * pivot[1] + matrix[9]! * pivot[2],
  matrix[14]! + matrix[2]! * pivot[0] + matrix[6]! * pivot[1] + matrix[10]! * pivot[2]
];
function expectFacing(matrix: Float32Array, target: readonly [number, number, number], pivot?: readonly [number, number, number]) {
  const eye = anchor(matrix, pivot), direction = target.map((value, index) => value - eye[index]!);
  const length = Math.hypot(...direction), forwardLength = Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!);
  for (let i = 0; i < 3; i++) expect(-matrix[8 + i]! / forwardLength).toBeCloseTo(direction[i]! / length, 5);
}
const context = (device: MockRenderDevice, registry: ReturnType<typeof createAuraRuntimeNodeRegistry>, signal?: AbortSignal): MountSceneCompileContext => ({
  renderer: { device }, assets: undefined, quality: { tier: "high" } as MountSceneCompileContext["quality"],
  strict: true, flags, degrade() {}, canvas: { width: 200, height: 100 } as HTMLCanvasElement,
  environmentLighting: () => ({ color: [1, 1, 1], intensity: 1 }), collectedLights: [], runtimeWarnings: new Set(), runtimeNodes: registry,
  ...(signal ? { request: { signal } } : {})
});
class FakeCanvas {
  width = 200; height = 100; clientWidth = 200; clientHeight = 100;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 200, height: 100, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}
function useMockRootDevice(): MockRenderDevice[] {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 200, innerHeight: 100, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
  const devices: MockRenderDevice[] = [];
  const create = Renderer.create.bind(Renderer);
  vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
    const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
    const device = renderer.device as MockRenderDevice;
    // Exercise root's WebGL selection with a command-validating mock, never a browser context.
    Object.defineProperty(device, "kind", { value: "webgl2" });
    Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
    devices.push(device);
    return renderer;
  });
  return devices;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("root Gaussian splat compilation", () => {
  it("exports a typed builder, recognizes splat-only content and rejects unverified assets", () => {
    const node = gaussianSplat(asset(binary())).toJSON();
    expect(isKnownNodeKind(node.kind)).toBe(true);
    expect(declaresWebGLContent([node])).toBe(true);
    expect(analyzeProductionBridgeEligibility([node]).eligible).toBe(true);
    const unsafe = defineAuraAssets({ cloud: { type: "gaussian-splat", format: "splat", url: "/unverified.splat" } }).cloud;
    expect(analyzeProductionBridgeEligibility([gaussianSplat(unsafe).toJSON()]).eligible).toBe(false);
    expect(() => gaussianSplat(asset(binary()), { maxSplats: 0 })).toThrow(/maxSplats/);
    expect(gaussianSplat(asset(binary()), { layers: 2 }).toJSON().layers).toBe(2);
    expect(() => gaussianSplat(asset(binary()), { layers: 2.5 })).toThrow(/32-bit mask/);
    expect(() => gaussianSplat(asset(binary()), { renderOrder: Infinity })).toThrow(/renderOrder/);
    expect(() => gaussianSplat(asset(binary()), { frustumCulled: "no" as never })).toThrow(/frustumCulled/);
    expect(() => gaussianSplat(asset(binary()), { defaultColorSpace: "invalid" as never })).toThrow(/color space/);
  });

  it("includes typed splat references in the public app asset diagnostics", () => {
    const bytes = binary();
    const app = createAuraApp(null, { scene: scene().add(gaussianSplat(asset(bytes))), autoStart: false });
    try {
      expect(app.diagnostics().assets).toEqual(expect.arrayContaining([expect.objectContaining({
        id: "cloud", type: "gaussian-splat", hash: sha(bytes), provenance: expect.objectContaining({ source: "typed-aura-assets-manifest" })
      })]));
    } finally { app.dispose(); }
  });

  it("honors a registered splat handler instead of acquiring the bridge asset twice", async () => {
    const bytes = binary(), fetch = vi.fn(async () => response(bytes)); vi.stubGlobal("fetch", fetch);
    const compile = vi.fn();
    const unregister = registerNodeHandler({ kind: "gaussian-splat", owner: "prd02", compile });
    const snapshot = scene().add(gaussianSplat(asset(bytes))).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    try {
      const compiled = await compileScene(snapshot, context(device, registry));
      expect(compile).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
      expect(draws(compiled.source)).toHaveLength(0); expect(device.getDiagnostics().buffers).toBe(0);
      compiled.dispose();
    } finally { unregister(); device.dispose(); }
  });

  it("loads verified bytes, submits the live world transform and releases GPU resources with its parent", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(group("parent", [gaussianSplat(asset(bytes), { position: [1, 0, 0] })], { position: [2, 0, 0] }).runtime({ id: "parent" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    registry.attachCompiled(compiled); registry.configure({ flags, getScene: () => snapshot, setScene: () => {} });
    expect(device.getDiagnostics().buffers).toBe(2);
    expect(asRuntimeImpl(compiled)!.loadedSplatAssetIds).toEqual(["cloud"]);
    let frame = draws(updateCompiledScene(compiled, snapshot, registry, 0));
    expect(frame).toHaveLength(1);
    expect(frame[0]!.modelMatrix[12]).toBeCloseTo(3);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    device.beginFrame(200, 100);
    frame[0]!.renderer.draw({ viewMatrix: identity, projectionMatrix: identity, modelMatrix: identity, viewport: [200, 100] });
    device.endFrame();
    expect(device.drawCommands).toHaveLength(1);
    registry.get("parent")!.setPosition(4, 0, 0);
    frame = draws(updateCompiledScene(compiled, snapshot, registry, 1));
    expect(frame[0]!.modelMatrix[12]).toBeCloseTo(5);
    registry.get("parent")!.setVisible(false);
    expect(draws(updateCompiledScene(compiled, snapshot, registry, 2))).toHaveLength(0);
    registry.get("parent")!.setVisible(true);
    expect(registry.remove("parent")).toBe(true);
    expect(asRuntimeImpl(compiled)!.loadedSplatAssetIds).toEqual([]);
    expect(draws(updateCompiledScene(compiled, snapshot, registry, 3))).toHaveLength(0);
    expect(device.getDiagnostics().buffers).toBe(0);
    compiled.dispose(); device.dispose();
  });

  it("routes opt-in gpuSort to the native sorter and reports the CPU fallback reason", async () => {
    expect(() => gaussianSplat(asset(binary()), { gpuSort: "yes" as unknown as boolean })).toThrow(/gpuSort must be boolean/);
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const flush = async (): Promise<void> => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const input = { viewMatrix: identity, projectionMatrix: identity, modelMatrix: identity, viewport: [200, 100] as const, cameraPosition: [0, 0, 2] as const };
    const snapshot = scene().add(gaussianSplat(asset(bytes), { gpuSort: true })).toJSON() as AuraSceneSnapshot;
    const plain = scene().add(gaussianSplat(asset(bytes))).toJSON() as AuraSceneSnapshot;

    // WebGL2/mock devices: requested, CPU sort, explicit reason.
    const mockDevice = new MockRenderDevice();
    const onMock = await compileScene(snapshot, context(mockDevice, createAuraRuntimeNodeRegistry(snapshot)));
    await flush();
    const mockRenderer = draws(onMock.source)[0]!.renderer;
    expect(mockRenderer.prepare(input).sortFallbackReason).toMatch(/requires WebGPU/);
    expect(asRuntimeImpl(onMock)!.splatSortStatus).toEqual([{ assetId: "cloud", status: { requested: true, lastBackend: "cpu", fallbackReason: expect.stringMatching(/requires WebGPU.*mock/) } }]);
    onMock.dispose(); mockDevice.dispose();

    // A WebGPU device whose native device cannot compile the sorter falls back with the sorter's reason.
    const gpuDevice = new MockRenderDevice();
    Object.defineProperty(gpuDevice, "kind", { value: "webgpu" });
    Object.defineProperty(gpuDevice, "nativeGpuDevice", { value: { queue: {} } });
    const onGpu = await compileScene(snapshot, context(gpuDevice, createAuraRuntimeNodeRegistry(snapshot)));
    // The sorter module loads lazily; wait for its rejection to settle.
    await vi.waitFor(() => expect(asRuntimeImpl(onGpu)!.splatSortStatus[0]!.status.fallbackReason).toBeTruthy());
    const status = asRuntimeImpl(onGpu)!.splatSortStatus[0]!.status;
    expect(status.requested).toBe(true);
    expect(status.fallbackReason).toMatch(/GPU sorting requires native device\.createShaderModule/);
    expect(draws(onGpu.source)[0]!.renderer.prepare(input).sortBackend).toBe("cpu");
    onGpu.dispose(); gpuDevice.dispose();

    // Without the option nothing is requested.
    const plainDevice = new MockRenderDevice();
    const onPlain = await compileScene(plain, context(plainDevice, createAuraRuntimeNodeRegistry(plain)));
    expect(asRuntimeImpl(onPlain)!.splatSortStatus).toEqual([{ assetId: "cloud", status: { requested: false, lastBackend: null } }]);
    onPlain.dispose(); plainDevice.dispose();
  });

  it("keeps identical authored nodes isolated across two compiled apps", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes)).runtime({ id: "cloud" })).toJSON() as AuraSceneSnapshot;
    const r1 = createAuraRuntimeNodeRegistry(snapshot), r2 = createAuraRuntimeNodeRegistry(snapshot);
    const d1 = new MockRenderDevice(), d2 = new MockRenderDevice();
    const [c1, c2] = await Promise.all([compileScene(snapshot, context(d1, r1)), compileScene(snapshot, context(d2, r2))]);
    expect(draws(c1.source)[0]!.renderer).not.toBe(draws(c2.source)[0]!.renderer);
    c1.dispose(); expect(d1.getDiagnostics().buffers).toBe(0); expect(d2.getDiagnostics().buffers).toBe(2);
    c2.dispose(); expect(d2.getDiagnostics().buffers).toBe(0); d1.dispose(); d2.dispose();
  });

  it("passes the authored color-space declaration to formats without embedded metadata", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes), { defaultColorSpace: "lin_rec709_display" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    expect(draws(compiled.source)[0]!.colorSpace).toBe("lin_rec709_display");
    compiled.dispose(); device.dispose();
  });

  it("publishes conservative instance bounds in scene space, including a four-sigma cutoff", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes), { position: [2, 3, 4], scale: [2, 1, 0.5], sigmaCutoff: 4 })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    const entry = draws(compiled.source)[0]!;
    expect(entry).toMatchObject({ layerMask: 1, frustumCulled: true, renderOrder: 0 });
    for (let axis = 0; axis < 3; axis++) {
      const extent = [1.6, 0.8, 0.4][axis]!, center = [2, 3, 4][axis]!;
      expect(entry.worldBounds.min[axis]).toBeLessThanOrEqual(center - extent);
      expect(entry.worldBounds.max[axis]).toBeGreaterThanOrEqual(center + extent);
      expect(entry.worldBounds.min[axis]).toBeCloseTo(center - extent, 4);
      expect(entry.worldBounds.max[axis]).toBeCloseTo(center + extent, 4);
    }
    compiled.dispose(); device.dispose();
  });

  it("publishes authored and live layer, culling, and render-order fields", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes), { layers: 4, frustumCulled: false, renderOrder: -2 }).runtime({ id: "cloud" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    expect(draws(compiled.source)[0]).toMatchObject({ layerMask: 4, frustumCulled: false, renderOrder: -2 });
    const handle = registry.get("cloud")!;
    handle.layers.set(1); handle.frustumCulled = true; handle.renderOrder = 3;
    expect(draws(updateCompiledScene(compiled, snapshot, registry, 1))[0]).toMatchObject({ layerMask: 2, frustumCulled: true, renderOrder: 3 });
    compiled.dispose(); device.dispose();
  });

  it("composes rotated, nonuniform ancestors with live child transforms", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const child = gaussianSplat(asset(bytes), { position: [1, 0, 0] }).runtime({ id: "child" });
    const parent = group("parent", [child], { position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1] }).runtime({ id: "parent" });
    const snapshot = scene().add(parent).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    let matrix = draws(updateCompiledScene(compiled, snapshot, registry, 0))[0]!.modelMatrix;
    expect(matrix[12]).toBeCloseTo(3); expect(matrix[13]).toBeCloseTo(2);
    expect(matrix[0]).toBeCloseTo(0); expect(matrix[1]).toBeCloseTo(2); expect(matrix[4]).toBeCloseTo(-1);
    registry.get("child")!.setPosition(0, 1, 0);
    matrix = draws(updateCompiledScene(compiled, snapshot, registry, 1))[0]!.modelMatrix;
    expect(matrix[12]).toBeCloseTo(2); expect(matrix[13]).toBeCloseTo(0);
    compiled.dispose(); device.dispose();
  });

  it("carries selected glTF instances through the asset and node coordinate bases", async () => {
    const bytes = instancedGlb(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes, "glb"), { position: [10, 0, 0] }).runtime({ id: "cloud" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    const entries = draws(updateCompiledScene(compiled, snapshot, registry, 0));
    expect(entries).toHaveLength(2);
    expect(entries[0]!.renderer).toBe(entries[1]!.renderer);
    expect([...entries[0]!.modelMatrix.slice(12, 15)]).toEqual([8, 3, -4]);
    expect([...entries[1]!.modelMatrix.slice(12, 15)]).toEqual([12, 0, 0]);
    expect(entries[0]!.colorSpace).toBe("lin_rec709_display");
    compiled.dispose(); expect(device.getDiagnostics().buffers).toBe(0); device.dispose();
  });

  it("acquires each distinct glTF cloud, preserves its instance transform, and releases every renderer", async () => {
    const bytes = instancedGlb(false, true); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes, "glb")).runtime({ id: "cloud" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    const entries = draws(updateCompiledScene(compiled, snapshot, registry, 0));
    expect(entries).toHaveLength(2); expect(entries[0]!.renderer).not.toBe(entries[1]!.renderer);
    expect(entries.map((entry) => entry.modelMatrix[12])).toEqual([-1, 2]);
    expect(device.getDiagnostics().buffers).toBe(4);
    expect(asRuntimeImpl(compiled)!.loadedSplatAssetIds).toEqual(["cloud"]);
    compiled.dispose(); expect(device.getDiagnostics().buffers).toBe(0); device.dispose();
  });

  it("enforces the aggregate GPU budget before allocating any distinct cloud", async () => {
    const bytes = instancedGlb(false, true); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes, "glb"), { maxGpuBytes: gaussianSplatGpuInstanceBytes(2) - 1 })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    await expect(compileScene(snapshot, context(device, registry))).rejects.toThrow(/maxGpuBytes/);
    expect(device.getDiagnostics()).toMatchObject({ buffers: 0, shaders: 0 }); device.dispose();
  });

  it("enforces the point budget over all distinct glTF clouds", async () => {
    const bytes = instancedGlb(false, true); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes, "glb"), { maxSplats: 1 })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    await expect(compileScene(snapshot, context(device, registry))).rejects.toThrow(/budget|point limit|count|limit/i);
    expect(device.getDiagnostics().buffers).toBe(0); device.dispose();
  });

  it("releases earlier cloud renderers if a later cloud allocation fails", async () => {
    class FailingDevice extends MockRenderDevice {
      allocations = 0;
      override createBuffer(...args: Parameters<MockRenderDevice["createBuffer"]>) {
        if (++this.allocations === 3) throw new Error("second cloud allocation failed");
        return super.createBuffer(...args);
      }
    }
    const bytes = instancedGlb(false, true); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes, "glb"))).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new FailingDevice();
    await expect(compileScene(snapshot, context(device, registry))).rejects.toThrow(/second cloud allocation failed/);
    expect(device.getDiagnostics()).toMatchObject({ buffers: 0, shaders: 0 }); device.dispose();
  });

  it("aborts an in-flight mount before allocating GPU resources", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto);
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const snapshot = scene().add(gaussianSplat(asset(bytes))).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice(), abort = new AbortController();
    const pending = compileScene(snapshot, context(device, registry, abort.signal));
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(signal).toBeDefined());
    abort.abort(); await rejected;
    expect(signal!.aborted).toBe(true); expect(device.getDiagnostics().buffers).toBe(0); device.dispose();
  });

  it("propagates createAuraApp scene replacement to an in-flight asset request", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); const devices = useMockRootDevice();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(gaussianSplat(asset(bytes))), autoStart: false, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    try {
      await vi.waitFor(() => expect(signal).toBeDefined());
      const oldReady = app.ready();
      app.setScene(scene());
      expect(signal!.aborted).toBe(true);
      await oldReady;
      await vi.waitFor(() => expect(devices[0]?.disposed).toBe(true));
      expect(devices[0]!.getDiagnostics().buffers).toBe(0);
    } finally { app.dispose(); }
  });

  it("mounts a splat-only scene through createAuraApp and submits it on the owned renderer", async () => {
    const bytes = instancedGlb(true); vi.stubGlobal("crypto", webcrypto); const devices = useMockRootDevice();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(gaussianSplat(asset(bytes, "glb")).runtime({ id: "cloud" })), autoStart: false, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    try {
      await app.ready();
      const device = devices[0]!;
      const draw = device.drawCommands.find((command) => command.label === "gaussian-splat");
      expect(draw).toBeDefined(); expect(draw!.instanceCount).toBe(1);
      expect(draw!.vertexBuffer.disposed).toBe(false);
      expect(app.nodes.remove!("cloud")).toBe(true);
      expect(draw!.vertexBuffer.disposed).toBe(true);
      app.step(1 / 60);
      expect(device.drawCommands.some((command) => command.label === "gaussian-splat")).toBe(false);
    } finally { app.dispose(); }
  });

  it("submits and releases all distinct glTF clouds through the public app", async () => {
    const bytes = instancedGlb(false, true); vi.stubGlobal("crypto", webcrypto); const devices = useMockRootDevice();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const submit = vi.spyOn(GaussianSplatRenderer.prototype, "submitPrepared");
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(gaussianSplat(asset(bytes, "glb"), { maxSplats: 2, maxGpuBytes: gaussianSplatGpuInstanceBytes(2) }).runtime({ id: "cloud" })),
      autoStart: false, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    try {
      await app.ready(); expect(new Set(submit.mock.contexts).size).toBe(2);
      const vertexBuffers = devices[0]!.drawCommands.filter((draw) => draw.label === "gaussian-splat").map((draw) => draw.vertexBuffer);
      expect(vertexBuffers).toHaveLength(2); expect(vertexBuffers.every((buffer) => !buffer.disposed)).toBe(true);
      expect(app.nodes.remove!("cloud")).toBe(true);
      expect(vertexBuffers.every((buffer) => buffer.disposed)).toBe(true);
    } finally { app.dispose(); }
  });

  it("filters splat layers against the public camera and reacts to live mask changes", async () => {
    const bytes = instancedGlb(true); vi.stubGlobal("crypto", webcrypto); useMockRootDevice();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const prepare = vi.spyOn(GaussianSplatRenderer.prototype, "prepare");
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], layers: 2 }))
        .add(gaussianSplat(asset(bytes, "glb"), { layers: 1 }).runtime({ id: "cloud" })),
      autoStart: false, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    try {
      await app.ready(); expect(prepare).not.toHaveBeenCalled();
      app.nodes.get("cloud")!.layers.set(1); app.step(1 / 60);
      expect(prepare).toHaveBeenCalledTimes(1);
      app.nodes.get("cloud")!.layers.disableAll(); app.step(1 / 60);
      expect(prepare).toHaveBeenCalledTimes(1);
    } finally { app.dispose(); }
  });

  it("bypasses coarse node-frustum culling when the live handle opts out", async () => {
    const bytes = instancedGlb(true); vi.stubGlobal("crypto", webcrypto); useMockRootDevice();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const prepare = vi.spyOn(GaussianSplatRenderer.prototype, "prepare");
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0] }))
        .add(gaussianSplat(asset(bytes, "glb"), { position: [100, 0, 0] }).runtime({ id: "cloud" })),
      autoStart: false, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    try {
      await app.ready(); expect(prepare).not.toHaveBeenCalled();
      app.nodes.get("cloud")!.frustumCulled = false; app.step(1 / 60);
      expect(prepare).toHaveBeenCalledTimes(1);
      // Per-point clipping still rejects off-screen samples; only the coarse node test is bypassed.
      expect(prepare.mock.results[0]!.value.visibleCount).toBe(0);
    } finally { app.dispose(); }
  });

  it("orders splat draws by renderOrder before depth and tracks live order changes", async () => {
    const bytes = instancedGlb(true); vi.stubGlobal("crypto", webcrypto); useMockRootDevice();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const prepare = vi.spyOn(GaussianSplatRenderer.prototype, "prepare");
    const submit = vi.spyOn(GaussianSplatRenderer.prototype, "submitPrepared");
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0] }))
        .add(gaussianSplat(asset(bytes, "glb"), { position: [0, 0, -1], renderOrder: 10 }).runtime({ id: "far" }))
        .add(gaussianSplat(asset(bytes, "glb"), { position: [0, 0, 1], renderOrder: -10 }).runtime({ id: "near" })),
      autoStart: false, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    const submittedZ = () => {
      const positions = new Map(prepare.mock.contexts.map((renderer, index) => [renderer, prepare.mock.calls[index]![0].modelMatrix![14]]));
      return submit.mock.contexts.map((renderer) => positions.get(renderer));
    };
    try {
      await app.ready(); expect(submittedZ()).toEqual([1, -1]);
      prepare.mockClear(); submit.mockClear();
      app.nodes.get("far")!.renderOrder = -10; app.nodes.get("near")!.renderOrder = 10;
      app.step(1 / 60); expect(submittedZ()).toEqual([-1, 1]);
    } finally { app.dispose(); }
  });

  it("interleaves splats with transparent mesh nodes by live renderOrder", async () => {
    const bytes = instancedGlb(true); vi.stubGlobal("crypto", webcrypto); const devices = useMockRootDevice();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0] }))
        .add(gaussianSplat(asset(bytes, "glb"), { position: [0, 0, -1], renderOrder: 10 }).runtime({ id: "cloud" }))
        .add(primitives.box({ name: "glass", position: [0, 0, 1], renderOrder: -10,
          material: material.pbr({ color: "#ffffff", opacity: 0.5, alphaMode: "blend" }) }).runtime({ id: "glass" })),
      autoStart: false, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    const labels = () => devices[0]!.drawCommands.map((command) => command.label ?? "");
    try {
      await app.ready();
      const first = labels(), splatFirst = first.findIndex((label) => label === "gaussian-splat"), meshFirst = first.findIndex((label) => label.includes("glass"));
      expect(meshFirst).toBeGreaterThanOrEqual(0); expect(splatFirst).toBeGreaterThan(meshFirst);
      app.nodes.get("cloud")!.renderOrder = -10; app.nodes.get("glass")!.renderOrder = 10;
      app.step(1 / 60);
      const next = labels(), splatNext = next.findIndex((label) => label === "gaussian-splat"), meshNext = next.findIndex((label) => label.includes("glass"));
      expect(splatNext).toBeGreaterThanOrEqual(0); expect(meshNext).toBeGreaterThan(splatNext);
    } finally { app.dispose(); }
  });

  it("cancels a removed dynamic splat and never mounts its late response", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto);
    let resolveFetch: ((value: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));
    const snapshot = scene().toJSON() as AuraSceneSnapshot, registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    registry.attachCompiled(compiled); registry.configure({ flags, getScene: () => snapshot, setScene: () => {} });
    registry.add(gaussianSplat(asset(bytes)).runtime({ id: "late" }));
    await vi.waitFor(() => expect(resolveFetch).toBeDefined());
    expect(registry.remove("late")).toBe(true);
    resolveFetch!(response(bytes));
    await vi.waitFor(() => expect(asRuntimeImpl(compiled)!.splatLeases.size).toBe(0));
    expect(draws(updateCompiledScene(compiled, snapshot, registry, 1))).toHaveLength(0);
    expect(device.getDiagnostics().buffers).toBe(0);
    compiled.dispose(); device.dispose();
  });

  it("rejects changed bytes instead of silently mounting the admitted asset", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(new Uint8Array(32))));
    const snapshot = scene().add(gaussianSplat(asset(bytes))).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    await expect(compileScene(snapshot, context(device, registry))).rejects.toThrow(/integrity|digest|hash/i);
    expect(device.getDiagnostics().buffers).toBe(0); device.dispose();
  });

  it("cancels a second in-flight acquisition when a peer fails integrity", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto);
    let slowSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((url, init) => {
      if (String(url).includes("slow")) return new Promise<Response>((_resolve, reject) => {
        slowSignal = init?.signal as AbortSignal;
        slowSignal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
      return Promise.resolve(response(new Uint8Array(32)));
    }));
    const slow = defineAuraAssets({ slow: { ...asset(bytes), url: "https://assets.example/slow.splat" } }).slow;
    const snapshot = scene().add(gaussianSplat(slow)).add(gaussianSplat(asset(bytes))).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    await expect(compileScene(snapshot, context(device, registry))).rejects.toThrow();
    expect(slowSignal?.aborted).toBe(true); expect(device.getDiagnostics().buffers).toBe(0); device.dispose();
  });

  it("retains dynamic load failures in frame diagnostics until the failed node is removed", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(new Uint8Array(32))));
    const snapshot = scene().toJSON() as AuraSceneSnapshot, registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const ctx = context(device, registry), compiled = await compileScene(snapshot, ctx);
    registry.attachCompiled(compiled); registry.configure({ flags, getScene: () => snapshot, setScene: () => {} });
    registry.add(gaussianSplat(asset(bytes)).runtime({ id: "bad-cloud" }));
    await vi.waitFor(() => expect([...ctx.runtimeWarnings].some((value) => value.includes("SPLAT_LOAD_FAILED"))).toBe(true));
    updateCompiledScene(compiled, snapshot, registry, 1);
    expect([...ctx.runtimeWarnings].some((value) => value.includes("SPLAT_LOAD_FAILED"))).toBe(true);
    expect(registry.remove("bad-cloud")).toBe(true);
    updateCompiledScene(compiled, snapshot, registry, 2);
    expect([...ctx.runtimeWarnings].some((value) => value.includes("SPLAT_LOAD_FAILED"))).toBe(false);
    compiled.dispose(); device.dispose();
  });

  it("releases partially initialized leases when a splat exceeds its GPU budget", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes), { maxGpuBytes: 4 })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    await expect(compileScene(snapshot, context(device, registry))).rejects.toThrow(/maxGpuBytes/);
    expect(device.getDiagnostics()).toMatchObject({ buffers: 0, shaders: 0 }); device.dispose();
  });

  it("aims anonymous splats at an inherited world target and follows live parent movement", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const target = [0, 0, -10] as const;
    const parent = group("targeted", [gaussianSplat(asset(bytes), { position: [1, 0, 0] })], { lookAt: target }).runtime({ id: "parent" });
    const snapshot = scene().add(parent).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    let matrix = draws(updateCompiledScene(compiled, snapshot, registry, 0))[0]!.modelMatrix;
    expectFacing(matrix, target); expect(anchor(matrix)).toEqual([1, 0, 0]);
    registry.get("parent")!.setPosition(4, 0, 0);
    matrix = draws(updateCompiledScene(compiled, snapshot, registry, 1))[0]!.modelMatrix;
    expectFacing(matrix, target); expect(anchor(matrix)).toEqual([5, 0, 0]);
    compiled.dispose(); device.dispose();
  });

  it("applies inherited lookAt for a static anonymous hierarchy without a runtime handle", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const target = [0, 2, -8] as const;
    const snapshot = scene().add(group("static", [gaussianSplat(asset(bytes), { position: [1, 0, 0] })], { position: [2, 0, 0], lookAt: target })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    const matrix = draws(compiled.source)[0]!.modelMatrix;
    expectFacing(matrix, target); expect(anchor(matrix)).toEqual([3, 0, 0]);
    compiled.dispose(); device.dispose();
  });

  it("submits the inherited lookAt transform through the public app renderer after parent movement", async () => {
    const bytes = instancedGlb(true); vi.stubGlobal("crypto", webcrypto); useMockRootDevice();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const prepare = vi.spyOn(GaussianSplatRenderer.prototype, "prepare");
    const target = [1, 0, -5] as const;
    const parent = group("targeted", [gaussianSplat(asset(bytes, "glb"))], { lookAt: target }).runtime({ id: "parent" });
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(parent), autoStart: false, resize: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false } }
    });
    try {
      await app.ready();
      const first = Float32Array.from(prepare.mock.calls.at(-1)![0].modelMatrix!);
      expectFacing(first, target);
      app.nodes.get("parent")!.setPosition(0.25, 0, 0); app.step(1 / 60);
      const next = Float32Array.from(prepare.mock.calls.at(-1)![0].modelMatrix!);
      expectFacing(next, target); expect(next[12]).toBeCloseTo(0.25);
      expect(next[8]).not.toBeCloseTo(first[8]!, 4);
    } finally { app.dispose(); }
  });

  it("gives the child target precedence and retains its pivot and sheared scale", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const target = [10, 3, -5] as const, pivot = [0.2, -0.1, 0.3] as const;
    const child = gaussianSplat(asset(bytes), { position: [1, 2, 0], rotation: [0, 0, Math.PI / 4], pivot }).lookAt(target).runtime({ id: "child" });
    const parent = group("parent", [child], { position: [3, 0, 0], scale: [2, 1, 1], lookAt: [0, 0, -10] });
    const snapshot = scene().add(parent).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    const compiled = await compileScene(snapshot, context(device, registry));
    const matrix = draws(updateCompiledScene(compiled, snapshot, registry, 0))[0]!.modelMatrix;
    expectFacing(matrix, target, pivot);
    const anchored = anchor(matrix, pivot);
    expect(anchored[0]).toBeCloseTo(5.4); expect(anchored[1]).toBeCloseTo(1.9); expect(anchored[2]).toBeCloseTo(0.3);
    // The first two world columns retain the authored shear, rather than being recomposed as plain TRS.
    const dot = matrix[0]! * matrix[4]! + matrix[1]! * matrix[5]! + matrix[2]! * matrix[6]!;
    expect(Math.abs(dot)).toBeGreaterThan(1);
    const position = registry.get("child")!.getWorldPosition();
    for (let i = 0; i < 3; i++) expect(position[i]).toBeCloseTo(matrix[12 + i]!, 5);
    compiled.dispose(); device.dispose();
  });

  it("rejects a zero-distance lookAt target without leaking its resources", async () => {
    const bytes = binary(); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const snapshot = scene().add(gaussianSplat(asset(bytes)).lookAt(0, 0, 0)).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot), device = new MockRenderDevice();
    await expect(compileScene(snapshot, context(device, registry))).rejects.toThrow(/distinct target/);
    expect(device.getDiagnostics().buffers).toBe(0); device.dispose();
  });
});
