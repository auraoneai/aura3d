import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import { scalarVolume, validateScalarVolumeNode, type AuraScalarVolumeOptions } from "../../../packages/engine/src/agent-api/nodes/scalarVolume";
import { scalarVolume as rootScalarVolume } from "../../../packages/engine/src/public/index";
import { scalarVolume as v5ScalarVolume } from "../../../packages/engine/src/public/v5";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { asRuntimeImpl, retainCompiledBatchFrame, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { analyzeProductionBridgeEligibility, declaresWebGLContent } from "../../../packages/engine/src/agent-api/compiler/observations";
import { isKnownNodeKind } from "../../../packages/engine/src/agent-api/compiler/handlers";
import { compileScene, updateCompiledScene } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { ScalarVolumeLoader, type ScalarVolumeAsset } from "../../../packages/assets/src/loaders/ScalarVolumeLoader";
import { FormatRegistry } from "../../../packages/assets/src/FormatRegistry";
// Load the real optional importer module during collection so the first
// cancellation test measures the loader rather than a cold transform.
import "../../../packages/assets/src/importers";
import { MockRenderDevice, type RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { VolumeRenderer, type VolumeRendererOptions } from "../../../packages/rendering/src/volumetrics";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const scalarAsset = defineAuraAssets({
  scan: {
    type: "scalar-volume",
    format: "nrrd",
    url: "/aura-assets/scan.nrrd",
    hash: `sha256-${"a".repeat(64)}`,
    metadata: { sourcePath: "public/aura-assets/scan.nrrd" }
  }
}).scan;

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("typed scalar-volume scene nodes", () => {
  it("builds a visible typed node and accepts both NRRD extensions", () => {
    expect(rootScalarVolume).toBe(scalarVolume);
    expect(v5ScalarVolume).toBe(scalarVolume);
    const node = scalarVolume(scalarAsset).toJSON();
    expect(node).toMatchObject({ kind: "scalar-volume", asset: scalarAsset, visible: true });
    expect(isKnownNodeKind(node.kind)).toBe(true);
    expect(declaresWebGLContent([node])).toBe(true);
    expect(analyzeProductionBridgeEligibility([node]).eligible).toBe(true);
    const detached = { ...scalarAsset, format: "NHDR" };
    expect(scalarVolume(detached).toJSON().asset).toBe(detached);
    expect(scalarVolume(scalarAsset, { visible: false }).toJSON().visible).toBe(false);
  });

  it("rejects non-volume references and unsupported formats", () => {
    expect(() => scalarVolume({ ...scalarAsset, kind: "other" } as never)).toThrow(/typed scalar-volume/);
    expect(() => scalarVolume({ ...scalarAsset, type: "model" } as never)).toThrow(/typed scalar-volume/);
    expect(() => scalarVolume({ ...scalarAsset, format: "vtk" })).toThrow(/nrrd or nhdr/);
    expect(() => scalarVolume(scalarAsset, null as never)).toThrow(/options/);
  });

  it("snapshots transforms, transfer stops, planes and slice controls", () => {
    const position: [number, number, number] = [1, 2, 3];
    const scale: [number, number, number] = [2, 3, 4];
    const domain: [number, number] = [0, 200];
    const color: [number, number, number, number] = [0.1, 0.2, 0.3, 0.4];
    const transfer: [{ value: number; color: [number, number, number, number] }, { value: number; color: [number, number, number, number] }] = [
      { value: 0, color }, { value: 200, color: [1, 1, 1, 1] }
    ];
    const plane: [number, number, number, number] = [1, 0, 0, -0.5];
    const mode: { type: "slice"; axis: "x" | "y" | "z"; position: number } = { type: "slice", axis: "z", position: 0.25 };
    const node = scalarVolume(scalarAsset, { position, scale, domain, transfer, clipPlanes: [plane], mode }).toJSON();
    position[0] = 99; scale[0] = 99; domain[0] = 99; color[0] = 0.9; transfer[1].value = 500; plane[3] = 1; mode.position = 1;
    expect(node.position).toEqual([1, 2, 3]);
    expect(node.scale).toEqual([2, 3, 4]);
    expect(node.domain).toEqual([0, 200]);
    expect(node.transfer).toEqual([{ value: 0, color: [0.1, 0.2, 0.3, 0.4] }, { value: 200, color: [1, 1, 1, 1] }]);
    expect(node.clipPlanes).toEqual([[1, 0, 0, -0.5]]);
    expect(node.mode).toEqual({ type: "slice", axis: "z", position: 0.25 });
  });

  it("accepts supported limits and both volume modes", () => {
    const node = scalarVolume(scalarAsset, {
      mode: { type: "raymarch" }, density: 0, sampleCount: 512, maxVoxels: 67_108_864,
      domain: [-2, 3], transfer: [{ value: -2, color: [0, 0, 0, 0] }, { value: 3, color: [1, 1, 1, 1] }],
      clipPlanes: [[0, 1, 0, 0]], layers: 0xffffffff, renderOrder: -5, frustumCulled: false
    }).toJSON();
    expect(() => validateScalarVolumeNode(node)).not.toThrow();
    expect(() => scalarVolume(scalarAsset, { mode: { type: "slice", axis: "x", position: 0 } })).not.toThrow();
    expect(() => scalarVolume(scalarAsset, { mode: { type: "slice", axis: "y", position: 1 } })).not.toThrow();
  });

  it.each([
    [{ sampleCount: 0 }, /sampleCount/],
    [{ sampleCount: 513 }, /sampleCount/],
    [{ maxVoxels: 0 }, /maxVoxels/],
    [{ maxVoxels: 67_108_865 }, /maxVoxels/],
    [{ density: -1 }, /density/],
    [{ density: Infinity }, /density/],
    [{ density: 1_000_001 }, /density/],
    [{ domain: [1, 1] }, /domain/],
    [{ domain: [0, Number.MIN_VALUE] }, /domain/],
    [{ transfer: [{ value: 0, color: [0, 0, 0, 0] }] }, /transfer/],
    [{ transfer: [{ value: 1, color: [0, 0, 0, 0] }, { value: 1, color: [1, 1, 1, 1] }] }, /transfer/],
    [{ transfer: [{ value: 0, color: [0, 0, 0, 0] }, { value: 1, color: [1, 1, 1, 2] }] }, /transfer/],
    [{ clipPlanes: [[0, 0, 0, 1]] }, /clip plane/],
    [{ clipPlanes: Array.from({ length: 9 }, () => [1, 0, 0, 0]) }, /clipPlanes/],
    [{ mode: { type: "slice", axis: "q", position: 0.5 } }, /slice/],
    [{ mode: { type: "slice", axis: "x", position: 1.01 } }, /slice/],
    [{ mode: { type: "other" } }, /mode/],
    [{ layers: 1.5 }, /layers/],
    [{ renderOrder: Infinity }, /renderOrder/],
    [{ frustumCulled: "yes" }, /frustumCulled/],
    [{ position: [0, NaN, 0] }, /position/],
    [{ scale: [1, 0, 1] }, /scale/],
    [{ quaternion: [0, 0, 0, 0] }, /quaternion/],
    [{ lookAt: [0, 0, 0] }, /lookAt/]
  ] as [unknown, RegExp][])("rejects invalid authored options %#", (options, message) => {
    expect(() => scalarVolume(scalarAsset, options as unknown as AuraScalarVolumeOptions)).toThrow(message);
  });

  it("revalidates builder-chain transforms at compiler admission", () => {
    const moved = scalarVolume(scalarAsset).position(1, 2, 3).rotate(0, 0, 1).toJSON();
    expect(() => validateScalarVolumeNode(moved)).not.toThrow();
    const unsupported = scalarVolume(scalarAsset).lookAt(0, 0, 1).toJSON();
    expect(() => validateScalarVolumeNode(unsupported)).toThrow(/lookAt/);
    const nonfinite = scalarVolume(scalarAsset).position(Infinity, 0, 0).toJSON();
    expect(() => validateScalarVolumeNode(nonfinite)).toThrow(/position/);
  });
});

/** Independently constructed raw NRRD: RAS axes become Aura's R-U-B axes. */
function nrrdBytes(): Uint8Array {
  const header = new TextEncoder().encode([
    "NRRD0005", "type: uint8", "dimension: 3", "sizes: 2 2 2", "encoding: raw",
    "space: right-anterior-superior", "space directions: (1,0,0) (0,1,0) (0,0,1)",
    "space origin: (0,0,0)", "", ""
  ].join("\n"));
  const bytes = new Uint8Array(header.length + 8);
  bytes.set(header);
  bytes.set([0, 1, 2, 3, 4, 5, 6, 7], header.length);
  return bytes;
}

/** Construct signed raw NRRD data without relying on an external encoder. */
function signedNrrdBytes(type: "int8" | "int16", values: readonly number[]): Uint8Array {
  const header = new TextEncoder().encode([
    "NRRD0005", `type: ${type}`, "dimension: 3", "sizes: 2 2 2", "encoding: raw",
    ...(type === "int16" ? ["endian: little"] : []),
    "space: right-anterior-superior", "space directions: (1,0,0) (0,1,0) (0,0,1)",
    "space origin: (0,0,0)", "", ""
  ].join("\n"));
  const width = type === "int8" ? 1 : 2;
  const bytes = new Uint8Array(header.length + values.length * width);
  bytes.set(header);
  const view = new DataView(bytes.buffer, header.length);
  values.forEach((value, index) => {
    if (width === 1) view.setInt8(index, value);
    else view.setInt16(index * width, value, true);
  });
  return bytes;
}

function admittedVolume(bytes: Uint8Array) {
  const hash = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
  return defineAuraAssets({ scan: {
    type: "scalar-volume", format: "nrrd", url: "https://assets.example/scan.nrrd", hash,
    metadata: { sourcePath: "public/aura-assets/scan.nrrd" }
  } }).scan;
}

const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } });
function compileContext(device: MockRenderDevice, registry: ReturnType<typeof createAuraRuntimeNodeRegistry>, signal?: AbortSignal): MountSceneCompileContext {
  return {
    renderer: { device }, assets: undefined, quality: { tier: "high" } as MountSceneCompileContext["quality"],
    strict: true, flags, degrade() {}, canvas: { width: 160, height: 100 } as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 1 }), collectedLights: [], runtimeWarnings: new Set(), runtimeNodes: registry,
    ...(signal ? { request: { signal } } : {})
  };
}

class FakeVolumeRenderer {
  closed = false;
  readonly releases = vi.fn();
  readonly dispose = vi.fn(() => { this.closed = true; });
  constructor(readonly device: RenderDevice, readonly options: VolumeRendererOptions) {}
  belongsToDevice(device: RenderDevice) { return device === this.device; }
  assertUsableForDevice(device: RenderDevice) { if (device !== this.device || this.closed) throw new Error("volume is unavailable"); }
  acquireFrameLease(device: RenderDevice) {
    this.assertUsableForDevice(device);
    let released = false;
    return {
      assertCurrent: () => { if (released || this.closed) throw new Error("volume frame is stale"); },
      release: () => { if (!released) { released = true; this.releases(); } }
    };
  }
}

function mockVolumeHost(): { readonly device: MockRenderDevice; readonly created: FakeVolumeRenderer[] } {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: "webgl2" });
  const created: FakeVolumeRenderer[] = [];
  vi.spyOn(VolumeRenderer, "fromDevice").mockImplementation((owner, options) => {
    const renderer = new FakeVolumeRenderer(owner, options);
    created.push(renderer);
    return renderer as unknown as VolumeRenderer;
  });
  return { device, created };
}

type TestVolumeDraw = {
  readonly renderer: VolumeRenderer;
  readonly modelMatrix: Float32Array;
  readonly worldBounds: { readonly min: readonly number[]; readonly max: readonly number[] };
  readonly mode: { readonly type: string };
  readonly frameLease: { assertCurrent(): void; release(): void };
};
function volumeDraws(source: unknown): readonly TestVolumeDraw[] {
  return (source as { scalarVolumes?: readonly TestVolumeDraw[] } | null)?.scalarVolumes ?? [];
}

describe("root scalar-volume compilation", () => {
  it.each([
    ["int8", Int8Array, [-128, -9, -1, 0, 1, 9, 42, 127]],
    ["int16", Int16Array, [-32768, -257, -1, 0, 1, 257, 2048, 32767]]
  ] as const)("passes signed %s NRRD samples through compiler admission to the renderer", async (type, sampleType, values) => {
    const bytes = signedNrrdBytes(type, values);
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes).buffer)));
    const { device, created } = mockVolumeHost();
    const snapshot = scene().add(scalarVolume(admittedVolume(bytes))).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const compiled = await compileScene(snapshot, compileContext(device, registry));
    expect(created).toHaveLength(1);
    expect(created[0]!.options.data).toBeInstanceOf(sampleType);
    expect([...created[0]!.options.data]).toEqual(values);
    compiled.dispose();
    device.dispose();
  });

  it("rejects unsupported custom-adapter sample types before creating a renderer", async () => {
    const bytes = nrrdBytes();
    const { device, created } = mockVolumeHost();
    const dispose = vi.fn();
    const formats = new FormatRegistry();
    formats.register({ id: "custom-volume", extensions: ["nrrd"], loader: {
      type: "custom-volume", canLoad: () => true, load: async () => ({
        kind: "scalar-volume", dimensions: [2, 2, 2], data: new Int32Array(8),
        dataToLocal: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        metadata: {}, diagnostics: []
      } as unknown as ScalarVolumeAsset), dispose
    } });
    const asset = { ...admittedVolume(bytes), formatMetadata: { adapter: "custom-volume" } };
    const snapshot = scene().add(scalarVolume(asset)).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const context: MountSceneCompileContext = { ...compileContext(device, registry), formatRegistry: formats };
    await expect(compileScene(snapshot, context)).rejects.toThrow(/supported type/);
    expect(created).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
    device.dispose();
  });

  it("loads verified scalar samples and publishes live ancestor transforms and visibility", async () => {
    const bytes = nrrdBytes();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes).buffer)));
    const disposeAsset = vi.spyOn(ScalarVolumeLoader.prototype, "dispose");
    const { device, created } = mockVolumeHost();
    const child = scalarVolume(admittedVolume(bytes), { position: [1, 0, 0], sampleCount: 32 }).runtime({ id: "volume" });
    const snapshot = scene().add(group("parent", [child], { position: [2, 0, 0] }).runtime({ id: "parent" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const compiled = await compileScene(snapshot, compileContext(device, registry));
    registry.attachCompiled(compiled);
    registry.configure({ flags, getScene: () => snapshot, setScene: () => {} });
    expect(created).toHaveLength(1);
    expect([...created[0]!.options.data]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(created[0]!.options.sampleCount).toBe(32);
    expect(asRuntimeImpl(compiled)!.loadedScalarVolumeAssetIds).toEqual(["scan"]);
    let frame = volumeDraws(updateCompiledScene(compiled, snapshot, registry, 0));
    expect(frame).toHaveLength(1);
    expect(frame[0]!.modelMatrix[12]).toBeCloseTo(3);
    expect(frame[0]!.worldBounds.min[0]).toBeLessThanOrEqual(3);
    expect(frame[0]!.worldBounds.max[0]).toBeGreaterThanOrEqual(4);
    registry.get("parent")!.setPosition(4, 0, 0);
    frame = volumeDraws(updateCompiledScene(compiled, snapshot, registry, 1));
    expect(frame[0]!.modelMatrix[12]).toBeCloseTo(5);
    registry.get("parent")!.setVisible(false);
    expect(volumeDraws(updateCompiledScene(compiled, snapshot, registry, 2))).toHaveLength(0);
    registry.get("parent")!.setVisible(true);
    expect(registry.remove("parent")).toBe(true);
    expect(volumeDraws(updateCompiledScene(compiled, snapshot, registry, 3))).toHaveLength(0);
    compiled.dispose(); device.dispose();
    expect(created[0]!.dispose).toHaveBeenCalledOnce();
    expect(disposeAsset).toHaveBeenCalledOnce();
  });

  it("fails a mismatched admitted digest before creating a renderer", async () => {
    const bytes = nrrdBytes();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes).buffer)));
    const { device, created } = mockVolumeHost();
    const badAsset = { ...admittedVolume(bytes), hash: `sha256-${"0".repeat(64)}` };
    const snapshot = scene().add(scalarVolume(badAsset)).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    await expect(compileScene(snapshot, compileContext(device, registry))).rejects.toThrow(/integrity|digest|hash/i);
    expect(created).toHaveLength(0);
    device.dispose();
  });

  it("settles a cancelled acquisition without creating a late renderer", async () => {
    const bytes = nrrdBytes();
    const controller = new AbortController();
    let complete!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { complete = resolve; });
    const fetch = vi.fn(() => response);
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", fetch);
    const { device, created } = mockVolumeHost();
    const snapshot = scene().add(scalarVolume(admittedVolume(bytes))).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const mounting = compileScene(snapshot, compileContext(device, registry, controller.signal));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort(new DOMException("cancelled", "AbortError"));
    complete(new Response(new Uint8Array(bytes).buffer));
    await expect(mounting).rejects.toThrow(/abort|cancel/i);
    expect(created).toHaveLength(0);
    device.dispose();
  });

  it("waits for an explicit adapter's asynchronous release", async () => {
    const bytes = nrrdBytes();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes).buffer)));
    const { device } = mockVolumeHost();
    const native = new ScalarVolumeLoader();
    let complete!: () => void;
    const pendingRelease = new Promise<void>((resolve) => { complete = resolve; });
    const dispose = vi.fn(async (asset: ScalarVolumeAsset) => { await pendingRelease; native.dispose(asset); });
    const registry = new FormatRegistry();
    registry.register({ id: "custom-volume", extensions: ["nrrd"], loader: {
      type: "custom-volume", canLoad: (request) => native.canLoad(request),
      load: (request, context) => native.load(request, context), dispose
    } });
    const asset = { ...admittedVolume(bytes), formatMetadata: { adapter: "custom-volume" } };
    const snapshot = scene().add(scalarVolume(asset)).toJSON() as AuraSceneSnapshot;
    const nodes = createAuraRuntimeNodeRegistry(snapshot);
    const context: MountSceneCompileContext = { ...compileContext(device, nodes), formatRegistry: registry };
    const compiled = await compileScene(snapshot, context);
    compiled.dispose();
    let settled = false;
    const waiting = asRuntimeImpl(compiled)!.whenVolumeDisposalsSettled().then(() => { settled = true; });
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    complete();
    await waiting;
    expect(settled).toBe(true);
    device.dispose();
  });

  it("waits for a cancelled custom loader and its late asset cleanup", async () => {
    const bytes = nrrdBytes();
    const controller = new AbortController();
    const { device, created } = mockVolumeHost();
    let finishLoad!: (asset: ScalarVolumeAsset) => void;
    let finishCleanup!: () => void;
    const loading = new Promise<ScalarVolumeAsset>((resolve) => { finishLoad = resolve; });
    const cleanup = new Promise<void>((resolve) => { finishCleanup = resolve; });
    const load = vi.fn(() => loading);
    const dispose = vi.fn(() => cleanup);
    const formats = new FormatRegistry();
    formats.register({ id: "custom-volume", extensions: ["nrrd"], loader: {
      type: "custom-volume", canLoad: () => true, load, dispose
    } });
    const asset = { ...admittedVolume(bytes), formatMetadata: { adapter: "custom-volume" } };
    const snapshot = scene().add(scalarVolume(asset)).toJSON() as AuraSceneSnapshot;
    const nodes = createAuraRuntimeNodeRegistry(snapshot);
    let settled = false;
    const context: MountSceneCompileContext = { ...compileContext(device, nodes, controller.signal), formatRegistry: formats };
    const mounting = compileScene(snapshot, context);
    void mounting.then(() => { settled = true; }, () => { settled = true; });
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    controller.abort(new DOMException("cancelled", "AbortError"));
    await Promise.resolve();
    expect(settled).toBe(false);
    finishLoad({ kind: "scalar-volume", dimensions: [2, 2, 2], data: new Uint8Array(8),
      dataToLocal: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      metadata: {}, diagnostics: [] } as unknown as ScalarVolumeAsset);
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    finishCleanup();
    await expect(mounting).rejects.toThrow(/abort|cancel/i);
    expect(created).toHaveLength(0);
    device.dispose();
  });

  it("keeps an in-flight frame token alive until release and marks it stale on removal", async () => {
    const bytes = nrrdBytes();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes).buffer)));
    const { device, created } = mockVolumeHost();
    const snapshot = scene().add(scalarVolume(admittedVolume(bytes)).runtime({ id: "volume" })).toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const compiled = await compileScene(snapshot, compileContext(device, registry));
    registry.attachCompiled(compiled);
    registry.configure({ flags, getScene: () => snapshot, setScene: () => {} });
    const source = updateCompiledScene(compiled, snapshot, registry, 0) as object;
    const record = volumeDraws(source)[0]!;
    const releasedEarlierFrames = created[0]!.releases.mock.calls.length;
    const release = retainCompiledBatchFrame(source);
    expect(() => record.frameLease.assertCurrent()).not.toThrow();
    expect(registry.remove("volume")).toBe(true);
    expect(() => record.frameLease.assertCurrent()).toThrow(/stale|disposed|unavailable/i);
    compiled.dispose();
    expect(created[0]!.releases).toHaveBeenCalledTimes(releasedEarlierFrames);
    release(); release();
    expect(created[0]!.releases).toHaveBeenCalledTimes(releasedEarlierFrames + 1);
    device.dispose();
  });
});
