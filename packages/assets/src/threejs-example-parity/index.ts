import { loadProductionGLTFRenderPipeline } from "../asset-corpus/ProductionGLTFRenderPipeline";
import type { ProductionGLTFRenderPipeline, ProductionGLTFRenderPipelineOptions } from "../asset-corpus/ProductionGLTFRenderPipeline";

export type CurrentRoutesFlagshipAssetId =
  | "damaged-helmet"
  | "boom-box"
  | "avocado"
  | "clear-coat-test"
  | "sheen-test-grid"
  | "product-camera"
  | "material-spheres"
  | "variant-product"
  | "transmission-material-sample"
  | "animated-colors-cube"
  | "cesium-man"
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

export interface CurrentRoutesFlagshipAsset {
  readonly id: CurrentRoutesFlagshipAssetId;
  readonly name: string;
  readonly localPath: string;
  readonly role: string;
  readonly license: string;
  readonly expectedFeatures: readonly string[];
}

export const CURRENT_ROUTES_FLAGSHIP_ASSETS: readonly CurrentRoutesFlagshipAsset[] = [
  {
    id: "damaged-helmet",
    name: "Damaged Helmet",
    localPath: "fixtures/asset-corpus/damaged-helmet.glb",
    role: "flagship-pbr",
    license: "CC-BY-4.0-and-CC-BY-NC-4.0",
    expectedFeatures: ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture", "emissiveTexture", "hdrIbl"]
  },
  {
    id: "boom-box",
    name: "Boom Box",
    localPath: "fixtures/asset-corpus/boom-box.glb",
    role: "flagship-product",
    license: "CC0-1.0",
    expectedFeatures: ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture", "hdrIbl"]
  },
  {
    id: "avocado",
    name: "Avocado",
    localPath: "fixtures/asset-corpus/avocado.glb",
    role: "flagship-organic-pbr",
    license: "CC-BY-4.0",
    expectedFeatures: ["baseColorTexture", "normalTexture", "roughnessVariation", "organicProduct", "hdrIbl"]
  },
  {
    id: "clear-coat-test",
    name: "Clear Coat Test",
    localPath: "fixtures/asset-corpus/clear-coat-test.glb",
    role: "flagship-clearcoat-materials",
    license: "CC-BY-4.0",
    expectedFeatures: ["KHR_materials_clearcoat", "baseColorTexture", "normalTexture", "materialGrid", "hdrIbl"]
  },
  {
    id: "sheen-test-grid",
    name: "Sheen Test Grid",
    localPath: "fixtures/asset-corpus/sheen-test-grid.glb",
    role: "flagship-sheen-materials",
    license: "CC-BY-4.0",
    expectedFeatures: ["KHR_materials_sheen", "baseColorTexture", "materialGrid", "fabricResponse", "hdrIbl"]
  },
  {
    id: "product-camera",
    name: "Product Camera",
    localPath: "fixtures/workflow-assets/assets/product-camera/product-camera.glb",
    role: "standard-product-asset",
    license: "local-fixture-corpus",
    expectedFeatures: ["productAsset", "pbrMaterials", "textureMaterials", "hdrIbl"]
  },
  {
    id: "material-spheres",
    name: "Material Spheres",
    localPath: "fixtures/workflow-assets/assets/material-spheres/material-spheres.glb",
    role: "standard-material-comparison",
    license: "local-fixture-corpus",
    expectedFeatures: ["materialGrid", "roughnessVariation", "metallicVariation", "hdrIbl"]
  },
  {
    id: "variant-product",
    name: "Variant Product",
    localPath: "fixtures/workflow-assets/assets/variant-product/variant-product.glb",
    role: "additional-product-variant",
    license: "local-fixture-corpus",
    expectedFeatures: ["productVariant", "multiMaterialProduct", "pbrMaterials", "hdrIbl"]
  },
  {
    id: "transmission-material-sample",
    name: "Transmission Material Sample",
    localPath: "fixtures/threejs-parity/assets/materials/compare-transmission.glb",
    role: "additional-transmission-material",
    license: "local-fixture-corpus",
    expectedFeatures: ["transmission", "glassMaterial", "materialComparison", "hdrIbl"]
  },
  {
    id: "animated-colors-cube",
    name: "Animated Colors Cube",
    localPath: "fixtures/three-compat/assets/corpus/animated-colors-cube.glb",
    role: "standard-animation-asset",
    license: "local-fixture-corpus",
    expectedFeatures: ["animationClip", "vertexColors", "starterAsset", "hdrIbl"]
  },
  {
    id: "cesium-man",
    name: "Cesium Man",
    localPath: "fixtures/three-compat/assets/corpus/cesium-man.glb",
    role: "additional-character-animation",
    license: "local-fixture-corpus",
    expectedFeatures: ["skinning", "animationClip", "characterAsset", "hdrIbl"]
  },
  {
    id: "lantern",
    name: "Lantern",
    localPath: "fixtures/asset-corpus/lantern.glb",
    role: "flagship-emissive",
    license: "CC0-1.0",
    expectedFeatures: ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "emissiveTexture", "hdrIbl"]
  },
  {
    id: "chronograph-watch",
    name: "Chronograph Watch",
    localPath: "fixtures/threejs-parity/assets/product/chronograph-watch.glb",
    role: "flagship-configurator",
    license: "local-fixture-corpus",
    expectedFeatures: ["KHR_materials_variants", "KHR_materials_transmission", "textureTransform", "multiMaterialProduct", "hdrIbl"]
  },
  {
    id: "car-concept",
    name: "Concept Car",
    localPath: "fixtures/threejs-parity/assets/vehicles/car-concept.glb",
    role: "flagship-automotive",
    license: "local-fixture-corpus",
    expectedFeatures: ["clearcoat", "iridescence", "transmission", "materialVariants", "highTriangleCount", "hdrIbl"]
  },
  {
    id: "materials-variants-shoe",
    name: "Materials Variants Shoe",
    localPath: "fixtures/threejs-parity/assets/product/materials-variants-shoe.glb",
    role: "flagship-product-variants",
    license: "local-fixture-corpus",
    expectedFeatures: ["materialVariants", "baseColorTexture", "normalTexture", "productConfigurator"]
  },
  {
    id: "sunglasses-khronos",
    name: "Khronos Sunglasses",
    localPath: "fixtures/threejs-parity/assets/product/sunglasses-khronos.glb",
    role: "flagship-glass-product",
    license: "local-fixture-corpus",
    expectedFeatures: ["transmission", "volume", "ior", "iridescence", "glassProduct"]
  },
  {
    id: "toy-car",
    name: "Toy Car",
    localPath: "fixtures/threejs-parity/assets/vehicles/toy-car.glb",
    role: "flagship-vehicle-product",
    license: "local-fixture-corpus",
    expectedFeatures: ["authoredVehicle", "pbrMaterials", "hdrIbl"]
  },
  {
    id: "antique-camera-interior",
    name: "Antique Camera Interior",
    localPath: "fixtures/asset-corpus/antique-camera.glb",
    role: "flagship-interior-prop",
    license: "local-fixture-corpus",
    expectedFeatures: ["interiorScene", "pbrMaterials", "largeTextureSet", "hdrIbl"]
  },
  {
    id: "lantern-interior",
    name: "Lantern Interior",
    localPath: "fixtures/threejs-parity/assets/architecture/lantern-interior.glb",
    role: "flagship-emissive-interior",
    license: "local-fixture-corpus",
    expectedFeatures: ["emissiveTexture", "interiorScene", "pbrMaterials", "hdrIbl"]
  },
  {
    id: "robot-expressive",
    name: "Robot Expressive",
    localPath: "fixtures/threejs-parity/assets/character/robot-expressive.glb",
    role: "flagship-character-animation",
    license: "local-fixture-corpus",
    expectedFeatures: ["skinning", "morphTargets", "animationClips", "characterRig"]
  },
  {
    id: "soldier",
    name: "Soldier",
    localPath: "fixtures/threejs-parity/assets/character/soldier.glb",
    role: "flagship-character-animation",
    license: "local-fixture-corpus",
    expectedFeatures: ["skinning", "textureMaterials", "animationClips", "characterRig"]
  },
  {
    id: "xbot",
    name: "XBot",
    localPath: "fixtures/threejs-parity/assets/character/xbot.glb",
    role: "flagship-character-animation",
    license: "local-fixture-corpus",
    expectedFeatures: ["skinning", "animationClips", "characterRig"]
  },
  {
    id: "cesium-milk-truck",
    name: "Cesium Milk Truck",
    localPath: "fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb",
    role: "flagship-physics-vehicle",
    license: "local-fixture-corpus",
    expectedFeatures: ["authoredVehicle", "physicsProp", "pbrMaterials"]
  },
  {
    id: "duck",
    name: "Duck",
    localPath: "fixtures/threejs-parity/assets/physics/duck.glb",
    role: "flagship-physics-prop",
    license: "local-fixture-corpus",
    expectedFeatures: ["authoredProp", "physicsColliderTarget", "pbrMaterials"]
  }
] as const;

export interface CurrentRoutesLoadFlagshipAssetOptions extends Omit<ProductionGLTFRenderPipelineOptions, "url" | "assetId" | "assetName"> {
  readonly id?: CurrentRoutesFlagshipAssetId;
  readonly origin?: string;
}

export function listCurrentRoutesFlagshipAssets(): readonly CurrentRoutesFlagshipAsset[] {
  return CURRENT_ROUTES_FLAGSHIP_ASSETS;
}

export function resolveCurrentRoutesFlagshipAsset(id: CurrentRoutesFlagshipAssetId = "damaged-helmet"): CurrentRoutesFlagshipAsset {
  const asset = CURRENT_ROUTES_FLAGSHIP_ASSETS.find((entry) => entry.id === id);
  if (!asset) throw new Error(`Unknown CurrentRoutes flagship asset: ${id}`);
  return asset;
}

export function currentRoutesAssetUrl(asset: CurrentRoutesFlagshipAsset, origin = ""): string {
  const prefix = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${prefix}/${asset.localPath}`;
}

export async function loadCurrentRoutesFlagshipAsset(options: CurrentRoutesLoadFlagshipAssetOptions = {}): Promise<ProductionGLTFRenderPipeline> {
  const asset = resolveCurrentRoutesFlagshipAsset(options.id);
  return loadProductionGLTFRenderPipeline({
    ...options,
    url: currentRoutesAssetUrl(asset, options.origin),
    assetId: asset.id,
    assetName: asset.name
  });
}
