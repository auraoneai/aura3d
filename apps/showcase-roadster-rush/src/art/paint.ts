/**
 * GU47 AO-M1 / AO-A2: vehicle paint overrides. The hero GLB's base colour map is a neutral grey (mean sRGB 127/125/121), so a
 * multiply tint turns it cobalt while its baked detail survives (no texture is replaced: the C-35 `asset-texture-override`
 * rule stays clean). Paint values come from `material.carPaint` (semi-metal base under a clearcoat lobe); the warm rim (E-D)
 * is the low sun dead ahead catching the silhouette. The tangerine stripe needs the WP-36 hero retexture.
 *
 * Rivals (interim until the WP-36 interceptor lands): graphite with a red rim, so a sky-lane threat never reads as the hero.
 */
import { material, type AuraModelMaterialOverride } from "@aura3d/engine";
import { APEX_PALETTE } from "./look";

/** Multiply tint over the grey base map: lands on the identity cobalt with the map's mid-grey shading. */
export const APEX_HERO_TINT = "#3a64e8";
export const APEX_RIVAL_TINT = "#4a4d56";

function paintOverride(tint: string, rim: { color: string; power: number; intensity: number }): AuraModelMaterialOverride {
  const paint = material.carPaint({ color: tint });
  return {
    color: tint,
    colorMode: "multiply",
    ...(paint.roughness !== undefined ? { roughness: paint.roughness } : {}),
    ...(paint.metallic !== undefined ? { metallic: paint.metallic } : {}),
    ...(paint.clearcoat !== undefined ? { clearcoat: paint.clearcoat } : {}),
    ...(paint.clearcoatRoughness !== undefined ? { clearcoatRoughness: paint.clearcoatRoughness } : {}),
    ...(paint.envMapIntensity !== undefined ? { envMapIntensity: paint.envMapIntensity } : {}),
    rim
  };
}

/** Hero: cobalt metallic clearcoat, warm tangerine rim (AO-M1). */
export function apexHeroPaint(): readonly AuraModelMaterialOverride[] {
  return [paintOverride(APEX_HERO_TINT, { color: APEX_PALETTE.tangerine, power: 3.5, intensity: 0.9 })];
}

/** Sky-lane rival: graphite with the reserved rival red on the rim (AO-A2 interim). */
export function apexRivalPaint(): readonly AuraModelMaterialOverride[] {
  return [paintOverride(APEX_RIVAL_TINT, { color: APEX_PALETTE.rival, power: 2.5, intensity: 1.2 })];
}
