import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuraApp, primitives, scene } from "../../../packages/engine/src";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeSceneRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import type { AuraApp, AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { Renderer } from "../../../packages/rendering/src/Renderer";

// Real app, frame loop, compiler and Renderer; only the DOM target and device
// are synthetic. These tests do not launch a browser or GPU.
class FakeCanvas {
  width = 96; height = 64; clientWidth = 96; clientHeight = 64;
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  getBoundingClientRect() { return { width: 96, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function containsError(error: unknown, target: unknown): boolean {
  if (Object.is(error, target)) return true;
  if (error instanceof AggregateError && error.errors.some((entry) => containsError(entry, target))) return true;
  return error instanceof Error && error.cause !== undefined && containsError(error.cause, target);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => { throw new Error("Expected cleanup to fail"); },
    (error: unknown) => error
  );
}

const apps: AuraApp[] = [];
const renderers: Renderer[] = [];
const flags = (compiler: boolean) => ({
  A3D_QR_CORE: compiler, A3D_QR_COMPILER: compiler, A3D_QR_CORE_GENERATOR: false,
  A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false, A3D_QR_POST: false,
  A3D_QR_VFX: false, A3D_QR_VFX_FOG: false
});

function makeApp(canvas = new FakeCanvas(), compiler = false): AuraApp {
  const app = createAuraApp(canvas as unknown as HTMLCanvasElement, {
    scene: scene().add(primitives.box({ name: "box" }).runtime({ id: "box" })),
    autoStart: false, resize: false, diagnostics: false,
    renderer: { backend: "webgl2" },
    qualityRebuild: { allowUrlFlags: false, flags: flags(compiler) }
  });
  apps.push(app);
  return app;
}

function failDeviceOnce(renderer: Renderer, error: Error, reenter?: () => void) {
  const original = renderer.device.dispose.bind(renderer.device);
  let first = true;
  return vi.spyOn(renderer.device, "dispose").mockImplementation(() => {
    reenter?.();
    if (first) {
      first = false;
      throw error;
    }
    original();
  });
}

beforeEach(() => {
  renderers.length = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 96, innerHeight: 64, location: { search: "", href: "http://localhost/" },
    addEventListener() {}, removeEventListener() {}
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const create = Renderer.create.bind(Renderer);
  vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
    const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
    Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
    Object.defineProperty(renderer.device, "info", { value: {
      ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"]
    } });
    renderers.push(renderer);
    return renderer;
  });
});

afterEach(async () => {
  for (const app of apps.splice(0)) await app.disposeAsync().catch(() => undefined);
  for (const renderer of renderers) {
    try { renderer.dispose(); } catch { /* Tests can intentionally retain a failed one-shot owner. */ }
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("app-owned production disposal retry", () => {
  it.each([false, true])("retries a real failed native device without repeating completed owners (compiler=%s)", async (compiler) => {
    const app = makeApp(new FakeCanvas(), compiler);
    await app.readyStrict();
    const renderer = renderers[0]!;
    const original = new Error("first device release");
    const deviceDispose = failDeviceOnce(renderer, original);
    const rendererDispose = vi.spyOn(renderer, "dispose");
    const nodesDispose = vi.spyOn(app.nodes as AuraRuntimeNodeRegistry, "dispose");

    app.dispose();
    const first = rejection(app.disposeAsync());
    const simultaneous = rejection(app.disposeAsync());
    expect(deviceDispose).toHaveBeenCalledTimes(1);
    const [firstError, sameError] = await Promise.all([first, simultaneous]);
    expect(containsError(firstError, original)).toBe(true);
    expect(containsError(sameError, original)).toBe(true);
    expect(renderer.device.disposed).toBe(false);
    expect(() => app.step()).toThrow(/disposed/i);
    await expect(app.stepAsync()).rejects.toThrow(/disposed/i);

    await expect(app.disposeAsync()).resolves.toBeUndefined();
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(rendererDispose).toHaveBeenCalledTimes(2);
    expect(nodesDispose).toHaveBeenCalledTimes(1);
    expect(renderer.device.disposed).toBe(true);
    app.dispose();
    await app.disposeAsync();
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(nodesDispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the first waiter's error when a reentrant disposal observes the in-progress attempt", async () => {
    const app = makeApp();
    await app.readyStrict();
    const renderer = renderers[0]!;
    const original = new Error("reentrant device release");
    let nested: Promise<unknown> | undefined;
    const deviceDispose = failDeviceOnce(renderer, original, () => {
      app.dispose();
      nested ??= rejection(app.disposeAsync());
    });
    const outer = rejection(app.disposeAsync());
    expect(nested).toBeDefined();
    const [outerError, nestedError] = await Promise.all([outer, nested!]);
    expect(containsError(outerError, original)).toBe(true);
    expect(containsError(nestedError, original)).toBe(true);
    expect(deviceDispose).toHaveBeenCalledTimes(1);
    await app.disposeAsync();
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(renderer.device.disposed).toBe(true);
  });

  it("waits for an active frame, preserves its error, and retries the later cleanup failure", async () => {
    const app = makeApp();
    await app.readyStrict();
    const renderer = renderers[0]!;
    const entered = deferred(), release = deferred();
    const frameError = new Error("active frame failure");
    const disposeError = new Error("deferred device failure");
    vi.spyOn(renderer, "renderAsync").mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      throw frameError;
    });
    const deviceDispose = failDeviceOnce(renderer, disposeError);
    const frame = rejection(app.stepAsync());
    await entered.promise;
    const first = rejection(app.disposeAsync());
    app.dispose();
    const concurrent = app.disposeAsync();
    expect(deviceDispose).not.toHaveBeenCalled();
    expect(renderer.device.disposed).toBe(false);
    await expect(app.stepAsync()).rejects.toThrow(/disposed/i);

    release.resolve();
    expect(await frame).toBe(frameError);
    expect(containsError(await first, disposeError)).toBe(true);
    await concurrent;
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(renderer.device.disposed).toBe(true);
  });

  it("does not retry or hide a failed one-shot sibling when the native renderer recovers", async () => {
    const app = makeApp(new FakeCanvas(), true);
    await app.readyStrict();
    const renderer = renderers[0]!;
    const nativeError = new Error("native failure");
    const siblingError = new Error("compiled detach failure");
    const deviceDispose = failDeviceOnce(renderer, nativeError);
    const registry = app.nodes as AuraRuntimeNodeRegistry;
    const detach = vi.spyOn(registry, "detachCompiled").mockImplementationOnce(() => { throw siblingError; });
    const nodesDispose = vi.spyOn(registry, "dispose");

    const first = await rejection(app.disposeAsync());
    expect(containsError(first, nativeError)).toBe(true);
    expect(containsError(first, siblingError)).toBe(true);
    const second = await rejection(app.disposeAsync());
    expect(containsError(second, siblingError)).toBe(true);
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(renderer.device.disposed).toBe(true);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(nodesDispose).toHaveBeenCalledTimes(1);
    expect(containsError(await rejection(app.disposeAsync()), siblingError)).toBe(true);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(deviceDispose).toHaveBeenCalledTimes(2);
  });

  it("keeps a peer on the same canvas alive while the first app retries", async () => {
    const canvas = new FakeCanvas();
    const first = makeApp(canvas), peer = makeApp(canvas);
    await Promise.all([first.readyStrict(), peer.readyStrict()]);
    const [oldRenderer, peerRenderer] = renderers;
    const error = new Error("first app device failure");
    const deviceDispose = failDeviceOnce(oldRenderer!, error);
    const peerDispose = vi.spyOn(peerRenderer!.device, "dispose");
    const firstError = await rejection(first.disposeAsync());
    expect(containsError(firstError, error)).toBe(true);
    peer.step(0);
    await first.disposeAsync();
    first.dispose();
    expect(deviceDispose).toHaveBeenCalledTimes(2);
    expect(peerDispose).not.toHaveBeenCalled();
    expect(peerRenderer!.device.disposed).toBe(false);
    expect(peer.nodes.require("box")).toBeDefined();
    peer.step(0);
    await peer.disposeAsync();
    expect(peerDispose).toHaveBeenCalledTimes(1);
  });
});

describe("production scene renderer disposal attempt snapshots", () => {
  it("keeps the first whenDisposed result after a synchronous retry", async () => {
    const snapshot = scene().add(primitives.box({ name: "direct" })).toJSON();
    const quality = resolveQrFlags({ options: flags(true), env: {} });
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags: quality });
    const mounted = await createProductionRuntimeSceneRenderer(
      new FakeCanvas() as unknown as HTMLCanvasElement, snapshot, { backend: "webgl2" }, registry, quality
    );
    const renderer = mounted.auraRenderer as Renderer;
    const error = new Error("direct device failure");
    const deviceDispose = failDeviceOnce(renderer, error);
    const detach = vi.spyOn(registry, "detachCompiled");
    try {
      expect(() => mounted.dispose()).toThrow(/cleanup/i);
      const first = rejection(mounted.whenDisposed!());
      mounted.dispose();
      await expect(mounted.whenDisposed!()).resolves.toBeUndefined();
      expect(containsError(await first, error)).toBe(true);
      expect(deviceDispose).toHaveBeenCalledTimes(2);
      expect(detach).toHaveBeenCalledTimes(1);
      expect(renderer.device.disposed).toBe(true);
    } finally {
      mounted.dispose();
      registry.dispose();
    }
  });
});
