/**
 * IRON CROWN floor detail maps (GU47 WP-15 IC47-M1): CC0 normal and roughness maps from the repo's ambientCG archives
 * on the four hero floors (Crown obsidian tiles, Neo-Tokyo wet concrete, Colosseum grit, Monastery slate). The look
 * row's floor colour stays the base colour; the maps add grain the follow-spot and low suns pick out. Provenance and
 * hashes: ../assets/textures/PROVENANCE.md. Draw delta 0 (the same plank courses get maps).
 */
import { defineAuraAssets, type AuraAssetDefinition, type AuraAssetMap, type AuraMaterialSpec } from "@aura3d/engine";
import type { StageId } from "./stages";

type TextureAsset = AuraAssetDefinition & { readonly type: "texture"; readonly format: "webp"; readonly url: string };

const meta = (archive: string, member: string) => ({
  license: "CC0-1.0",
  author: "ambientCG",
  provenance: { sourceUrl: "https://ambientcg.com", archive: `assets/library/textures/tiling/${archive}`, member }
});

const tex = (file: string, sha256: string, sizeBytes: number, archive: string, member: string): TextureAsset => ({
  type: "texture",
  format: "webp",
  url: new URL(`../assets/textures/${file}`, import.meta.url).pathname,
  sha256,
  sizeBytes,
  metadata: meta(archive, member)
});

const definitions = {
  icObsidianNormal: tex("ic-obsidian-normal.webp", "04e486f2d162e3516b50917f5e16f3ed07994129ed9accf7672e14092adf0949", 4316, "acg-tiles141.zip", "Tiles141_1K-JPG_NormalGL.jpg"),
  icObsidianRoughness: tex("ic-obsidian-roughness.webp", "14b8a61b7c1eb26742fa8c42e83f305e92d1e9625344ad4b9c97b76405b3808d", 6008, "acg-tiles141.zip", "Tiles141_1K-JPG_Roughness.jpg"),
  icWetConcreteNormal: tex("ic-wetconcrete-normal.webp", "2ec7e237313752ffc8108fb6fcc5c411b4e8d013e90d2083eb7a17fc31f877da", 67338, "acg-concrete034.zip", "Concrete034_1K-JPG_NormalGL.jpg"),
  icWetConcreteRoughness: tex("ic-wetconcrete-roughness.webp", "f05c9905ddaa235948577e3b0d1938babdb9ddb92e91cdbaf0447cffe927dcb1", 5722, "acg-concrete034.zip", "Concrete034_1K-JPG_Roughness.jpg"),
  icGritNormal: tex("ic-grit-normal.webp", "42f9ae85dc2e9f09aeedbf6f76c88a6ef212192d175ff6d0733c8d01319c55fd", 118970, "acg-gravel043.zip", "Gravel043_1K-JPG_NormalGL.jpg"),
  icGritRoughness: tex("ic-grit-roughness.webp", "3c4eb18170cc9cd523d10f5a0191249b0a0033ac27518add4e2225208c279b9b", 18182, "acg-gravel043.zip", "Gravel043_1K-JPG_Roughness.jpg"),
  icSlateNormal: tex("ic-slate-normal.webp", "f8737eeab1d9bbb530262c6292f38083e5378ad2cf36ee53baa847bb95ff5d79", 80106, "acg-pavingstones151.zip", "PavingStones151_1K-JPG_NormalGL.jpg"),
  icSlateRoughness: tex("ic-slate-roughness.webp", "337ef489c21029eff36dae5dd9f14d46d14c789196455ce4a6f8aebfa6cb62b3", 22966, "acg-pavingstones151.zip", "PavingStones151_1K-JPG_Roughness.jpg")
} satisfies Record<string, TextureAsset>;

export const floorTextures: AuraAssetMap<typeof definitions> = defineAuraAssets(definitions as never) as AuraAssetMap<typeof definitions>;
type FloorTextureKey = keyof typeof definitions;

export interface FloorDetail {
  readonly normal: FloorTextureKey;
  readonly roughness: FloorTextureKey;
  readonly normalScale: number;
  /** Metres per tile on the 38 x 2.06 m plank courses. */
  readonly tile: number;
}

/** The four hero floors with a CC0 set (PRD: "4 CC0 sets"); the Dock teak and Airstrip tarmac stay flat. */
export const FLOOR_DETAIL: Partial<Record<StageId, FloorDetail>> = {
  "crown-arena": { normal: "icObsidianNormal", roughness: "icObsidianRoughness", normalScale: 0.35, tile: 2.06 },
  "neo-tokyo-rooftop": { normal: "icWetConcreteNormal", roughness: "icWetConcreteRoughness", normalScale: 0.5, tile: 2.06 },
  "colosseum-ruins": { normal: "icGritNormal", roughness: "icGritRoughness", normalScale: 0.7, tile: 1.03 },
  "himalayan-monastery": { normal: "icSlateNormal", roughness: "icSlateRoughness", normalScale: 0.6, tile: 2.06 }
};

/** The plank course's top face spans 38 m by 2.06 m in UV 0..1. */
export const PLANK_SIZE = [38, 2.06] as const;

/** Detail-map fields to spread into a plank course's `material.pbr` options, or `{}` for a flat venue. */
export function floorDetailFields(stage: StageId, enabled = true): Partial<AuraMaterialSpec> & Record<string, unknown> {
  const detail = FLOOR_DETAIL[stage];
  if (!enabled || !detail) return {};
  const scale: [number, number] = [Number((PLANK_SIZE[0] / detail.tile).toFixed(3)), Number((PLANK_SIZE[1] / detail.tile).toFixed(3))];
  return {
    normal: floorTextures[detail.normal],
    normalScale: detail.normalScale,
    roughnessMap: floorTextures[detail.roughness],
    texTransforms: { normal: { scale }, metallicRoughness: { scale } }
  };
}
