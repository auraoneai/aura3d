// apps/showcase-gravity-post/src/v2/scene/lighting.ts — T2.2 light rig.
// §6.9.13: one sun-lit system — a single 5800K directional "solar" key angled
// so every planet shows a real terminator, plus the vendored deep-space HDRI
// for IBL fill (lighting.fill: ibl) and ONE practical at the active dock
// (direction.lighting.practicals = 1). No ambient/fill lights (§7.1).
import { environments, lights, type AuraNodeInput } from "@aura3d/engine";
import { PLAY_PLANE_Y } from "../../gameplay/stations";
import { envAssets } from "../env-assets";

export function lightingNodes(): AuraNodeInput[] {
  return [
    // Solar key: direction light sits along +x so the planets' day/night
    // terminators run roughly top-left → bottom-right on the board view.
    lights.directional({
      name: "sol key",
      color: "#fff4dd",
      intensity: 2.5,
      position: [6, 7, 2],
      shadow: true
    }),
    // ONE practical (direction.lighting.practicals = 1): the Delivery-1
    // destination gate at Aquaria Post — the capture window the player learns
    // first. Light positions are authored, not runtime-moved.
    lights.point({
      name: "aquaria-dock practical",
      color: "#59d7ff",
      intensity: 0.9,
      position: [-2.27, PLAY_PLANE_Y + 0.5, -0.65]
    }),
    environments.hdri({
      name: "deep-space dome",
      texture: envAssets.deepSpaceDomeHdr,
      intensity: 0.4
    })
  ];
}
