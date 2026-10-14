// apps/showcase-skyline-runner/src/v2/scene/materials.ts — palette constants for
// the winter-dusk v2 shell (art/direction.ts is the contract).
import { material } from "@aura3d/engine";

export const SKYLINE_BG = "#0a1626";
export const LEDGE_BODY = "#16304a";
export const LEDGE_TRIM = "#3d6a8f";
export const SNOW_EDGE = "#dbe9f4";
export const AMBER_ACCENT = "#ffb454";
export const RELAY_TEAL = "#62f8e7";
export const HAZARD_CORAL = "#ff5f77";

export const ledgeBodyMaterial = material.pbr({
  name: "skyline v2 ledge body",
  color: LEDGE_BODY,
  roughness: 0.74,
  metallic: 0.04
});

export const ledgeTrimMaterial = material.emissive({
  name: "skyline v2 snow-edge trim",
  color: SNOW_EDGE,
  emissive: "#bfe4f4",
  emissiveIntensity: 0.35,
  roughness: 0.5
});

export const beaconMaterial = material.emissive({
  name: "skyline v2 relay beacon",
  color: RELAY_TEAL,
  emissive: RELAY_TEAL,
  emissiveIntensity: 0.9,
  roughness: 0.3
});

export const hazardMarkMaterial = material.emissive({
  name: "skyline v2 hazard mark",
  color: "#3d1620",
  emissive: HAZARD_CORAL,
  emissiveIntensity: 0.72,
  roughness: 0.38
});
