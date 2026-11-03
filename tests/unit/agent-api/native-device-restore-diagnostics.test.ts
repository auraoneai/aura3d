import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mounts: 0, restored: new Set<() => void>() }));

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: async () => {
      state.mounts += 1;
      const listeners = new Set<() => void>();
      return {
        update() {}, render() {}, setPerformanceQuality() {}, diagnostics: () => undefined,
        renderAsync: () => Promise.resolve(), busy: () => false, whenIdle: () => Promise.resolve(),
        resetTemporalHistory() {}, pause() {}, resume() {},
        onDeviceLost: () => () => {},
        onDeviceRestored(listener: () => void) {
          listeners.add(listener);
          state.restored.add(listener);
          return () => { listeners.delete(listener); state.restored.delete(listener); };
        },
        deviceLost: () => false,
        dispose() { for (const listener of listeners) state.restored.delete(listener); listeners.clear(); }
      };
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";

class FakeCanvas {
  width = 64; height = 64; style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  clientWidth = 64; clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

beforeEach(() => {
  state.mounts = 0;
  state.restored.clear();
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 64, innerHeight: 64,
    location: { search: "", href: "http://localhost/" },
    addEventListener() {}, removeEventListener() {}
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const fireRestored = () => { for (const listener of [...state.restored]) listener(); };
const flush = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };

function snapshotWithRestoreFailure() {
  const snapshot = scene().add(primitives.box({ name: "restore test" })).toJSON();
  const nodes = snapshot.nodes;
  let failure: (() => never) | undefined;
  Object.defineProperty(snapshot, "nodes", {
    configurable: true,
    enumerable: true,
    get() { return failure ? failure() : nodes; }
  });
  return { snapshot, failWith(next: (() => never) | undefined) { failure = next; } };
}

describe("device restore diagnostics", () => {
  it("does not let an unprintable thrown value escape a restore callback and can recover", async () => {
    const input = snapshotWithRestoreFailure();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: input.snapshot, autoStart: false, diagnostics: false
    });
    try {
      await app.ready();
      const unprintable = Object.create(null) as object;
      input.failWith(() => { throw unprintable; });
      expect(fireRestored).not.toThrow();
      input.failWith(undefined);
      expect(app.diagnostics().errors.at(-1)).toMatch(/^DEVICE_RESTORE_REMOUNT_FAILED:/);
      expect(state.mounts).toBe(1);

      fireRestored();
      await flush();
      await app.ready();
      expect(state.mounts).toBe(2);
      expect(app.diagnostics().warnings.some((warning) => warning.startsWith("DEVICE_RESTORED_REMOUNT"))).toBe(true);
    } finally { app.dispose(); }
  });

  it("keeps a bounded recent history when repeated restore attempts fail", async () => {
    const input = snapshotWithRestoreFailure();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: input.snapshot, autoStart: false, diagnostics: false
    });
    try {
      await app.ready();
      let attempt = 0;
      input.failWith(() => { throw new Error(`restore-${attempt++}`); });
      for (let index = 0; index < 150; index += 1) fireRestored();
      input.failWith(undefined);
      const errors = app.diagnostics().errors;
      expect(errors).toHaveLength(128);
      expect(errors[0]).toContain("restore-22");
      expect(errors.at(-1)).toContain("restore-149");
      expect(state.mounts).toBe(1);
    } finally { app.dispose(); }
  });

  it("redacts sensitive error text reported by a failed restore", async () => {
    const input = snapshotWithRestoreFailure();
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: input.snapshot, autoStart: false, diagnostics: false
    });
    try {
      await app.ready();
      input.failWith(() => { throw new Error("failure at https://sample-user:sample-password@example.invalid/a.glb?token=sample-token"); });
      fireRestored();
      input.failWith(undefined);
      const message = app.diagnostics().errors.at(-1)!;
      expect(message).toContain("DEVICE_RESTORE_REMOUNT_FAILED");
      expect(message).toContain("example.invalid/a.glb");
      expect(message).not.toContain("sample-user");
      expect(message).not.toContain("sample-password");
      expect(message).not.toContain("sample-token");
    } finally { app.dispose(); }
  });
});
