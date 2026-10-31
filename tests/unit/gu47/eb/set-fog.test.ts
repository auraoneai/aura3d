/**
 * GU47 E-B (WP-2): `app.atmosphere.setFog(spec, { transitionSeconds, overrideSceneFog })` applies to scenes with an
 * `effects.fog` node (it was ignored once the scene tracked any fog node), `handle.setFog` writes its own node, and the
 * live fog binding installs without A3D_QR_VFX_SKY (A3D_QR_VFX_FOG alone).
 */
import { afterEach, describe, expect, it } from "vitest";
import { LiveAtmosphere } from "../../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import type { EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { bindPrd07FogRuntime, createProductionRuntimeEnvironmentFog, prd07FogRuntimeState } from "../../../../packages/engine/src/agent-api/compiler/fog";
import { createAtmosphereExtension } from "../../../../packages/engine/src/agent-api/vfx/atmosphere-api";
import { StubAppAtmosphere } from "../../../../packages/engine/src/contracts/atmosphere";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraApp, AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/index";

function fogNode(id: string, spec: Record<string, unknown>, effect = "fog"): EffectNodeLike {
  return { kind: "effect", effect, ...spec, runtime: { id } } as unknown as EffectNodeLike;
}

function visibleAll(...ids: string[]): { nodes: { get(id: string): { visible?: boolean } | undefined } } {
  return { nodes: { get: (id: string) => (ids.includes(id) ? { visible: true } : undefined) } };
}

afterEach(() => bindPrd07FogRuntime(null));

describe("GU47 E-B setFog on scenes with fog nodes", () => {
  it("an effects.fog scene takes the app-level spec by default (merged over the node)", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([fogNode("f", { density: 0.1, color: "#808080", maxOpacity: 0.6 })]);
    atmosphere.updateFogVisibility(visibleAll("f"));
    expect(atmosphere.resolveFog(0)?.density).toBe(0.1);
    atmosphere.setFog({ density: 0.4, color: "#ff0000" });
    const fog = atmosphere.resolveFog(0.1);
    expect(fog?.density).toBe(0.4);
    expect(fog?.color).toBe("#ff0000");
    expect(fog?.maxOpacity).toBe(0.6);
    expect(atmosphere.sceneFogOverridden()).toBe(true);
  });

  it("transitionSeconds blends the override from the fog shown before", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([fogNode("f", { density: 0.1 })]);
    atmosphere.updateFogVisibility(visibleAll("f"));
    atmosphere.resolveFog(0);
    atmosphere.setFog({ density: 0.3 }, { transitionSeconds: 2 });
    expect(atmosphere.resolveFog(1)?.density).toBeCloseTo(0.1, 6); // anchor t0 = 1
    expect(atmosphere.resolveFog(2)?.density).toBeCloseTo(0.2, 6);
    expect(atmosphere.resolveFog(3)?.density).toBeCloseTo(0.3, 6);
  });

  it("a blend leaves keys neither spec sets absent, so merged defaults stay finite (phase 2, roadster-rush NaN fog)", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([fogNode("f", { density: 0.1, color: "#808080" })]);
    atmosphere.updateFogVisibility(visibleAll("f"));
    atmosphere.resolveFog(0);
    atmosphere.setFog({ density: 0.3, color: "#204060" }, { transitionSeconds: 2, overrideSceneFog: true });
    atmosphere.resolveFog(1);
    const mid = atmosphere.resolveFog(2)!;
    expect(mid.density).toBeCloseTo(0.2, 6);
    for (const key of ["heightDensity", "heightFalloff", "heightReference", "start", "near", "far"]) {
      expect(Object.prototype.hasOwnProperty.call(mid, key)).toBe(false);
    }
    const merged = { heightDensity: 0.04, heightFalloff: 0.2, ...mid };
    expect(Number.isFinite(merged.heightDensity * merged.heightFalloff)).toBe(true);
  });

  it("a height-fog scene keeps its node unless overrideSceneFog is true", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([fogNode("h", { mode: "height", heightDensity: 0.02 }, "height-fog")]);
    atmosphere.updateFogVisibility(visibleAll("h"));
    atmosphere.setFog({ heightDensity: 0.5 });
    expect(atmosphere.resolveFog(0)?.heightDensity).toBe(0.02);
    expect(atmosphere.sceneFogOverridden()).toBe(false);
    atmosphere.setFog({ heightDensity: 0.5 }, { overrideSceneFog: true });
    expect(atmosphere.resolveFog(0.1)?.heightDensity).toBe(0.5);
  });

  it("overrideSceneFog: false leaves an effects.fog node alone", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([fogNode("f", { density: 0.1 })]);
    atmosphere.updateFogVisibility(visibleAll("f"));
    atmosphere.setFog({ density: 0.9 }, { overrideSceneFog: false });
    expect(atmosphere.resolveFog(0)?.density).toBe(0.1);
  });

  it("setFog(null) clears the scene fog until the next override", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([fogNode("f", { density: 0.1 })]);
    atmosphere.updateFogVisibility(visibleAll("f"));
    atmosphere.setFog(null);
    expect(atmosphere.resolveFog(0)).toBeNull();
    atmosphere.setFog({ density: 0.2 });
    expect(atmosphere.resolveFog(0.1)?.density).toBe(0.2);
  });

  it("handle.setFog writes the handle's own node", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([fogNode("near", { density: 0.1 }), fogNode("far", { density: 0.05 }, "height-fog")]);
    atmosphere.updateFogVisibility(visibleAll("near", "far"));
    expect(atmosphere.setNodeFogByRuntimeId("far", { density: 0.07 })).toBe(true);
    expect(atmosphere.resolveFog(0)?.density).toBe(0.07);
    expect(atmosphere.setNodeFogByRuntimeId("missing", { density: 1 })).toBe(false);
  });

  it("node-free scenes keep the app-level spec (unchanged contract)", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.setFog({ mode: "exp", density: 0.05 }, { transitionSeconds: 0 });
    expect(atmosphere.resolveFog(0)?.density).toBe(0.05);
    expect(atmosphere.sceneFogOverridden()).toBe(false);
  });
});

describe("GU47 E-B height-fog binding without A3D_QR_VFX_SKY", () => {
  it("A3D_QR_VFX_FOG alone installs the live atmosphere and binds compiler/fog.ts", () => {
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: false, A3D_QR_VFX_SKY: false, A3D_QR_VFX_FOG: true } });
    expect(flags.on("A3D_QR_VFX_SKY")).toBe(false);
    expect(flags.on("A3D_QR_VFX")).toBe(false);
    expect(flags.on("A3D_QR_VFX_FOG")).toBe(true);
    const fog = { kind: "effect", effect: "fog", density: 0.1, runtime: { id: "fog" } };
    const app = { scene: { nodes: [fog] }, onFrame: () => () => undefined } as unknown as AuraApp;
    const atmosphere = createAtmosphereExtension(app, { flags });
    expect(atmosphere).not.toBeInstanceOf(StubAppAtmosphere);
    const bound = prd07FogRuntimeState();
    expect(bound?.flags.on("A3D_QR_VFX_FOG")).toBe(true);
    bound!.atmosphere.trackFogNodes([fog as unknown as EffectNodeLike]);
    bound!.atmosphere.updateFogVisibility(visibleAll("fog"));
    atmosphere.setFog({ mode: "exp", density: 0.25 });
    const snapshot = { nodes: [fog] } as unknown as AuraSceneSnapshot;
    const out = createProductionRuntimeEnvironmentFog(snapshot, [], 1280, 720) as { mode: string; density: number };
    expect(out.mode).toBe("exponential");
    expect(out.density).toBeCloseTo(0.25, 6);
  });

  it("with every VFX flag off the atmosphere stays the stub", () => {
    const flags = resolveQrFlags({ options: { A3D_QR_VFX: false, A3D_QR_VFX_SKY: false, A3D_QR_VFX_FOG: false } });
    const app = { scene: { nodes: [] }, onFrame: () => () => undefined } as unknown as AuraApp;
    expect(createAtmosphereExtension(app, { flags })).toBeInstanceOf(StubAppAtmosphere);
  });
});
