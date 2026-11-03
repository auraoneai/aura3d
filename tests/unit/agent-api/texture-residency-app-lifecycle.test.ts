import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ events: [] as string[], releases: [] as (() => void)[] }));
vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (original) => {
  const actual = await original<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: (...args: unknown[]) => {
      const id = harness.releases.length + 1;
      let release!: () => void;
      const retired = new Promise<void>((resolve) => { release = resolve; });
      harness.releases.push(release);
      harness.events.push(`mount:${id}`);
      let disposed = false;
      const controller = {
        render() {}, diagnostics: () => undefined,
        dispose() { if (!disposed) { disposed = true; harness.events.push(`dispose:${id}`); } },
        whenIdle: () => disposed ? retired : Promise.resolve()
      };
      const ready = args[12] as { onRendererReady(backend: "webgl2", controller: unknown): void; onFirstFrame(backend: "webgl2"): void };
      ready.onRendererReady("webgl2", controller);
      ready.onFirstFrame("webgl2");
      return Promise.resolve(controller);
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";

class FakeCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

const ticks = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  harness.events.length = 0; harness.releases.length = 0;
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { search: "", href: "https://site.test/" }, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("root residency cleanup ordering", () => {
  it("waits for the old device before remounting and reports disposal completion only after the new device retires", async () => {
    const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box({ name: "first" })), autoStart: false, resize: false,
      renderer: { textureResidency: { budgetBytes: 4096 } }
    });
    await app.readyStrict();
    app.setScene(scene().add(primitives.box({ name: "second" })));
    await ticks();
    expect(harness.events).toEqual(["mount:1", "dispose:1"]);
    harness.releases[0]!();
    await ticks();
    await app.readyStrict();
    expect(harness.events).toEqual(["mount:1", "dispose:1", "mount:2"]);
    let disposed = false;
    const pending = app.disposeAsync().then(() => { disposed = true; });
    await ticks();
    expect(disposed).toBe(false);
    expect(harness.events).toContain("dispose:2");
    harness.releases[1]!();
    await pending;
    expect(disposed).toBe(true);
  });
});
