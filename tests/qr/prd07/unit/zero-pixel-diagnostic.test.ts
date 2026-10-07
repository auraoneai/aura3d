// PRD-07 P1-T2 acceptance — EFFECT_ZERO_PIXELS is raised after 30 consecutive
// frames where a live, visible particle-backed effect node produced no draws.
// Run with a real (headless) app; the draw path is exercised through the C-20
// hook on a MockRenderDevice.

import { describe, expect, it, vi } from "vitest";
import { createAuraApp, effects, scene } from "../../../../packages/engine/src";
import { MockRenderDevice } from "@aura3d/rendering";
import { particlePassFor } from "@aura3d/rendering/lanes";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";
import { collectEffectsSection } from "../../../../packages/engine/src/agent-api/vfx/diagnostics";

const particleScene = () =>
  scene().add(
    effects.particles({ name: "fx-fountain", emitter: "fountain", particleCount: 64, emissionRate: 200 })
  );

const ctxFor = (device: MockRenderDevice) =>
  ({
    device,
    width: 320,
    height: 200,
    frameIndex: 0,
    timeSeconds: 0,
    camera: null,
    source: {},
    items: [],
    tier: undefined,
    flags: { values: {}, on: () => true },
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
    blackboard: new Map()
  }) as never;

describe("P1-T2 zero-pixel diagnostic", () => {
  it("flags none: reports EFFECT_ZERO_PIXELS after 30 frames", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createAuraApp(null, { autoStart: false, scene: particleScene() });
    expect(prd07SystemFor(app)).toBeTruthy();

    for (let i = 0; i < 31; i++) app.step(1 / 60);
    const report = collectEffectsSection(app);

    expect(report.errors.some((e) => e.code === "EFFECT_ZERO_PIXELS")).toBe(true);
    expect(report.pixelBacked).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
    app.dispose();
  });

  it("flags vfx: draws through MockRenderDevice put the node in pixelBacked", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: particleScene(),
      qualityRebuild: { flags: ["vfx"] }
    });
    const system = prd07SystemFor(app);
    expect(system).toBeTruthy();

    const device = new MockRenderDevice();
    const pass = particlePassFor(device);

    app.step(1 / 60); // sim advances — particles exist before the first feed
    system!.feed(pass);
    const queue = pass.transparentItems(ctxFor(device));
    expect(queue.length).toBeGreaterThan(0);
    device.beginFrame(320, 200);
    for (const item of queue) item.draw(ctxFor(device));
    device.endFrame();
    const diag = pass.diagnostics;
    expect(diag.drawCalls).toBeGreaterThan(0);
    expect(diag.instancesDrawn).toBeGreaterThan(0);
    system!.afterDraw(diag);

    app.step(1 / 60); // endFrame attributes the draws
    const report = collectEffectsSection(app);
    expect(report.pixelBacked).toContain("particles");
    expect(report.errors.filter((e) => e.code === "EFFECT_ZERO_PIXELS")).toEqual([]);
    app.dispose();
  });

  it("fog nodes never report zero-pixel (they are not particle consumers)", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(effects.fog({ name: "fx-fog" }))
    });
    for (let i = 0; i < 40; i++) app.step(1 / 60);
    const report = collectEffectsSection(app);
    expect(report.errors.filter((e) => e.nodeId === "fx-fog")).toEqual([]);
    app.dispose();
  });
});
