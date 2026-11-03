import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAuraApp, defineAuraAssets, distanceLod, group, material, primitives, scene, texture
} from "../../../packages/engine/src/public/index";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import type { AuraApp, AuraAssetRef, AuraRuntimeNodeHandle, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { prd07SystemFor } from "../../../packages/engine/src/agent-api/vfx/effects-api";
import { bindRuntimeCompiled, type CompiledScene, type RuntimeCompiledSceneInternals } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

const assets = defineAuraAssets({
  // Both test responses carry the same three independently authored bytes.
  delayed: { type: "texture", format: "png", url: "/delayed.png", hash: "sha256-ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc" },
  next: { type: "texture", format: "png", url: "/next.png", hash: "sha256-ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc" }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
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

interface RecordedDraw {
  readonly label?: string;
  readonly textures: ReadonlyMap<string, Texture | null>;
}

/** Only device acquisition is mocked; the app, compiler and Renderer are real. */
class CapturingDevice extends MockRenderDevice {
  readonly submitted: RecordedDraw[] = [];
  override draw(command: DrawCommand): void {
    const textures = new Map<string, Texture | null>();
    for (const [name, value] of command.uniforms ?? []) {
      if (value instanceof TextureBinding) textures.set(name, value.texture);
    }
    this.submitted.push({ label: command.label, textures });
    super.draw(command);
  }
}

function pixel(r: number, g: number, b: number) {
  return texture.data({ width: 1, height: 1, data: new Uint8Array([r, g, b, 255]), colorSpace: "srgb" });
}

function initialScene() {
  return scene().add(primitives.box({ name: "anchor" }));
}

async function harness(start: ReturnType<typeof scene> = initialScene(), autoStart = false) {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 64, innerHeight: 64, location: { href: "https://scene.example.test/", search: "" },
    addEventListener() {}, removeEventListener() {}
  });
  let nextFrame = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; callbacks.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
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
    scene: start, autoStart, resize: false,
    qualityRebuild: { flags: {
      A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
      A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false
    }, allowUrlFlags: false }
  });
  if (autoStart) {
    // Isolate frame invalidation from the effects system's continuous tick while
    // keeping its app-owned mount authority and normal disposal path intact.
    const effects = prd07SystemFor(app);
    const stopEffectFrames: unknown = effects && Reflect.get(effects, "offFrame");
    if (typeof stopEffectFrames !== "function") throw new Error("Expected the effects frame subscription");
    stopEffectFrames();
  }
  await app.readyStrict({ stage: "first-frame" });
  const fireFrame = (): void => {
    expect(callbacks.size).toBe(1);
    const [id, callback] = [...callbacks.entries()][0]!;
    callbacks.delete(id);
    callback(id * 16);
  };
  return { app, device: () => devices[devices.length - 1]!, callbacks, fireFrame };
}

async function waitTextured(app: AuraApp, name: string, levelName?: string) {
  await vi.waitFor(() => {
    const materials = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
    expect(materials).toContainEqual(expect.objectContaining({
      nodeName: name, status: "textured", pixelBacked: true, slots: expect.arrayContaining(["baseColor"]),
      ...(levelName === undefined ? {} : { levelName })
    }));
  }, { timeout: 2000 });
}

function frameFor(app: AuraApp, device: CapturingDevice, name: string): RecordedDraw {
  device.submitted.length = 0;
  app.step(0);
  const matches = device.submitted.filter((entry) => entry.label?.includes(`:${name}`));
  const draw = matches[matches.length - 1];
  expect(draw, `a draw for ${name} was submitted`).toBeDefined();
  return draw!;
}

function pendingBitmap() {
  const pending = deferred<ImageBitmap>();
  const image = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
  const signals: AbortSignal[] = [];
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    return new Response(new Uint8Array([0, 1, 2]));
  });
  const decode = vi.fn(() => pending.promise);
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("createImageBitmap", decode);
  return { ...pending, image, signals, fetch, decode };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("dynamic primitive texture lifecycle", () => {
  it("upgrades a runtime-added texture, removes its diagnostics, and safely reuses the node id", async () => {
    const first = pixel(255, 0, 0); const second = pixel(0, 255, 0);
    const { app, device } = await harness();
    try {
      const added = app.nodes.add!(primitives.box({ name: "dynamic", material: material.pbr({ texture: first }) }).runtime({ id: "dynamic" }));
      await waitTextured(app, "dynamic");
      expect(frameFor(app, device(), "dynamic").textures.get("u_baseColorMap")).toBe(first.texture);
      expect(app.nodes.remove!(added)).toBe(true);
      expect(app.diagnostics().renderer?.runtime.texturedMaterials.some((entry) => entry.nodeName === "dynamic")).toBe(false);
      expect(first.texture.disposed).toBe(false);

      app.nodes.add!(primitives.box({ name: "dynamic", material: material.pbr({ texture: second }) }).runtime({ id: "dynamic" }));
      await waitTextured(app, "dynamic");
      expect(frameFor(app, device(), "dynamic").textures.get("u_baseColorMap")).toBe(second.texture);
      expect(app.diagnostics().renderer?.runtime.texturedMaterials.filter((entry) => entry.nodeName === "dynamic")).toHaveLength(1);
    } finally {
      await app.disposeAsync();
      expect(first.texture.disposed).toBe(false); expect(second.texture.disposed).toBe(false);
      first.dispose(); second.dispose();
    }
  });

  it("replaces a live texture and observes reapplication of the same mutable material spec", async () => {
    const first = pixel(255, 0, 0); const second = pixel(0, 255, 0); const third = pixel(0, 0, 255);
    const initial = material.pbr({ texture: first });
    const { app, device } = await harness(initialScene().add(primitives.box({ name: "target", material: initial }).runtime({ id: "target" })));
    try {
      await waitTextured(app, "target");
      expect(frameFor(app, device(), "target").textures.get("u_baseColorMap")).toBe(first.texture);
      const mutable = material.pbr({ texture: second });
      app.nodes.require("target").setMaterial(mutable);
      app.step(0);
      await waitTextured(app, "target");
      expect(frameFor(app, device(), "target").textures.get("u_baseColorMap")).toBe(second.texture);

      (mutable as { texture?: typeof third }).texture = third;
      app.nodes.require("target").setMaterial(mutable);
      app.step(0);
      await waitTextured(app, "target");
      expect(frameFor(app, device(), "target").textures.get("u_baseColorMap")).toBe(third.texture);

      app.nodes.require("target").setMaterial(material.pbr({ color: "#ffffff" }));
      const scalar = frameFor(app, device(), "target");
      expect(scalar.textures.get("u_baseColorMap")).toBeUndefined();
      expect(first.texture.disposed || second.texture.disposed || third.texture.disposed).toBe(false);
    } finally {
      await app.disposeAsync();
      expect([first, second, third].every((handle) => !handle.texture.disposed)).toBe(true);
      first.dispose(); second.dispose(); third.dispose();
    }
  });

  it("aborts an obsolete material load before a later material wins and closes its late bitmap", async () => {
    const pending = pendingBitmap(); const second = pixel(0, 255, 0);
    const mutable = material.pbr({ texture: assets.delayed });
    const { app, device } = await harness(initialScene().add(primitives.box({ name: "target", material: mutable }).runtime({ id: "target" })));
    try {
      await vi.waitFor(() => expect(pending.decode).toHaveBeenCalledTimes(1));
      expect(pending.signals).toHaveLength(1);
      (mutable as { texture?: typeof second }).texture = second;
      app.nodes.require("target").setMaterial(mutable);
      expect(pending.signals[0]!.aborted).toBe(true);
      app.step(0);
      await waitTextured(app, "target");
      expect(frameFor(app, device(), "target").textures.get("u_baseColorMap")).toBe(second.texture);
      pending.resolve(pending.image);
      await vi.waitFor(() => expect(pending.image.close).toHaveBeenCalledTimes(1));
      expect(frameFor(app, device(), "target").textures.get("u_baseColorMap")).toBe(second.texture);
      expect(app.diagnostics().warnings.some((warning) => /textured upgrade failed.*target/i.test(warning))).toBe(false);
    } finally {
      pending.resolve(pending.image);
      await app.disposeAsync();
      expect(second.texture.disposed).toBe(false); second.dispose();
    }
  });

  it("keeps a replacement pending when an aborted fetch completes after it starts", async () => {
    const oldResponse = deferred<Response>(); const nextResponse = deferred<Response>();
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    const oldCancelled = deferred<void>(); const releaseOldCleanup = deferred<void>(); const oldCleanupFinished = deferred<void>();
    const cancelOldBody = vi.fn(() => {
      oldCancelled.resolve();
      return releaseOldCleanup.promise.then(() => { oldCleanupFinished.resolve(); });
    });
    const oldBody = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Uint8Array.of(0, 1, 2)); },
      cancel: cancelOldBody
    });
    const lateOldResponse = new Response(oldBody, { headers: { "content-type": "image/png" } });
    const readOldBody = vi.spyOn(lateOldResponse.body!, "getReader");
    const replacementResponse = new Response(Uint8Array.of(0, 1, 2).buffer as ArrayBuffer, { headers: { "content-type": "image/png" } });
    const nextImage = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
    const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(url);
      requests.push({ url: requestUrl, signal: init?.signal ?? undefined });
      // Deliberately ignore abort, as a transport or cache may complete late.
      return requestUrl.includes("/delayed.png") ? oldResponse.promise : nextResponse.promise;
    });
    const decode = vi.fn().mockResolvedValue(nextImage);
    vi.stubGlobal("fetch", fetch); vi.stubGlobal("createImageBitmap", decode);
    const { app, device } = await harness(initialScene().add(primitives.box({
      name: "overlap", material: material.pbr({ texture: assets.delayed })
    }).runtime({ id: "overlap" })));
    try {
      await vi.waitFor(() => expect(requests.some((request) => request.url.includes("/delayed.png"))).toBe(true));
      const oldSignal = requests.find((request) => request.url.includes("/delayed.png"))?.signal;
      expect(oldSignal).toBeDefined();
      app.nodes.require("overlap").setMaterial(material.pbr({ texture: assets.next }));
      expect(oldSignal!.aborted).toBe(true);
      app.step(0);
      await vi.waitFor(() => expect(requests.some((request) => request.url.includes("/next.png"))).toBe(true));
      const nextSignal = requests.find((request) => request.url.includes("/next.png"))?.signal;
      expect(nextSignal?.aborted).toBe(false);
      const currentMaterial = () => app.diagnostics().renderer?.runtime.texturedMaterials.find((entry) => entry.nodeName === "overlap");
      const textureWarnings = () => {
        const diagnostics = app.diagnostics();
        return [...diagnostics.warnings, ...(diagnostics.renderer?.runtime.warnings ?? [])];
      };
      expect(currentMaterial()?.status).toBe("pending");

      oldResponse.resolve(lateOldResponse);
      await oldCancelled.promise;
      expect(cancelOldBody).toHaveBeenCalledTimes(1);
      expect(lateOldResponse.bodyUsed).toBe(true);
      expect(readOldBody).not.toHaveBeenCalled();
      expect(currentMaterial()?.status).toBe("pending");
      expect(nextSignal?.aborted).toBe(false);
      expect(decode).not.toHaveBeenCalled();
      expect(frameFor(app, device(), "overlap").textures.get("u_baseColorMap")).toBeUndefined();
      expect(textureWarnings().some((warning) => /textured upgrade failed.*overlap/i.test(warning))).toBe(false);

      releaseOldCleanup.resolve();
      await oldCleanupFinished.promise;
      expect(currentMaterial()?.status).toBe("pending");
      expect(decode).not.toHaveBeenCalled();
      nextResponse.resolve(replacementResponse);
      await waitTextured(app, "overlap");
      expect(decode).toHaveBeenCalledTimes(1);
      expect(readOldBody).not.toHaveBeenCalled();
      expect(cancelOldBody).toHaveBeenCalledTimes(1);
      expect(frameFor(app, device(), "overlap").textures.get("u_baseColorMap")?.source).toBe(nextImage);
      expect(textureWarnings().some((warning) => /textured upgrade failed.*overlap/i.test(warning))).toBe(false);
    } finally {
      oldResponse.resolve(lateOldResponse);
      releaseOldCleanup.resolve();
      nextResponse.resolve(replacementResponse);
      await app.disposeAsync();
    }
    expect(nextImage.close).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("loads only the current material when a runtime add is replaced before tracking (immediate step: %s)", async (immediateStep) => {
    const requests: string[] = [];
    const image = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      requests.push(String(url));
      return new Response(new Uint8Array([0, 1, 2]));
    }));
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(image));
    const { app, device } = await harness();
    try {
      const node = app.nodes.add!(primitives.box({
        name: "early", material: material.pbr({ texture: assets.delayed })
      }).runtime({ id: "early" }));
      node.setMaterial(material.pbr({ texture: assets.next }));
      if (immediateStep) app.step(0);
      await Promise.resolve(); // Let the newly added entry register with the texture coordinator.
      if (!immediateStep) app.step(0);
      await waitTextured(app, "early");
      expect(requests.filter((url) => url.includes("/delayed.png"))).toHaveLength(0);
      expect(requests.filter((url) => url.includes("/next.png"))).toHaveLength(1);
      expect(frameFor(app, device(), "early").textures.get("u_baseColorMap")?.source).toBe(image);
    } finally { await app.disposeAsync(); }
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it("retains a same-id addition made synchronously while its predecessor is removed", () => {
    const source = initialScene().toJSON() as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(source, {
      flags: resolveQrFlags({ options: ["compiler"] }), getScene: () => source
    });
    const compiled = {} as CompiledScene;
    let replacement: AuraRuntimeNodeHandle | undefined;
    const addSubtree = vi.fn();
    const removeSubtree = vi.fn((id: string) => {
      expect(id).toBe("reused");
      replacement = registry.add(primitives.box({ name: "replacement" }).runtime({ id: "reused" }));
      return true;
    });
    bindRuntimeCompiled(compiled, { addSubtree, removeSubtree } as unknown as RuntimeCompiledSceneInternals);
    registry.attachCompiled(compiled);
    try {
      const old = registry.add(primitives.box({ name: "original" }).runtime({ id: "reused" }));
      expect(registry.remove("reused")).toBe(true);
      expect(removeSubtree).toHaveBeenCalledTimes(1);
      expect(addSubtree).toHaveBeenCalledTimes(2);
      expect(replacement).toBeDefined();
      expect(replacement).not.toBe(old);
      expect(registry.require("reused")).toBe(replacement);
      const remountScene = registry.sceneWithRuntimeAdditions()!;
      expect(remountScene.nodes.filter((node) => "runtime" in node && node.runtime?.id === "reused")).toEqual([
        expect.objectContaining({ kind: "primitive", name: "replacement" })
      ]);
      registry.reset(remountScene);
      expect(registry.require("reused").name).toBe("replacement");
    } finally { registry.dispose(); }
  });

  it("cancels a removed node's pending load without affecting a new node with the same id", async () => {
    const pending = pendingBitmap(); const replacement = pixel(0, 0, 255);
    const { app, device } = await harness();
    try {
      app.nodes.add!(primitives.box({ name: "reused", material: material.pbr({ texture: assets.delayed }) }).runtime({ id: "reused" }));
      await vi.waitFor(() => expect(pending.decode).toHaveBeenCalledTimes(1));
      expect(app.nodes.remove!("reused")).toBe(true);
      expect(pending.signals[0]!.aborted).toBe(true);
      app.nodes.add!(primitives.box({ name: "reused", material: material.pbr({ texture: replacement }) }).runtime({ id: "reused" }));
      await waitTextured(app, "reused");
      pending.resolve(pending.image);
      await vi.waitFor(() => expect(pending.image.close).toHaveBeenCalledTimes(1));
      expect(frameFor(app, device(), "reused").textures.get("u_baseColorMap")).toBe(replacement.texture);
      expect(app.diagnostics().renderer?.runtime.texturedMaterials.filter((entry) => entry.nodeName === "reused")).toHaveLength(1);
    } finally {
      pending.resolve(pending.image);
      await app.disposeAsync();
      expect(replacement.texture.disposed).toBe(false); replacement.dispose();
    }
  });

  it("upgrades nested additions and applies material replacements to distance levels", async () => {
    const first = pixel(255, 0, 0); const second = pixel(0, 255, 0);
    const { app, device } = await harness();
    try {
      app.nodes.add!(group("nested", [
        distanceLod({ name: "lod", material: material.pbr({ texture: first }), frustumCulled: false,
          levels: [{ name: "near", maxDistance: 30, primitive: "box" }, { name: "far", primitive: "sphere" }] }).runtime({ id: "lod" })
      ]).runtime({ id: "nested" }));
      await waitTextured(app, "lod", "near");
      await waitTextured(app, "lod", "far");
      expect(frameFor(app, device(), "lod").textures.get("u_baseColorMap")).toBe(first.texture);
      const handle = app.nodes.require("lod");
      handle.setMaterial(material.pbr({ texture: second }));
      app.step(0);
      await waitTextured(app, "lod", "near");
      expect(frameFor(app, device(), "lod").textures.get("u_baseColorMap")).toBe(second.texture);
      handle.setPosition(100, 0, 0);
      app.step(0);
      await waitTextured(app, "lod", "far");
      expect(frameFor(app, device(), "lod").textures.get("u_baseColorMap")).toBe(second.texture);
      expect(app.nodes.remove!("nested")).toBe(true);
      expect(app.diagnostics().renderer?.runtime.texturedMaterials.some((entry) => entry.nodeName === "lod")).toBe(false);
    } finally {
      await app.disposeAsync();
      expect(first.texture.disposed || second.texture.disposed).toBe(false);
      first.dispose(); second.dispose();
    }
  });

  it("cancels a pending runtime addition across remount and does not publish the old bitmap", async () => {
    const pending = pendingBitmap();
    const { app } = await harness();
    try {
      app.nodes.add!(primitives.box({ name: "old", material: material.pbr({ texture: assets.delayed }) }).runtime({ id: "old" }));
      await vi.waitFor(() => expect(pending.decode).toHaveBeenCalledTimes(1));
      app.setScene(initialScene().add(primitives.box({ name: "new" })));
      expect(pending.signals[0]!.aborted).toBe(true);
      pending.resolve(pending.image);
      await vi.waitFor(() => expect(pending.image.close).toHaveBeenCalledTimes(1));
      await app.readyStrict({ stage: "first-frame" });
      expect(app.nodes.has("old")).toBe(false);
      expect(app.diagnostics().renderer?.runtime.texturedMaterials.some((entry) => entry.nodeName === "old")).toBe(false);
    } finally { pending.resolve(pending.image); await app.disposeAsync(); }
  });

  it("aborts a pending runtime addition on app disposal and closes a late decoded bitmap", async () => {
    const pending = pendingBitmap();
    const { app } = await harness();
    app.nodes.add!(primitives.box({ name: "disposed", material: material.pbr({ texture: assets.delayed }) }).runtime({ id: "disposed" }));
    try {
      await vi.waitFor(() => expect(pending.decode).toHaveBeenCalledTimes(1));
      app.dispose();
      expect(pending.signals[0]!.aborted).toBe(true);
      pending.resolve(pending.image);
      await vi.waitFor(() => expect(pending.image.close).toHaveBeenCalledTimes(1));
      await app.disposeAsync();
      expect(app.diagnostics().warnings.some((warning) => /textured upgrade failed.*disposed/i.test(warning))).toBe(false);
    } finally { pending.resolve(pending.image); await app.disposeAsync(); }
  });

  it("restarts a custom uniform asset load on material replacement and retires the stale bitmap", async () => {
    const first = deferred<ImageBitmap>(); const second = deferred<ImageBitmap>();
    const firstImage = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
    const secondImage = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Response(new Uint8Array([0, 1, 2]));
    }));
    const decode = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("createImageBitmap", decode);
    const custom = (asset: AuraAssetRef<"texture">) => material.custom({
      glsl: { fragment: "uniform sampler2D u_albedo; out vec4 outColor; void main() { outColor = texture(u_albedo, vec2(0.5)); }" },
      uniforms: { albedo: { type: "texture2d", value: asset } }
    });
    const { app, device } = await harness();
    try {
      const node = app.nodes.add!(primitives.box({ name: "custom", material: custom(assets.delayed) }).runtime({ id: "custom" }));
      await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
      node.setMaterial(custom(assets.next));
      expect(signals[0]!.aborted).toBe(true);
      app.step(0);
      await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(2));
      second.resolve(secondImage);
      await vi.waitFor(() => expect(frameFor(app, device(), "custom").textures.get("u_albedo")?.source).toBe(secondImage));
      first.resolve(firstImage);
      await vi.waitFor(() => expect(firstImage.close).toHaveBeenCalledTimes(1));
      expect(frameFor(app, device(), "custom").textures.get("u_albedo")?.source).toBe(secondImage);
    } finally {
      first.resolve(firstImage); second.resolve(secondImage);
      await app.disposeAsync();
    }
    expect(secondImage.close).toHaveBeenCalledTimes(1);
  });

  it("invalidates an isolated idle auto-start scheduler again when a dynamic texture commits", async () => {
    const pending = pendingBitmap();
    const { app, device, callbacks, fireFrame } = await harness(initialScene(), true);
    try {
      if (callbacks.size) fireFrame(); // Drain any mount-time invalidation.
      expect(callbacks.size).toBe(0);
      app.nodes.add!(primitives.box({ name: "auto", material: material.pbr({ texture: assets.delayed }) }).runtime({ id: "auto" }));
      await vi.waitFor(() => expect(pending.decode).toHaveBeenCalledTimes(1));
      expect(callbacks.size).toBe(1); // Topology changed, before the texture completes.
      fireFrame();
      expect(callbacks.size).toBe(0);
      pending.resolve(pending.image);
      await vi.waitFor(() => expect(callbacks.size).toBe(1));
      device().submitted.length = 0;
      fireFrame();
      const draw = device().submitted.find((entry) => entry.label?.includes(":auto") && entry.textures.has("u_baseColorMap"));
      expect(draw?.textures.get("u_baseColorMap")?.source).toBe(pending.image);
      expect(callbacks.size).toBe(0);
    } finally { pending.resolve(pending.image); await app.disposeAsync(); }
    expect(pending.image.close).toHaveBeenCalledTimes(1);
  });
});
