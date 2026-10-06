// apps/showcase-siege-golf/src/v2/scene/lighting.ts — §6.9.10 lighting (T2.4).
// One 2900 K golden directional key raking across the range (shadowed — the
// crates, planks and ball must stack shadows on the fairway), a single cool
// practical at the keep end, and the vendored golden-field HDRI as the IBL
// floor at 0.4. No ambient light, no emissive fill.
import { lights, environments } from "@aura3d/engine";
import { envAssets } from "../env-assets";

export function lightingNodes() {
  return [
    lights.directional({
      name: "golden valley sun key",
      color: "#ffcf9a",
      intensity: 2.8,
      position: [-7, 10, 5],
      shadow: true
    }).toJSON(),
    lights.point({
      name: "keep rim practical",
      color: "#59d7ff",
      intensity: 0.9,
      position: [0, 2.4, -10.5]
    }).toJSON(),
    environments.hdri({
      name: "golden field dome reflections",
      texture: envAssets.goldenValleyHdr,
      intensity: 0.4
    }).toJSON()
  ];
}
