// Lane E1 wave 3 (handoff from G10, Aura Links hole changes): `setScene()` or `dispose()` called from an onFrame callback disposes
// the mounted controller; the frame loop must not then submit that frame on the released renderer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ renderers: [] as { disposed: boolean; renders: number; renderedAfterDispose: number }[] }));

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/mountRenderer")>();
  return {
    ...actual,
    createProductionSceneRenderer: async () => {
      const record = { disposed: false, renders: 0, renderedAfterDispose: 0 };
      fake.renderers.push(record);
      return {
        backend: "production-runtime",
        diagnostics: undefined,
        render() {
          if (record.disposed) {
            record.renderedAfterDispose += 1;
            throw new Error("Material a3d-production-sdf-text-label is disposed");
          }
          record.renders += 1;
          return 3;
        },
        update() { /* stand-in */ },
        resize() { /* stand-in */ },
        viewProjection: () => new Float32Array(16),
        deviceLost: () => false,
        dispose() { record.disposed = true; }
      };
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";

class FakeCanvas {
  width = 64; height = 64; style: Record<string, string> = { width: "64px", height: "64px" }; dataset: Record<string, string> = {};
  parentElement = null; clientWidth = 64; clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; } getContext() { return null; } addEventListener() {} removeEventListener() {}
}
const globals = globalThis as unknown as Record<string, unknown>;
let rafQueue: ((time: number) => void)[] = [];
let now = 0;
const tick = () => { now += 16; const queue = rafQueue; rafQueue = []; for (const cb of queue) cb(now); };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  fake.renderers.length = 0; rafQueue = []; now = 0;
  globals.HTMLCanvasElement = FakeCanvas;
  globals.window = { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} };
  vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => { rafQueue.push(cb); return rafQueue.length; });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});
afterEach(() => { delete globals.HTMLCanvasElement; delete globals.window; vi.unstubAllGlobals(); });

describe("E1 wave 3: setScene inside onFrame (G10 handoff)", () => {
  it("the frame that swapped scenes is not submitted on the disposed renderer, and the new scene mounts", async () => {
    const holeOne = scene().add(primitives.box({ name: "hole-1" }));
    const holeTwo = scene().add(primitives.box({ name: "hole-2" }));
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, { scene: holeOne, diagnostics: false });
    let swap = false;
    app.onFrame(() => { if (swap) { swap = false; app.setScene(holeTwo); } });
    await app.ready();
    tick();
    expect(fake.renderers).toHaveLength(1);
    const first = fake.renderers[0]!;
    expect(first.renders).toBeGreaterThan(0);

    swap = true;
    tick();
    await flush();
    await app.ready();
    expect(first.disposed).toBe(true);
    expect(first.renderedAfterDispose).toBe(0);
    expect(app.diagnostics().errors).toEqual([]);
    expect(fake.renderers).toHaveLength(2);
    const second = fake.renderers[1]!;
    expect(second.renders).toBeGreaterThan(0);
    tick();
    expect(second.renderedAfterDispose).toBe(0);
    expect(app.scene.nodes.some((node) => (node as { readonly name?: string }).name === "hole-2")).toBe(true);
    app.dispose();
  });

  it("dispose() inside onFrame stops the frame without a render on the released renderer", async () => {
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, { scene: scene().add(primitives.box({ name: "b" })), diagnostics: false });
    let stop = false;
    app.onFrame(() => { if (stop) app.dispose(); });
    await app.ready();
    tick();
    stop = true;
    expect(() => tick()).not.toThrow();
    expect(fake.renderers[0]!.disposed).toBe(true);
    expect(fake.renderers[0]!.renderedAfterDispose).toBe(0);
  });
});
