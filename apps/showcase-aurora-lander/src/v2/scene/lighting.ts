// apps/showcase-aurora-lander/src/v2/scene/lighting.ts — §6.9.12 lighting (T2.4).
// One 6500 K moon key raking across the valley (shadowed — the lander must
// stack a readable shadow on the regolith during the touchdown grade), a cool
// aurora rim, warm+cyan pad practicals at the final site, and the vendored
// starfield HDRI as the IBL floor at 0.35. No ambient light, no emissive fill.
import { lights, environments } from "@aura3d/engine";
import { envAssets } from "../env-assets";
import { SITES } from "../../gameplay/sites";

export function lightingNodes() {
  const finalPad = SITES[2]!.pads[0]!;
  return [
    lights.directional({
      name: "moonlight key",
      color: "#d9e4fb",
      intensity: 2.35,
      position: [-38, 62, -22],
      shadow: true
    }).toJSON(),
    lights.directional({
      name: "aurora rim",
      color: "#5eead4",
      intensity: 1.1,
      position: [30, 40, 36]
    }).toJSON(),
    lights.point({
      name: "extraction warm practical",
      color: "#ffb454",
      intensity: 2.2,
      position: [finalPad.x - 3.8, 5.6, finalPad.z + 2.2]
    }).toJSON(),
    lights.point({
      name: "extraction cyan practical",
      color: "#67e8f9",
      intensity: 1.8,
      position: [finalPad.x + 4.2, 3.4, finalPad.z - 1.8]
    }).toJSON(),
    environments.hdri({
      name: "starfield dome reflections",
      texture: envAssets.starfieldDomeHdr,
      intensity: 0.35
    }).toJSON()
  ];
}
