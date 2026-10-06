// apps/showcase-neon-swarm/src/v2/scene/lighting.ts — §6.9.8 night rig (T2.4).
// One 3200 K shadowed directional key (the plaza's warm sodium source) plus
// three cool/magenta practicals; the vendored studio HDRI sits at 0.28 as the
// IBL floor. No ambient light, no emissive fill.
import { lights, environments } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function lightingNodes() {
  return [
    lights.directional({
      name: "sodium plaza key",
      color: "#ffc79a",
      intensity: 2.2,
      position: [8, 22, 6],
      shadow: true
    }).toJSON(),
    lights.point({
      name: "core cyan practical",
      color: "#38bdf8",
      intensity: 2.4,
      position: [0, 4.0, 0]
    }).toJSON(),
    lights.point({
      name: "west magenta practical",
      color: "#ff4fd8",
      intensity: 1.5,
      position: [-18, 3.4, -10]
    }).toJSON(),
    lights.point({
      name: "east violet practical",
      color: "#7c6cff",
      intensity: 1.5,
      position: [18, 3.4, 10]
    }).toJSON(),
    environments.hdri({
      name: "studio 1k night floor reflections",
      texture: envAssets.nightPlazaHdr,
      intensity: 0.28
    }).toJSON()
  ];
}
