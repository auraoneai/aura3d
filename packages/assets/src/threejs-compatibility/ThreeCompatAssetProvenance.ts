export interface ThreeCompatTrackedAssetInput {
  readonly id: string;
  readonly class: string;
  readonly localPath: string;
  readonly visualEvidenceSlot?: boolean;
}

export interface ThreeCompatSourceAsset {
  readonly id: string;
  readonly name: string;
  readonly license: string;
  readonly format: string;
  readonly tags: readonly string[];
  readonly source: {
    readonly repository: string;
    readonly revision: string;
    readonly path: string;
    readonly uri: string;
    readonly sha256: string;
  };
}

export interface ThreeCompatAssetProvenance extends ThreeCompatTrackedAssetInput {
  readonly name: string;
  readonly license: string;
  readonly format: string;
  readonly tags: readonly string[];
  readonly repository: string;
  readonly revision: string;
  readonly sourcePath: string;
  readonly uri: string;
  readonly sha256: string;
  readonly licenseReviewRequired: boolean;
}

export function createThreeCompatAssetProvenance(input: ThreeCompatTrackedAssetInput, source: ThreeCompatSourceAsset): ThreeCompatAssetProvenance {
  return {
    ...input,
    name: source.name,
    license: source.license,
    format: source.format,
    tags: source.tags,
    repository: source.source.repository,
    revision: source.source.revision,
    sourcePath: source.source.path,
    uri: source.source.uri,
    sha256: source.source.sha256,
    licenseReviewRequired: /review|trademark|limitations/i.test(source.license)
  };
}

