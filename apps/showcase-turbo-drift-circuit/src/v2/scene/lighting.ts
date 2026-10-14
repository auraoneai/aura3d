// apps/showcase-turbo-drift-circuit/src/v2/scene/lighting.ts — T2.2 lighting.
// §6.9.2: sun directional aligned to the HDRI sun as the ONLY shadowed key
// (CSM 3 cascades stand-in: single directional until C-10 is real, R-14-14);
// K1 sunset HDRI carries sky + IBL; zero point lights, no ambient.
import { environments, lights } from "@aura3d/engine";
import { envAssets } from "../env-assets";

/** Warm 2400K key from the sunset azimuth; sole shadow caster. */
export function turboDriftLights() {
  return [
    lights.directional({
      name: "turbo sun key",
      color: "#ffb36b",
      intensity: 3.1,
      // Low sunset azimuth; directional lights aim at the origin (no `target`
      // option on the builder).
      position: [-14, 4.2, 9],
      shadow: true
    })
  ];
}

/** K1 sunset sky + reflection IBL at a reflection-bias intensity. */
export function turboDriftEnvironment() {
  return environments.hdri({
    name: "turbo sunset hdri",
    texture: envAssets.sunsetHdr,
    intensity: 0.55
  });
}
