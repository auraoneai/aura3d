/**
 * 08-LOOP: `app.camera` and `app.feel` must subscribe `app.onFrame` only while
 * they have work — a permanently-registered callback keeps `requiresFrames()`
 * true and re-arms rAF forever, so static scenes render every frame.
 *
 * This test uses a fake app whose onFrame registry counts callbacks, the same
 * signal `createAuraApp.ts` feeds `requiresFrames()`.
 */
import { describe, expect, it } from "vitest";
import { createAuraCameraController } from "../../../../packages/engine/src/agent-api/camera/extension.js";
import { createAuraFeelBus } from "../../../../packages/engine/src/agent-api/feel/extension.js";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index.js";

type FrameInfo = { readonly dt: number; readonly time: number };
type FrameCb = (f: FrameInfo) => void;

function fakeApp(spec?: Record<string, unknown>) {
  const callbacks = new Set<FrameCb>();
  const app = {
    scene: { camera: spec as never, nodes: [] },
    nodes: { all: () => [], get: () => undefined },
    onFrame(cb: FrameCb) {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    }
  };
  return {
    app: app as unknown as AuraApp,
    callbacks,
    /** One rAF tick: run every registered callback then report how many remain. */
    tick(dt = 1 / 60, time = 0) {
      for (const cb of [...callbacks]) cb({ dt, time });
      return callbacks.size;
    }
  };
}

describe("08-LOOP arm/idle frame gating", () => {
  it("static spec: camera subscribes, presents, then unregisters when settled", () => {
    const { app, callbacks, tick } = fakeApp({ position: [0, 2, 6], target: [0, 0, 0], fov: 50 });
    const controller = createAuraCameraController(app);
    expect(callbacks.size).toBe(1);
    const t0 = tick(1 / 60, 0);
    // After the first update the static rig has presented its pose; the next
    // tick produces an identical pose → idle → unsubscribe.
    let size = t0;
    for (let i = 0; i < 8 && size > 0; i += 1) size = tick(1 / 60, 16.7 * (i + 1));
    expect(callbacks.size).toBe(0);
    // A mutating call re-arms.
    controller.shake.add(0.5);
    expect(callbacks.size).toBe(1);
  });

  it("continuous rig (chase) never unregisters — subject motion is unpredictable", () => {
    const { app, callbacks, tick } = fakeApp({ position: [0, 2, 6], target: [0, 0, 0], fov: 50 });
    const controller = createAuraCameraController(app);
    controller.use(controller.rigs.chase({ target: "hero" }));
    for (let i = 0; i < 12; i += 1) tick(1 / 60, 16.7 * i);
    expect(callbacks.size).toBe(1);
  });

  it("feel bus: idle at mount (no callback), emit() arms until decay + verdict", () => {
    const { app, callbacks, tick } = fakeApp();
    const bus = createAuraFeelBus(app);
    expect(callbacks.size).toBe(0);
    bus.define("hit", { screen: { flash: 0.8, vignette: 0.5 } });
    bus.emit("hit");
    expect(callbacks.size).toBe(1);
    let size = callbacks.size;
    for (let i = 0; i < 120 && size > 0; i += 1) size = tick(1 / 60, 16.7 * i);
    expect(callbacks.size).toBe(0);
    bus.emit("hit");
    expect(callbacks.size).toBe(1);
  });

  it("ramp setFov settles instead of staying active forever", () => {
    const { app, callbacks, tick } = fakeApp({ position: [0, 2, 6], target: [0, 0, 0], fov: 50 });
    const controller = createAuraCameraController(app);
    // Let it idle out first.
    for (let i = 0; i < 8 && callbacks.size > 0; i += 1) tick(1 / 60, 16.7 * i);
    expect(callbacks.size).toBe(0);
    controller.setFov(70, { halflife: 0.05 });
    let size = callbacks.size;
    for (let i = 0; i < 240 && size > 0; i += 1) size = tick(1 / 60, 16.7 * i);
    expect(callbacks.size).toBe(0);
    expect(controller.presented().fov).toBeCloseTo(70, 3);
  });
});
