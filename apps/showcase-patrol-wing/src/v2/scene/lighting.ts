// apps/showcase-patrol-wing/src/v2/scene/lighting.ts — §6.9.11 lighting.
// One 3200K golden-hour directional key low off the west horizon (shadowed —
// the plane, gates and tower must stack shadows on the island), exactly two
// practicals (pad beacon cyan + peak beacon red, matching
// direction.lighting.practicals), and the vendored golden-field HDRI as the
// IBL floor at 0.45 standing in for k1-sunset-ocean until T3.x.
// No ambient light, no emissive fill (§7.1).
import { lights, environments } from "@aura3d/engine";
import { envAssets } from "../env-assets";
import { PAD_CENTER, PAD_Y } from "../../legacy/sky";

export function lightingNodes() {
  return [
    lights.directional({
      name: "golden-hour sun key",
      color: "#ffc9a0",
      intensity: 2.4,
      position: [-30, 26, 18],
      shadow: true
    }).toJSON(),
    // Practical 1/2: pad service beacon pool on the landing plateau.
    lights.point({
      name: "pad beacon practical",
      color: "#7ef8ff",
      intensity: 1.6,
      position: [PAD_CENTER[0], PAD_Y + 1.9, PAD_CENTER[2]]
    }).toJSON(),
    // Practical 2/2: red peak beacon on the radar tower.
    lights.point({
      name: "peak beacon practical",
      color: "#ef4444",
      intensity: 1.2,
      position: [0, 13.8, 0]
    }).toJSON(),
    // IBL fill: warm low-sun field dome tinted toward the sunset-ocean
    // palette (k1-sunset-ocean stand-in until T3.x admits the K1 set).
    environments.hdri({
      name: "sunset ocean dome reflections",
      texture: envAssets.sunsetOceanHdr,
      intensity: 0.45
    }).toJSON()
  ];
}
