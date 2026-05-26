import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createThreeCompatAssetProvenance, type ThreeCompatAssetProvenance, type ThreeCompatSourceAsset, type ThreeCompatTrackedAssetInput } from "./ThreeCompatAssetProvenance";

export interface ThreeCompatAssetManifest {
  readonly schema: "a3d-three-compat-asset-library";
  readonly sourceManifest: string;
  readonly requirements: {
    readonly minimumTrackedAssets: number;
    readonly minimumLocalAssets: number;
    readonly minimumVisualEvidenceSlots: number;
    readonly everyAssetRequiresLicenseSourceShaAndLocalPath: boolean;
  };
  readonly claimBoundary: string;
  readonly assets: readonly ThreeCompatTrackedAssetInput[];
}

export interface ThreeCompatAssetRegistrySummary {
  readonly trackedAssetCount: number;
  readonly localAssetCount: number;
  readonly visualEvidenceSlotCount: number;
  readonly classes: readonly string[];
  readonly advancedMaterialAssetCount: number;
  readonly animationSkinMorphAssetCount: number;
  readonly textureAssetCount: number;
  readonly licenseReviewRequiredCount: number;
  readonly missingSourceIds: readonly string[];
  readonly missingLocalPaths: readonly string[];
}

export function loadThreeCompatAssetManifest(path = "fixtures/three-compat/assets/manifest.json"): ThreeCompatAssetManifest {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as ThreeCompatAssetManifest;
}

export function loadThreeCompatAssetRegistry(manifest = loadThreeCompatAssetManifest()): readonly ThreeCompatAssetProvenance[] {
  const sourceManifest = JSON.parse(readFileSync(resolve(manifest.sourceManifest), "utf8")) as { readonly assets: readonly ThreeCompatSourceAsset[] };
  const sourceById = new Map(sourceManifest.assets.map((asset) => [asset.id, asset]));
  return manifest.assets.flatMap((asset) => {
    const source = sourceById.get(asset.id);
    return source ? [createThreeCompatAssetProvenance(asset, source)] : [];
  });
}

export function summarizeThreeCompatAssetRegistry(manifest = loadThreeCompatAssetManifest()): ThreeCompatAssetRegistrySummary {
  const registry = loadThreeCompatAssetRegistry(manifest);
  const sourceIds = new Set(registry.map((asset) => asset.id));
  const missingSourceIds = manifest.assets.map((asset) => asset.id).filter((id) => !sourceIds.has(id));
  const missingLocalPaths = registry.filter((asset) => !existsSync(resolve(asset.localPath))).map((asset) => asset.localPath);
  return {
    trackedAssetCount: manifest.assets.length,
    localAssetCount: registry.length - missingLocalPaths.length,
    visualEvidenceSlotCount: registry.filter((asset) => asset.visualEvidenceSlot).length,
    classes: [...new Set(registry.map((asset) => asset.class))].sort(),
    advancedMaterialAssetCount: registry.filter((asset) => /clearcoat|specular|sheen|transmission|anisotropy|material|metal|normal|rough/i.test([...asset.tags, asset.id].join(" "))).length,
    animationSkinMorphAssetCount: registry.filter((asset) => /animat|skin|morph/i.test([...asset.tags, asset.id].join(" "))).length,
    textureAssetCount: registry.filter((asset) => /texture|material|pbr|normal|metal|rough/i.test([...asset.tags, asset.id].join(" "))).length,
    licenseReviewRequiredCount: registry.filter((asset) => asset.licenseReviewRequired).length,
    missingSourceIds,
    missingLocalPaths
  };
}
