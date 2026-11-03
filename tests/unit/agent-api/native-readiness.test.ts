import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mounts = vi.hoisted(() => ({ signals: [] as AbortSignal[], options: [] as unknown[], forwarded: [] as unknown[][] }));

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async (...args: unknown[]) => {
    mounts.forwarded.push(args);
    return { backend: "webgl2", diagnostics: undefined, render: () => 1, renderAsync: async () => 1,
      deviceLost: () => false, viewProjection: () => new Float32Array(16), dispose() {} };
  }
}));

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: (...args: unknown[]) => {
      const signal = args[13] as AbortSignal;
      mounts.signals.push(signal);
      mounts.options.push(args[3]);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("mount aborted"), { name: "AbortError" })), { once: true });
      });
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";

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
  mounts.signals.length = 0;
  mounts.options.length = 0;
  mounts.forwarded.length = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("mount request ownership", () => {
  it.each(["", "   ", null, 42])("rejects invalid asset generations before acquiring a canvas: %s", (securityContext) => {
    const canvas = new FakeCanvas();
    const getContext = vi.spyOn(canvas, "getContext");
    expect(() => createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box()), autoStart: false,
      assets: { securityContext: securityContext as never }
    })).toThrow(/securityContext/);
    expect(getContext).not.toHaveBeenCalled();
    expect(mounts.signals).toHaveLength(0);
  });

  it("rejects invalid output policy before acquiring a canvas context or starting a mount", () => {
    const canvas = new FakeCanvas();
    const getContext = vi.spyOn(canvas, "getContext");
    expect(() => createAuraApp(canvas as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box()), autoStart: false,
      output: { alphaMode: "invalid" as never }
    })).toThrow(/Unsupported output alpha mode/);
    expect(getContext).not.toHaveBeenCalled();
    expect(mounts.signals).toHaveLength(0);
  });

  it("aborts superseded and disposed mounts while settling the matching readiness waiters", async () => {
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box({ name: "first" })), autoStart: false, diagnostics: false
    });
    const firstReady = app.readiness();
    expect(mounts.signals).toHaveLength(1);
    expect(mounts.signals[0]!.aborted).toBe(false);
    app.setScene(scene().add(primitives.box({ name: "second" })));
    expect(mounts.signals).toHaveLength(2);
    expect(mounts.signals[0]!.aborted).toBe(true);
    expect(mounts.signals[1]!.aborted).toBe(false);
    await expect(firstReady).resolves.toMatchObject({ state: "cancelled" });
    const secondReady = app.readiness();
    app.dispose();
    expect(mounts.signals[1]!.aborted).toBe(true);
    await expect(secondReady).resolves.toMatchObject({ state: "disposed" });
    await Promise.resolve();
    expect(app.diagnostics().errors).not.toContain("mount aborted");
  });

  it("keeps the app's initial authentication generation through a scene remount", async () => {
    const assets = { securityContext: "account-a-session-1" };
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box({ name: "first" })), autoStart: false, assets
    });
    const firstReady = app.readiness();
    assets.securityContext = "account-b-session-2";
    app.setScene(scene().add(primitives.box({ name: "second" })));
    expect(mounts.options.map((options) => (options as { assets: { securityContext: string } }).assets.securityContext))
      .toEqual(["account-a-session-1", "account-a-session-1"]);
    expect(mounts.signals[0]?.aborted).toBe(true);
    await expect(firstReady).resolves.toMatchObject({ state: "cancelled" });
    app.dispose();
    expect(mounts.signals[1]?.aborted).toBe(true);
  });

  it("forwards the active signal, decoder options and merged output through the actual frame loop", async () => {
    const { startProductionRender } = await vi.importActual<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>("../../../packages/engine/src/agent-api/app/frameLoop");
    const { createInitialDiagnostics } = await import("../../../packages/engine/src/agent-api/diagnostics");
    const snapshot = scene().add(primitives.box({ name: "forwarded" })).toJSON();
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const abort = new AbortController();
    const options = { scene: snapshot, autoStart: false, resize: false, assets: { securityContext: "account-a-session-1", decoders: { basePath: "/local-codecs/" } },
      renderer: { output: { alphaMode: "premultiplied" as const, inputAlphaMode: "premultiplied" as const, outputColorSpace: "srgb" as const } }, output: { outputColorSpace: "display-p3" as const } };
    const controller = await startProductionRender(canvas, snapshot, createInitialDiagnostics(snapshot, undefined), options,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, abort.signal);
    expect(mounts.forwarded).toHaveLength(1);
    expect(mounts.forwarded[0]![6]).toMatchObject({ output: { outputColorSpace: "display-p3", alphaMode: "premultiplied", inputAlphaMode: "premultiplied" } });
    expect(mounts.forwarded[0]![7]).toMatchObject({ request: { signal: abort.signal, securityContext: "account-a-session-1" }, assetOptions: options.assets });
    controller.dispose();
  });
});
