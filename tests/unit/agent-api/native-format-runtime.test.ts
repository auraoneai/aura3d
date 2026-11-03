import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";

const mounts = vi.hoisted(() => ({ contexts: [] as Array<Record<string, any>>, factory: undefined as undefined | ((args: unknown[]) => Promise<unknown>) }));
vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async (...args: unknown[]) => {
    mounts.contexts.push(args[7] as Record<string, any>);
    if (mounts.factory) return mounts.factory(args);
    return {
      backend: "webgl2", diagnostics: undefined, render: () => 1,
      renderAsync: async () => 1, deviceLost: () => false,
      viewProjection: () => new Float32Array(16), dispose() {}
    };
  }
}));

import { createAuraApp, defineModelAssets, group, model, scene } from "../../../packages/engine/src/public/index";
import { validateSceneAssets } from "../../../packages/engine/src/agent-api/diagnostics";
import { createDefaultFormatRegistry, createGLTFFormatAdapter, FormatRegistry } from "../../../packages/assets/src/FormatRegistry";
import { PLYLoader } from "../../../packages/assets/src/loaders/MeshFormatLoaders";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";

class FakeCanvas {
  width = 300; height = 150; style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  clientWidth = 64; clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

beforeEach(() => {
  mounts.contexts.length = 0;
  mounts.factory = undefined;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("location", { origin: "https://site.test", href: "https://site.test/" });
});
afterEach(() => vi.unstubAllGlobals());

describe("native format root model contract", () => {
  it("preserves the admitted URL and format through per-app mounts", async () => {
    const firstRegistry = createDefaultFormatRegistry();
    const secondRegistry = createDefaultFormatRegistry();
    for (const registry of [firstRegistry, secondRegistry]) {
      registry.register(createGLTFFormatAdapter("ply", ["ply"], new PLYLoader(), ["application/ply"], ["1.0"]));
    }
    const assets = defineModelAssets({ mesh: {
      url: "https://site.test/models/triangle.ply?revision=2#part",
      sha256: "a".repeat(64),
      formatMetadata: { adapter: "ply", mediaType: "application/ply", version: "1.0" }
    } }, { queryParam: null });
    expect(assets.refs.mesh.url).toBe("/models/triangle.ply?revision=2#part");
    expect(assets.refs.mesh.format).toBe("ply");
    expect(assets.refs.mesh.formatMetadata).toEqual({ adapter: "ply", mediaType: "application/ply", version: "1.0" });
    const first = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(model(assets.refs.mesh)), formatRegistry: firstRegistry, autoStart: false, resize: false
    });
    const second = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(group("outer", [group("inner", [model(assets.refs.mesh)])])), formatRegistry: secondRegistry, autoStart: false, resize: false
    });
    try {
      await Promise.all([first.ready(), second.ready()]);
      expect(mounts.contexts).toHaveLength(2);
      expect(mounts.contexts.map((context) => context.formatRegistry)).toEqual([firstRegistry, secondRegistry]);
      expect(mounts.contexts[0]!.runtimeOwner).not.toBe(mounts.contexts[1]!.runtimeOwner);
      expect(mounts.contexts.every((context) => context.request.signal instanceof AbortSignal)).toBe(true);
      first.dispose();
      expect(mounts.contexts[0]!.request.signal.aborted).toBe(true);
      expect(mounts.contexts[1]!.request.signal.aborted).toBe(false);
    } finally { first.dispose(); second.dispose(); }
  });

  it("rejects an unregistered format or a data-only adapter rather than skipping the model", () => {
    const asset = defineModelAssets({ mesh: { url: "/triangle.ply", sha256: "a".repeat(64) } }, { queryParam: null }).refs.mesh;
    const make = (formatRegistry?: FormatRegistry) => createAuraApp(undefined, {
      scene: scene().add(model(asset)), formatRegistry, autoStart: false
    });
    expect(() => make()).toThrow(/unsupported format/i);
    expect(() => make(createDefaultFormatRegistry())).toThrow(/no native format adapter/i);
    const nested = scene().add(group("outer", [group("inner", [model(asset)])])).toJSON();
    expect(() => validateSceneAssets(nested, [], createDefaultFormatRegistry())).toThrow(/no native format adapter/i);
    expect(() => createAuraApp(undefined, { scene: nested, autoStart: false })).toThrow(/unsupported format/i);
    const dataOnly = new FormatRegistry();
    dataOnly.register({ id: "ply", extensions: ["ply"], loader: { type: "ply", canLoad: () => true, load: () => ({}) } });
    expect(() => make(dataOnly)).toThrow(/cannot build Aura3D model resources/i);
  });

  it.each([false, true])("awaits mounted adapter cleanup and reports failure=%s on app disposal", async (fails) => {
    vi.stubGlobal("crypto", webcrypto);
    const source = ["ply", "format ascii 1.0", "element vertex 3", "property float x", "property float y", "property float z", "element face 1", "property list uchar int vertex_indices", "end_header", "-1 -1 0", "1 -1 0", "0 1 0", "3 0 1 2", ""].join("\n");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(source)));
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const disposing = new Promise<void>((resolve) => { started = resolve; });
    const loader = new PLYLoader();
    const registry = createDefaultFormatRegistry();
    registry.register(createGLTFFormatAdapter("ply", ["ply"], {
      type: "ply", canLoad: (request) => loader.canLoad(request),
      load: (request, context) => loader.load(request, context),
      async dispose(asset) { started(); await gate; loader.dispose(asset); if (fails) throw new Error("adapter cleanup failed"); }
    }));
    mounts.factory = async (args) => {
      const snapshot = args[1] as ReturnType<ReturnType<typeof scene>["toJSON"]>;
      const context = args[7] as { runtimeOwner: object; request: { signal: AbortSignal }; formatRegistry: FormatRegistry };
      const node = snapshot.nodes[0]!;
      if (node.kind !== "model") throw new Error("expected model");
      const actor = await createTypedGLBActor({ asset: node.asset, id: "mesh", width: 64, height: 64, ...context });
      expect(actor.collectRenderItems().length).toBeGreaterThan(0);
      return { backend: "webgl2", diagnostics: undefined, render: () => 1,
        deviceLost: () => false, viewProjection: () => new Float32Array(16), dispose: () => actor.dispose() };
    };
    const asset = defineModelAssets({ mesh: {
      url: "/models/triangle.ply?revision=3", sha256: createHash("sha256").update(source).digest("hex")
    } }, { queryParam: null }).refs.mesh;
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(model(asset)), formatRegistry: registry, autoStart: false, resize: false
    });
    try {
      await app.readyStrict();
      const pending = app.disposeAsync();
      await disposing;
      let done = false;
      void pending.then(() => { done = true; }, () => { done = true; });
      await Promise.resolve();
      expect(done).toBe(false);
      release();
      if (fails) {
        await expect(pending).rejects.toThrow(/Native model cleanup failed/);
        await expect(app.disposeAsync()).rejects.toThrow(/Native model cleanup failed/);
      } else {
        await expect(pending).resolves.toBeUndefined();
        await expect(app.disposeAsync()).resolves.toBeUndefined();
      }
    } finally { release(); app.dispose(); }
  });
});
