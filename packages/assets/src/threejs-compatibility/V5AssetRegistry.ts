import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createV5AssetProvenance, type V5AssetProvenance, type V5SourceAsset, type V5TrackedAssetInput } from "./V5AssetProvenance";

export interface V5AssetManifest {
  readonly schema: "a3d-three-compat-asset-library/v1";
  readonly sourceManifest: string;
  readonly requirements: {
    readonly minimumTrackedAssets: number;
    readonly minimumLocalAssets: number;
    readonly minimumVisualEvidenceSlots: number;
    readonly everyAssetRequiresLicenseSourceShaAndLocalPath: boolean;
  };
  readonly claimBoundary: string;
  readonly assets: readonly V5TrackedAssetInput[];
}

export interface V5AssetRegistrySummary {
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

export function loadV5AssetManifest(path = "fixtures/three-compat/assets/manifest.json"): V5AssetManifest {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as V5AssetManifest;
}

export function loadV5AssetRegistry(manifest = loadV5AssetManifest()): readonly V5AssetProvenance[] {
  const sourceManifest = JSON.parse(readFileSync(resolve(manifest.sourceManifest), "utf8")) as { readonly assets: readonly V5SourceAsset[] };
  const sourceById = new Map(sourceManifest.assets.map((asset) => [asset.id, asset]));
  return manifest.assets.flatMap((asset) => {
    const source = sourceById.get(asset.id);
    return source ? [createV5AssetProvenance(asset, source)] : [];
  });
}

export function summarizeV5AssetRegistry(manifest = loadV5AssetManifest()): V5AssetRegistrySummary {
  const registry = loadV5AssetRegistry(manifest);
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
