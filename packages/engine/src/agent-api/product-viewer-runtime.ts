import { sceneKits as rootSceneKits } from "./nodes/sceneKits.js";
import { product as rootProduct } from "./nodes/product.js";
import type { AuraSceneBuilder } from "./nodes/scene.js";
import type { AuraApp, AuraAppTarget, AuraAssetDefinition, AuraAssetMap, AuraAssetRef, AuraCreateAppOptions, AuraProductStageStyle, AuraSceneKit } from "./nodes/types.js";
import { lazyNamespace } from "./lazyNamespace.js";


export {
  createAuraApp
} from "./app/createAuraApp.js";
export {
  defineAuraAssets
} from "./nodes/assets.js";

export type {
  AuraApp,
  AuraAppTarget,
  AuraAssetDefinition,
  AuraAssetMap,
  AuraAssetRef,
  AuraCreateAppOptions
};

export interface ProductViewerOptions {
  readonly captureFrame?: number;
  readonly stageStyle?: AuraProductStageStyle;
}

export type ProductViewerScene = AuraSceneBuilder;
export type ProductViewerSceneKit = AuraSceneKit;
export type ProductViewerDiagnostics = ReturnType<AuraApp["diagnostics"]>;

export const product = lazyNamespace(() => rootProduct);

export const sceneKits = {
  productViewer(asset: AuraAssetRef<"model">, options: ProductViewerOptions = {}): ProductViewerSceneKit {
    return productViewer(asset, options);
  }
} as const;

export function productViewer(asset: AuraAssetRef<"model">, options: ProductViewerOptions = {}): ProductViewerSceneKit {
  return rootSceneKits.productViewer(asset, options);
}
