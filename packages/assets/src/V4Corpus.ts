export interface V4CorpusAsset {
  readonly id: string;
  readonly license: string;
  readonly provenance: string;
  readonly features: readonly string[];
  readonly advancedMaterial?: boolean;
  readonly animationSkinMorph?: boolean;
  readonly visualEvidenceSlot?: boolean;
  readonly licenseReviewRequired?: boolean;
}

export interface V4CorpusManifest {
  readonly schema: "g3d-v4-gltf-corpus/v1";
  readonly source: {
    readonly repository: string;
    readonly revision: string;
    readonly sourceManifest: string;
    readonly provenance: string;
  };
  readonly claimBoundary: string;
  readonly assets: readonly V4CorpusAsset[];
}

export interface V4CorpusSummary {
  readonly assetCount: number;
  readonly visualEvidenceSlots: number;
  readonly advancedMaterialAssets: number;
  readonly animationSkinMorphAssets: number;
  readonly licenseReviewRequired: number;
  readonly licenses: readonly string[];
  readonly featureCoverage: readonly string[];
  readonly releaseProofComplete: false;
}

export function summarizeV4Corpus(manifest: V4CorpusManifest): V4CorpusSummary {
  validateV4CorpusManifest(manifest);
  return {
    assetCount: manifest.assets.length,
    visualEvidenceSlots: manifest.assets.filter((asset) => asset.visualEvidenceSlot).length,
    advancedMaterialAssets: manifest.assets.filter((asset) => asset.advancedMaterial).length,
    animationSkinMorphAssets: manifest.assets.filter((asset) => asset.animationSkinMorph).length,
    licenseReviewRequired: manifest.assets.filter((asset) => asset.licenseReviewRequired).length,
    licenses: [...new Set(manifest.assets.map((asset) => asset.license))].sort(),
    featureCoverage: [...new Set(manifest.assets.flatMap((asset) => asset.features))].sort(),
    releaseProofComplete: false
  };
}

export function validateV4CorpusManifest(manifest: V4CorpusManifest): void {
  if (manifest.schema !== "g3d-v4-gltf-corpus/v1") throw new Error("Invalid V4 corpus schema.");
  if (!manifest.source.repository || !manifest.source.revision || !manifest.source.sourceManifest) throw new Error("V4 corpus source must include repository, revision, and source manifest.");
  if (!manifest.claimBoundary.includes("not final flagship product visual proof")) throw new Error("V4 corpus must include a flagship proof claim boundary.");
  if (manifest.assets.length < 25) throw new Error("V4 corpus must include at least 25 assets.");
  for (const asset of manifest.assets) {
    if (!asset.id || !asset.license || !asset.provenance) throw new Error(`V4 corpus asset ${asset.id || "<missing>"} lacks license/provenance.`);
    if (asset.features.length === 0) throw new Error(`V4 corpus asset ${asset.id} lacks feature tags.`);
  }
}
