// These tests count device/texture/fetch calls for the scene they author; the 5.1 cold-start default look (studio IBL fetch) is off here.
process.env.A3D_COLD_START_LOOK = "0";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startProductionRender } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { upgradeCustomMaterialTextures } from "../../../packages/engine/src/agent-api/compiler/customTextures";
import { createAuraApp, defineAuraAssets, environments, material, primitives, scene } from "../../../packages/engine/src/public/index";
import type { AuraCustomMaterialSpec, ProductionRuntimePrimitiveEntry } from "../../../packages/engine/src/agent-api/nodes/types";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import type { RenderSource } from "../../../packages/rendering/src/contracts/renderSource";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

const hdriMock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../../packages/engine/src/agent-api/compiler/primitives", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../packages/engine/src/agent-api/compiler/primitives")>();
  return { ...original, upgradeProductionEnvironmentHdri: hdriMock.load };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {} removeEventListener() {}
}
const bitmap = () => ({ width: 1, height: 1, close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
// Decoding is mocked in this suite; the verified bytes and declared digest are still real.
const imageBytes = Uint8Array.of(0, 1, 2);
const imageHash = `sha256-${createHash("sha256").update(imageBytes).digest("hex")}`;
const imageResponse = () => new Response(imageBytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } });
const assets = defineAuraAssets({
  first: { type: "texture", format: "png", url: "/first.png", hash: imageHash },
  second: { type: "texture", format: "png", url: "/second.png", hash: imageHash },
  sky: { type: "texture", format: "hdr", url: "/sky.hdr" }
});

function setupRenderer() {
  const callbacks = new Map<number, FrameRequestCallback>();
  const mounted: Array<{ device: MockRenderDevice; frames: RenderSource[]; invalidations: number }> = [];
  let nextId = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextId; callbacks.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  vi.spyOn(Renderer, "create").mockImplementation(async () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgl2" });
    const item = { device, frames: [] as RenderSource[], invalidations: 0 };
    mounted.push(item);
    const render = (source: RenderSource) => { item.frames.push(source); return device.getDiagnostics(); };
    return {
      device, getDiagnostics: () => device.getDiagnostics(), getShadowEvidence: () => null,
      isDeviceLost: () => device.contextLost, onDeviceLost: () => () => {}, onDeviceRestored: () => () => {},
      invalidateBenchmarkMaskFrame: () => { item.invalidations++; }, resetTemporalHistory() {}, resize() {},
      postDiagnosticViews: () => undefined, postScopeId: () => undefined,
      // Renderer contract: teardown awaits the owned device retirement.
      whenOwnedDeviceDisposed: async () => { if (!device.disposed) throw new Error("device not disposed"); },
      render, renderAsync: async (source: RenderSource) => render(source), dispose: () => device.dispose()
    } as unknown as Renderer;
  });
  const runFrame = async (owner: number, expectedFrames: number) => {
    const next = [...callbacks.entries()][0];
    if (!next) throw new Error("No invalidated frame was scheduled");
    callbacks.delete(next[0]);
    next[1](16);
    await vi.waitFor(() => expect(mounted[owner]!.frames).toHaveLength(expectedFrames));
    await vi.waitFor(() => expect(callbacks.size).toBe(0));
  };
  return { callbacks, mounted, runFrame };
}
const options = { autoStart: true, resize: false, diagnostics: false, frameMode: "async" as const,
  renderer: { backend: "webgl2" as const }, qualityRebuild: { flags: "none" as const } };

async function mount(snapshot: ReturnType<ReturnType<typeof scene>["toJSON"]>, autoStart = true) {
  return startProductionRender(new FakeCanvas() as unknown as HTMLCanvasElement, snapshot,
    createInitialDiagnostics(snapshot, undefined), { ...options, autoStart, scene: snapshot });
}

function customFixture() {
  const custom: AuraCustomMaterialSpec = {
    glsl: { fragment: "out vec4 outColor; void main() { outColor = texture(first, vec2(0.5)) + texture(second, vec2(0.5)); }" },
    uniforms: { first: { type: "texture2d", value: assets.first }, second: { type: "texture2d", value: assets.second } }
  };
  const shader = createCustomShaderMaterial(custom, "fixture");
  const resource = { name: "fixture", material: shader, materialSpec: { kind: "custom", custom },
    textureWarnings: [] as string[], textureDisposer: undefined as (() => void) | undefined };
  return { shader, resource, entries: [{ resources: [resource] }] as unknown as readonly ProductionRuntimePrimitiveEntry[] };
}

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); hdriMock.load.mockReset(); });

describe("mount texture upgrade lifecycle", () => {
  it("redraws only the owning static app after each committed primitive texture", async () => {
    const { callbacks, mounted, runFrame } = setupRenderer();
    const first = deferred<Response>(); const second = deferred<Response>();
    const fetch = vi.fn((url: RequestInfo | URL) => String(url).includes("first") ? first.promise : second.promise);
    vi.stubGlobal("fetch", fetch);
    const decoded = [bitmap(), bitmap()];
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce(decoded[0]).mockResolvedValueOnce(decoded[1]));
    const a = scene().add(primitives.box({ name: "first", material: material.pbr({ texture: assets.first }) }))
      .add(primitives.box({ name: "second", position: [2, 0, 0], material: material.pbr({ texture: assets.second }) })).toJSON();
    const b = scene().add(primitives.box({ name: "other" })).toJSON();
    const appA = await mount(a); const appB = await mount(b);
    try {
      expect(mounted.map((entry) => entry.frames.length)).toEqual([1, 1]);
      expect(callbacks.size).toBe(0);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      first.resolve(imageResponse());
      await vi.waitFor(() => expect(callbacks.size).toBe(1));
      expect(fetch).toHaveBeenCalledTimes(2); // second load is still pending
      await runFrame(0, 2);
      expect(mounted.map((entry) => entry.frames.length)).toEqual([2, 1]);
      const submittedSource = mounted[0]!.frames[1]!;
      const rendered = [...(submittedSource.collectRenderItems?.() ?? submittedSource.renderItems ?? [])];
      expect(rendered.some((entry) => entry.material?.getParameter("u_baseColorTexture") instanceof TextureBinding)).toBe(true);
      second.resolve(imageResponse());
      await vi.waitFor(() => expect(callbacks.size).toBe(1));
      await runFrame(0, 3);
      expect(mounted.map((entry) => entry.frames.length)).toEqual([3, 1]);
    } finally { appA.dispose(); appB.dispose(); await Promise.all([appA.whenIdle?.(), appB.whenIdle?.()]); }
    expect(decoded[0]!.close).toHaveBeenCalledTimes(1);
    expect(decoded[1]!.close).toHaveBeenCalledTimes(1);
  });

  it("redraws a static app when an HDR environment swap commits", async () => {
    const { callbacks, mounted, runFrame } = setupRenderer();
    const pending = deferred<{ lighting: object; dispose: () => void; maxLinearValue: number; specularMipCount: number; dualProbe: boolean }>();
    hdriMock.load.mockReturnValue(pending.promise);
    const snapshot = scene().add(environments.hdri({ texture: assets.sky })).add(primitives.box()).toJSON();
    const app = await mount(snapshot);
    const lighting = { intensity: 0.37 };
    const dispose = vi.fn();
    try {
      expect(mounted[0]!.frames).toHaveLength(1);
      expect(callbacks.size).toBe(0);
      pending.resolve({ lighting, dispose, maxLinearValue: 2, specularMipCount: 1, dualProbe: false });
      await vi.waitFor(() => expect(callbacks.size).toBe(1));
      await runFrame(0, 2);
      expect(mounted[0]!.frames).toHaveLength(2);
      expect(mounted[0]!.frames[1]!.environmentLighting).toBe(lighting);
    } finally { app.dispose(); await app.whenIdle?.(); }
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps manual mode manual and ignores a late environment result after disposal", async () => {
    const { callbacks, mounted } = setupRenderer();
    const pending = deferred<{ lighting: object; dispose: () => void; maxLinearValue: number; specularMipCount: number; dualProbe: boolean }>();
    hdriMock.load.mockReturnValue(pending.promise);
    const app = await mount(scene().add(environments.hdri({ texture: assets.sky })).add(primitives.box()).toJSON(), false);
    const lighting = { intensity: 0.25 };
    const disposeFirst = vi.fn();
    pending.resolve({ lighting, dispose: disposeFirst, maxLinearValue: 1, specularMipCount: 1, dualProbe: false });
    await vi.waitFor(() => expect(app.diagnostics?.()?.environment.hdriStatus).toBe("ready"));
    expect(callbacks.size).toBe(0);
    expect(mounted[0]!.frames).toHaveLength(1);
    app.render(0);
    expect(mounted[0]!.frames[1]!.environmentLighting).toBe(lighting);
    app.dispose();
    expect(disposeFirst).toHaveBeenCalledTimes(1);

    const late = deferred<{ lighting: object; dispose: () => void; maxLinearValue: number; specularMipCount: number; dualProbe: boolean }>();
    hdriMock.load.mockReturnValue(late.promise);
    const replaced = await mount(scene().add(environments.hdri({ texture: assets.sky })).add(primitives.box()).toJSON(), false);
    replaced.dispose();
    const dispose = vi.fn();
    late.resolve({ lighting: {}, dispose, maxLinearValue: 1, specularMipCount: 1, dualProbe: false });
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    expect(callbacks.size).toBe(0);
    await Promise.all([app.whenIdle?.(), replaced.whenIdle?.()]);
  });

  it("notifies for each custom binding without waiting for later uniforms", async () => {
    const { shader, resource, entries } = customFixture();
    const first = bitmap(); const second = deferred<ImageBitmap>();
    const loader = vi.fn<(url: string, signal?: AbortSignal) => Promise<ImageBitmap>>()
      .mockResolvedValueOnce(first).mockReturnValueOnce(second.promise);
    const notify = vi.fn(); const controller = new AbortController();
    const pending = upgradeCustomMaterialTextures(entries, vi.fn(), loader, controller.signal, notify);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(loader).toHaveBeenNthCalledWith(1, "/first.png", controller.signal);
    expect(notify).toHaveBeenCalledTimes(1);
    const firstBinding = shader.getParameter("u_first") as TextureBinding;
    expect(firstBinding.texture).not.toBeNull();
    const next = bitmap(); second.resolve(next);
    await pending;
    expect(notify).toHaveBeenCalledTimes(2);
    resource.textureDisposer!(); shader.dispose();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(next.close).toHaveBeenCalledTimes(1);
  });

  it("cleans earlier custom bindings when a later load rejects after disposal", async () => {
    const { shader, resource, entries } = customFixture();
    const first = bitmap(); const second = deferred<ImageBitmap>();
    const loader = vi.fn<(url: string, signal?: AbortSignal) => Promise<ImageBitmap>>()
      .mockResolvedValueOnce(first).mockReturnValueOnce(second.promise);
    const warn = vi.fn(); const notify = vi.fn(); const controller = new AbortController();
    const pending = upgradeCustomMaterialTextures(entries, warn, loader, controller.signal, notify);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    const texture = (shader.getParameter("u_first") as TextureBinding).texture!;
    // Scene removal invokes the currently installed disposer before disposing
    // the material; the mount itself can remain live for other nodes.
    resource.textureDisposer?.(); shader.dispose();
    second.reject(new Error("cancelled transport"));
    await pending;
    expect(texture.disposed).toBe(true);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("closes an uncooperative late bitmap after mount cancellation", async () => {
    const { shader, resource, entries } = customFixture();
    // Both texture uniforms start loading at once (GU47 e6 phase 8), so each
    // load gets its own late bitmap and each must be closed exactly once.
    const late = [deferred<ImageBitmap>(), deferred<ImageBitmap>()];
    const loader = vi.fn<(url: string, signal?: AbortSignal) => Promise<ImageBitmap>>()
      .mockReturnValueOnce(late[0]!.promise).mockReturnValueOnce(late[1]!.promise);
    const controller = new AbortController(); const notify = vi.fn(); const warn = vi.fn();
    const pending = upgradeCustomMaterialTextures(entries, warn, loader, controller.signal, notify);
    controller.abort(); shader.dispose();
    const images = [bitmap(), bitmap()]; late[0]!.resolve(images[0]!); late[1]!.resolve(images[1]!);
    await pending;
    expect(loader).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(images[1]!.close).toHaveBeenCalled());
    for (const [index, image] of images.entries()) expect(image.close, `bitmap ${index}`).toHaveBeenCalledTimes(1);
    expect(resource.textureDisposer).toBeUndefined();
    expect(notify).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
  });

  it("bounds per-mount texture jobs and aborts in-flight work on disposal", async () => {
    setupRenderer();
    const requests = Array.from({ length: 5 }, () => deferred<Response>());
    const signals = new Map<number, AbortSignal>();
    const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const index = Number(String(url).match(/\/(\d)\.png$/)?.[1]);
      if (!Number.isInteger(index) || !requests[index]) throw new Error("Unexpected texture request");
      if (init?.signal) signals.set(index, init.signal);
      return requests[index]!.promise; // Deliberately ignores abort until its response arrives.
    });
    vi.stubGlobal("fetch", fetch);
    const decoded = bitmap();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => decoded));
    const maps = defineAuraAssets({
      a: { type: "texture", format: "png", url: "/0.png", hash: imageHash },
      b: { type: "texture", format: "png", url: "/1.png", hash: imageHash },
      c: { type: "texture", format: "png", url: "/2.png", hash: imageHash },
      d: { type: "texture", format: "png", url: "/3.png", hash: imageHash },
      e: { type: "texture", format: "png", url: "/4.png", hash: imageHash }
    });
    const builder = scene();
    for (const [index, map] of Object.values(maps).entries()) {
      builder.add(primitives.box({ name: `item-${index}`, material: material.pbr({ texture: map }) }));
    }
    const app = await mount(builder.toJSON(), false);
    try {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
      requests[0]!.resolve(imageResponse());
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
      expect(app.diagnostics?.()?.runtime.texturedMaterials).toContainEqual(
        expect.objectContaining({ nodeName: "item-0", status: "textured", pixelBacked: true })
      );
    } finally { app.dispose(); }
    expect(signals.size).toBe(5);
    expect(signals.get(0)?.aborted).toBe(false);
    for (const index of [1, 2, 3, 4]) expect(signals.get(index)?.aborted).toBe(true);
    for (const request of requests.slice(1)) request.resolve(imageResponse());
    await vi.waitFor(() => expect(decoded.close).toHaveBeenCalledTimes(1));
    await app.whenIdle?.();
  });

  it("keeps canceled work in its slots and deduplicates queued material replacements", async () => {
    setupRenderer();
    const oldResponses = Array.from({ length: 4 }, () => deferred<Response>());
    const latestResponse = deferred<Response>();
    const calls: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal("fetch", vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      calls.push({ url: path, signal: init?.signal ?? undefined });
      const oldIndex = Number(path.match(/\/old-(\d)\.png$/)?.[1]);
      if (Number.isInteger(oldIndex) && oldResponses[oldIndex]) return oldResponses[oldIndex]!.promise;
      if (path.endsWith("/latest.png")) return latestResponse.promise;
      throw new Error(`Unexpected texture request: ${path}`);
    }));
    const latestImage = bitmap();
    const decode = vi.fn(async () => latestImage);
    vi.stubGlobal("createImageBitmap", decode);
    const maps = defineAuraAssets({
      old0: { type: "texture", format: "png", url: "/old-0.png", hash: imageHash },
      old1: { type: "texture", format: "png", url: "/old-1.png", hash: imageHash },
      old2: { type: "texture", format: "png", url: "/old-2.png", hash: imageHash },
      old3: { type: "texture", format: "png", url: "/old-3.png", hash: imageHash },
      obsolete: { type: "texture", format: "png", url: "/obsolete.png", hash: imageHash },
      latest: { type: "texture", format: "png", url: "/latest.png", hash: imageHash }
    });
    const draws: DrawCommand[] = [];
    class CapturingDevice extends MockRenderDevice {
      override draw(command: DrawCommand): void { draws.push(command); super.draw(command); }
    }
    vi.mocked(Renderer.create).mockImplementation(async (rendererOptions = {}) => {
      const device = new CapturingDevice();
      Object.defineProperty(device, "kind", { value: "webgl2" });
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
      return new Renderer(device, { ...rendererOptions, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    });
    const builder = scene();
    for (const [index, map] of [maps.old0, maps.old1, maps.old2, maps.old3].entries()) {
      builder.add(primitives.box({ name: `old-${index}`, material: material.pbr({ texture: map }) }).runtime({ id: `old-${index}` }));
    }
    builder.add(primitives.box({ name: "queued", material: material.pbr({ texture: maps.obsolete }) }).runtime({ id: "queued" }));
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: builder, autoStart: false, resize: false,
      qualityRebuild: { flags: {
        A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
        A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false, A3D_QR_VFX: false
      }, allowUrlFlags: false }
    });
    try {
      await app.readyStrict({ stage: "first-frame" });
      await vi.waitFor(() => expect(calls).toHaveLength(4));
      for (let index = 0; index < 4; index += 1) {
        app.nodes.require(`old-${index}`).setMaterial(material.pbr({ color: "#ffffff" }));
      }
      expect(calls.every((call) => call.signal?.aborted)).toBe(true);
      app.step(0);
      const queued = app.nodes.require("queued");
      for (let revision = 0; revision < 30; revision += 1) {
        queued.setMaterial(material.pbr({ texture: revision % 2 === 0 ? maps.obsolete : maps.latest }));
        app.step(0);
      }
      await Promise.resolve();
      expect(calls).toHaveLength(4);
      expect(app.diagnostics().renderer?.runtime.warnings?.some((warning) => warning.includes("TEXTURE_UPGRADE_QUEUE_BLOCKED"))).toBe(true);

      oldResponses[0]!.resolve(imageResponse());
      await vi.waitFor(() => expect(calls).toHaveLength(5));
      expect(calls[4]!.url).toContain("/latest.png");
      expect(calls.some((call) => call.url.includes("/obsolete.png"))).toBe(false);
      expect(decode).not.toHaveBeenCalled(); // The settled canceled request cannot publish.
      latestResponse.resolve(imageResponse());
      await vi.waitFor(() => expect(app.diagnostics().renderer?.runtime.texturedMaterials).toContainEqual(
        expect.objectContaining({ nodeName: "queued", status: "textured", pixelBacked: true })
      ));
      draws.length = 0;
      app.step(0);
      const binding = draws.find((draw) => draw.label?.includes(":queued") && draw.uniforms?.has("u_baseColorMap"))?.uniforms?.get("u_baseColorMap");
      expect(binding).toBeInstanceOf(TextureBinding);
      if (!(binding instanceof TextureBinding) || !binding.texture) throw new Error("Submitted draw is missing its live texture");
      expect(binding.texture.source).toBe(latestImage);
    } finally {
      for (const response of oldResponses) response.resolve(imageResponse());
      latestResponse.resolve(imageResponse());
      await app.disposeAsync();
    }
    expect(latestImage.close).toHaveBeenCalledTimes(1);
  });
});
