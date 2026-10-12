// Visible effects pass (batch C): the default (engine-default flags) look of
// the legacy boot. Every node here is a public engine builder whose runtime
// path is on under the default `post` / `vfx` / `lighting` flags; with those
// flags off the pass falls back to the pre-pass fog so the flags-off arm keeps
// its old look (and never pays the CPU volumetric-light fallback).
//
// Look brief (space): hard warm sun from upper-left, graphite void with a cool
// rim, the planet as the lit subject. Families: sun key + cascaded shadows and
// contact shadows, volumetric in-scatter / god rays, ambient orbital dust and
// ring sparks, studio IBL reflections on the stations, grade + vignette.
import { effects, environments, lights } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
});

export const effectsPassOn = flags.on("A3D_QR_POST");
const vfxOn = flags.on("A3D_QR_VFX");

export function orbitalEffectsPass() {
  if (!effectsPassOn) return [effects.fog({ density: 0.024, color: "#0d1726" })];
  return [
    // Sun key: the strongest directional drives the shadow cascades and the
    // S4 god-ray direction. Warm, from the upper left so the terminator falls
    // across the planet face the camera sees.
    lights.directional({
      name: "orbital sun key",
      position: [-5.5, 3.6, 4.2],
      target: [0, 0, 0],
      color: "#ffe2b8",
      intensity: 5.0,
      shadow: { cascades: "auto", maxDistance: 24 }
    }),
    // Studio IBL for reflections on the metallic stations and planet lacquer;
    // background stays the authored void.
    environments.preset("studio", { intensity: 0.7, specularIntensity: 1.25, background: false }),
    effects.contactShadows({ length: 0.3, intensity: 0.8 }),
    // Depth-aware in-scatter: a cool haze that recedes the outer ring
    // and lets the sun throw rays past the planet limb.
    effects.volumetricFog({
      name: "orbital in-scatter",
      density: 0.045,
      color: "#2a4a6e",
      intensity: 0.62,
      volumetricQuality: "balanced"
    }),
    effects.colorGrade({ exposure: 1.38, contrast: 1.02, saturation: 1.25 }),
    ...(vfxOn
      ? [
          // Debris belt: a wide spawn disc (fountain plume preset) in the
          // orbital plane, drifting slowly up through the defence ring.
          effects.particles({
            name: "orbital debris belt",
            emitter: "fountain",
            particleCount: 380,
            emissionRate: 85,
            radius: 5.5,
            height: 0.9,
            size: [0.06, 0.13],
            lifetime: [3.5, 4.5],
            color: "#9fd8ff",
            materialMode: "additive-glow",
            seed: 4101
          }).position(0, -0.25, 0),
          // Faint warm sparks scattering off the atmosphere on the sun side.
          effects.particles({
            name: "atmosphere sun-side sparks",
            emitter: "ambient",
            particleCount: 90,
            emissionRate: 24,
            size: [0.035, 0.08],
            lifetime: [2, 3.5],
            speed: 0.45,
            gravity: 0,
            color: "#ffd59a",
            materialMode: "additive-glow",
            seed: 4102
          }).position(-1.05, 0.75, 0.7)
        ]
      : [])
  ] as const;
}
