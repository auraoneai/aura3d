// PRD-07 P4-T4 — the carved compiler/fog.ts:
//  * flag off → byte-identical legacy output (exp2, near 1 / far 60 hard-codes,
//    0.525 opacity cap — the 85aafcd0 contract);
//  * flag on → C-21 defaults at resolve time (height fog 7/37/62 % at
//    10/50/100 m on a horizontal ray at eye height), near/far cap gone,
//    legacy `density`-only calls stay exp2 with maxOpacity 1.

import { describe, expect, it } from "vitest";
import { createProductionRuntimeEnvironmentFog } from "../../../../packages/engine/src/agent-api/compiler/fog";
import { LiveAtmosphere } from "../../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import { bindPrd07FogRuntime } from "../../../../packages/engine/src/agent-api/compiler/fog";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { fogAmount, resolvePrd07FogSpec } from "../../../../packages/rendering/src/atmosphere/HeightFog";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/index";

function snapshotWithFog(node: Record<string, unknown>): AuraSceneSnapshot {
  return { nodes: [{ kind: "effect", effect: "fog", ...node }], groups: [] } as unknown as AuraSceneSnapshot;
}

describe("P4-T4 carved compiler/fog.ts", () => {
  it("flag off → byte-identical legacy uniforms (near 1 / far 60 / 0.525 cap)", () => {
    const snapshot = snapshotWithFog({ density: 0.12 });
    const out = createProductionRuntimeEnvironmentFog(snapshot, [], 1280, 720);
    expect(out).not.toBe(false);
    const fog = out as { mode: string; density: number; near: number; far: number; maxOpacity: number };
    expect(fog.mode).toBe("exponential-squared");
    expect(fog.near).toBe(1);
    expect(fog.far).toBe(60);
    expect(fog.density).toBeCloseTo(0.12, 6);
    // §11 cap: 0.25 + intensity·0.55 clamped 0.92 — default intensity path.
    expect(fog.maxOpacity).toBeLessThanOrEqual(0.92);
    expect(fog.maxOpacity).toBeGreaterThan(0.5);
  });

  it("flag off → fog node still compiles when bound (binding alone does not alter output)", () => {
    // Even with a prd07 runtime bound, flag-off flags keep the legacy body.
    const atmosphere = new LiveAtmosphere();
    atmosphere.setFog({ mode: "height", heightDensity: 0.9 });
    bindPrd07FogRuntime({ flags: resolveQrFlags({ options: {} }), atmosphere });
    try {
      const out = createProductionRuntimeEnvironmentFog(snapshotWithFog({ density: 0.12 }), [], 1280, 720);
      const fog = out as { mode: string; density: number };
      expect(fog.mode).toBe("exponential-squared");
      expect(fog.density).toBeCloseTo(0.12, 6);
    } finally {
      bindPrd07FogRuntime(null);
    }
  });

  it("flag on → C-21 default fog: ≈7% / 37% / 62% at 10/50/100 m horizontal at 1.6 m", () => {
    const spec = resolvePrd07FogSpec({}); // bare effects.fog() → defaults
    // fogAmount at a horizontal ray from eye height 1.6 m.
    const cam: [number, number, number] = [0, 1.6, 0];
    const f10 = fogAmount(cam, [10, 1.6, 0], spec);
    const f50 = fogAmount(cam, [50, 1.6, 0], spec);
    const f100 = fogAmount(cam, [100, 1.6, 0], spec);
    // C-21 frozen law: 7% / 37% / 62% ±1.5%.
    expect(f10).toBeGreaterThan(0.055);
    expect(f10).toBeLessThan(0.085);
    expect(f50).toBeGreaterThan(0.355);
    expect(f50).toBeLessThan(0.385);
    expect(f100).toBeGreaterThan(0.605);
    expect(f100).toBeLessThan(0.635);
  });

  it("flag on → legacy density-only call keeps exp2 with maxOpacity 1 (no cap)", () => {
    const resolved = resolvePrd07FogSpec({ density: 0.03, color: "#9fb7d9" });
    expect(resolved.mode).toBe("exp2");
    expect(resolved.maxOpacity).toBe(1);
  });

  it("flag on → bare fog node resolves to height mode with C-21 σ values", () => {
    const resolved = resolvePrd07FogSpec({});
    expect(resolved.mode).toBe("height");
    expect(resolved.density).toBeCloseTo(0.004, 6);   // σ_d
    expect(resolved.heightDensity).toBeCloseTo(0.008, 6); // σ_h
    expect(resolved.heightFalloff).toBeCloseTo(0.2, 6);   // b
    expect(resolved.start).toBe(2);
    expect(resolved.color).toBe("sky");
  });

  it("flag on → bound runtime compiles the live spec via packLegacy", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.setFog({ mode: "exp", density: 0.05, maxOpacity: 0.8 });
    bindPrd07FogRuntime({
      flags: resolveQrFlags({ options: ["vfx.fog"] }),
      atmosphere
    });
    try {
      const out = createProductionRuntimeEnvironmentFog(snapshotWithFog({}), [], 1280, 720);
      const fog = out as { mode: string; density: number; maxOpacity: number; near: number; far: number };
      expect(fog.mode).toBe("exponential");           // exp → legacy exponential
      expect(fog.density).toBeCloseTo(0.05, 6);
      expect(fog.maxOpacity).toBeCloseTo(0.8, 6);      // authored cap, not the 0.525 clamp
      // near/far hard-codes are gone — packLegacy emits 0/1 (unused in exp mode).
      expect(fog.near).toBe(0);
      expect(fog.far).toBe(1);
    } finally {
      bindPrd07FogRuntime(null);
    }
  });
});
