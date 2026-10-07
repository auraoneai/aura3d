// PRD-07 P1-T14 — the C-38 effects extension creates one ProductionEffectSystem
// per app; a second bridge attach on the same canvas notes
// VFX_APP_BINDING_AMBIGUOUS and stays detached.

import { describe, expect, it } from "vitest";
import { createAuraApp, effects, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";
import { attachVfxBridge } from "../../../../packages/engine/src/agent-api/vfx/bridge";

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
});
