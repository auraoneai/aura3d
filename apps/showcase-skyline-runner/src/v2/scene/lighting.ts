// apps/showcase-skyline-runner/src/v2/scene/lighting.ts — direction contract:
// 5500K shadowed directional key, IBL fill (winter-dusk stand-in HDRI), 2 practicals.
import { environments, lights } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function skylineLighting() {
  return [
    lights.directional({
      name: "skyline dusk key",
      color: "#cfe0ee",
      intensity: 1.15,
      position: [-3, 5, 4],
      shadow: true
    }).toJSON(),
    lights.point({
      name: "relay checkpoint practical",
      color: "#62f8e7",
      intensity: 0.9,
      position: [1.7, 1.8, 2.4]
    }).toJSON(),
    lights.point({
      name: "steel-dawn sodium practical",
      color: "#ffb454",
      intensity: 0.6,
      position: [-1.2, 2.6, 1.4]
    }).toJSON(),
    environments.hdri({
      name: "winter dusk dome",
      texture: envAssets.winterDuskHdr,
      intensity: 0.4
    }).toJSON()
  ];
}
