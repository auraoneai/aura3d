import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetManager, type AssetRequestOptions } from "@aura3d/assets/browser";
import { createAuraApp, defineAuraAssets, material, primitives, scene, texture } from "../../../packages/engine/src/public/index";
import type { AuraNativeTextureLoadOptions } from "../../../packages/engine/src/public/index";
import { applyCustomUniformWrites, createCustomShaderMaterial, syncCustomTextureRefs } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { resolveAuraTextureRef } from "../../../packages/engine/src/agent-api/compiler/textures";
import { auraTextureRefTexture } from "../../../packages/engine/src/agent-api/nodes/texture";
import { prepareNativeTextureLoad, runNativeTextureLoad, startNativeTextureLoad, type PreparedNativeTextureLoad } from "../../../packages/engine/src/agent-api/nodes/loadNativeTexture";
import { MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

/** Independently constructed 2x2 PVR v3 RGBA8 image; no external asset. */
function pvr(options: { flags?: number; metadata?: Uint8Array; format?: number } = {}): Uint8Array {
  const metadata = options.metadata ?? new Uint8Array();
  const compressed = options.format !== undefined;
  const pixels = compressed ? new Uint8Array(32) : Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 128,
    0, 0, 255, 255, 255, 255, 255, 0
  ]);
  const bytes = new Uint8Array(52 + metadata.length + pixels.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x03525650, true);
  view.setUint32(4, options.flags ?? 0, true);
  view.setUint32(8, options.format ?? 0x61626772, true);
  view.setUint32(12, compressed ? 0 : 0x08080808, true);
  view.setUint32(16, 1, true); // sRGB
  view.setUint32(20, 0, true); // unsigned normalized bytes
  view.setUint32(24, 2, true);
  view.setUint32(28, 2, true);
  view.setUint32(32, 1, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, 1, true);
  view.setUint32(48, metadata.length, true);
  bytes.set(metadata, 52);
  bytes.set(pixels, 52 + metadata.length);
  return bytes;
}

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const asset = (bytes: Uint8Array, request: AssetRequestOptions = {}) =>
  defineAuraAssets({ image: {
    type: "texture", format: "pvr", url: "https://assets.example.test/image?version=1",
    hash: `sha256-${digest(bytes)}`, request
  } }).image;

function response(bytes: Uint8Array): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "application/octet-stream" } });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

/** The compiler and Renderer are real; only device acquisition is replaced. */
class CapturingDevice extends MockRenderDevice {
  readonly submitted: Array<{ label?: string; binding: TextureBinding }> = [];
  override draw(command: DrawCommand): void {
    // Generated programs rename the material's base-color parameter.
    const binding = command.uniforms?.get("u_baseColorMap");
    if (binding instanceof TextureBinding) this.submitted.push({ label: command.label, binding });
    super.draw(command);
  }
}

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("typed native PVR texture acquisition", () => {
  it("snapshots a queued request without I/O and executes independently of later mutations", async () => {
    const bytes = pvr();
    const headers = new Headers({ "x-queued-policy": "original" });
    const origins = ["https://assets.example.test"];
    const typed = asset(bytes, { credentials: "include", allowedOrigins: origins, maxBytes: bytes.length + 10 });
    const request = { headers, allowedOrigins: [...origins], cache: "no-store" as const, redirect: "error" as const, maxBytes: bytes.length };
    const options = { request, maxFileBytes: bytes.length, maxPixels: 4, maxDecodedBytes: 64, maxMipLevels: 1 };
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(bytes));
    const register = vi.spyOn(AssetManager.prototype, "register");
    vi.stubGlobal("fetch", fetch);

    const plan = prepareNativeTextureLoad(typed, options);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Reflect.ownKeys(plan)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    (typed as { url: string; hash?: string }).url = "https://wrong.example.test/changed";
    (typed as { hash?: string }).hash = "0".repeat(64);
    headers.set("x-queued-policy", "changed");
    origins[0] = "https://wrong.example.test";
    request.allowedOrigins[0] = "https://wrong.example.test";
    request.maxBytes = 0;
    options.maxFileBytes = 1;
    options.maxPixels = 1;
    options.maxDecodedBytes = 1;
    options.maxMipLevels = 0;

    const first = await runNativeTextureLoad(plan, undefined, texture.fromNativeImage);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://assets.example.test/image?version=1");
    expect(init?.credentials).toBe("include");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("x-queued-policy")).toBe("original");
    expect(Array.from(first.texture.mipLevels[0]!.data)).toEqual(Array.from(bytes.slice(52)));
    const second = await runNativeTextureLoad(plan, undefined, texture.fromNativeImage);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    first.dispose();
    expect(second.texture.disposed).toBe(false);
    second.dispose();
  });

  it("rejects a forged queued plan and pre-cancelled scopes before any fetch", async () => {
    const bytes = pvr();
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    await expect(runNativeTextureLoad({} as PreparedNativeTextureLoad, undefined, texture.fromNativeImage)).rejects.toThrow(/invalid prepared/i);
    const caller = new AbortController();
    const plan = prepareNativeTextureLoad(asset(bytes), { signal: caller.signal });
    caller.abort();
    await expect(runNativeTextureLoad(plan, new AbortController().signal, texture.fromNativeImage)).rejects.toThrow(/abort/i);
    const job = new AbortController();
    const another = prepareNativeTextureLoad(asset(bytes));
    job.abort();
    await expect(runNativeTextureLoad(another, job.signal, texture.fromNativeImage)).rejects.toThrow(/abort/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["caller", "job"] as const)("cancels a queued-plan execution from the %s scope and removes linked listeners", async (scope) => {
    const bytes = pvr();
    const caller = new AbortController();
    const job = new AbortController();
    const callerRemove = vi.spyOn(caller.signal, "removeEventListener");
    const jobRemove = vi.spyOn(job.signal, "removeEventListener");
    const started = deferred<void>();
    const reply = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => { started.resolve(undefined); return reply.promise; }));
    const plan = prepareNativeTextureLoad(asset(bytes), { signal: caller.signal });
    const loading = runNativeTextureLoad(plan, job.signal, texture.fromNativeImage);
    const failure = expect(loading).rejects.toThrow(/abort/i);
    await started.promise;
    (scope === "caller" ? caller : job).abort();
    await failure;
    expect((scope === "caller" ? job : caller).signal.aborted).toBe(false);
    expect(callerRemove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(jobRemove).toHaveBeenCalledWith("abort", expect.any(Function));
    reply.resolve(response(bytes));
  });

  it("removes linked scope listeners after a successful queued-plan execution", async () => {
    const bytes = pvr();
    const caller = new AbortController();
    const job = new AbortController();
    const callerRemove = vi.spyOn(caller.signal, "removeEventListener");
    const jobRemove = vi.spyOn(job.signal, "removeEventListener");
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const plan = prepareNativeTextureLoad(asset(bytes), { signal: caller.signal });
    const handle = await runNativeTextureLoad(plan, job.signal, texture.fromNativeImage);
    expect(callerRemove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(jobRemove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(handle.texture.disposed).toBe(false);
    handle.dispose();
  });

  it("keeps the physical-work barrier pending through a late response and its body cancellation", async () => {
    const bytes = pvr();
    const caller = new AbortController();
    const job = new AbortController();
    const fetching = deferred<void>();
    const reply = deferred<Response>();
    const cancelling = deferred<void>();
    const finishCancel = deferred<void>();
    const body = new ReadableStream<Uint8Array>({
      cancel: () => { cancelling.resolve(undefined); return finishCancel.promise; }
    });
    vi.stubGlobal("fetch", vi.fn(() => { fetching.resolve(undefined); return reply.promise; }));
    const plan = prepareNativeTextureLoad(asset(bytes), { signal: caller.signal });
    const started = startNativeTextureLoad(plan, job.signal, texture.fromNativeImage);
    const failure = expect(started.result).rejects.toThrow(/abort/i);
    let physicallySettled = false;
    void started.settled.then(() => { physicallySettled = true; });
    await fetching.promise;
    job.abort();
    await failure;
    await Promise.resolve();
    expect(physicallySettled).toBe(false);
    expect(caller.signal.aborted).toBe(false);
    reply.resolve(new Response(body));
    await cancelling.promise;
    await Promise.resolve();
    expect(physicallySettled).toBe(false);
    finishCancel.resolve(undefined);
    await started.settled;
    expect(physicallySettled).toBe(true);
  });

  it("waits for an in-flight request-identity digest after prompt cancellation", async () => {
    const bytes = pvr();
    const controller = new AbortController();
    const digestStarted = deferred<void>();
    const finishDigest = deferred<ArrayBuffer>();
    const subtle = { digest: vi.fn(() => { digestStarted.resolve(undefined); return finishDigest.promise; }) };
    vi.stubGlobal("crypto", { subtle });
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const plan = prepareNativeTextureLoad(asset(bytes));
    const started = startNativeTextureLoad(plan, controller.signal, texture.fromNativeImage);
    const failure = expect(started.result).rejects.toThrow(/abort/i);
    let physicallySettled = false;
    void started.settled.then(() => { physicallySettled = true; });
    await digestStarted.promise;
    controller.abort();
    await failure;
    await Promise.resolve();
    expect(physicallySettled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    finishDigest.resolve(new ArrayBuffer(32));
    await started.settled;
    expect(physicallySettled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("verifies and snapshots pixels into an independently owned public material handle", async () => {
    const bytes = pvr();
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const release = vi.spyOn(AssetManager.prototype, "release");
    const handle = await texture.loadNativeAsset(asset(bytes));
    const acquisition = release.mock.calls[0]?.[0];
    expect(release).toHaveBeenCalledTimes(1);
    expect(acquisition?.disposed).toBe(true);
    expect(handle.texture.disposed).toBe(false);
    expect(handle.texture.width).toBe(2);
    expect(handle.texture.height).toBe(2);
    expect(handle.texture.format).toBe("rgba8");
    expect(handle.texture.colorSpace).toBe("srgb");
    expect(Array.from(handle.texture.mipLevels[0]!.data)).toEqual(Array.from(bytes.slice(52)));
    expect(material.pbr({ texture: handle }).texture).toBe(handle);
    expect(auraTextureRefTexture(handle)).toBe(handle.texture);
    bytes.fill(0);
    expect(handle.texture.mipLevels[0]!.data[0]).toBe(255);
    handle.dispose();
    expect(handle.texture.disposed).toBe(true);
  });

  it("submits the acquired texture through the public app, compiler and Renderer without taking caller ownership", async () => {
    const bytes = pvr();
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const handle = await texture.loadNativeAsset(asset(bytes));
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "https://assets.example.test/", search: "" }, addEventListener() {}, removeEventListener() {} });
    const devices: CapturingDevice[] = [];
    vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
      const device = new CapturingDevice();
      const renderer = new Renderer(device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
      Object.defineProperty(device, "kind", { value: "webgl2" });
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
      devices.push(device);
      return renderer;
    });
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box({ name: "pvr-receiver", material: material.pbr({ texture: handle }) })),
      autoStart: false, resize: false,
      qualityRebuild: { flags: {
        A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
        A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false
      }, allowUrlFlags: false }
    });
    try {
      await app.readyStrict({ stage: "first-frame" });
      // Material upgrades are asynchronous and may finish after the first
      // scalar frame. Require the actual upgraded state before a second draw.
      await vi.waitFor(() => expect(app.diagnostics().renderer?.runtime.texturedMaterials).toContainEqual(
        expect.objectContaining({ nodeName: "pvr-receiver", status: "textured", pixelBacked: true, slots: expect.arrayContaining(["baseColor"]) })
      ));
      app.step(0);
      const submission = devices[0]?.submitted.find((item) => item.label?.includes(":pvr-receiver"));
      expect(submission).toBeDefined();
      expect(submission?.binding.texture).toBe(handle.texture);
      expect(Array.from(submission!.binding.texture!.mipLevels[0]!.data)).toEqual(Array.from(bytes.slice(52)));
      expect(fetch).toHaveBeenCalledOnce();
      await app.disposeAsync();
      expect(handle.texture.disposed).toBe(false);
    } finally {
      app.dispose();
      handle.dispose();
    }
    expect(handle.texture.disposed).toBe(true);
  });

  it("snapshots effective request metadata before loading the optional importer", async () => {
    const bytes = pvr();
    const headers = new Headers({ "x-asset-policy": "original" });
    const origins = ["https://assets.example.test"];
    const typed = asset(bytes, { credentials: "include", headers, allowedOrigins: origins, maxBytes: bytes.length + 20 });
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const options = { request: { cache: "no-store" as const, redirect: "error" as const, maxBytes: bytes.length } } satisfies AuraNativeTextureLoadOptions;
    const loading = texture.loadNativeAsset(typed, options);
    headers.set("x-asset-policy", "changed");
    origins[0] = "https://wrong.example.test";
    (typed as { url: string }).url = "https://wrong.example.test/replaced";
    options.request.maxBytes = 0;
    const handle = await loading;
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://assets.example.test/image?version=1");
    expect(init?.credentials).toBe("include");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("x-asset-policy")).toBe("original");
    handle.dispose();
  });

  it("rejects absent, conflicting, or changed integrity before publishing a texture", async () => {
    const bytes = pvr();
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const unhashed = defineAuraAssets({ image: { type: "texture", format: "pvr", url: "https://assets.example.test/image" } }).image;
    await expect(texture.loadNativeAsset(unhashed)).rejects.toThrow(/expected SHA-256/);
    const typed = asset(bytes);
    await expect(texture.loadNativeAsset(typed, { request: { integrity: { version: 1, digest: "0".repeat(64) } } })).rejects.toThrow(/conflicts/);
    expect(fetch).not.toHaveBeenCalled();
    bytes[52] = (bytes[52] ?? 0) ^ 1;
    await expect(texture.loadNativeAsset(typed)).rejects.toThrow(/load asset|integrity/i);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("applies the stricter request byte and decoded-pixel limits", async () => {
    const bytes = pvr();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    await expect(texture.loadNativeAsset(asset(bytes, { maxBytes: bytes.length - 1 }), { request: { maxBytes: bytes.length + 5 } })).rejects.toThrow();
    await expect(texture.loadNativeAsset(asset(bytes), { maxPixels: 3 })).rejects.toThrow();
    await expect(texture.loadNativeAsset(asset(bytes), { maxPixels: 0 })).rejects.toThrow(/maxPixels/);
    await expect(texture.loadNativeAsset(asset(bytes), { maxFileBytes: 128 * 1024 * 1024 + 1 })).rejects.toThrow(/maxFileBytes/);
  });

  it("releases the parsed acquisition when unsupported alpha or orientation cannot be converted", async () => {
    const release = vi.spyOn(AssetManager.prototype, "release");
    for (const bytes of [pvr({ flags: 2 }), pvr({ metadata: Uint8Array.of(1, 2, 3, 4) })]) {
      vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
      await expect(texture.loadNativeAsset(asset(bytes))).rejects.toThrow(/premultiplied|orientation/i);
    }
    expect(release).toHaveBeenCalledTimes(2);
    expect(release.mock.calls.every(([entry]) => entry.disposed)).toBe(true);
  });

  it("rejects compressed formats that require undeclared device capabilities", async () => {
    const bytes = pvr({ format: 2 }); // PVRTC cannot be decoded by the CPU path.
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    await expect(texture.loadNativeAsset(asset(bytes))).rejects.toThrow(/load asset|codec|gpu/i);
  });

  it("uses a CPU-decoded BC fallback without assuming a device compression format", async () => {
    const bytes = pvr({ format: 7 });
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const progress = vi.fn();
    const handle = await texture.loadNativeAsset(asset(bytes), { onProgress: progress });
    expect(handle.texture.format).toBe("rgba8");
    expect(Array.from(handle.texture.mipLevels[0]!.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(handle.diagnostics.some((entry) => entry.includes("decoded to RGBA8"))).toBe(true);
    expect(progress.mock.calls.some(([event]) => event.phase === "complete")).toBe(true);
    handle.dispose();
  });

  it("lets one caller cancel without cancelling an independent concurrent acquisition", async () => {
    const bytes = pvr();
    const firstController = new AbortController();
    const firstReady = deferred<void>();
    const secondReady = deferred<void>();
    const firstReply = deferred<Response>();
    const secondReply = deferred<Response>();
    let calls = 0;
    const fetch = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => {
      calls += 1;
      if (calls === 1) { firstReady.resolve(undefined); return firstReply.promise; }
      secondReady.resolve(undefined);
      return secondReply.promise;
    });
    vi.stubGlobal("fetch", fetch);
    const first = texture.loadNativeAsset(asset(bytes), { signal: firstController.signal });
    const firstFailure = expect(first).rejects.toThrow(/abort/i);
    await firstReady.promise;
    const second = texture.loadNativeAsset(asset(bytes));
    await secondReady.promise;
    firstController.abort();
    await firstFailure;
    secondReply.resolve(response(bytes));
    const handle = await second;
    expect(handle.texture.format).toBe("rgba8");
    expect(fetch).toHaveBeenCalledTimes(2);
    firstReply.resolve(response(bytes));
    handle.dispose();
  });

  it("cancels a pending transport and discards a response that arrives afterward", async () => {
    const bytes = pvr();
    const controller = new AbortController();
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    let resolveResponse!: (value: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn(() => { started(); return pendingResponse; }));
    const loading = texture.loadNativeAsset(asset(bytes), { signal: controller.signal });
    await began;
    controller.abort();
    await expect(loading).rejects.toThrow(/abort/i);
    resolveResponse(new Response(stream));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not publish a texture when cancellation happens during acquisition cleanup", async () => {
    const bytes = pvr();
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    const controller = new AbortController();
    let cleanupStarted!: () => void;
    const started = new Promise<void>((resolve) => { cleanupStarted = resolve; });
    let allowCleanup!: () => void;
    const cleanupGate = new Promise<void>((resolve) => { allowCleanup = resolve; });
    const originalRelease = AssetManager.prototype.release;
    vi.spyOn(AssetManager.prototype, "release").mockImplementation(async function (this: AssetManager, acquired) {
      cleanupStarted();
      await cleanupGate;
      await originalRelease.call(this, acquired);
    });
    const disposedTextures: Texture[] = [];
    const originalDispose = Texture.prototype.dispose;
    const dispose = vi.spyOn(Texture.prototype, "dispose").mockImplementation(function (this: Texture) {
      disposedTextures.push(this);
      originalDispose.call(this);
    });
    const loading = texture.loadNativeAsset(asset(bytes), { signal: controller.signal });
    await started;
    controller.abort();
    allowCleanup();
    await expect(loading).rejects.toThrow(/abort/i);
    expect(dispose).toHaveBeenCalledOnce();
    expect(disposedTextures[0]?.disposed).toBe(true);
  });

  it("rejects a disposed handle while letting a staged custom-material replacement take effect", () => {
    const previous = texture.data({ width: 1, height: 1, data: Uint8Array.of(255, 0, 0, 255) });
    const replacement = texture.data({ width: 1, height: 1, data: Uint8Array.of(0, 0, 255, 255) });
    const shader = createCustomShaderMaterial({
      glsl: { fragment: "out vec4 outColor; void main() { outColor = texture(map, vec2(0.5)); }" },
      uniforms: { map: { type: "texture2d", value: previous } }
    });
    try {
      const oldBinding = shader.getParameter("u_map") as TextureBinding;
      expect(oldBinding.texture).toBe(previous.texture);
      previous.dispose();
      expect(auraTextureRefTexture(previous)).toBeNull();
      expect(() => resolveAuraTextureRef(previous)).toThrow(/disposed|no backing/i);
      expect(() => createCustomShaderMaterial({
        glsl: { fragment: "out vec4 outColor; void main() { outColor = texture(map, vec2(0.5)); }" },
        uniforms: { map: { type: "texture2d", value: previous } }
      })).toThrow(/no live backing/i);
      // The draw cannot sample the old texture, but synchronization leaves it
      // in place until a staged replacement is applied later in the frame.
      expect(syncCustomTextureRefs(shader)).toBe(0);
      expect(oldBinding.validate().ok).toBe(false);
      expect(applyCustomUniformWrites(shader, new Map([["map", replacement]]))).toBe(1);
      const newBinding = shader.getParameter("u_map") as TextureBinding;
      expect(newBinding.texture).toBe(replacement.texture);
      expect(newBinding.validate().ok).toBe(true);
      expect(syncCustomTextureRefs(shader)).toBe(0);
    } finally {
      shader.dispose();
      previous.dispose();
      replacement.dispose();
    }
  });

  it("preserves the custom-material placeholder for a reference that never had a backing", () => {
    const shader = createCustomShaderMaterial({
      glsl: { fragment: "out vec4 outColor; void main() { outColor = texture(map, vec2(0.5)); }" },
      uniforms: { map: { type: "texture2d", value: { kind: "aura-texture-ref", id: "not-owned" } } }
    });
    try {
      const binding = shader.getParameter("u_map") as TextureBinding;
      expect(binding.texture).toBeNull();
      expect(shader.customDiagnostics.some((line) => line.includes("[CUSTOM_TEXTURE_UNBOUND]"))).toBe(true);
      expect(syncCustomTextureRefs(shader)).toBe(0);
    } finally { shader.dispose(); }
  });
});
