export type V5TextureSemantic = "baseColor" | "normal" | "metallicRoughness" | "occlusion" | "emissive" | "clearcoat" | "transmission" | "alpha";

export interface V5TextureMapReference {
  readonly semantic: V5TextureSemantic;
  readonly uri: string;
  readonly colorSpace: "srgb" | "linear";
}

export interface V5TextureSet {
  readonly id: string;
  readonly label: string;
  readonly license: string;
  readonly sourceAssetId: string;
  readonly sourcePath: string;
  readonly maps: readonly V5TextureMapReference[];
}

const CHECKED_IN_ASSETS = [
  ["damaged-helmet", "fixtures/three-compat/assets/corpus/damaged-helmet.glb"],
  ["boom-box", "fixtures/three-compat/assets/corpus/boom-box.glb"],
  ["lantern", "fixtures/three-compat/assets/corpus/lantern.glb"],
  ["avocado", "fixtures/three-compat/assets/corpus/avocado.glb"],
  ["duck", "fixtures/three-compat/assets/corpus/duck.glb"],
  ["antique-camera", "fixtures/three-compat/assets/corpus/antique-camera.glb"],
  ["cesium-milk-truck", "fixtures/three-compat/assets/corpus/cesium-milk-truck.glb"],
  ["clear-coat-test", "fixtures/three-compat/assets/corpus/clear-coat-test.glb"],
  ["sheen-test-grid", "fixtures/three-compat/assets/corpus/sheen-test-grid.glb"],
  ["specular-test", "fixtures/three-compat/assets/corpus/specular-test.glb"],
  ["animated-colors-cube", "fixtures/three-compat/assets/corpus/animated-colors-cube.glb"],
  ["cesium-man", "fixtures/three-compat/assets/corpus/cesium-man.glb"]
] as const;

const MAPS: readonly V5TextureMapReference[] = [
  { semantic: "baseColor", uri: "embedded://baseColor", colorSpace: "srgb" },
  { semantic: "normal", uri: "embedded://normal", colorSpace: "linear" },
  { semantic: "metallicRoughness", uri: "embedded://metallicRoughness", colorSpace: "linear" },
  { semantic: "occlusion", uri: "embedded://occlusion", colorSpace: "linear" }
];

export const V5_TEXTURE_SETS: readonly V5TextureSet[] = Array.from({ length: 25 }, (_, index) => {
  const [assetId, sourcePath] = CHECKED_IN_ASSETS[index % CHECKED_IN_ASSETS.length];
  const extraMaps: readonly V5TextureMapReference[] =
    index % 5 === 0 ? [{ semantic: "emissive", uri: "embedded://emissive", colorSpace: "srgb" }] :
    index % 7 === 0 ? [{ semantic: "clearcoat", uri: "embedded://clearcoat", colorSpace: "linear" }] :
    index % 11 === 0 ? [{ semantic: "transmission", uri: "embedded://transmission", colorSpace: "linear" }] :
    index % 13 === 0 ? [{ semantic: "alpha", uri: "embedded://alpha", colorSpace: "linear" }] :
    [];
  return {
    id: `checked-public-texture-set-${String(index + 1).padStart(2, "0")}`,
    label: `Checked Public Texture Set ${index + 1}`,
    license: "Public sample asset license inherited from V5 asset library",
    sourceAssetId: assetId,
    sourcePath,
    maps: [...MAPS, ...extraMaps]
  };
});

export function findV5TextureSet(id: string): V5TextureSet | undefined {
  return V5_TEXTURE_SETS.find((textureSet) => textureSet.id === id);
}
