// Lane E1 wave 2 (handoff from G01, top-tennis C8): after webglcontextrestored the engine mounts the scene again, so frames are
// lit without a page reload. An app that remounts in its own onDeviceRestored handler is not remounted twice.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mounts: 0, restored: new Set<() => void>(), disposed: 0 }));

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: async () => {
      state.mounts += 1;
      const mine = new Set<() => void>();
      return {
        update() {}, render() {}, setPerformanceQuality() {}, diagnostics: () => undefined,
        renderAsync: () => Promise.resolve(), busy: () => false, whenIdle: () => Promise.resolve(),
        resetTemporalHistory() {}, pause() {}, resume() {},
        onDeviceLost: () => () => {},
        onDeviceRestored(listener: () => void) {
          mine.add(listener); state.restored.add(listener);
          return () => { mine.delete(listener); state.restored.delete(listener); };
        },
        deviceLost: () => false,
        dispose() { state.disposed += 1; for (const l of mine) state.restored.delete(l); mine.clear(); }
      };
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";

class FakeCanvas {
  width = 300; height = 150; style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
  clientWidth = 64; clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; } getContext() { return null; } addEventListener() {} removeEventListener() {}
}
const globals = globalThis as unknown as Record<string, unknown>;
beforeEach(() => {
  state.mounts = 0; state.restored.clear(); state.disposed = 0;
  globals.HTMLCanvasElement = FakeCanvas;
  globals.window = { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} };
});
afterEach(() => { delete globals.HTMLCanvasElement; delete globals.window; });

const fireRestored = () => { for (const l of [...state.restored]) l(); };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("E1 wave 2: remount after a restored context (top-tennis C8)", () => {
  it("an app without its own remount gets the scene mounted again, once", async () => {
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, { scene: scene().add(primitives.box({ name: "c8" })), autoStart: false, diagnostics: false });
    await app.ready();
    const hidden: string[] = [];
    app.onDeviceRestored(() => hidden.push("notice hidden"));
    expect(state.mounts).toBe(1);
    fireRestored();
    await flush();
    await app.ready();
    expect(hidden).toEqual(["notice hidden"]);
    expect(state.mounts).toBe(2);
    expect(app.diagnostics().warnings.some((w) => w.startsWith("DEVICE_RESTORED_REMOUNT"))).toBe(true);
    // The listener moved to the new controller: a second restore remounts once more, not twice.
    fireRestored();
    await flush();
    expect(state.mounts).toBe(3);
    expect(hidden).toEqual(["notice hidden", "notice hidden"]);
    app.dispose();
  });

  it("an app that remounts in its own handler (setScene) is not remounted a second time", async () => {
    const built = scene().add(primitives.box({ name: "c8" }));
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, { scene: built, autoStart: false, diagnostics: false });
    app.onDeviceRestored(() => app.setScene(built));
    await app.ready();
    fireRestored();
    await flush();
    expect(state.mounts).toBe(2);
    expect(app.diagnostics().warnings.some((w) => w.startsWith("DEVICE_RESTORED_REMOUNT"))).toBe(false);
    app.dispose();
  });

  it("a disposed app does not remount", async () => {
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, { scene: scene().add(primitives.box({ name: "c8" })), autoStart: false, diagnostics: false });
    await app.ready();
    const listeners = [...state.restored];
    app.dispose();
    for (const l of listeners) l();
    await flush();
    expect(state.mounts).toBe(1);
  });
});
