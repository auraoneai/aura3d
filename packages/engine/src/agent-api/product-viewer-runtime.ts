import { product as rootProduct, sceneKits as rootSceneKits } from "./index.js";
import type {
  AuraApp,
  AuraAppTarget,
  AuraAssetDefinition,
  AuraAssetMap,
  AuraAssetRef,
  AuraCreateAppOptions,
  AuraProductStageStyle,
  AuraSceneBuilder,
  AuraSceneKit
} from "./index.js";

export {
  createAuraApp,
  defineAuraAssets
} from "./index.js";

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

export const product = rootProduct;

export const sceneKits = {
  productViewer(asset: AuraAssetRef<"model">, options: ProductViewerOptions = {}): ProductViewerSceneKit {
    return productViewer(asset, options);
  }
} as const;

export function productViewer(asset: AuraAssetRef<"model">, options: ProductViewerOptions = {}): ProductViewerSceneKit {
  return rootSceneKits.productViewer(asset, options);
}
