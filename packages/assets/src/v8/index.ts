import { loadV6GLTFRenderPipeline } from "../v6/V6GLTFRenderPipeline";
import type { V6GLTFRenderPipeline, V6GLTFRenderPipelineOptions } from "../v6/V6GLTFRenderPipeline";

export type V8FlagshipAssetId =
  | "damaged-helmet"
  | "boom-box"
  | "lantern"
  | "chronograph-watch"
  | "car-concept"
  | "materials-variants-shoe"
  | "sunglasses-khronos"
  | "toy-car"
  | "antique-camera-interior"
  | "lantern-interior"
  | "robot-expressive"
  | "soldier"
  | "xbot"
  | "cesium-milk-truck"
  | "duck";

export interface V8FlagshipAsset {
  readonly id: V8FlagshipAssetId;
  readonly name: string;
  readonly localPath: string;
  readonly role: string;
  readonly license: string;
  readonly expectedFeatures: readonly string[];
}

export const V8_FLAGSHIP_ASSETS: readonly V8FlagshipAsset[] = [
  {
    id: "damaged-helmet",
    name: "Damaged Helmet",
    localPath: "fixtures/v6/assets/corpus/damaged-helmet.glb",
    role: "flagship-pbr",
    license: "CC-BY-4.0-and-CC-BY-NC-4.0",
    expectedFeatures: ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture", "emissiveTexture", "hdrIbl"]
  },
  {
    id: "boom-box",
    name: "Boom Box",
    localPath: "fixtures/v6/assets/corpus/boom-box.glb",
    role: "flagship-product",
    license: "CC0-1.0",
    expectedFeatures: ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture", "hdrIbl"]
  },
  {
    id: "lantern",
    name: "Lantern",
    localPath: "fixtures/v6/assets/corpus/lantern.glb",
    role: "flagship-emissive",
    license: "CC0-1.0",
    expectedFeatures: ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "emissiveTexture", "hdrIbl"]
  },
  {
    id: "chronograph-watch",
    name: "Chronograph Watch",
    localPath: "fixtures/v8/assets/product/chronograph-watch.glb",
    role: "flagship-configurator",
    license: "local-fixture-corpus",
    expectedFeatures: ["KHR_materials_variants", "KHR_materials_transmission", "textureTransform", "multiMaterialProduct", "hdrIbl"]
  },
  {
    id: "car-concept",
    name: "Concept Car",
    localPath: "fixtures/v8/assets/vehicles/car-concept.glb",
    role: "flagship-automotive",
    license: "local-fixture-corpus",
    expectedFeatures: ["clearcoat", "iridescence", "transmission", "materialVariants", "highTriangleCount", "hdrIbl"]
  },
  {
    id: "materials-variants-shoe",
    name: "Materials Variants Shoe",
    localPath: "fixtures/v8/assets/product/materials-variants-shoe.glb",
    role: "flagship-product-variants",
    license: "local-fixture-corpus",
    expectedFeatures: ["materialVariants", "baseColorTexture", "normalTexture", "productConfigurator"]
  },
  {
    id: "sunglasses-khronos",
    name: "Khronos Sunglasses",
    localPath: "fixtures/v8/assets/product/sunglasses-khronos.glb",
    role: "flagship-glass-product",
    license: "local-fixture-corpus",
    expectedFeatures: ["transmission", "volume", "ior", "iridescence", "glassProduct"]
  },
  {
    id: "toy-car",
    name: "Toy Car",
    localPath: "fixtures/v7/assets/flagship/toy-car.glb",
    role: "flagship-vehicle-product",
    license: "local-fixture-corpus",
    expectedFeatures: ["authoredVehicle", "pbrMaterials", "hdrIbl"]
  },
  {
    id: "antique-camera-interior",
    name: "Antique Camera Interior",
    localPath: "fixtures/v6/assets/corpus/antique-camera.glb",
    role: "flagship-interior-prop",
    license: "local-fixture-corpus",
    expectedFeatures: ["interiorScene", "pbrMaterials", "largeTextureSet", "hdrIbl"]
  },
  {
    id: "lantern-interior",
    name: "Lantern Interior",
    localPath: "fixtures/v8/assets/architecture/lantern-interior.glb",
    role: "flagship-emissive-interior",
    license: "local-fixture-corpus",
    expectedFeatures: ["emissiveTexture", "interiorScene", "pbrMaterials", "hdrIbl"]
  },
  {
    id: "robot-expressive",
    name: "Robot Expressive",
    localPath: "fixtures/v8/assets/character/robot-expressive.glb",
    role: "flagship-character-animation",
    license: "local-fixture-corpus",
    expectedFeatures: ["skinning", "morphTargets", "animationClips", "characterRig"]
  },
  {
    id: "soldier",
    name: "Soldier",
    localPath: "fixtures/v8/assets/character/soldier.glb",
    role: "flagship-character-animation",
    license: "local-fixture-corpus",
    expectedFeatures: ["skinning", "textureMaterials", "animationClips", "characterRig"]
  },
  {
    id: "xbot",
    name: "XBot",
    localPath: "fixtures/v8/assets/character/xbot.glb",
    role: "flagship-character-animation",
    license: "local-fixture-corpus",
    expectedFeatures: ["skinning", "animationClips", "characterRig"]
  },
  {
    id: "cesium-milk-truck",
    name: "Cesium Milk Truck",
    localPath: "fixtures/v8/assets/physics/cesium-milk-truck.glb",
    role: "flagship-physics-vehicle",
    license: "local-fixture-corpus",
    expectedFeatures: ["authoredVehicle", "physicsProp", "pbrMaterials"]
  },
  {
    id: "duck",
    name: "Duck",
    localPath: "fixtures/v8/assets/physics/duck.glb",
    role: "flagship-physics-prop",
    license: "local-fixture-corpus",
    expectedFeatures: ["authoredProp", "physicsColliderTarget", "pbrMaterials"]
  }
] as const;

export interface V8LoadFlagshipAssetOptions extends Omit<V6GLTFRenderPipelineOptions, "url" | "assetId" | "assetName"> {
  readonly id?: V8FlagshipAssetId;
  readonly origin?: string;
}

export function listV8FlagshipAssets(): readonly V8FlagshipAsset[] {
  return V8_FLAGSHIP_ASSETS;
}

export function resolveV8FlagshipAsset(id: V8FlagshipAssetId = "damaged-helmet"): V8FlagshipAsset {
  const asset = V8_FLAGSHIP_ASSETS.find((entry) => entry.id === id);
  if (!asset) throw new Error(`Unknown V8 flagship asset: ${id}`);
  return asset;
}

export function v8AssetUrl(asset: V8FlagshipAsset, origin = ""): string {
  const prefix = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${prefix}/${asset.localPath}`;
}

export async function loadV8FlagshipAsset(options: V8LoadFlagshipAssetOptions = {}): Promise<V6GLTFRenderPipeline> {
  const asset = resolveV8FlagshipAsset(options.id);
  return loadV6GLTFRenderPipeline({
    ...options,
    url: v8AssetUrl(asset, options.origin),
    assetId: asset.id,
    assetName: asset.name
  });
}
