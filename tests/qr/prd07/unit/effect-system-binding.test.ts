// PRD-07 P1-T14 — the C-38 effects extension creates one ProductionEffectSystem
// per app; a second bridge attach on the same canvas notes
// VFX_APP_BINDING_AMBIGUOUS and stays detached.

import { describe, expect, it } from "vitest";
import { createAuraApp, effects, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";
import { attachVfxBridge } from "../../../../packages/engine/src/agent-api/vfx/bridge";
import { attachRootRenderSource, getRootRenderSource } from "../../../../packages/engine/src/agent-api/RootRuntimeSupport";

describe("P1-T14 effect-system binding", () => {
  it("creates one system per app (headless included)", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(effects.particles({ name: "fx", particleCount: 32 })),
      qualityRebuild: { flags: ["vfx"] }
    });
    const system = prd07SystemFor(app);
    expect(system).toBeTruthy();
    expect(system!.emitterIds()).toContain("fx");
    app.dispose();
  });

  it("a second bridge on the same canvas reports VFX_APP_BINDING_AMBIGUOUS", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const system = prd07SystemFor(app)!;
    const canvas = {} as HTMLCanvasElement;
    const first = attachVfxBridge(canvas, system);
    expect(first.attached).toBe(true);
    const second = attachVfxBridge(canvas, system);
    expect(second.attached).toBe(false);
    expect(system.diagnostics.report().errors.some((e) => e.code === "VFX_APP_BINDING_AMBIGUOUS")).toBe(true);
    first.detach();
    app.dispose();
  });

  // FIX-bridge-exclusive: an app-owned compatibility bridge (Aura Clash
  // AuraClashArenaApp.ts, smart-city main.ts) and the vfx bridge share a canvas
  // in either order — no throw, no VFX_APP_BINDING_AMBIGUOUS, one merged view.
  for (const order of ["app-first", "vfx-first"] as const) {
    it(`coexists with an app compatibility bridge (${order})`, () => {
      const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
      const system = prd07SystemFor(app)!;
      const canvas = {} as HTMLCanvasElement;
      const onFrame = () => {};
      const appLight = { kind: "point" } as never;
      const appBridge = { source: { collectRenderItems: () => [], collectedLights: [appLight] }, onFrame };
      let detachApp = () => {};
      let vfx: ReturnType<typeof attachVfxBridge>;
      if (order === "app-first") {
        detachApp = attachRootRenderSource(canvas, appBridge);
        vfx = attachVfxBridge(canvas, system);
      } else {
        vfx = attachVfxBridge(canvas, system);
        expect(() => { detachApp = attachRootRenderSource(canvas, appBridge); }).not.toThrow();
      }
      expect(vfx.attached).toBe(true);
      expect(system.diagnostics.report().errors.some((e) => e.code === "VFX_APP_BINDING_AMBIGUOUS")).toBe(false);
      const view = getRootRenderSource(canvas)!;
      expect(view.onFrame).toBe(onFrame);
      expect(typeof view.source.collectRenderItems).toBe("function");
      const source = view.source as unknown as Record<string, unknown>;
      expect(source.vfx).toBeTruthy();
      expect(source.atmosphere).toBeTruthy();
      expect([...(view.source.collectedLights ?? [])][0]).toBe(appLight);
      vfx.detach();
      expect(getRootRenderSource(canvas)).toBe(appBridge);
      detachApp();
      expect(getRootRenderSource(canvas)).toBeUndefined();
      app.dispose();
    });
  }
});
