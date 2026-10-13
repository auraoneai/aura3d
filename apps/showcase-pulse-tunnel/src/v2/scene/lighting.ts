// apps/showcase-pulse-tunnel/src/v2/scene/lighting.ts — §6.9.9 lighting (T2.4).
// One shadowed cool-white spot key tracking down the tunnel mouth (6500 K per
// direction), plus three neon practicals and the vendored deep-space HDRI as
// the IBL floor at 0.85. No ambient light, no emissive fill.
import { lights, environments } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function lightingNodes() {
  return [
    lights.spot({
      name: "tunnel mouth key",
      color: "#b8ecff",
      intensity: 3.4,
      position: [0, 4.6, 4.4],
      target: [0, 0.2, -6],
      shadow: true
    }).toJSON(),
    lights.point({
      name: "cyan lane practical",
      color: "#2ee6ff",
      intensity: 3.1,
      position: [-1.6, 0.5, -3]
    }).toJSON(),
    lights.point({
      name: "magenta lane practical",
      color: "#ff3fd4",
      intensity: 3.1,
      position: [1.6, 0.5, -3]
    }).toJSON(),
    lights.point({
      name: "deep tunnel violet practical",
      color: "#9d6bff",
      intensity: 2.3,
      position: [0, 1.8, -10]
    }).toJSON(),
    environments.hdri({
      name: "deep space dome reflections",
      texture: envAssets.synthwaveDomeHdr,
      intensity: 0.85
    }).toJSON()
  ];
}
