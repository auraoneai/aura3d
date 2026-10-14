// apps/showcase-gallery-shift/src/v2/scene/lighting.ts — the direction's
// lighting plan: a 3200K shadowed spot as the exhibit key over the rotunda,
// IBL fill from the vendored studio dome (stand-in for k1-gallery-interior,
// R-14-13), and exactly the six declared practicals — rotunda chandelier,
// two sweeping guard flashlights, the exit beacon, and the live objective
// glow. No ambient or fill lights anywhere (§7.1).
import { environments, lights } from "@aura3d/engine";
import type { AuraNodeInput } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function galleryLighting(): AuraNodeInput[] {
  return [
    // Key: 3200K exhibit spot over the rotunda, shadowed (direction: spot /
    // 3200K / shadow:true).
    lights.spot({
      name: "v2 rotunda exhibit key",
      color: "#ffcf9e",
      intensity: 2.4,
      position: [0, 7.4, 2.2],
      target: [0, 0.4, -0.4],
      angle: 0.62,
      penumbra: 0.55,
      distance: 26,
      decay: 2,
      shadow: true
    }).toJSON(),
    // Practicals (6): warm chandelier, two flashlights (runtime-reposed ahead
    // of each guard's facing), the exit beacon, the live objective glow, and
    // the thief's own tactical key that keeps the subject lit in dark aisles.
    lights.point({ name: "v2 rotunda chandelier", color: "#ffd9a0", intensity: 1.35 })
      .position(0, 4.2, 0)
      .toJSON(),
    lights.point({ name: "v2 guard-1 flashlight", color: "#ffd58a", intensity: 1.7 })
      .position(-8.5, 1.8, 4.5)
      .runtime(engineRuntime("v2-guard-1-flashlight"))
      .toJSON(),
    lights.point({ name: "v2 guard-2 flashlight", color: "#ffd58a", intensity: 1.7 })
      .position(8.5, 1.8, -5.5)
      .runtime(engineRuntime("v2-guard-2-flashlight"))
      .toJSON(),
    lights.point({ name: "v2 exit beacon glow", color: "#34d399", intensity: 1.6 })
      .position(0, 2.4, -6.4)
      .toJSON(),
    lights.point({ name: "v2 objective practical", color: "#ffd05a", intensity: 2.6 })
      .position(0, -20, 0)
      .runtime(engineRuntime("v2-objective-practical"))
      .toJSON(),
    lights.point({ name: "v2 thief practical", color: "#69f7df", intensity: 1.4 })
      .position(0, 1.25, 4.55)
      .runtime(engineRuntime("v2-thief-practical"))
      .toJSON(),
    // IBL fill: enclosed gallery interior dome (stand-in R-14-13).
    environments.hdri({
      name: "v2 gallery interior dome",
      texture: envAssets.galleryDomeHdr,
      intensity: 0.34
    }).toJSON()
  ];
}

import { game as engineGame } from "@aura3d/engine";
function engineRuntime(id: string) {
  return engineGame.runtimeNode(id, { tags: ["practical", "renderer-owned"] });
}
