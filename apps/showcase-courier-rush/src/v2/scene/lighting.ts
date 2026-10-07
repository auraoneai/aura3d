// apps/showcase-courier-rush/src/v2/scene/lighting.ts — wet-dawn light.
// §6.9.7: ONE shadowed directional key (4300 K low dawn sun from the east)
// does the city light; ≤4 practicals total (the pressure gate key inside
// buildCityDressing counts as one — three dock/street accents join it); the
// vendored overcast HDRI at 0.4 feeds wet-asphalt reflections only. No
// ambient, no fills.
import { environments, lights, type AuraSceneNode } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function lightingNodes(): AuraSceneNode[] {
  return [
    // The one shadowed key: 4300 K dawn directional.
    lights.directional({
      name: "dawn sun key",
      color: "#ffd9a8",
      intensity: 2.9,
      position: [24, 9, -14],
      shadow: true
    }).toJSON(),
    // Three of the four allowed practicals (pressure-gate key is the fourth).
    lights.point({
      name: "depot dock practical",
      color: "#ffb84d",
      intensity: 1.4,
      position: [-2.35, 2.8, -14]
    }).toJSON(),
    lights.point({
      name: "north tower practical",
      color: "#9fd8ff",
      intensity: 1.0,
      position: [-2.35, 3.0, 14]
    }).toJSON(),
    lights.point({
      name: "east plaza practical",
      color: "#ffe0b8",
      intensity: 0.9,
      position: [22, 2.8, -2.35]
    }).toJSON(),
    // K1-class HDRI at 0.4 — wet reflections only (vendored 1k dawn fixture).
    environments.hdri({
      name: "dawn overcast hdri reflections",
      texture: envAssets.dawnOvercastHdr,
      intensity: 0.4
    }).toJSON()
  ];
}
