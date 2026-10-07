// apps/showcase-blockfall-reactor/src/v2/scene/lighting.ts — §6.9.16 lighting.
// One shadowed 4200K overhead key angles across the well (the "capsule spot"
// of the direction), two practicals only (cabinet marquee glow + arcade trim point —
// direction declares practicals: 2), and the vendored studio HDRI reads as the
// enclosed room's low IBL floor. No ambient/fill light — the jewel emissives
// and neon practicals carry the accents (§7.1 banned list).
import { lights, environments } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function blockfallLighting() {
  return [
    lights.directional({
      name: "blockfall overhead key",
      color: "#ffe3c4",
      intensity: 1.05,
      position: [1.6, 7.2, 2.4],
      shadow: true
    }).toJSON(),
    // Practical 1/2: the cabinet's own screen/marquee glow bathing the well.
    lights.point({
      name: "cabinet screen practical",
      color: "#58e8ff",
      intensity: 1.9,
      position: [-1.4, 3.4, 1.6]
    }).toJSON(),
    // Practical 2/2: room neon trim — a dim magenta counter-edge behind the room.
    lights.point({
      name: "arcade trim practical",
      color: "#ff5ed8",
      intensity: 1.35,
      position: [3.4, 2.6, -2.4]
    }).toJSON(),
    environments.hdri({
      name: "arcade interior dome reflections",
      texture: envAssets.arcadeInteriorHdr,
      intensity: 0.32
    }).toJSON()
  ];
}
