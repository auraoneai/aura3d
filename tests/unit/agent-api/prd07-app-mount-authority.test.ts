import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mounts = vi.hoisted(() => ({
  starts: [] as unknown[][],
  forwarded: [] as unknown[][],
  consumed: [] as unknown[],
  losses: [] as Array<() => void>,
  restores: [] as Array<() => void>,
  runActual: false,
  consumeSupplier: false,
  failFirstFrame: false,
  consumeGate: undefined as Promise<void> | undefined
}));

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer.js", () => ({
  createProductionSceneRenderer: async (...args: unknown[]) => {
    mounts.forwarded.push(args);
    if (mounts.consumeSupplier) {
      // Model the renderer's post-await handoff, not a public renderer setter.
      const gate = mounts.consumeGate;
      if (gate) await gate;
      await Promise.resolve();
      const context = args[7] as { getPrd07MountAuthority?: () => unknown };
      mounts.consumed.push(context.getPrd07MountAuthority?.());
    }
    return {
      backend: "webgl2", diagnostics: undefined,
      render: () => { if (mounts.failFirstFrame) throw new Error("mock render failure"); return 1; }, renderAsync: async () => 1,
      deviceLost: () => false, viewProjection: () => new Float32Array(16), dispose() {},
      onDeviceLost: (listener: () => void) => {
        mounts.losses.push(listener);
        return () => { const index = mounts.losses.indexOf(listener); if (index >= 0) mounts.losses.splice(index, 1); };
      },
      onDeviceRestored: (listener: () => void) => {
        mounts.restores.push(listener);
        return () => { const index = mounts.restores.indexOf(listener); if (index >= 0) mounts.restores.splice(index, 1); };
      }
    };
  }
}));

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop.js")>();
  return {
    ...actual,
    startProductionRender: (...args: unknown[]) => {
      mounts.starts.push(args);
      if (mounts.runActual) return actual.startProductionRender(...args as Parameters<typeof actual.startProductionRender>);
      const signal = args[13] as AbortSignal;
      return new Promise((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("mount aborted"), { name: "AbortError" }));
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
    }
  };
});

import "../../../packages/engine/src/lanes/prd07.js";
import { createAuraAppWithPhysicsWorldAccess } from "../../../packages/engine/src/agent-api/app/createAuraAppCore.js";
import { createInitialDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics.js";
import { attachRootRenderSource } from "../../../packages/engine/src/agent-api/RootRuntimeSupport.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { PhysicsWorldAccess } from "../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js";

class FakeCanvas {
  width = 300; height = 150; style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  clientWidth = 64; clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

const asCanvas = (canvas: FakeCanvas) => canvas as unknown as HTMLCanvasElement;
const noPhysics: PhysicsWorldAccess = {
  preload: async () => {},
  requireReady: () => { throw new Error("Unexpected physics world"); }
};

beforeEach(() => {
  mounts.starts.length = 0;
  mounts.forwarded.length = 0;
  mounts.consumed.length = 0;
  mounts.losses.length = 0;
  mounts.restores.length = 0;
  mounts.runActual = false;
  mounts.consumeSupplier = false;
  mounts.failFirstFrame = false;
  mounts.consumeGate = undefined;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("app-owned PRD07 mount plumbing", () => {
  it("seals the app before a deferred renderer requests its mount authority", async () => {
    mounts.runActual = true;
    mounts.consumeSupplier = true;
    const canvas = asCanvas(new FakeCanvas());
    const app = createAuraAppWithPhysicsWorldAccess(noPhysics, canvas, {
      scene: scene().add(primitives.box()), autoStart: false, resize: false, diagnostics: false,
      qualityRebuild: { flags: ["vfx"] }
    });
    try {
      await app.ready();
      expect(mounts.starts).toHaveLength(1);
      const authority = mounts.consumed[0] as { owner: object; canvas: HTMLCanvasElement; isLive(): boolean };
      expect(authority).toMatchObject({ owner: mounts.starts[0]![14], canvas });
      expect(authority.isLive()).toBe(true);
      app.dispose();
      expect(authority.isLive()).toBe(false);
    } finally { app.dispose(); }
  });

  it("returns no authority to a renderer that finishes after app disposal", async () => {
    mounts.runActual = true;
    mounts.consumeSupplier = true;
    let release!: () => void;
    mounts.consumeGate = new Promise<void>((resolve) => { release = resolve; });
    const canvas = asCanvas(new FakeCanvas());
    const app = createAuraAppWithPhysicsWorldAccess(noPhysics, canvas, {
      scene: scene().add(primitives.box()), autoStart: false, resize: false, diagnostics: false,
      qualityRebuild: { flags: ["vfx"] }
    });
    app.dispose();
    release();
    await app.disposeAsync();
    expect(mounts.consumed).toEqual([null]);
  });

  it("revokes a captured authority on the current renderer's device loss", async () => {
    mounts.runActual = true;
    mounts.consumeSupplier = true;
    const canvas = asCanvas(new FakeCanvas());
    const app = createAuraAppWithPhysicsWorldAccess(noPhysics, canvas, {
      scene: scene().add(primitives.box()), autoStart: false, resize: false, diagnostics: false,
      qualityRebuild: { flags: ["vfx"] }
    });
    try {
      await app.ready();
      const authority = mounts.consumed[0] as { isLive(): boolean; onRevoke(listener: () => void): () => void };
      const revoke = vi.fn();
      authority.onRevoke(revoke);
      const hooks = mounts.starts[0]![15] as {
        getPrd07MountAuthority(): unknown;
        subscribePrd07Atmosphere(listener: () => void): () => void;
      };
      const oldChange = vi.fn();
      const stopOld = hooks.subscribePrd07Atmosphere(oldChange);
      expect(mounts.losses).toHaveLength(1);
      mounts.losses[0]!();
      expect(authority.isLive()).toBe(false);
      expect(revoke).toHaveBeenCalledTimes(1);
      expect(hooks.getPrd07MountAuthority()).toBeNull();
      app.atmosphere!.setWetness(0.2);
      expect(oldChange).not.toHaveBeenCalled();
      expect(mounts.restores).toHaveLength(1);
      mounts.restores[0]!();
      await app.ready();
      expect(mounts.consumed).toHaveLength(2);
      const restored = mounts.consumed[1] as { isLive(): boolean };
      const restoredHooks = mounts.starts[1]![15] as typeof hooks;
      const restoredChange = vi.fn();
      const stopRestored = restoredHooks.subscribePrd07Atmosphere(restoredChange);
      app.atmosphere!.setWetness(0.7);
      expect(restoredChange).toHaveBeenCalled();
      expect(oldChange).not.toHaveBeenCalled();
      expect(restored).not.toBe(authority);
      expect(restored.isLive()).toBe(true);
      expect(authority.isLive()).toBe(false);
      app.dispose();
      expect(restored.isLive()).toBe(false);
      expect(revoke).toHaveBeenCalledTimes(1);
      stopOld(); stopRestored();
    } finally { app.dispose(); }
  });

  it("revokes a captured authority when renderer mount fails", async () => {
    mounts.runActual = true;
    mounts.consumeSupplier = true;
    mounts.failFirstFrame = true;
    const errorOutput = vi.spyOn(console, "error").mockImplementation(() => {});
    const canvas = asCanvas(new FakeCanvas());
    const app = createAuraAppWithPhysicsWorldAccess(noPhysics, canvas, {
      scene: scene().add(primitives.box()), autoStart: false, resize: false, diagnostics: false,
      qualityRebuild: { flags: ["vfx"] }
    });
    try {
      await app.ready();
      const authority = mounts.consumed[0] as { isLive(): boolean };
      expect(authority.isLive()).toBe(false);
      const hooks = mounts.starts[0]![15] as { getPrd07MountAuthority(): unknown };
      expect(hooks.getPrd07MountAuthority()).toBeNull();
    } finally { app.dispose(); errorOutput.mockRestore(); }
  });

  it("keeps app identity, subscriptions and remounts separate on one canvas", () => {
    type Hooks = {
      getPrd07MountAuthority(): {
        readonly owner: object; readonly canvas: HTMLCanvasElement; readonly overlay: object;
        isLive(): boolean; capture(): unknown; onChange(listener: () => void): () => void;
        onRevoke(listener: () => void): () => void; noteCamera(x: number, y: number, z: number, fx: number, fy: number, fz: number): void;
      } | null;
      subscribePrd07Atmosphere(listener: () => void): () => void;
    };
    const canvas = asCanvas(new FakeCanvas());
    const options = { scene: scene().add(primitives.box({ name: "first" })), autoStart: false, diagnostics: false,
      qualityRebuild: { flags: ["vfx"] } } as const;
    const first = createAuraAppWithPhysicsWorldAccess(noPhysics, canvas, options);
    const second = createAuraAppWithPhysicsWorldAccess(noPhysics, canvas, options);
    try {
      expect(mounts.starts).toHaveLength(2);
      const firstOwner = mounts.starts[0]![14] as object;
      const secondOwner = mounts.starts[1]![14] as object;
      const firstHooks = mounts.starts[0]![15] as Hooks;
      const secondHooks = mounts.starts[1]![15] as Hooks;
      expect(firstOwner).not.toBe(secondOwner);
      const authority = firstHooks.getPrd07MountAuthority();
      expect(authority).toMatchObject({ owner: firstOwner, canvas });
      expect(authority?.overlay).toBeTruthy();
      expect(firstHooks.getPrd07MountAuthority()).toBe(authority);
      const revoked = vi.fn(), cancelledRevoke = vi.fn(), scopedChange = vi.fn();
      authority!.onRevoke(revoked);
      authority!.onRevoke(cancelledRevoke)();
      authority!.onChange(scopedChange);
      // Overlays are keyed by app runtime owner on a shared canvas. The second
      // app gets only its own authority, never the first app's merely because
      // the canvas matches.
      const secondAuthority = secondHooks.getPrd07MountAuthority();
      expect(secondAuthority).toMatchObject({ owner: secondOwner, canvas });
      expect(secondAuthority).not.toBe(authority);
      expect(secondAuthority!.overlay).not.toBe(authority!.overlay);

      const firstChange = vi.fn(), secondChange = vi.fn();
      const offFirst = firstHooks.subscribePrd07Atmosphere(firstChange);
      const offSecond = secondHooks.subscribePrd07Atmosphere(secondChange);
      first.atmosphere!.setWetness(0.4);
      expect(firstChange).toHaveBeenCalled();
      expect(secondChange).not.toHaveBeenCalled();
      firstChange.mockClear();
      second.atmosphere!.setWetness(0.7);
      expect(secondChange).toHaveBeenCalled();
      expect(firstChange).not.toHaveBeenCalled();
      offFirst(); offSecond();

      const previousScene = first.scene;
      expect(() => first.setScene(scene().add(primitives.box({ name: "physics" }).physics({ type: "dynamic", shape: "box" }))))
        .toThrow("Unexpected physics world");
      expect(first.scene).toBe(previousScene);
      expect(authority!.isLive()).toBe(true);
      expect(revoked).not.toHaveBeenCalled();

      first.setScene(scene().add(primitives.box({ name: "replacement" })));
      expect(mounts.starts).toHaveLength(3);
      const replacementHooks = mounts.starts[2]![15] as Hooks;
      expect(firstHooks.getPrd07MountAuthority()).toBeNull();
      const replacement = replacementHooks.getPrd07MountAuthority();
      expect(replacement).toMatchObject({ owner: firstOwner, canvas });
      expect(replacement).not.toBe(authority);
      expect(authority!.isLive()).toBe(false);
      expect(authority!.capture()).toBeNull();
      expect(() => authority!.noteCamera(0, 0, 0, 0, 0, -1)).toThrow(/authority_revoked/i);
      expect(revoked).toHaveBeenCalledTimes(1);
      expect(cancelledRevoke).not.toHaveBeenCalled();
      scopedChange.mockClear();
      const staleChange = vi.fn();
      const stopStale = firstHooks.subscribePrd07Atmosphere(staleChange);
      first.atmosphere!.setWetness(0.2);
      expect(staleChange).not.toHaveBeenCalled();
      expect(scopedChange).not.toHaveBeenCalled();
      stopStale();
      first.dispose();
      expect(revoked).toHaveBeenCalledTimes(1);
      expect(replacement!.isLive()).toBe(false);
      expect(replacementHooks.getPrd07MountAuthority()).toBeNull();
      // Disposing the first app never revokes or resets the second app's authority.
      expect(secondAuthority!.isLive()).toBe(true);
      expect(secondHooks.getPrd07MountAuthority()).toBe(secondAuthority);
      second.dispose();
      expect(secondAuthority!.isLive()).toBe(false);
      expect(secondHooks.getPrd07MountAuthority()).toBeNull();
    } finally { first.dispose(); second.dispose(); }
  });

  it("passes the private supplier through the frame loop without reading a foreign atmosphere getter", async () => {
    const { startProductionRender } = await vi.importActual<typeof import("../../../packages/engine/src/agent-api/app/frameLoop.js")>("../../../packages/engine/src/agent-api/app/frameLoop.js");
    const canvas = asCanvas(new FakeCanvas());
    const foreignGetter = vi.fn(() => { throw new Error("foreign atmosphere must not be read"); });
    const source = Object.defineProperty({}, "atmosphere", { get: foreignGetter });
    const detach = attachRootRenderSource(canvas, { source: source as never });
    const snapshot = scene().add(primitives.box({ name: "renderable" })).toJSON();
    const owner = {};
    const supply = vi.fn(() => null);
    const unsubscribe = vi.fn();
    let notify: (() => void) | undefined;
    const subscribe = vi.fn((listener: () => void) => { notify = listener; return unsubscribe; });
    const requestFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    try {
      const controller = await startProductionRender(canvas, snapshot, createInitialDiagnostics(snapshot, undefined),
        { scene: snapshot, autoStart: true, resize: false },
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        owner, { getPrd07MountAuthority: supply, subscribePrd07Atmosphere: subscribe });
      expect(mounts.forwarded).toHaveLength(1);
      expect(mounts.forwarded[0]![7]).toMatchObject({ runtimeOwner: owner, getPrd07MountAuthority: supply });
      expect(supply).not.toHaveBeenCalled();
      expect(foreignGetter).not.toHaveBeenCalled();
      expect(subscribe).toHaveBeenCalledTimes(1);
      notify?.();
      expect(requestFrame).toHaveBeenCalledTimes(1);
      controller.dispose();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      notify?.();
      expect(requestFrame).toHaveBeenCalledTimes(1);
    } finally { detach(); }
  });

  it("keeps the legacy source subscription for standalone frame-loop callers", async () => {
    const { startProductionRender } = await vi.importActual<typeof import("../../../packages/engine/src/agent-api/app/frameLoop.js")>("../../../packages/engine/src/agent-api/app/frameLoop.js");
    const canvas = asCanvas(new FakeCanvas());
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const detach = attachRootRenderSource(canvas, { source: { atmosphere: { onRenderChange: subscribe } } as never });
    const snapshot = scene().add(primitives.box()).toJSON();
    try {
      const controller = await startProductionRender(canvas, snapshot, createInitialDiagnostics(snapshot, undefined),
        { scene: snapshot, autoStart: false, resize: false });
      expect(subscribe).toHaveBeenCalledTimes(1);
      controller.dispose();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    } finally { detach(); }
  });
});
