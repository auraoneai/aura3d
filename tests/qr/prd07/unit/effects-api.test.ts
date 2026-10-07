// PRD-07 P2-T1 — pooled AuraAppEffects: 1,000 bursts over 10 s keep the
// transient pool at or under the instance cap and live particles at or under
// the C-27 tier particleBudget; over-budget frames report `culled`.

import { describe, expect, it } from "vitest";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index";
import { ProductionEffectSystem } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";
import { createAppEffects, prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

function stubAppLike(frames: ((f: { dt: number }) => void)[]) {
  return { scene: { nodes: [] as never[] }, onFrame: (cb: (f: { dt: number }) => void) => { frames.push(cb); return () => {}; } };
}

describe("P2-T1 pooled app.effects", () => {
  it("1,000 bursts over 10 s keep the pool ≤ cap and live ≤ particleBudget", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const fx = app.effects!;
    const system = prd07SystemFor(app)!;
    let issued = 0;
    for (let frame = 0; frame < 600; frame++) {
      // 10 bursts every 6 frames × 100 groups = 1,000 bursts in 10 s.
      if (frame % 6 === 0) {
        for (let i = 0; i < 10; i++) {
          fx.burst("spark", [0, 0, 0], { count: 24 });
          issued++;
        }
      }
      app.step(1 / 60);
    }
    expect(issued).toBe(1000);
    expect(system.emitterIds().length).toBeLessThanOrEqual(96);
    expect(system.liveCount()).toBeLessThanOrEqual(QUALITY_TIERS[system.tier].particleBudget);
    app.dispose();
  });

  it("over-budget live particles are capped and reported as culled", () => {
    const frames: ((f: { dt: number }) => void)[] = [];
    const system = new ProductionEffectSystem(stubAppLike(frames), { tier: "low" });
    const cap = QUALITY_TIERS.low.particleBudget; // 2,000
    for (let i = 0; i < 3; i++) {
      system.addInstance(`fx-${i}`, {
        kind: "effect",
        effect: "particles",
        id: `fx-${i}`,
        particleCount: cap,
        burst: cap
      } as never);
    }
    frames.forEach((cb) => cb({ dt: 1 / 60 }));
    expect(system.liveCount()).toBeLessThanOrEqual(cap);
    expect(system.culled()).toBeGreaterThan(0);
    const budget = system.diagnostics.report().budget;
    expect(budget).toEqual({ tier: "low", cap, culled: system.culled() });
    system.dispose();
  });

  it("camera layers drive C-22 and super-flash hits C-05 setOutputOverlay", () => {
    const frames: ((f: { dt: number }) => void)[] = [];
    const system = new ProductionEffectSystem(stubAppLike(frames), { tier: "high" });
    let shakeTotal = 0;
    const configured: unknown[] = [];
    const overlays: unknown[] = [];
    const fakeApp = {
      camera: {
        shake: { add: (n: number) => { shakeTotal += n; }, configure: (o: unknown) => configured.push(o) },
        punch: { trigger: () => {} }
      },
      setOutputOverlay: (o: unknown) => { overlays.push(o); return { applied: true }; }
    } as unknown as AuraApp;
    const fx = createAppEffects(fakeApp, system);
    fx.burst("super-flash", [0, 0, 0]);
    fx.burst("explosion-small", [0, 0, 0]);
    expect(shakeTotal).toBeCloseTo(0.7); // 0.25 super-flash + 0.45 explosion-small
    expect(configured.length).toBe(2);
    expect(overlays).toEqual([{ flash: [9, 7, 4, 0.85] }]);
    system.dispose();
  });

  it("without a camera extension the layer is skipped and noted once", () => {
    const frames: ((f: { dt: number }) => void)[] = [];
    const system = new ProductionEffectSystem(stubAppLike(frames), { tier: "high" });
    const fx = createAppEffects({} as AuraApp, system);
    fx.burst("muzzle", [0, 0, 0]);
    fx.burst("impact-flash", [0, 0, 0]);
    const errors = system.diagnostics.report().errors.filter((e) => e.code === "VFX_LAYER_UNAVAILABLE");
    expect(errors).toHaveLength(1);
    system.dispose();
  });
});
