/**
 * GU47 AO-M2: CC0 deck surfaces. ambientCG Asphalt033 and Concrete034 (CC0 1.0), taken from the repo's library archives
 * (assets/library/textures/tiling/acg-asphalt033.zip, acg-concrete034.zip), downscaled to 512 px JPEG (quality 82) into this
 * app folder; provenance and hashes in ../assets/textures/PROVENANCE.md. No texture exceeds 512 px (budget: 2048).
 */
import { defineAuraAssets, material, type AuraAssetDefinition, type AuraAssetMap } from "@aura3d/engine";

type TextureAsset = AuraAssetDefinition & { readonly type: "texture"; readonly format: "jpg"; readonly url: string };

const meta = (source: string) => ({ license: "CC0-1.0", author: "ambientCG", provenance: { sourceUrl: "https://ambientcg.com", source } });

const definitions = {
  apexAsphaltColor: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-asphalt-color.jpg", import.meta.url).pathname, sha256: "0787c5cc9abc58c26f42c0afa90203a925c1466bcfad5cf7eed384557efaa7d0", sizeBytes: 59218, metadata: meta("Asphalt033_1K-JPG_Color.jpg") },
  apexAsphaltNormal: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-asphalt-normal.jpg", import.meta.url).pathname, sha256: "e5a3f5a7b83066d417b55bb7bdc3d3b9a0662d7848a4efc47523c217ac48c491", sizeBytes: 115838, metadata: meta("Asphalt033_1K-JPG_NormalGL.jpg") },
  apexAsphaltRoughness: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-asphalt-roughness.jpg", import.meta.url).pathname, sha256: "9b780fcba11cb43d325c4841566ca2cbdd8f4767fe17da0eddec31a23e4205f1", sizeBytes: 96620, metadata: meta("Asphalt033_1K-JPG_Roughness.jpg") },
  apexConcreteColor: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-concrete-color.jpg", import.meta.url).pathname, sha256: "a39ab497a85fce1b3db72d12d00673a527ee72d4c7da041263c9b5956ce37a9a", sizeBytes: 27062, metadata: meta("Concrete034_1K-JPG_Color.jpg") },
  apexConcreteNormal: { type: "texture", format: "jpg", url: new URL("../assets/textures/apex-concrete-normal.jpg", import.meta.url).pathname, sha256: "383c4b61979db2cfecd92944d05f6cd68f95dd676c06e970d7b18d74026e4d4a", sizeBytes: 39313, metadata: meta("Concrete034_1K-JPG_NormalGL.jpg") }
} satisfies Record<string, TextureAsset>;

export const surfaces: AuraAssetMap<typeof definitions> = defineAuraAssets(definitions as never) as AuraAssetMap<typeof definitions>;

/** Deck tiling (AO-M2): 6 x 95 repeats over the 24 x 380 m deck, i.e. one 4 m tile. */
export const ASPHALT_REPEAT: readonly [number, number] = [6, 95];
export const ASPHALT_ROUGHNESS = 0.55;
/** Barrier tiling along the 380 m run. */
export const CONCRETE_REPEAT: readonly [number, number] = [95, 1];

/** The deck: sun-glare asphalt (roughness 0.55 so the low sun dead ahead lays a glare streak down the centre lanes). */
export function asphaltMaterial(): ReturnType<typeof material.pbr> {
  const scale = ASPHALT_REPEAT;
  return material.pbr({
    color: "#6b6e78",
    roughness: ASPHALT_ROUGHNESS,
    metalness: 0.02,
    texture: surfaces.apexAsphaltColor,
    normal: surfaces.apexAsphaltNormal,
    normalScale: 0.7,
    roughnessMap: surfaces.apexAsphaltRoughness,
    texTransforms: { baseColor: { scale }, normal: { scale }, metallicRoughness: { scale } }
  });
}

/** Jersey barriers: cast concrete. */
export function concreteMaterial(): ReturnType<typeof material.pbr> {
  const scale = CONCRETE_REPEAT;
  return material.pbr({
    color: "#8c8f98",
    roughness: 0.82,
    metalness: 0,
    texture: surfaces.apexConcreteColor,
    normal: surfaces.apexConcreteNormal,
    normalScale: 0.8,
    texTransforms: { baseColor: { scale }, normal: { scale } }
  });
}
