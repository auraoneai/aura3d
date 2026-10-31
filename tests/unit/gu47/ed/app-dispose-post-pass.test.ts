import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * GU47 phase 2 (receipt `outline-targets`, toon depth ink), app level: `app.dispose()` releases what
 * `app.post.addPostPass` took. The C-13 pass registry is page-global, so before the fix a disposed app's pass stayed
 * registered: the next app on the page that added a pass with the same name threw
 * `REGISTRY_DUPLICATE:prd03.custom.<name>` (the receipt harness mounts one app per variant and adds
 * `effects.toon({ name: "receipt-toon" })` to several), and every other app kept running the dead app's pass. The RP-03
 * direct-path veto the pass put on the app's canvas also outlived the app, so a later app on the same canvas was kept
 * off the direct path for a pass that no longer existed. The production frame loop is a stand-in (node has no WebGL).
 */
vi.mock("../../../../packages/engine/src/agent-api/app/frameLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: async () => ({
      update() { /* stand-in */ },
      render() { /* stand-in */ },
      setPerformanceQuality() { /* stand-in */ },
      diagnostics: () => undefined,
      renderAsync: () => Promise.resolve(),
      busy: () => false,
      whenIdle: () => Promise.resolve(),
      resetTemporalHistory() { /* stand-in */ },
      pause() { /* stand-in */ },
      resume() { /* stand-in */ },
      dispose() { /* stand-in */ }
    })
  };
});

import { createAuraApp, effects, primitives, scene } from "../../../../packages/engine/src";
import { directPathVetoReasons, setDirectRenderPath } from "../../../../packages/engine/src/agent-api/app/renderPath";
import { registeredPostPasses } from "../../../../packages/rendering/src/contracts/post";

class FakeCanvas {
  width = 300;
  height = 150;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  parentElement = null;
  clientWidth = 64;
  clientHeight = 64;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  toDataURL() { return "data:image/png;base64,"; }
  addEventListener() { /* stand-in */ }
  removeEventListener() { /* stand-in */ }
}

const globals = globalThis as unknown as Record<string, unknown>;
beforeEach(() => {
  globals.HTMLCanvasElement = FakeCanvas;
  globals.window = { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} };
});
afterEach(() => {
  delete globals.HTMLCanvasElement;
  delete globals.window;
});

type PostApp = { readonly post?: { addPostPass?: (pass: ReturnType<typeof effects.toon>) => () => void } };

async function directPathApp() {
  const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
  const app = createAuraApp(canvas, { scene: scene().add(primitives.box({ name: "gu47 dispose probe" })), autoStart: false, diagnostics: false });
  await app.ready();
  setDirectRenderPath(canvas, true);
  return { app, canvas, post: (app as unknown as PostApp).post! };
}

const toonIds = () => registeredPostPasses().map((pass) => pass.id).filter((id) => id.startsWith("prd03.custom.gu47-app-dispose"));

describe("GU47 phase 2: app.dispose() releases the custom post passes and direct-path vetoes the app added", () => {
  it("the next app adds a pass with the same name; the disposed app's pass and canvas veto are gone", async () => {
    const first = await directPathApp();
    first.post.addPostPass!(effects.toon({ name: "gu47-app-dispose-toon", size: [480, 270] }));
    await first.app.ready();
    expect(toonIds()).toEqual(["prd03.custom.gu47-app-dispose-toon"]);
    expect(directPathVetoReasons(first.canvas)).toEqual(['custom post pass "gu47-app-dispose-toon"']);
    first.app.dispose();
    expect(toonIds()).toEqual([]);
    expect(directPathVetoReasons(first.canvas)).toEqual([]);

    const second = await directPathApp();
    const release = second.post.addPostPass!(effects.toon({ name: "gu47-app-dispose-toon", size: [480, 270], inkSource: "depth", order: "before-tonemap" }));
    await second.app.ready();
    expect(toonIds()).toEqual(["prd03.custom.gu47-app-dispose-toon"]);
    second.app.dispose();
    release();
    expect(toonIds()).toEqual([]);
    expect(directPathVetoReasons(second.canvas)).toEqual([]);
  });

  it("a release the caller kept still works before dispose and stays a no-op after it", async () => {
    const { app, canvas, post } = await directPathApp();
    const release = post.addPostPass!(effects.toon({ name: "gu47-app-dispose-kept" }));
    await app.ready();
    release();
    expect(toonIds()).toEqual([]);
    expect(directPathVetoReasons(canvas)).toEqual([]);
    const again = post.addPostPass!(effects.toon({ name: "gu47-app-dispose-kept" }));
    await app.ready();
    app.dispose();
    again();
    release();
    expect(toonIds()).toEqual([]);
    expect(directPathVetoReasons(canvas)).toEqual([]);
  });
});
