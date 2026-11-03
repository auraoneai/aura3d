/** A caller-supplied regular file under inputRoot. */
export interface PortableAssemblyFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

/** Candidate paths are source-root-relative; supplied paths are input-root-relative. */
export interface PortableAssemblyArchive extends PortableAssemblyFile {
  readonly resolved: string;
  readonly origin: 'candidate' | 'supplied';
  readonly integrity: string;
}

export interface PortableAssemblyConsumer {
  readonly id: string;
  readonly manifest: PortableAssemblyFile;
  readonly lockfile: PortableAssemblyFile;
  readonly archives: readonly PortableAssemblyArchive[];
  readonly assets: readonly { readonly target: string; readonly file: PortableAssemblyFile }[];
}

export interface PortableAssemblyExample {
  readonly id: string;
  readonly manifest: PortableAssemblyFile;
  readonly lockfile: PortableAssemblyFile;
  readonly archives: readonly PortableAssemblyArchive[];
}

export interface PortableAssemblyMatrixCell extends PortableAssemblyExample {
  readonly manager: 'npm' | 'pnpm';
}

export interface PreparePortableInputsOptions {
  readonly root: string;
  readonly inputRoot: string;
  readonly runId: string;
  readonly sourceManifestSha256: string;
  readonly candidatePlanSha256: string;
  /** Supplied catalog inventory; the source producer independently derives and checks the actual catalog before consumer installation. */
  readonly expectedExampleIds: readonly string[];
  readonly consumers: readonly PortableAssemblyConsumer[];
  readonly examples: readonly PortableAssemblyExample[];
  readonly matrix: readonly PortableAssemblyMatrixCell[];
  /** Existing signed review files; these bytes are copied, never generated. */
  readonly candidateReviews: readonly PortableAssemblyFile[];
  /** Preserve the signed logical path for each separately supplied sidecar evidence file. */
  readonly candidateReviewEvidence: readonly { readonly path: string; readonly file: PortableAssemblyFile }[];
}

export interface PortableAssemblyResult {
  readonly runId: string;
  readonly inputs: { readonly path: string; readonly sha256: string };
  readonly sourceManifest: { readonly path: string; readonly sha256: string };
  readonly candidatePlan: { readonly path: string; readonly sha256: string };
  /** Transport and byte identity do not establish independent provenance or authorize installation. */
  readonly admission: 'not-verified';
}

/** Assemble immutable bytes locally without fetching, executing, installing or claiming archive admission. */
export function preparePortableInputs(options: PreparePortableInputsOptions): PortableAssemblyResult;
