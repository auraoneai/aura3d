// apps/showcase-mech-hangar/src/v2/scene/lighting.ts — direction contract:
// 6500K shadowed directional key, IBL fill via the studio-dome stand-in,
// three practicals (bay strip, pit flood, amber worklight). No ambient/fill.
import { environments, lights } from "@aura3d/engine";
import { envAssets } from "../env-assets";
import { ARENA_CENTER_Z } from "./world";

export function mechLighting() {
  return [
    lights.directional({
      name: "mech daylight key",
      color: "#dceaf7",
      intensity: 1.2,
      position: [-4, 7, 5],
      shadow: true
    }).toJSON(),
    lights.point({
      name: "bay strip practical",
      color: "#61dfff",
      intensity: 0.9,
      position: [0, 4.6, -4.2]
    }).toJSON(),
    lights.point({
      name: "pit flood practical",
      color: "#47cfff",
      intensity: 1.0,
      position: [0, 6.4, ARENA_CENTER_Z]
    }).toJSON(),
    lights.point({
      name: "amber worklight practical",
      color: "#ffb454",
      intensity: 0.7,
      position: [5.2, 2.6, 2.2]
    }).toJSON(),
    environments.hdri({
      name: "hangar dome",
      texture: envAssets.hangarDomeHdr,
      intensity: 0.38
    }).toJSON()
  ];
}
