// apps/aura-clash-showcase/src/v2/scene/lighting.ts — rig + environment (T2.2).
// §6.9.3 rig: warm overhead spot key (shadow, the ONLY shadow caster) fitted
// to the fighter envelope + cool back-rim directional (no shadow) + two neon
// practicals at sign positions + K1 night-city HDRI (stand-in R-14-13) as
// enclosed fill. Deletes the per-fighter camera-side point keys and rim
// points (:920-952). exposureEV -0.3 lands through setOutput in boot.ts.
import { environments, lights } from "@aura3d/engine";
import { envAssets } from "../env-assets";

/** Warm 4000K overhead spot key, sole shadow caster, frustum on the fighters. */
export function auraClashLights(): unknown[] {
  return [
    lights.spot({
      name: "clash overhead key",
      color: "#ffd9b3",
      intensity: 3.4,
      position: [0, 5.6, 1.6],
      target: [0, 0.9, 0],
      angle: 0.85,
      penumbra: 0.5,
      distance: 16,
      shadow: true
    }),
    // Cool back-rim directional (no shadow — one shadowed key only).
    lights.directional({
      name: "clash cool rim",
      color: "#39d6ff",
      intensity: 1.1,
      position: [-4.5, 3.2, -6.5]
    }),
    // Neon practicals at the sign positions (x ±2.85).
    lights.point({
      name: "clash neon pink practical",
      color: "#ff2d78",
      intensity: 1.35,
      position: [-2.85, 1.9, -1.4]
    }),
    lights.point({
      name: "clash neon cyan practical",
      color: "#39d6ff",
      intensity: 1.25,
      position: [2.85, 1.9, -1.4]
    })
  ];
}

/** K1 night-city HDRI stand-in (R-14-13): dusk HDR at enclosed fill level. */
export function auraClashEnvironment(): unknown {
  return environments.hdri({
    name: "clash night city hdri",
    texture: envAssets.nightCityHdr,
    intensity: 0.32
  });
}
