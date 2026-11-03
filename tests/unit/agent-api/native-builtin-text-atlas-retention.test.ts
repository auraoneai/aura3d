import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeSceneRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { text3D } from "../../../packages/engine/src/agent-api/nodes/text3d";
import type { AuraCreateAppRendererOptions, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { RenderItem, RenderSource } from "../../../packages/rendering/src";
import { Material } from "../../../packages/rendering/src/Material";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

class FakeCanvas {
  width = 100; height = 50; clientWidth = 100; clientHeight = 50;
  style = {}; dataset = {}; parentElement = null;
  constructor(readonly maxTextureSize = 4096) {}
  getBoundingClientRect() { return { width: this.width, height: this.height, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext(kind: string) {
    return kind === "webgl2" ? { MAX_TEXTURE_SIZE: 0x0d33, getParameter: () => this.maxTextureSize } : null;
  }
  addEventListener() {}
  removeEventListener() {}
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}

const flags = (compiler: boolean) => resolveQrFlags({ options: {
  A3D_QR_COMPILER: compiler, A3D_QR_CORE: true, A3D_QR_LIGHTING: false, A3D_QR_POST: false
} });

function sourceScene(twoLabels = false): AuraSceneSnapshot {
  const builder = scene()
    .camera(camera.perspective({ position: [0, 0, 5], target: [0, 0, 0] }))
    .add(primitives.box({ name: "anchor" }))
    .add(text3D("AB", { name: "first", backend: "sdf", sdfGlyphAtlas: "shared" }).runtime({ id: "first" }));
  if (twoLabels) builder.add(text3D("AC", { name: "second", backend: "sdf", sdfGlyphAtlas: "shared" }).runtime({ id: "second" }));
  return builder.toJSON();
}

function installMockRenderer(fixtureOptions: { readonly failResidencyRelease?: boolean } = {}): void {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("WebGL2RenderingContext", { MAX_TEXTURE_SIZE: 0x0d33 });
  vi.stubGlobal("window", {
    innerWidth: 100, innerHeight: 50, location: { href: "http://localhost/", search: "" },
    addEventListener() {}, removeEventListener() {}
  });
  const create = Renderer.create.bind(Renderer);
  vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
    const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
    Object.defineProperty(renderer.device, "kind", { value: "webgl2" });
    Object.defineProperty(renderer.device, "info", { value: {
      ...renderer.device.info, capabilities: [...(renderer.device.info.capabilities ?? []), "hdr-render-targets"]
    } });
    // These scenes have no streamed actor textures. The empty adapter lets
    // the same pending-frame test exercise the residency teardown branch.
    const device = renderer.device;
    const unexpected = (): never => { throw new Error("Unexpected streamed texture in text-only fixture"); };
    Object.defineProperty(device, "createTextureResidencyAdapter", { configurable: true, value: () => ({
      device, generation: () => 1, isLost: () => false, usageBytes: () => 0,
      acquireBudgetLimit: () => ({ setLimit() {}, release() {
        if (fixtureOptions.failResidencyRelease) throw new Error("synthetic residency retirement failure");
      } }),
      estimate: unexpected, prepare: unexpected, allocate: async () => unexpected(), publish: unexpected,
      retire: async () => {}, unprepare: async () => {},
      onDeviceLost: () => () => {}, onDeviceRestored: () => () => {}
    }) });
    return renderer;
  });
}

async function mount(snapshot: AuraSceneSnapshot, compiler: boolean, maxTextureSize = 4096, options: AuraCreateAppRendererOptions = {}) {
  const canvas = new FakeCanvas(maxTextureSize);
  const qualityFlags = flags(compiler);
  const registry = createAuraRuntimeNodeRegistry(snapshot, { flags: qualityFlags, getScene: () => snapshot, setScene: () => {} });
  try {
    const controller = await createProductionRuntimeSceneRenderer(
      canvas as unknown as HTMLCanvasElement, snapshot, { ...options, backend: "webgl2" }, registry, qualityFlags
    );
    const renderer = controller.auraRenderer as Renderer;
    return {
      controller, renderer, registry,
      async dispose() { controller.dispose(); registry.dispose(); await controller.whenDisposed?.(); }
    };
  } catch (error) { registry.dispose(); throw error; }
}

function textItem(source: RenderSource, name = "first"): RenderItem {
  const item = [...(source.collectRenderItems?.() ?? source.renderItems ?? [])].find((entry) => entry.label?.includes(`:${name}`));
  if (!item) throw new Error(`Missing text item ${name}`);
  return item;
}

/** Built-in text items own a plain Material (never a MaterialInstance), which tracks disposal. */
function textMaterial(item: RenderItem): Material {
  const material = item.material;
  if (!(material instanceof Material)) throw new Error("Text item must own a Material");
  return material;
}

function textTexture(item: RenderItem) {
  const binding = item.material?.getParameter("u_baseColorTexture");
  if (!(binding instanceof TextureBinding) || !binding.texture) throw new Error("Missing text texture");
  return binding.texture;
}

async function capturePrecompile(f: Awaited<ReturnType<typeof mount>>): Promise<RenderSource> {
  let captured: RenderSource | undefined;
  const spy = vi.spyOn(f.renderer, "precompile").mockImplementation(async (argument) => {
    captured = ("source" in argument ? argument.source : argument) as RenderSource;
    return { compiledPrograms: 0, durationMs: 0 };
  });
  try { await f.controller.precompile!(); } finally { spy.mockRestore(); }
  if (!captured) throw new Error("Precompile did not receive a source");
  return captured;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const operationCases = [false, true].flatMap((compiler) => [false, true].flatMap((residency) =>
  (["render", "precompile"] as const).flatMap((operation) => [false, true].map((reject) => ({ compiler, residency, operation, reject })))
));

describe("mount-owned built-in glyph atlas frame lifetimes", () => {
  it.each([false, true])("keeps a replaced text resource alive through async render with compiler=%s", async (compiler) => {
    installMockRenderer();
    const f = await mount(sourceScene(), compiler);
    const gate = deferred();
    const entered = deferred();
    let oldItem!: RenderItem;
    let oldTexture!: ReturnType<typeof textTexture>;
    const diagnostics = f.renderer.getDiagnostics();
    vi.spyOn(f.renderer, "renderAsync").mockImplementation(async (source) => {
      oldItem = textItem(source as RenderSource);
      oldTexture = textTexture(oldItem);
      entered.resolve();
      await gate.promise;
      return diagnostics;
    });
    const rendering = f.controller.renderAsync!(0);
    try {
      await Promise.race([entered.promise, rendering.then(() => { throw new Error("Frame completed before capture"); })]);
      expect(oldTexture.label).toBe("a3d-builtin-glyph-atlas");
      f.registry.get("first")!.setText("BA");
      f.controller.update!(1);
      expect(textMaterial(oldItem).disposed).toBe(false);
      expect(() => oldItem.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
      expect(oldTexture.disposed).toBe(false);
      gate.resolve();
      await rendering;
      expect(textMaterial(oldItem).disposed).toBe(true);
      expect(() => oldItem.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
      const next = textItem(await capturePrecompile(f));
      expect(next.geometry).not.toBe(oldItem.geometry);
      expect(textTexture(next)).toBe(oldTexture);
      expect(oldTexture.disposed).toBe(false);
    } finally {
      gate.resolve();
      await rendering.catch(() => {});
      await f.dispose();
    }
    expect(oldTexture.disposed).toBe(true);
  });

  it("retains removed compiled text until its pending precompile releases the frame", async () => {
    installMockRenderer();
    const f = await mount(sourceScene(), true);
    const gate = deferred();
    const entered = deferred();
    let item!: RenderItem;
    vi.spyOn(f.renderer, "precompile").mockImplementation(async (source) => {
      item = textItem(("source" in source ? source.source : source) as RenderSource);
      entered.resolve();
      await gate.promise;
      return { compiledPrograms: 0, durationMs: 0 };
    });
    const warming = f.controller.precompile!();
    try {
      await Promise.race([entered.promise, warming.then(() => { throw new Error("Warmup completed before capture"); })]);
      const texture = textTexture(item);
      expect(f.registry.remove("first")).toBe(true);
      f.controller.update!(1);
      expect(textMaterial(item).disposed).toBe(false);
      expect(texture.disposed).toBe(false);
      gate.resolve();
      await warming;
      expect(textMaterial(item).disposed).toBe(true);
      expect(texture.disposed).toBe(false); // The open mount still owns the atlas.
    } finally {
      gate.resolve();
      await warming.catch(() => {});
      await f.dispose();
    }
  });

  it.each([false, true])("waits for a pending frame before retiring the mount scope with compiler=%s", async (compiler) => {
    installMockRenderer();
    const f = await mount(sourceScene(), compiler);
    const gate = deferred();
    const entered = deferred();
    let item!: RenderItem;
    const diagnostics = f.renderer.getDiagnostics();
    vi.spyOn(f.renderer, "renderAsync").mockImplementation(async (source) => {
      item = textItem(source as RenderSource);
      entered.resolve();
      await gate.promise;
      return diagnostics;
    });
    const rendering = f.controller.renderAsync!(0);
    try {
      await Promise.race([entered.promise, rendering.then(() => { throw new Error("Frame completed before capture"); })]);
      const texture = textTexture(item);
      f.controller.dispose();
      f.registry.dispose();
      let disposed = false;
      const settled = f.controller.whenDisposed!().then(() => { disposed = true; });
      await Promise.resolve();
      expect(disposed).toBe(false);
      expect(textMaterial(item).disposed).toBe(false);
      expect(texture.disposed).toBe(false);
      gate.resolve();
      await rendering.catch(() => {});
      await settled;
      expect(textMaterial(item).disposed).toBe(true);
      expect(texture.disposed).toBe(true);
    } finally {
      gate.resolve();
      await rendering.catch(() => {});
      f.controller.dispose();
      f.registry.dispose();
      await f.controller.whenDisposed!();
    }
  });

  it.each(operationCases)("keeps the device through $operation (compiler=$compiler, residency=$residency, reject=$reject)", async ({ compiler, residency, operation, reject }) => {
    installMockRenderer();
    const options = residency ? { textureResidency: { budgetBytes: 4 * 1024 * 1024 } } : {};
    const f = await mount(sourceScene(), compiler, 4096, options);
    const disposeDevice = vi.spyOn(f.renderer.device, "dispose");
    const gate = deferred(), entered = deferred();
    let item!: RenderItem;
    if (operation === "render") {
      const diagnostics = f.renderer.getDiagnostics();
      vi.spyOn(f.renderer, "renderAsync").mockImplementation(async (source) => {
        item = textItem(source as RenderSource);
        entered.resolve();
        await gate.promise;
        if (reject) throw new Error("synthetic pending render failure");
        return diagnostics;
      });
    } else {
      vi.spyOn(f.renderer, "precompile").mockImplementation(async (source) => {
        item = textItem(("source" in source ? source.source : source) as RenderSource);
        entered.resolve();
        await gate.promise;
        if (reject) throw new Error("synthetic pending precompile failure");
        return { compiledPrograms: 0, durationMs: 0 };
      });
    }
    const pending: Promise<unknown> = operation === "render" ? f.controller.renderAsync!(0) : f.controller.precompile!();
    const outcome = pending.then(() => ({ error: undefined }), (error: unknown) => ({ error }));
    try {
      await Promise.race([entered.promise, outcome.then(() => { throw new Error("Operation finished before capture"); })]);
      const texture = textTexture(item);
      f.controller.dispose(); f.controller.dispose();
      f.registry.dispose(); f.registry.dispose();
      let settled = false;
      const disposal = f.controller.whenDisposed!().then(() => { settled = true; });
      void disposal.catch(() => {});
      await flushMicrotasks();
      expect(settled).toBe(false);
      expect(disposeDevice).not.toHaveBeenCalled();
      expect(textMaterial(item).disposed).toBe(false);
      expect(texture.disposed).toBe(false);

      gate.resolve();
      const result = await outcome;
      if (reject) expect(result.error).toMatchObject({ message: `synthetic pending ${operation} failure` });
      else expect(result.error).toBeUndefined();
      await disposal;
      expect(textMaterial(item).disposed).toBe(true);
      expect(texture.disposed).toBe(true);
      expect(disposeDevice).toHaveBeenCalledTimes(1);
      f.controller.dispose(); f.registry.dispose();
      await f.controller.whenDisposed!();
      expect(disposeDevice).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve();
      await outcome;
      f.controller.dispose(); f.registry.dispose();
      await f.controller.whenDisposed!();
    }
  });

  it.each([false, true])("disposes synchronously and only once with no active operation (compiler=%s)", async (compiler) => {
    installMockRenderer();
    const f = await mount(sourceScene(), compiler);
    const disposeDevice = vi.spyOn(f.renderer.device, "dispose");
    try {
      f.controller.dispose();
      expect(disposeDevice).toHaveBeenCalledTimes(1);
      f.controller.dispose(); f.registry.dispose(); f.registry.dispose();
      await f.controller.whenDisposed!();
      expect(disposeDevice).toHaveBeenCalledTimes(1);
    } finally { await f.dispose(); }
  });

  it.each([false, true])("keeps the device through reentrant disposal during frame construction (compiler=%s)", async (compiler) => {
    installMockRenderer();
    const f = await mount(sourceScene(), compiler);
    const disposeDevice = vi.spyOn(f.renderer.device, "dispose");
    const originalGet = f.registry.get.bind(f.registry);
    let called = false;
    vi.spyOn(f.registry, "get").mockImplementation((id) => {
      const handle = originalGet(id);
      if (id === "first" && !called) {
        called = true;
        f.controller.dispose();
        expect(disposeDevice).not.toHaveBeenCalled();
      }
      return handle;
    });
    try {
      expect(() => f.controller.update!(1)).toThrow(/disposed|closed/i);
      expect(called).toBe(true);
      expect(() => f.controller.render!(1)).toThrow(/disposed/i);
      await f.controller.whenDisposed!();
      expect(disposeDevice).toHaveBeenCalledTimes(1);
    } finally { await f.dispose(); }
  });

  it("reports residency retirement failure without disposing the device", async () => {
    installMockRenderer({ failResidencyRelease: true });
    const f = await mount(sourceScene(), true, 4096, { textureResidency: { budgetBytes: 4 * 1024 * 1024 } });
    const disposeDevice = vi.spyOn(f.renderer.device, "dispose");
    try {
      f.controller.dispose();
      f.registry.dispose();
      await expect(f.controller.whenDisposed!()).rejects.toThrow(/cleanup/i);
      expect(disposeDevice).not.toHaveBeenCalled();
      f.controller.dispose();
      await expect(f.controller.whenDisposed!()).rejects.toThrow(/cleanup/i);
      expect(disposeDevice).not.toHaveBeenCalled();
    } finally {
      // The failed owner deliberately keeps custody; release the test renderer
      // explicitly after observing that fail-closed behavior.
      f.registry.dispose();
      f.renderer.dispose();
    }
  });

  it.each([false, true])("rejects a queued precompile after disposal and drains the active operation (compiler=%s)", async (compiler) => {
    installMockRenderer();
    const f = await mount(sourceScene(), compiler);
    const disposeDevice = vi.spyOn(f.renderer.device, "dispose");
    const gate = deferred(), entered = deferred();
    const warm = vi.spyOn(f.renderer, "precompile").mockImplementation(async () => {
      entered.resolve();
      await gate.promise;
      return { compiledPrograms: 0, durationMs: 0 };
    });
    const first = f.controller.precompile!();
    const firstOutcome = first.then(() => undefined, (error: unknown) => error);
    let queuedOutcome: Promise<unknown> | undefined;
    try {
      await Promise.race([entered.promise, firstOutcome.then(() => { throw new Error("Precompile finished before capture"); })]);
      const queued = f.controller.precompile!();
      queuedOutcome = queued.then(() => undefined, (error: unknown) => error);
      await flushMicrotasks();
      expect(warm).toHaveBeenCalledTimes(1);
      f.controller.dispose(); f.registry.dispose();
      expect(disposeDevice).not.toHaveBeenCalled();
      gate.resolve();
      expect(await firstOutcome).toBeUndefined();
      expect(await queuedOutcome).toMatchObject({ message: expect.stringMatching(/disposed/i) });
      await f.controller.whenDisposed!();
      expect(warm).toHaveBeenCalledTimes(1);
      expect(disposeDevice).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve();
      await firstOutcome;
      await queuedOutcome;
      await f.dispose();
    }
  });

  it.each([false, true])("shares within a mount and isolates two mounts with compiler=%s", async (compiler) => {
    installMockRenderer();
    const snapshot = sourceScene(true);
    const first = await mount(snapshot, compiler);
    const second = await mount(snapshot, compiler);
    try {
      const firstSource = await capturePrecompile(first);
      const secondSource = await capturePrecompile(second);
      const firstTexture = textTexture(textItem(firstSource));
      const secondTexture = textTexture(textItem(secondSource));
      expect(textTexture(textItem(firstSource, "second"))).toBe(firstTexture);
      expect(textTexture(textItem(secondSource, "second"))).toBe(secondTexture);
      expect(firstTexture).not.toBe(secondTexture);
      await first.dispose();
      expect(firstTexture.disposed).toBe(true);
      expect(secondTexture.disposed).toBe(false);
      const next = await capturePrecompile(second);
      expect(textTexture(textItem(next))).toBe(secondTexture);
    } finally { await first.dispose(); await second.dispose(); }
  });

  it.each([
    { reason: "device limit", max: 256, policy: undefined },
    { reason: "dimension policy", max: 4096, policy: { maxDimension: 256 } },
    { reason: "byte policy", max: 4096, policy: { maxBytes: 512 * 512 * 4 - 1 } }
  ])("falls back on a restricted $reason in both compiler modes", async ({ max, policy }) => {
    installMockRenderer();
    for (const compiler of [false, true]) {
      const f = await mount(sourceScene(), compiler, max, { textureBudgetPolicy: policy });
      try {
        const item = textItem(await capturePrecompile(f));
        expect(textTexture(item).label).not.toBe("a3d-builtin-glyph-atlas");
        const observations = f.controller.diagnostics.runtime.texturedMaterials;
        expect(observations.some((entry) => entry.nodeName === "first" && entry.warnings.some((warning) => warning.includes("SDF_GLYPH_ATLAS_FALLBACK")))).toBe(true);
      } finally { await f.dispose(); }
    }
  });
});
