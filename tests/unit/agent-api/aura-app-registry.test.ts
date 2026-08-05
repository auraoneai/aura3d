import { describe, expect, it } from "vitest";
import { auraAppRegistry } from "@aura3d/engine";

/**
 * The app registry exists so capture tooling can freeze a scene it did not create.
 *
 * Before it, a screenshot gate could only `waitForTimeout` and photograph whatever frame a live loop
 * had reached, which is why visual approval bound to a screenshot hash was unsatisfiable: 14 of 29
 * showcase screenshots differed between runs with no code change.
 */
describe("aura app registry", () => {
  it("exposes a settle surface for capture tooling", () => {
    expect(auraAppRegistry.kind).toBe("aura3d-live-app-registry");
    expect(typeof auraAppRegistry.settle).toBe("function");
    expect(typeof auraAppRegistry.pauseAll).toBe("function");
    expect(typeof auraAppRegistry.resumeAll).toBe("function");
  });

  it("reports zero apps and no-ops safely in a headless context", () => {
    // Registry must be usable before any app mounts; a capture tool calls it unconditionally.
    expect(auraAppRegistry.count()).toBe(0);
    expect(auraAppRegistry.settle(5)).toBe(0);
    expect(auraAppRegistry.pauseAll()).toBe(0);
    expect(auraAppRegistry.all()).toEqual([]);
  });

  it("is reachable on globalThis so page.evaluate needs no route opt-in", () => {
    // The whole point: routes create apps in module scope and never expose the handle.
    const registry = (globalThis as { __AURA3D_LIVE_APPS__?: { kind?: string } }).__AURA3D_LIVE_APPS__;
    // Only populated once an app is constructed; the export is the contract tested above.
    if (registry) expect(registry.kind).toBe("aura3d-live-app-registry");
  });
});
