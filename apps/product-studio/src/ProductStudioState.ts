import type {
  ProductAsset,
  ProductAssetId,
  ProductCameraPreset,
  ProductDiagnostics,
  ProductExportResult,
  ProductLightingPreset,
  ProductMaterialModeId,
  ProductRenderScene
} from "@galileo3d/product-studio";

export interface ProductOption {
  readonly id: ProductAssetId;
  readonly label: string;
  readonly url: string;
  readonly manifestUrl: string;
}

export interface ProductStudioAppState {
  status: "booting" | "loading" | "ready" | "error";
  readonly products: readonly ProductOption[];
  selectedProductId: ProductAssetId;
  lightingPreset: ProductLightingPreset;
  cameraPreset: ProductCameraPreset;
  materialMode: ProductMaterialModeId;
  floorEnabled: boolean;
  asset?: ProductAsset;
  scene?: ProductRenderScene;
  diagnostics?: ProductDiagnostics;
  latestExport?: ProductExportResult;
  error?: string;
}

export const PRODUCT_OPTIONS: readonly ProductOption[] = [
  {
    id: "camera-kit",
    label: "Camera Kit",
    url: "/fixtures/v2/products/camera-kit/camera-kit.gltf",
    manifestUrl: "/fixtures/v2/products/camera-kit/manifest.json"
  },
  {
    id: "speaker",
    label: "Speaker",
    url: "/fixtures/v2/products/speaker/speaker.gltf",
    manifestUrl: "/fixtures/v2/products/speaker/manifest.json"
  },
  {
    id: "watch",
    label: "Watch",
    url: "/fixtures/v2/products/watch/watch.gltf",
    manifestUrl: "/fixtures/v2/products/watch/manifest.json"
  }
];

export function createProductStudioState(): ProductStudioAppState {
  return {
    status: "booting",
    products: PRODUCT_OPTIONS,
    selectedProductId: "camera-kit",
    lightingPreset: "catalog-softbox",
    cameraPreset: "front-three-quarter",
    materialMode: "asset",
    floorEnabled: true
  };
}

export function selectedProduct(state: ProductStudioAppState): ProductOption {
  return state.products.find((product) => product.id === state.selectedProductId) ?? state.products[0]!;
}

declare global {
  interface Window {
    __G3D_PRODUCT_STUDIO__?: ProductStudioAppState & {
      reloadProduct?: (id: ProductAssetId) => Promise<void>;
      setLighting?: (preset: ProductLightingPreset) => Promise<void>;
      setCamera?: (preset: ProductCameraPreset) => Promise<void>;
      setMaterialMode?: (mode: ProductMaterialModeId) => Promise<void>;
      exportPng?: () => Promise<ProductExportResult | undefined>;
    };
  }
}
