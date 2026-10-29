import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Lane E1 app-level checks with the production frame loop replaced by a controllable stand-in (node has no WebGL). The real
 * `createFrameRateMeter` is kept; `startProductionRender` resolves to a controller whose busy/idle state the test drives.
 */
const controllerState = vi.hoisted(() => ({
  busy: false,
  renders: 0,
  idle: Promise.resolve() as Promise<void>,
  mounts: 0
}));

vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  return {
    ...actual,
    startProductionRender: async () => {
      controllerState.mounts += 1;
      return {
        update() { /* stand-in */ },
        render() { controllerState.renders += 1; },
        setPerformanceQuality() { /* stand-in */ },
        diagnostics: () => undefined,
        renderAsync: () => Promise.resolve(),
        busy: () => controllerState.busy,
        whenIdle: () => controllerState.idle,
        resetTemporalHistory() { /* stand-in */ },
        pause() { /* stand-in */ },
        resume() { /* stand-in */ },
        dispose() { /* stand-in */ }
      };
    }
  };
});

import { createAuraApp, primitives, scene } from "../../../packages/engine/src";
import { setDirectRenderPath, directPathVetoReasons } from "../../../packages/engine/src/agent-api/app/renderPath";

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
  toDataURL() { return `data:image/png;base64,frame-${controllerState.renders}`; }
  addEventListener() { /* stand-in */ }
  removeEventListener() { /* stand-in */ }
}

const globals = globalThis as unknown as Record<string, unknown>;
beforeEach(() => {
  controllerState.busy = false;
  controllerState.renders = 0;
  controllerState.idle = Promise.resolve();
  controllerState.mounts = 0;
  globals.HTMLCanvasElement = FakeCanvas;
  globals.window = { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} };
});
afterEach(() => {
  delete globals.HTMLCanvasElement;
  delete globals.window;
});

const makeApp = async () => {
  const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
  const app = createAuraApp(canvas, { scene: scene().add(primitives.box({ name: "e1 probe" })), autoStart: false, diagnostics: false });
  await app.ready();
  return { app, canvas };
};

describe("RP-08: screenshot while an async frame is in flight", () => {
  it("screenshot() re-renders when idle", async () => {
    const { app } = await makeApp();
    const shot = app.screenshot();
    expect(controllerState.renders).toBe(1);
    expect(shot.dataUrl).toBe("data:image/png;base64,frame-1");
    app.dispose();
  });

  it("screenshot() during a frame cannot re-render and says so; screenshotAsync() waits, renders, then reads", async () => {
    const { app } = await makeApp();
    let finish!: () => void;
    controllerState.busy = true;
    controllerState.idle = new Promise<void>((resolve) => { finish = () => { controllerState.busy = false; resolve(); }; });
    app.screenshot();
    expect(controllerState.renders).toBe(0);
    expect(app.diagnostics().warnings.some((w) => w.startsWith("SCREENSHOT_DURING_ASYNC_FRAME"))).toBe(true);
    const pending = app.screenshotAsync!();
    await Promise.resolve();
    expect(controllerState.renders).toBe(0);
    finish();
    const shot = await pending;
    expect(controllerState.renders).toBe(1);
    expect(shot.dataUrl).toBe("data:image/png;base64,frame-1");
    app.dispose();
  });
});

describe("RP-03: a custom post pass on a direct-path app", () => {
  it("vetoes the direct path while registered and remounts once", async () => {
    const { app, canvas } = await makeApp();
    const addPostPass = (app as { addPostPass?: (pass: { name: string; insertAt: string; fragment: { glsl: string } }) => () => void }).addPostPass;
    expect(typeof addPostPass).toBe("function");
    setDirectRenderPath(canvas, true);
    const mountsBefore = controllerState.mounts;
    const release = addPostPass!({ name: "invert", insertAt: "afterToneMap", fragment: { glsl: "void main(){}" } });
    expect(directPathVetoReasons(canvas)).toEqual(['custom post pass "invert"']);
    await app.ready();
    expect(controllerState.mounts).toBe(mountsBefore + 1);
    expect(app.diagnostics().warnings.some((w) => w.startsWith('DIRECT_PATH_REMOUNT: custom post pass "invert"'))).toBe(true);
    release();
    expect(directPathVetoReasons(canvas)).toEqual([]);
    app.dispose();
  });

  it("does not remount an app that is already on the HDR target", async () => {
    const { app, canvas } = await makeApp();
    setDirectRenderPath(canvas, false);
    const mountsBefore = controllerState.mounts;
    const release = (app as { addPostPass?: (pass: unknown) => () => void }).addPostPass!({ name: "tint", insertAt: "afterToneMap", fragment: { glsl: "" } });
    await app.ready();
    expect(controllerState.mounts).toBe(mountsBefore);
    release();
    app.dispose();
  });
});

describe("C11: renderer.quality string warning reaches diagnostics", () => {
  it("lists RENDERER_QUALITY_STRING for renderer: { quality: \"high\" }", async () => {
    const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
    const app = createAuraApp(canvas, { scene: scene().add(primitives.box()), autoStart: false, diagnostics: false, renderer: { quality: "high" } as never });
    await app.ready();
    expect(app.diagnostics().warnings.some((w) => w.startsWith('RENDERER_QUALITY_STRING: renderer.quality "high"'))).toBe(true);
    app.dispose();
  });
});
