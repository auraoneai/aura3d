/**
 * GU47 AO-M1 / AO-A2 / WP-06: automotive multi-lobe clearcoat flake paint, brushed alloy trim, and studio canopy glass.
 * Hero uses cobalt metallic clearcoat (`material.carPaint`) with warm golden-hour tangerine rim; sky-lane rivals use
 * graphite with reserved rival-red rim; highway traffic uses varied metallic `material.clearcoatPaint` finishes so every
 * vehicle class catches sunset IBL speculars and wet-deck reflections instead of reading as matte plastic.
 */
import { material, type AuraMaterialSpec, type AuraModelMaterialOverride } from "@aura3d/engine";
import { APEX_PALETTE } from "./look";

/** Multiply tint over the grey base map: lands on the identity cobalt with the map's mid-grey shading. */
export const APEX_HERO_TINT = "#3a64e8";
export const APEX_RIVAL_TINT = "#4a4d56";

function paintOverride(tint: string | null, rim: { color: string; power: number; intensity: number }): AuraModelMaterialOverride {
  const paint = material.carPaint({
    color: tint ?? APEX_PALETTE.cobalt,
    clearcoatRoughness: 0.13,
    envMapIntensity: 0.62
  });
  return {
    ...(tint !== null ? { color: tint, colorMode: "multiply" as const } : {}),
    ...(paint.roughness !== undefined ? { roughness: paint.roughness } : {}),
    ...(paint.metallic !== undefined ? { metallic: paint.metallic } : {}),
    ...(paint.clearcoat !== undefined ? { clearcoat: paint.clearcoat } : {}),
    ...(paint.clearcoatRoughness !== undefined ? { clearcoatRoughness: paint.clearcoatRoughness } : {}),
    ...(paint.envMapIntensity !== undefined ? { envMapIntensity: paint.envMapIntensity } : {}),
    rim
  };
}

/**
 * Hero: cobalt metallic clearcoat, warm tangerine rim (AO-M1). Retextured hero keeps its baked cobalt + tangerine stripe
 * while inheriting multi-lobe clearcoat flake speculars and warm silhouette rim.
 */
export function apexHeroPaint(retextured = true): readonly AuraModelMaterialOverride[] {
  return [paintOverride(retextured ? null : APEX_HERO_TINT, { color: APEX_PALETTE.tangerine, power: 3.5, intensity: 0.6 })];
}

/** Sky-lane rival: graphite clearcoat with the reserved rival red on the rim (AO-A2). */
export function apexRivalPaint(): readonly AuraModelMaterialOverride[] {
  return [paintOverride(APEX_RIVAL_TINT, { color: APEX_PALETTE.rival, power: 2.5, intensity: 1.2 })];
}

/** Automotive clearcoat lacquer overrides per highway traffic class (preserves baked GLB albedo maps, zero texture override). */
const TRAFFIC_FINISH: Readonly<Record<string, { metallic: number; roughness: number; clearcoat: number; clearcoatRoughness: number; rimIntensity: number }>> = {
  sedan: { metallic: 0.58, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.06, rimIntensity: 0.34 },
  hatch: { metallic: 0.52, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.07, rimIntensity: 0.32 },
  suv: { metallic: 0.62, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, rimIntensity: 0.36 },
  taxi: { metallic: 0.35, roughness: 0.24, clearcoat: 0.95, clearcoatRoughness: 0.08, rimIntensity: 0.3 },
  van: { metallic: 0.28, roughness: 0.34, clearcoat: 0.82, clearcoatRoughness: 0.12, rimIntensity: 0.24 },
  pickup: { metallic: 0.54, roughness: 0.3, clearcoat: 0.92, clearcoatRoughness: 0.09, rimIntensity: 0.3 },
  boxtruck: { metallic: 0.22, roughness: 0.42, clearcoat: 0.65, clearcoatRoughness: 0.16, rimIntensity: 0.2 },
  bus: { metallic: 0.34, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.12, rimIntensity: 0.24 },
  carrier: { metallic: 0.68, roughness: 0.32, clearcoat: 0.78, clearcoatRoughness: 0.14, rimIntensity: 0.32 }
};

export function apexTrafficPaint(vehicleType: string): readonly AuraModelMaterialOverride[] {
  const base = material.clearcoatPaint({ color: "#d8dee9" });
  const cfg = TRAFFIC_FINISH[vehicleType] ?? TRAFFIC_FINISH.sedan!;
  return [
    {
      roughness: cfg.roughness,
      metallic: cfg.metallic,
      clearcoat: cfg.clearcoat,
      clearcoatRoughness: cfg.clearcoatRoughness,
      ...(base.envMapIntensity !== undefined ? { envMapIntensity: base.envMapIntensity } : {}),
      rim: { color: "#ffb272", power: 3.8, intensity: cfg.rimIntensity }
    }
  ];
}

/** Anisotropic brushed alloy for aero splitters, thruster collars and carrier ramp diamond-plate treads. */
export function apexBrushedAlloyMaterial(color = "#cfd8e3"): AuraMaterialSpec {
  return material.brushedMetal({ color, roughness: 0.24, anisotropy: 0.88 });
}

/** Dark smoked cockpit canopy visor (`material.studioGlass`) with softened specular IBL to suppress horizon chatter. */
export function apexCanopyGlassMaterial(): AuraMaterialSpec {
  return material.studioGlass({ color: "#0b1424", roughness: 0.12, opacity: 0.86, envMapIntensity: 0.54 });
}

/** Sculpted carrier launch ramp deck: brushed anodized tangerine steel with subtle warm guide glow. */
export function apexRampDeckMaterial(): AuraMaterialSpec {
  return material.brushedMetal({
    color: "#e0782f",
    roughness: 0.28,
    anisotropy: 0.82,
    emissive: APEX_PALETTE.tangerine,
    emissiveIntensity: 0.14
  });
}
