// apps/showcase-rooftop-buckets/src/v2/scene/lighting.ts — golden-hour light.
// §6.9.6: ONE shadowed directional key (2600 K low sun from the west) does
// the court light; two dim practicals mark the hoop; the vendored golden-hour
// HDRI at 0.45 feeds glass/court reflections only. No ambient, no fills.
import { environments, lights, type AuraSceneNode } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function lightingNodes(): AuraSceneNode[] {
  return [
    // The one shadowed key: 2600 K late-sun directional.
    lights.directional({
      name: "golden sun key",
      color: "#ffb45e",
      intensity: 3.4,
      position: [-9, 7.5, -6],
      shadow: true
    }).toJSON(),
    // Two dim practicals (under-board rim light + ledge accent) — dressing.
    lights.point({
      name: "rim practical",
      color: "#ffd9a0",
      intensity: 1.6,
      position: [0, 3.6, 0.4]
    }).toJSON(),
    lights.point({
      name: "ledge practical",
      color: "#7ab0ff",
      intensity: 0.9,
      position: [7.6, 1.4, 10.5]
    }).toJSON(),
    // K1-class HDRI at 0.45 — reflections only (vendored 1k golden fixture).
    environments.hdri({
      name: "golden hour hdri reflections",
      texture: envAssets.goldenHourHdr,
      intensity: 0.45
    }).toJSON()
  ];
}
