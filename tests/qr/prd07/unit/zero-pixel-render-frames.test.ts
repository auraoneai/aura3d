// EFFECT_ZERO_PIXELS counts *rendered* frames once a canvas bridge binds the
// effect system to a renderer. Before the fix every sim tick counted, so a
// prewarmed emitter on a canvas app reported "no pixels for 30 consecutive
// frames" while the WebGL renderer was still mounting (L4 run 38273425728:
// 0 particle collects at the error; 2 draws / 640+ instances per frame after
// mount), and createGameApp's fixed-step substeps inflated the count too.

import { describe, expect, it, vi } from "vitest";
import { createAuraApp, effects, scene } from "../../../../packages/engine/src";
import { MockRenderDevice } from "@aura3d/rendering";
import { particlePassFor } from "@aura3d/rendering/lanes";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";
import { attachVfxBridge } from "../../../../packages/engine/src/agent-api/vfx/bridge";
import { getRootRenderSource } from "../../../../packages/engine/src/agent-api/RootRuntimeSupport";
import { collectEffectsSection } from "../../../../packages/engine/src/agent-api/vfx/diagnostics";

const ctxFor = (device: MockRenderDevice) =>
  ({
    device, width: 320, height: 200, frameIndex: 0, timeSeconds: 0, camera: null, source: {}, items: [],
    tier: undefined, flags: { values: {}, on: () => true },
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
    blackboard: new Map()
  }) as never;

function bridgedApp() {
  const app = createAuraApp(null, {
    autoStart: false,
    scene: scene().add(effects.particles({ name: "prewarmed dust", emitter: "fountain", maxParticles: 200, rate: 60, prewarm: 4 })),
    qualityRebuild: { flags: ["vfx"] }
  });
  const system = prd07SystemFor(app)!;
  const canvas = {} as HTMLCanvasElement;
  const bridge = attachVfxBridge(canvas, system);
  expect(bridge.attached).toBe(true);
  return { app, system, canvas, bridge };
}

/** One renderer frame: the render-input spread reads the bridged source (as renderInput.ts does). */
function renderFrame(canvas: HTMLCanvasElement, device: MockRenderDevice | null): void {
  const source = { ...(getRootRenderSource(canvas)!.source as Record<string, unknown>) } as { vfx?: { feed(h: unknown): void; afterDraw(d: unknown): void } };
  if (!device || !source.vfx) return; // a renderer without the particle contributor
  const pass = particlePassFor(device);
  source.vfx.feed(pass);
  const queue = pass.transparentItems(ctxFor(device));
  device.beginFrame(320, 200);
  for (const item of queue) item.draw(ctxFor(device));
  device.endFrame();
  source.vfx.afterDraw(pass.diagnostics);
}

const zeroPixelErrors = (app: Parameters<typeof collectEffectsSection>[0]) =>
  collectEffectsSection(app).errors.filter((e) => e.code === "EFFECT_ZERO_PIXELS");

describe("EFFECT_ZERO_PIXELS counts rendered frames on a bridged canvas", () => {
  it("does not fire while no renderer frame has run (async WebGL mount)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, system, bridge } = bridgedApp();
    for (let i = 0; i < 60; i++) app.step(1 / 60);
    expect(system.liveCount()).toBeGreaterThan(0);
    expect(zeroPixelErrors(app)).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("EFFECT_ZERO_PIXELS"));
    errorSpy.mockRestore();
    bridge.detach();
    app.dispose();
  });

  it("does not fire across fixed-step substeps between drawing renders", () => {
    const { app, canvas, bridge } = bridgedApp();
    const device = new MockRenderDevice();
    for (let i = 0; i < 28; i++) app.step(1 / 60); // pre-mount ticks
    for (let tick = 0; tick < 12; tick++) {
      for (let s = 0; s < 6; s++) app.step(1 / 60); // substeps, no render
      renderFrame(canvas, device);
    }
    app.step(1 / 60);
    expect(zeroPixelErrors(app)).toEqual([]);
    expect(collectEffectsSection(app).pixelBacked).toContain("particles");
    bridge.detach();
    app.dispose();
  });

  it("still fires after 30 rendered frames that drew nothing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, canvas, bridge } = bridgedApp();
    app.step(1 / 60);
    for (let i = 0; i < 31; i++) {
      renderFrame(canvas, null); // renderer frame without particle draws
      app.step(1 / 60);
    }
    expect(zeroPixelErrors(app).map((e) => e.nodeId)).toEqual(["prewarmed dust"]);
    errorSpy.mockRestore();
    bridge.detach();
    app.dispose();
  });
});
