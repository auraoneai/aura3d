/**
 * GU47 SS47-M2: island surfaces. ambientCG Ground112 (sand grain), Grass005 (turf) and Rock064 (wet rock), CC0 1.0,
 * taken from the repo's library archives (assets/library/textures/tiling/acg-*.zip) and downscaled into this app folder
 * (normal 512 px, roughness 256 px JPEG); provenance and hashes in ../assets/textures/PROVENANCE.md.
 *
 * Only detail maps ship: the authored palette colour stays the base colour (no photoreal moss or soil colour), so the
 * island keeps the painted-toy read while sun and contact shadows pick out grain, blades and wet-rock facets.
 * Draw delta: 0 (the same three island cylinders get maps).
 */
import { defineAuraAssets, material, type AuraAssetDefinition, type AuraAssetMap, type AuraColor, type AuraMaterialSpec } from "@aura3d/engine";

type TextureAsset = AuraAssetDefinition & { readonly type: "texture"; readonly format: "jpg"; readonly url: string };

const meta = (source: string) => ({ license: "CC0-1.0", author: "ambientCG", provenance: { sourceUrl: "https://ambientcg.com", source } });

const definitions = {
  siegeSandNormal: { type: "texture", format: "jpg", url: new URL("../assets/textures/siege-sand-normal.jpg", import.meta.url).pathname, sha256: "f17e185da1a44192e398eeae094fcad371f4ee98750b92e3b20dcb4c6d4b2a83", sizeBytes: 125325, metadata: meta("Ground112_1K-JPG_NormalGL.jpg") },
  siegeSandRoughness: { type: "texture", format: "jpg", url: new URL("../assets/textures/siege-sand-roughness.jpg", import.meta.url).pathname, sha256: "cd49d607e89248e81696cc5956c15534680e576ae00ab22ce9e2e8fae6578327", sizeBytes: 38723, metadata: meta("Ground112_1K-JPG_Roughness.jpg") },
  siegeTurfNormal: { type: "texture", format: "jpg", url: new URL("../assets/textures/siege-turf-normal.jpg", import.meta.url).pathname, sha256: "a6c68d782308f51fdbf3427721678174d3282f9cb26202deffc69c765378fb86", sizeBytes: 121087, metadata: meta("Grass005_1K-JPG_NormalGL.jpg") },
  siegeTurfRoughness: { type: "texture", format: "jpg", url: new URL("../assets/textures/siege-turf-roughness.jpg", import.meta.url).pathname, sha256: "b53230089f0ae806070dfee98a97aaee6c11f88c3acdc5ee1cf5a32250701f15", sizeBytes: 33379, metadata: meta("Grass005_1K-JPG_Roughness.jpg") },
  siegeWetRockNormal: { type: "texture", format: "jpg", url: new URL("../assets/textures/siege-wetrock-normal.jpg", import.meta.url).pathname, sha256: "92d74ed8112abce10f90fc1f938ba90cabf2a1c9aa5429e2bad914869bb94cde", sizeBytes: 96560, metadata: meta("Rock064_1K-JPG_NormalGL.jpg") },
  siegeWetRockRoughness: { type: "texture", format: "jpg", url: new URL("../assets/textures/siege-wetrock-roughness.jpg", import.meta.url).pathname, sha256: "e08c7e64b4a0c131d624ae3ec7740986255efd9540b313a1749f1916875eed6b", sizeBytes: 29156, metadata: meta("Rock064_1K-JPG_Roughness.jpg") }
} satisfies Record<string, TextureAsset>;

export const surfaces: AuraAssetMap<typeof definitions> = defineAuraAssets(definitions as never) as AuraAssetMap<typeof definitions>;

/** Repeats over the island cylinders (about one 1.8 m tile on the 18 x 14 m turf disc). */
export const SURFACE_REPEAT = {
  turf: [10, 8] as readonly [number, number],
  sand: [14, 11] as readonly [number, number],
  wetRock: [12, 3] as readonly [number, number]
} as const;

export type IslandSurface = keyof typeof SURFACE_REPEAT;

const MAPS: Record<IslandSurface, { normal: keyof typeof definitions; roughness: keyof typeof definitions; normalScale: number }> = {
  // Soft normal strengths: grain and blades read under the low sun without turning the toy island photoreal.
  turf: { normal: "siegeTurfNormal", roughness: "siegeTurfRoughness", normalScale: 0.55 },
  sand: { normal: "siegeSandNormal", roughness: "siegeSandRoughness", normalScale: 0.45 },
  wetRock: { normal: "siegeWetRockNormal", roughness: "siegeWetRockRoughness", normalScale: 0.8 }
};

/** A palette-coloured island surface with CC0 detail maps (SS47-M2). `textured: false` is today's flat material. */
export function islandSurface(surface: IslandSurface, color: AuraColor, roughness: number, textured = true): AuraMaterialSpec {
  if (!textured) return material.pbr({ color, roughness, metallic: 0 });
  const maps = MAPS[surface];
  const scale = SURFACE_REPEAT[surface];
  return material.pbr({
    color,
    roughness,
    metalness: 0,
    normal: surfaces[maps.normal],
    normalScale: maps.normalScale,
    roughnessMap: surfaces[maps.roughness],
    texTransforms: { normal: { scale }, metallicRoughness: { scale } }
  });
}
