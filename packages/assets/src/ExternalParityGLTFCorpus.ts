export interface ExternalParityGLTFCorpusAsset {
  readonly id: string;
  readonly license: string;
  readonly provenance: string;
  readonly features: readonly string[];
  readonly advancedMaterial?: boolean;
  readonly animationSkinMorph?: boolean;
  readonly visualEvidenceSlot?: boolean;
  readonly licenseReviewRequired?: boolean;
}

export interface ExternalParityGLTFCorpusManifest {
  readonly schema: "a3d-external-parity-gltf-corpus";
  readonly source: {
    readonly repository: string;
    readonly revision: string;
    readonly sourceManifest: string;
    readonly provenance: string;
  };
  readonly claimBoundary: string;
  readonly assets: readonly ExternalParityGLTFCorpusAsset[];
}

export interface ExternalParityGLTFCorpusSummary {
  readonly assetCount: number;
  readonly visualEvidenceSlots: number;
  readonly advancedMaterialAssets: number;
  readonly animationSkinMorphAssets: number;
  readonly licenseReviewRequired: number;
  readonly licenses: readonly string[];
  readonly featureCoverage: readonly string[];
  readonly releaseProofComplete: false;
}

export type ExternalParityCorpusAsset = ExternalParityGLTFCorpusAsset;
export type ExternalParityCorpusManifest = ExternalParityGLTFCorpusManifest;
export type ExternalParityCorpusSummary = ExternalParityGLTFCorpusSummary;

export function summarizeExternalParityGLTFCorpus(manifest: ExternalParityGLTFCorpusManifest): ExternalParityGLTFCorpusSummary {
  validateExternalParityGLTFCorpusManifest(manifest);
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

export function validateExternalParityGLTFCorpusManifest(manifest: ExternalParityGLTFCorpusManifest): void {
  if (manifest.schema !== "a3d-external-parity-gltf-corpus") throw new Error("Invalid external parity GLTF corpus schema.");
  if (!manifest.source.repository || !manifest.source.revision || !manifest.source.sourceManifest) throw new Error("External parity GLTF corpus source must include repository, revision, and source manifest.");
  if (!manifest.claimBoundary.includes("not final flagship product visual proof")) throw new Error("External parity GLTF corpus must include a flagship proof claim boundary.");
  if (manifest.assets.length < 25) throw new Error("External parity GLTF corpus must include at least 25 assets.");
  for (const asset of manifest.assets) {
    if (!asset.id || !asset.license || !asset.provenance) throw new Error(`External parity GLTF corpus asset ${asset.id || "<missing>"} lacks license/provenance.`);
    if (asset.features.length === 0) throw new Error(`External parity GLTF corpus asset ${asset.id} lacks feature tags.`);
  }
}

export const summarizeExternalParityCorpus = summarizeExternalParityGLTFCorpus;
export const validateExternalParityCorpusManifest = validateExternalParityGLTFCorpusManifest;
