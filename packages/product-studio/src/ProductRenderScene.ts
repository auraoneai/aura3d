import { createGLTFRenderSource } from "@galileo3d/assets";
import { createProductCameraFrame } from "./ProductCamera";
import { createProductFloor } from "./ProductFloor";
import { createProductLightingPreset } from "./ProductLighting";
import { applyProductMaterialMode, createProductMaterialMode } from "./ProductMaterials";
import type { ProductAsset, ProductRenderScene, ProductRenderSceneOptions } from "./ProductTypes";

export function createProductRenderScene(asset: ProductAsset, options: ProductRenderSceneOptions = {}): ProductRenderScene {
  const lighting = options.lighting ?? createProductLightingPreset();
  const camera = options.camera ?? createProductCameraFrame(asset);
  const materialMode = options.materialMode ?? createProductMaterialMode("asset");
  const renderItems = options.floor === false ? [] : [createProductFloor(asset)];
  const baseSource = createGLTFRenderSource({
    scene: asset.resources.scene,
    geometryLibrary: asset.resources.geometryLibrary,
    materialLibrary: applyProductMaterialMode(asset, materialMode),
    morphTargetLibrary: asset.resources.morphTargetLibrary,
    bounds: asset.resources.bounds
  }, {
    qualityPreset: "hdr-studio-preview",
    environmentLighting: lighting.environmentLighting,
    postprocess: lighting.postprocess,
    shadow: lighting.shadow,
    renderItems,
    cameraPolicy: "require",
    cameraPosition: camera.frame.cameraPosition,
    frustumCulling: true
  });
  const source = { ...baseSource, collectedLights: lighting.lights };

  return {
    asset,
    source,
    camera: camera.camera,
    cameraFrame: camera,
    lighting,
    materialMode,
    renderItems
  };
}

export function updateProductRenderScene(scene: ProductRenderScene, options: ProductRenderSceneOptions = {}): ProductRenderScene {
  return createProductRenderScene(scene.asset, {
    lighting: options.lighting ?? scene.lighting,
    camera: options.camera ?? scene.cameraFrame,
    materialMode: options.materialMode ?? scene.materialMode,
    floor: options.floor
  });
}
