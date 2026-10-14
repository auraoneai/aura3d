// apps/aura-clash-showcase/src/v2/scene/lighting.ts — rig + environment (T2.2).
// §6.9.3 rig, retuned to the aura3d-art-direction fighting recipe row
// (`arena-fight`: top spot key, dark arena + spotlight rim, post
// `arena-fight` applied via setOutput in boot.ts): warm overhead spot key
// (shadow at full strength, the ONLY shadow caster) fitted to the fighter
// envelope + cool back-rim directional (no shadow) so fighters read by
// silhouette + rim + two neon practicals at sign positions + K1 night-city
// HDRI (stand-in R-14-13) as enclosed fill. Contact grounding is the key's
// shadow plus the arena-fight post preset's ambient-occlusion term — no
// fake blob geometry. Deletes the per-fighter camera-side point keys and
// rim points (:920-952). exposureEV -0.3 lands through setOutput in boot.ts.
import { environments, lights, type AuraNodeInput } from "@aura3d/engine";
import { envAssets } from "../env-assets";

/** Warm 4000K overhead spot key, sole shadow caster, frustum on the fighters. */
export function auraClashLights(): AuraNodeInput[] {
  return [
    lights.spot({
      name: "clash overhead key",
      color: "#ffd9b3",
      intensity: 3.4,
      position: [0, 5.6, 1.6],
      target: [0, 0.9, 0],
      // Cone fitted to the fighter envelope by construction: from this
      // position the stage extremes (±3.6 m incl. margin, y 0..1.8) sit
      // ~36° off the spot axis, so 0.65 rad covers them while keeping
      // shadow-map texels dense enough for contact darkening at the feet.
      // The former 0.85 rad / 0.5 penumbra spread the map over ~11 m and
      // lane pixels showed fighters floating with no contact shadow.
      angle: 0.65,
      penumbra: 0.35,
      distance: 16,
      shadow: true
    }),
    // Cool back-rim directional (no shadow — one shadowed key only).
    // 1.85 separates fighter silhouettes and rooftop architecture against the night skyline.
    lights.directional({
      name: "clash cool rim",
      color: "#39d6ff",
      intensity: 1.85,
      position: [-4.5, 3.2, -6.5]
    }),
    // Neon practicals above the grounded floor-edge trim strips (x ±2.45).
    lights.point({
      name: "clash neon pink practical",
      color: "#ff2d78",
      intensity: 1.65,
      position: [-2.45, 0.48, -1.2]
    }),
    lights.point({
      name: "clash neon cyan practical",
      color: "#39d6ff",
      intensity: 1.55,
      position: [2.45, 0.48, -1.2]
    })
  ];
}

/** K1 night-city HDRI stand-in (R-14-13): dusk HDR at enclosed fill level with dark sky background preserved. */
export function auraClashEnvironment(): AuraNodeInput {
  return environments.hdri({
    name: "clash night city hdri",
    texture: envAssets.nightCityHdr,
    intensity: 0.42,
    background: false
  });
}
