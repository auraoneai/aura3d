import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/assets/src/importers";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { asRuntimeImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimeCollectedLights } from "../../../packages/engine/src/agent-api/compiler/observations";
import { compileScene, updateCompiledScene } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";

/** Independent RGBA8 PVR v3 fixture. */
function imageBytes(): Uint8Array {
  const bytes = new Uint8Array(52 + 16), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x03525650, true);
  view.setUint32(8, 0x61626772, true);
  view.setUint32(12, 0x08080808, true);
  view.setUint32(16, 1, true);
  view.setUint32(24, 2, true); view.setUint32(28, 2, true);
  view.setUint32(32, 1, true); view.setUint32(36, 1, true);
  view.setUint32(40, 1, true); view.setUint32(44, 1, true);
  bytes.set([12, 34, 56, 255, 78, 90, 123, 255, 145, 167, 189, 255, 210, 220, 230, 255], 52);
  return bytes;
}

function projectedAsset(bytes: Uint8Array) {
  return defineAuraAssets({ image: {
    type: "texture", format: "pvr", url: "https://assets.example/projector.pvr",
    hash: `sha256-${createHash("sha256").update(bytes).digest("hex")}`,
    metadata: { sourcePath: "public/aura-assets/projector.pvr" }
  } }).image;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class ProjectedDevice {
  readonly kind = "webgl2" as const;
  disposed = false;
  contextLost = false;
  generation = 1;
  activeFrameToken: object | null = null;
  readonly listeners = new Set<() => void>();
  readonly fences: ReturnType<typeof deferred<void>>[] = [];
  readonly supportsSubmittedWorkCompletion = () => true;
  readonly onDeviceLost = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly waitForSubmittedWork = () => { const fence = deferred<void>(); this.fences.push(fence); return fence.promise; };
  asDevice(): RenderDevice { return this as unknown as RenderDevice; }
  begin(): void { this.activeFrameToken = {}; }
  end(): void { this.activeFrameToken = null; }
}

const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } });
function context(snapshot: AuraSceneSnapshot, nodes: ReturnType<typeof createAuraRuntimeNodeRegistry>, device: ProjectedDevice, owner: object, strict = true): MountSceneCompileContext {
  return {
    renderer: { device: device.asDevice(), postScopeId: () => owner }, assets: undefined,
    quality: { tier: "high" } as MountSceneCompileContext["quality"], strict, flags, degrade() {},
    canvas: { width: 160, height: 100 } as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 1 }),
    collectedLights: createProductionRuntimeCollectedLights(snapshot, flags), runtimeWarnings: new Set(), runtimeNodes: nodes,
    projectedSpotImageAdmissionEnabled: true, projectedSpotMaxDimension: 2048
  };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("projected spot scene ownership", () => {
  it("preserves the authored asset identity and follows a live parent's transform and visibility", async () => {
    const bytes = imageBytes(), image = projectedAsset(bytes), owner = {}, device = new ProjectedDevice();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer)));
    const spot = lights.spot({ position: [1, 2, 0], target: [0, 0, 0], projectedImage: {
      texture: image, offset: [0.25, 0.5], scale: [2, 3], rotation: 0.2
    } }).runtime({ id: "spot" });
    const snapshot = scene().add(group("parent", [spot], { position: [2, 0, 0] }).runtime({ id: "parent" })).toJSON() as AuraSceneSnapshot;
    const nodes = createAuraRuntimeNodeRegistry(snapshot), ctx = context(snapshot, nodes, device, owner);
    const compiled = await compileScene(snapshot, ctx);
    nodes.attachCompiled(compiled); nodes.configure({ flags, getScene: () => snapshot, setScene: () => {} });
    const impl = asRuntimeImpl(compiled)!;
    const resource = impl.projectedSpotResourceFor(image);
    expect(resource?.matchesAsset(image)).toBe(true);
    const spotLight = ctx.collectedLights.find((light) => light.kind === "spot")!;
    updateCompiledScene(compiled, snapshot, nodes, 0);
    expect(spotLight.projectedImage).toMatchObject({ texture: image, offset: [0.25, 0.5], scale: [2, 3], rotation: 0.2 });
    expect(spotLight.projectedImage!.texture).toBe(image);
    expect(spotLight.position[0]).toBeCloseTo(3);
    nodes.get("parent")!.setPosition(4, 0, 0);
    updateCompiledScene(compiled, snapshot, nodes, 1);
    expect(spotLight.position[0]).toBeCloseTo(5);
    nodes.get("parent")!.setVisible(false);
    updateCompiledScene(compiled, snapshot, nodes, 2);
    expect(spotLight.projectedImage).toBeUndefined();
    expect(spotLight.intensity).toBe(0);
    nodes.get("parent")!.setVisible(true);
    updateCompiledScene(compiled, snapshot, nodes, 3);
    expect(spotLight.projectedImage!.texture).toBe(image);
    expect(spotLight.intensity).toBeGreaterThan(0);
    compiled.dispose();
    await impl.whenProjectedSpotDisposalsSettled();
    expect(device.listeners.size).toBe(0);
  });

  it("keeps a shared image until the last light retires and protects an in-flight frame", async () => {
    const bytes = imageBytes(), image = projectedAsset(bytes), owner = {}, device = new ProjectedDevice();
    vi.stubGlobal("crypto", webcrypto);
    const fetch = vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer));
    vi.stubGlobal("fetch", fetch);
    const first = lights.spot({ projectedImage: { texture: image } }).runtime({ id: "first" });
    const second = lights.spot({ projectedImage: { texture: image } }).runtime({ id: "second" });
    const snapshot = scene().add(first).add(second).toJSON() as AuraSceneSnapshot;
    const nodes = createAuraRuntimeNodeRegistry(snapshot), ctx = context(snapshot, nodes, device, owner);
    const compiled = await compileScene(snapshot, ctx);
    nodes.attachCompiled(compiled); nodes.configure({ flags, getScene: () => snapshot, setScene: () => {} });
    const impl = asRuntimeImpl(compiled)!, resource = impl.projectedSpotResourceFor(image)!;
    expect(fetch).toHaveBeenCalledOnce();
    device.begin();
    const identity = { device: device.asDevice(), owner, viewId: "main", frameIndex: 1 };
    const frame = resource.acquireFrame(identity)!;
    const texture = frame.texture;
    expect(frame.isCurrent(identity)).toBe(true);
    expect(nodes.remove("first")).toBe(true);
    expect(impl.projectedSpotResourceFor(image)).toBe(resource);
    expect(nodes.remove("second")).toBe(true);
    expect(impl.projectedSpotResourceFor(image)).toBeUndefined();
    expect(frame.isCurrent(identity)).toBe(false);
    expect(texture.disposed).toBe(false);
    device.end();
    expect(frame.release()).toBe(true);
    expect(texture.disposed).toBe(false);
    device.fences[0]!.resolve(undefined);
    await Promise.resolve();
    expect(texture.disposed).toBe(true);
    compiled.dispose();
    await impl.whenProjectedSpotDisposalsSettled();
  });

  it("cancels a removed dynamic light without publishing its late image", async () => {
    const bytes = imageBytes(), image = projectedAsset(bytes), owner = {}, device = new ProjectedDevice();
    vi.stubGlobal("crypto", webcrypto);
    const pending = deferred<Response>(), fetch = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetch);
    const snapshot = scene().toJSON() as AuraSceneSnapshot;
    const nodes = createAuraRuntimeNodeRegistry(snapshot), ctx = context(snapshot, nodes, device, owner);
    const compiled = await compileScene(snapshot, ctx);
    nodes.attachCompiled(compiled); nodes.configure({ flags, getScene: () => snapshot, setScene: () => {} });
    const impl = asRuntimeImpl(compiled)!;
    nodes.add(lights.spot({ projectedImage: { texture: image } }).runtime({ id: "late" }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(nodes.remove("late")).toBe(true);
    pending.resolve(new Response(bytes.slice().buffer as ArrayBuffer));
    await impl.whenProjectedSpotDisposalsSettled();
    expect(impl.projectedSpotResourceFor(image)).toBeUndefined();
    expect(device.listeners.size).toBe(0);
    compiled.dispose();
  });

  it("retains a sanitized failure warning in non-strict mode", async () => {
    const bytes = imageBytes(), image = { ...projectedAsset(bytes), hash: `sha256-${"0".repeat(64)}` }, owner = {}, device = new ProjectedDevice();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer)));
    const snapshot = scene().add(lights.spot({ name: "https://example.test/spot?sig=private", projectedImage: { texture: image } })).toJSON() as AuraSceneSnapshot;
    const nodes = createAuraRuntimeNodeRegistry(snapshot), ctx = context(snapshot, nodes, device, owner, false);
    const compiled = await compileScene(snapshot, ctx), impl = asRuntimeImpl(compiled)!;
    updateCompiledScene(compiled, snapshot, nodes, 1);
    const warnings = [...ctx.runtimeWarnings];
    expect(warnings.some((warning) => warning.includes("PROJECTED_SPOT_LOAD_FAILED"))).toBe(true);
    expect(warnings.join("\n")).not.toContain("private");
    expect(impl.projectedSpotResourceFor(image)).toBeUndefined();
    compiled.dispose();
    await impl.whenProjectedSpotDisposalsSettled();
  });

  it("rejects a failed initial image acquisition in strict mode", async () => {
    const bytes = imageBytes(), image = { ...projectedAsset(bytes), hash: `sha256-${"0".repeat(64)}` }, owner = {}, device = new ProjectedDevice();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer)));
    const snapshot = scene().add(lights.spot({ projectedImage: { texture: image } })).toJSON() as AuraSceneSnapshot;
    const nodes = createAuraRuntimeNodeRegistry(snapshot);
    await expect(compileScene(snapshot, context(snapshot, nodes, device, owner))).rejects.toThrow(/integrity|load asset/i);
    expect(device.listeners.size).toBe(0);
  });
});
