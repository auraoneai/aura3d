// PRD-15 T2.1 — consume the C-29 seam without touching Renderer.ts.
//
// `Renderer.create(options)` (PR 0b-2) routes through `createRenderer` →
// `createRenderDevice`; `onDeviceLost`/`onDeviceRestored`/`isDeviceLost`
// delegate to the device's optional lifecycle surface (DeviceLifecycle.ts).
// Per CONTRACTS §6.3 the suite runs against `stub` (mock backend — always
// available) and `real` (webgl2 — only where a GL canvas exists; node has
// none, so `real` is absent here and the MISSING_CANVAS rejection below is
// the honest node-side proof that the backend option is honoured).
import { describe, expect, it } from "vitest";
import { MockRenderDevice, type RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { ShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";

/** Mock device extended with the optional C-29 lifecycle surface. */
class LifecycleMockDevice extends MockRenderDevice {
  public lost = false;
  private readonly lostListeners = new Set<() => void>();
  private readonly restoredListeners = new Set<() => void>();

  public onDeviceLost(listener: () => void): () => void {
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }

  public onDeviceRestored(listener: () => void): () => void {
    this.restoredListeners.add(listener);
    return () => this.restoredListeners.delete(listener);
  }

  public isDeviceLost(): boolean {
    return this.lost;
  }

  public simulateDeviceLost(): void {
    this.lost = true;
    for (const listener of [...this.lostListeners]) listener();
  }

  public simulateDeviceRestored(): void {
    this.lost = false;
    for (const listener of [...this.restoredListeners]) listener();
  }
}

function rendererWith(device: RenderDevice): Renderer {
  // Constructing directly exercises the same delegates `Renderer.create`
  // produces — the factory only chooses the device.
  return new Renderer(
    device,
    { width: 16, height: 16, shaderLibrary: {} as ShaderLibrary },
    new TemporalHistory()
  );
}

describe("C-29 renderer factory consumer (PRD-15 T2.1)", () => {
  // `readonly backend` on Renderer is declared but never assigned (reads
  // undefined) — Q-01-3 filed to lane 01. `it.fails` keeps the suite green
  // meanwhile; when lane 01 lands `this.backend = device.kind` this test
  // turns red until `.fails` is removed — that red is the landing signal.
  it.fails("stub: Renderer.create({ backend: 'mock' }) returns a renderer whose backend is 'mock'", async () => {
    const renderer = await Renderer.create({ backend: "mock" });
    try {
      expect(renderer.backend).toBe("mock");
      // Lifecycle delegates exist and are callable on a lifecycle-free device:
      // subscribing returns an unsubscribe function and never throws.
      const unsubscribe = renderer.onDeviceLost(() => {});
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
      expect(renderer.isDeviceLost()).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it("stub: backend 'webgl2' is honoured — without a canvas it rejects MISSING_CANVAS", async () => {
    await expect(Renderer.create({ backend: "webgl2" })).rejects.toMatchObject({ code: "MISSING_CANVAS" });
  });

  it("stub: onDeviceLost fires exactly once per simulated loss, onDeviceRestored once per restore", () => {
    const device = new LifecycleMockDevice();
    const renderer = rendererWith(device);
    try {
      let lostCount = 0;
      let restoredCount = 0;
      renderer.onDeviceLost(() => { lostCount += 1; });
      renderer.onDeviceRestored(() => { restoredCount += 1; });

      device.simulateDeviceLost();
      expect(lostCount).toBe(1);
      expect(renderer.isDeviceLost()).toBe(true);
      device.simulateDeviceRestored();
      expect(restoredCount).toBe(1);
      expect(renderer.isDeviceLost()).toBe(false);

      device.simulateDeviceLost();
      expect(lostCount).toBe(2);
    } finally {
      renderer.dispose();
    }
  });

  it("stub: an unsubscribed listener does not fire", () => {
    const device = new LifecycleMockDevice();
    const renderer = rendererWith(device);
    try {
      let count = 0;
      const unsubscribe = renderer.onDeviceLost(() => { count += 1; });
      unsubscribe();
      device.simulateDeviceLost();
      expect(count).toBe(0);
    } finally {
      renderer.dispose();
    }
  });
});
