// PRD-07 P2-T1 — C-20 contract shape: `app.effects` exists under A3D_QR_VFX
// with the full AuraAppEffects surface (burst/spawn/trail/decal/presets/
// registerPreset/liveCount/clear); flag-off keeps the identical PR 0a stub
// surface so flag-off behaviour never changes.

import { describe, expect, it } from "vitest";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

const METHODS = ["burst", "spawn", "trail", "decal", "presets", "registerPreset", "liveCount", "clear"];

describe("C-20 AuraAppEffects surface", () => {
  it("flag-on exposes the real pooled API", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const fx = app.effects!;
    for (const m of METHODS) {
      const member = fx[m as keyof typeof fx];
      expect(member, m).toBeDefined();
    }
    const h = fx.burst("spark", [1, 2, 3], { count: 8 });
    expect(h.alive).toBe(true);
    expect(fx.liveCount).toBeGreaterThanOrEqual(0);
    expect(Object.keys(fx.presets).length).toBeGreaterThanOrEqual(14);
    fx.registerPreset("my-fx", { name: "my-fx", layers: [{ type: "emitter" }] });
    expect(fx.presets["my-fx"]).toBeDefined();
    fx.clear();
    expect(prd07SystemFor(app)!.liveCount()).toBe(0);
    app.dispose();
  });

  it("flag-off keeps the PR 0a stub surface (no emitters are created)", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene() });
    const fx = app.effects!;
    for (const m of METHODS) {
      expect(fx[m as keyof typeof fx], m).toBeDefined();
    }
    const h = fx.burst("spark", [0, 0, 0]);
    h.stop();
    expect(prd07SystemFor(app)!.emitterIds().length).toBe(0);
    app.dispose();
  });
});
