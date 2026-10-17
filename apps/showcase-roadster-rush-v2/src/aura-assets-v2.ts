import { defineAuraAssets } from "@aura3d/engine";

/**
 * Route-local Meshy-generated 3D assets for Apex Overdrive (v2).
 * Each GLB lives under `public/aura-assets/apex-*.glb` and is mirrored to
 * `/aura-assets/` by the showcase build pipeline.
 */
export const assetsV2 = defineAuraAssets({
  apexInterceptor: {
    type: "model",
    format: "glb",
    url: "/aura-assets/apex-interceptor.glb",
    hash: "sha256-ece0aa99f6edf276666d280c9f233bb7612bb01285085672691410a1357d2ea5",
    bounds: [2.25, 1.28, 4.35],
    role: "primaryVehicle"
  },
  apexRival: {
    type: "model",
    format: "glb",
    url: "/aura-assets/apex-rival-skycar.glb",
    hash: "sha256-a07f076d3ffa08b46ff0897a4f84fe068824580a8255d4639b1586d1e92a1062",
    bounds: [2.3, 1.3, 4.4],
    role: "primaryVehicle"
  },
  apexBlimp: {
    type: "model",
    format: "glb",
    url: "/aura-assets/apex-holo-blimp.glb",
    hash: "sha256-fdd75178fdb78dd21ca9f87f739fe598f09df2306eee621d0617c12952b7dea2",
    bounds: [12, 8, 28],
    role: "setDressing"
  },
  apexGunship: {
    type: "model",
    format: "glb",
    url: "/aura-assets/apex-gunship.glb",
    hash: "sha256-7f87f04a5cff7d32e1ad032fd5bff566fc91f050d086c97e3e07ef37b3c30f04",
    bounds: [6.4, 2.8, 8.2],
    role: "primaryVehicle"
  }
});
