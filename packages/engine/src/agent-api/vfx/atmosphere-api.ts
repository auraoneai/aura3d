// PRD-07 P4-T3 — real `app.atmosphere` factory (C-38 member "atmosphere").
// Holds spec state in the app's LiveAtmosphere and publishes it to the render
// source through the vfx bridge; falls back to StubAppAtmosphere flag-off.

import type { AuraApp } from "../index";
import type { QrFlags } from "@aura3d/rendering/contracts";
import type { AuraHeightFogSpec, AuraSkySpec } from "../../contracts/atmosphere";
import { StubAppAtmosphere } from "../../contracts/atmosphere";
import { ProductionEffectSystem, type AppLike } from "../../production-runtime/effects/ProductionEffectSystem";
import { attachVfxBridge } from "./bridge";
import { bindPrd07RendererFlags } from "@aura3d/rendering";
import { bindPrd07FogRuntime } from "../compiler/fog";
import { prd07SystemFor } from "./effects-api";

export function createAtmosphereExtension(app: AuraApp, ctx: { flags: QrFlags }): import("../../contracts/atmosphere").AuraAppAtmosphere {
  if (!ctx.flags.on("A3D_QR_VFX_SKY") && !ctx.flags.on("A3D_QR_VFX") && !ctx.flags.on("A3D_QR_VFX_FOG")) {
    return new StubAppAtmosphere();
  }
  bindPrd07RendererFlags(ctx.flags);
  const system = prd07SystemFor(app) ?? new ProductionEffectSystem(app as unknown as AppLike);
  // §6.5 — flag-on hides the tagged prd07.legacySky.* primitives.
  system.setSkyFlagOn(ctx.flags.on("A3D_QR_VFX_SKY"));
  // §8.6 — flag-on hides the tagged prd07.legacyWeather.* primitives.
  system.setWeatherFlagOn(ctx.flags.on("A3D_QR_VFX"));
  // §6.6 — flag-on makes the carved compiler/fog.ts read this app's live fog.
  bindPrd07FogRuntime({ flags: ctx.flags, atmosphere: system.atmosphere });
  if (app.canvas) attachVfxBridge(app.canvas, system);
  const atmosphere = system.atmosphere;
  return {
    setFog: (spec: AuraHeightFogSpec | null, o?: { transitionSeconds?: number }) => atmosphere.setFog(spec, o),
    setSky: (spec: Partial<AuraSkySpec>, o?: { transitionSeconds?: number }) => atmosphere.setSky(spec, o),
    setWetness: (value: number, o?: { transitionSeconds?: number }) => atmosphere.setWetness(value, o),
    state: () => atmosphere.state()
  };
}
