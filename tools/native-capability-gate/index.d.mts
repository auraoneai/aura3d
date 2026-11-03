export interface NativeFileReference {
  path: string;
  sha256: string;
}

export interface NativeCommitProof {
  format: "sha1" | "sha256";
  commit: string;
  tree: string;
  commitObject: string;
  treeObjects: Array<{ oid: string; data: string }>;
}

/** Historical evidence checks retained for Phase B, never a source-phase result. */
export interface NativeDeferredAcceptanceTest {
  readonly path: string;
  readonly sha256: string;
  readonly phase: "acceptance";
  readonly status: "not-run";
  readonly assertionIds: readonly string[];
  readonly sourceTest: Readonly<NativeFileReference>;
}

/** First-party historical replay inputs, separate from candidate browser receipts. */
export interface NativeDeferredReplayTest extends NativeDeferredAcceptanceTest {
  readonly schema: "aura3d.historical-replay-inventory/1";
  readonly kind: "first-party-historical-regression";
  readonly inapplicableAssertionIds: readonly string[];
  readonly fixtures: readonly Readonly<NativeFileReference>[];
  readonly currentCandidateBrowserReceipt: false;
}

/** External codec fixtures remain unavailable until trusted inputs exist in Phase B. */
export interface NativeDeferredExternalCodecTest extends NativeDeferredAcceptanceTest {
  readonly schema: "aura3d.external-codec-fixture-inventory/1";
  readonly kind: "external-codec-fixtures";
  readonly config: Readonly<NativeFileReference>;
  readonly policy: Readonly<NativeFileReference>;
  readonly contract: Readonly<NativeFileReference>;
  readonly contractTypes: Readonly<NativeFileReference>;
  readonly portableScanner: Readonly<NativeFileReference>;
  readonly portableScannerTypes: Readonly<NativeFileReference>;
  readonly portableScannerTest: Readonly<NativeFileReference>;
  readonly contractTest: Readonly<NativeFileReference>;
  readonly launcher: Readonly<NativeFileReference>;
  readonly launcherTest: Readonly<NativeFileReference>;
  readonly currentCandidateBrowserReceipt: false;
}

/** The fields returned after all source evidence has been revalidated. */
export interface NativeCodeCompleteGate {
  schema: "aura3d.native-code-complete/1";
  status: "CODE_COMPLETE_GO";
  owner: string;
  createdAt: string;
  sourceManifest: NativeFileReference;
  sourceReports: NativeFileReference;
  ledger: NativeFileReference;
  roadmap: NativeFileReference;
  freezeCommit: string;
  testedOrigin: { commit: string; tree: string };
  sourceInputDigest: string;
  lockfileSha256: string;
  runId: string;
  candidatePlan: NativeFileReference;
  sourceInventory: NativeFileReference;
  buildHandoff: NativeFileReference;
  portableInputs: {
    sourceManifest: NativeFileReference;
    candidatePlan: NativeFileReference;
    inputs: NativeFileReference;
    admissionPolicy: NativeFileReference;
    consumerBundle: NativeFileReference;
    exampleBundle: NativeFileReference;
    matrixBundle: NativeFileReference;
    candidateReviews: readonly Readonly<NativeFileReference>[];
    candidateReviewEvidence: readonly Readonly<NativeFileReference>[];
  };
  resumeRebuild: { checkId: 'resume-rebuild'; inventory: NativeFileReference; buildProductsSha256: string };
  archives: NativeFileReference[];
  retainedReports: { bundleSize: NativeFileReference; installedTreeShaking: NativeFileReference };
  sourceConsumerReport: NativeFileReference;
  matrixSourceReport: NativeFileReference;
  examplesSourceReport: NativeFileReference;
  requiredOutcomeIds: string[];
  completedOutcomeIds: string[];
  outcomeSnapshotSha256: string;
  expectedCheckIds: string[];
  executedCheckIds: string[];
  passingCheckIds: string[];
  expectedTestFiles: Record<string, string[]>;
  executedTestFiles: Record<string, string[]>;
  expectedSourceTestFiles: string[];
  executedSourceTestFiles: string[];
  deferredAcceptanceTests: readonly NativeDeferredAcceptanceTest[];
  deferredReplayTests: NativeDeferredReplayTest;
  deferredExternalCodecTests: NativeDeferredExternalCodecTest;
  acceptance: "not-run";
  commitProof: NativeCommitProof;
  inputs: string[];
}

export interface EmitCodeCompleteGateOptions {
  root?: string;
  sourceManifest: string;
  sourceReports: string;
  ledger: string;
  freezeCommit: string;
  out: string;
  owner: string;
}

export interface ValidateAcceptanceGateOptions {
  root?: string;
  gatePath: string;
  sourceReport?: string;
}

export interface NativeSourceInventoryEvidenceOptions {
  root: string;
  reports: unknown;
  manifestRef: NativeFileReference;
  manifest: unknown;
}

export interface NativeTestInventory {
  checkId: string;
  expectedFiles: readonly string[];
  discoveredFiles: readonly string[];
  testCount: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  testNames: readonly string[];
}

export interface NativeVitestInventory extends NativeTestInventory {
  sourceRoot: string;
  result: NativeFileReference;
}

/** A TAP subrun as produced by the source job, before verification. */
export interface NativeTapSubrun {
  file: string;
  argv: readonly string[];
  exitCode: number | null;
  result: NativeFileReference;
}

export interface NativeTapCheck {
  id: string;
  // Subruns are untrusted evidence; the verifier also accepts incomplete or
  // malformed entries so it can reject them at runtime.
  subruns: readonly unknown[];
}

/** Recompute and write the source gate, or throw if any source check fails. */
export function emitCodeCompleteGate(options: EmitCodeCompleteGateOptions): NativeCodeCompleteGate;

/** Revalidate and return the gate synchronously, or throw before acceptance. */
export function validateAcceptanceGate(options: ValidateAcceptanceGateOptions): NativeCodeCompleteGate;

export function verifySourceInventoryEvidence(options: NativeSourceInventoryEvidenceOptions): string[];

/** Recompute a retained Vitest inventory and return its result path, or throw. */
export function verifyVitestInventory(root: string, inventory: NativeVitestInventory, expectedFiles: readonly string[]): string;

/** Recompute retained TAP inventories and return their result paths, or throw. */
export function verifyTapInventory(
  root: string,
  inventory: NativeTestInventory,
  check: NativeTapCheck | null | undefined,
  expectedFiles: readonly string[],
  runId: string
): string[];
