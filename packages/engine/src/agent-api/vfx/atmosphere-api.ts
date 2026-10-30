// PRD-07 P4-T3 — real `app.atmosphere` factory (C-38 member "atmosphere").
// Holds spec state in the app's LiveAtmosphere and publishes it to the render
// source through the vfx bridge; falls back to StubAppAtmosphere flag-off.

import type { AuraApp } from "../index";
import type { QrFlags } from "@aura3d/rendering/contracts";
import type { AuraSetFogOptions, AuraSetFogSpec, AuraSkySpec } from "../../contracts/atmosphere";
import { StubAppAtmosphere } from "../../contracts/atmosphere";
import { ProductionEffectSystem, type AppLike } from "../../production-runtime/effects/ProductionEffectSystem";
import { attachVfxBridge } from "./bridge";
import { bindPrd07FogRuntime } from "../compiler/fog";
import { prd07SystemFor } from "./effects-api";

export function createAtmosphereExtension(app: AuraApp, ctx: { flags: QrFlags }): import("../../contracts/atmosphere").AuraAppAtmosphere {
  if (!ctx.flags.on("A3D_QR_VFX_SKY") && !ctx.flags.on("A3D_QR_VFX") && !ctx.flags.on("A3D_QR_VFX_FOG")) {
    return new StubAppAtmosphere();
  }
  const existing = prd07SystemFor(app);
  const system = existing ?? new ProductionEffectSystem(app as unknown as AppLike);
  // §6.5 — flag-on hides the tagged prd07.legacySky.* primitives.
  system.setSkyFlagOn(ctx.flags.on("A3D_QR_VFX_SKY"));
  // §8.6 — flag-on hides the tagged prd07.legacyWeather.* primitives.
  system.setWeatherFlagOn(ctx.flags.on("A3D_QR_VFX"));
  system.setDecalFlagOn(ctx.flags.on("A3D_QR_VFX_DECALS"));
  // §6.6 — A3D_QR_VFX_FOG makes the carved compiler/fog.ts read this app's live fog. GU47 E-B: the binding is made for
  // every real atmosphere (A3D_QR_VFX, A3D_QR_VFX_SKY or A3D_QR_VFX_FOG alone); it never depends on the sky flag.
  bindPrd07FogRuntime({ flags: ctx.flags, atmosphere: system.atmosphere });
  // The effects extension already bridged this app's system; a second attach
  // of the same system only recorded a spurious VFX_APP_BINDING_AMBIGUOUS.
  if (app.canvas && !existing) attachVfxBridge(app.canvas, system);
  const atmosphere = system.atmosphere;
  return {
    setFog: (spec: AuraSetFogSpec | null, o?: AuraSetFogOptions) => atmosphere.setFog(spec, o),
    setSky: (spec: Partial<AuraSkySpec>, o?: { transitionSeconds?: number }) => atmosphere.setSky(spec, o),
    setWetness: (value: number, o?: { transitionSeconds?: number }) => atmosphere.setWetness(value, o),
    state: () => atmosphere.state()
  };
}

/**
 * Top-level `atmosphere` namespace — app-first delegates over the C-38
 * `app.atmosphere` member (same object the extension installs). Exported
 * alongside `effects`/`environments`/`shadows` per the consolidated
 * public-surface contract.
 */
function requireAppAtmosphere(app: AuraApp): import("../../contracts/atmosphere").AuraAppAtmosphere {
  const member = app.atmosphere;
  if (member === undefined) {
    throw new Error("aura3d: app.atmosphere is not installed — create the app via createAuraApp (C-38 extension) before using atmosphere.*");
  }
  return member;
}

export const atmosphere = {
  setFog: (app: AuraApp, spec: AuraSetFogSpec | null, o?: AuraSetFogOptions): void =>
    requireAppAtmosphere(app).setFog(spec, o),
  setSky: (app: AuraApp, spec: Partial<AuraSkySpec>, o?: { transitionSeconds?: number }): void =>
    requireAppAtmosphere(app).setSky(spec, o),
  setWetness: (app: AuraApp, value: number, o?: { transitionSeconds?: number }): void =>
    requireAppAtmosphere(app).setWetness(value, o),
  state: (app: AuraApp): ReturnType<import("../../contracts/atmosphere").AuraAppAtmosphere["state"]> =>
    requireAppAtmosphere(app).state()
} as const;
