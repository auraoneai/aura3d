// apps/showcase-siege-golf/src/v2/scene/materials.ts — §6.9.10 palette.
// Direction primary: olive/earth driving range; accent #ffcf5c; the
// reserved-objective #59d7ff marks the aim guide + charge meter only.
import { material } from "@aura3d/engine";

export const RANGE_BG = "#8ecfe8";

export const AIM_GUIDE = material.emissive({
  color: "#59d7ff", emissive: "#59d7ff", emissiveIntensity: 1.1, opacity: 0.85
});
export const CHARGE_RING = material.emissive({
  color: "#ffcf5c", emissive: "#ffcf5c", emissiveIntensity: 1.2, opacity: 0.9
});
export const STRIKE_FLASH = material.emissive({
  color: "#fff3d6", emissive: "#ffd166", emissiveIntensity: 1.5
});
export const CUP_HALO = material.emissive({
  color: "#ff9d3c", emissive: "#ff9d3c", emissiveIntensity: 0.9, opacity: 0.75
});
export const EARTH_DARK = material.pbr({
  color: "#33401f", roughness: 0.9, metallic: 0.02
});
