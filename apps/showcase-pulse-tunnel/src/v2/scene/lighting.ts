// apps/showcase-pulse-tunnel/src/v2/scene/lighting.ts — §6.9.9 lighting (T2.4).
// One shadowed cool-white spot key tracking down the tunnel mouth (6500 K per
// direction), plus three neon practicals and the vendored deep-space HDRI as
// the IBL floor at 0.3. No ambient light, no emissive fill.
import { lights, environments } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function lightingNodes() {
  return [
    lights.spot({
      name: "tunnel mouth key",
      color: "#eef2ff",
      intensity: 2.6,
      position: [0, 4.6, 4.4],
      target: [0, 0.2, -6],
      shadow: true
    }).toJSON(),
    lights.point({
      name: "cyan lane practical",
      color: "#3ff2ff",
      intensity: 1.9,
      position: [-1.6, 0.5, -3]
    }).toJSON(),
    lights.point({
      name: "magenta lane practical",
      color: "#ff4fd8",
      intensity: 1.9,
      position: [1.6, 0.5, -3]
    }).toJSON(),
    lights.point({
      name: "deep tunnel violet practical",
      color: "#8b5cf6",
      intensity: 1.2,
      position: [0, 1.8, -10]
    }).toJSON(),
    environments.hdri({
      name: "deep space dome reflections",
      texture: envAssets.synthwaveDomeHdr,
      intensity: 0.3
    }).toJSON()
  ];
}
