import type { NativeCodeCompleteGate, NativeFileReference } from "../native-capability-gate/index.mjs";

export const EXTERNAL_CODEC_POLICY_PATH: "tests/acceptance/gltf-external-codec-policy.json";
export const EXTERNAL_CODEC_TEST_PATH: "tests/acceptance/gltf-external-decoder-fixtures.test.ts";
export const EXTERNAL_CODEC_CONFIG_PATH: "tests/acceptance/external-codec.vitest.config.ts";
export const EXTERNAL_CODEC_SOURCE_TEST_PATH: "tests/assets/gltf-optional-external-decoders.test.ts";
export const EXTERNAL_CODEC_CONTRACT_TEST_PATH: "tests/unit/tools/native-external-codec-contract.test.ts";
export const EXTERNAL_CODEC_ASSERTION_IDS: readonly string[];

export interface ExternalCodecLimits {
  readonly maxDocumentBytes: number;
  readonly maxResourceBytes: number;
  readonly maxTotalBytes: number;
  readonly maxResources: number;
  readonly maxProofBytes: number;
}

export interface ExternalCodecPolicyFixture {
  readonly id: string;
  readonly codec: string;
  readonly documentPath: string;
  readonly documentSha256: string | null;
  readonly license: string;
  readonly assertionId: string;
}

export interface ExternalCodecPolicy {
  readonly schema: "aura3d.external-codec-policy/1";
  readonly repository: string;
  readonly revision: string;
  readonly rawOrigin: string;
  readonly limits: ExternalCodecLimits;
  readonly fixtures: readonly ExternalCodecPolicyFixture[];
}

export interface ExternalCodecRecord {
  readonly repoPath: string;
  readonly url: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly localPath: string;
  readonly lfsPointerBase64?: string;
}

export interface ExternalCodecFixture {
  readonly id: string;
  readonly codec: string;
  readonly document: ExternalCodecRecord;
  readonly dependencies: readonly ExternalCodecRecord[];
}

export interface ExternalCodecProof {
  readonly revision: string;
  readonly commitObjectBase64: string;
  readonly trees: readonly { readonly oid: string; readonly bytesBase64: string }[];
}

export interface ExternalCodecLock {
  readonly schema: "aura3d.external-codec-lock/1";
  readonly runId: string;
  readonly gate: Readonly<NativeFileReference>;
  readonly freezeCommit: string;
  readonly sourceInputDigest: string;
  readonly candidatePlan: Readonly<NativeFileReference>;
  readonly policy: Readonly<NativeFileReference>;
  readonly provenance: ExternalCodecProof;
  readonly fixtures: readonly { readonly id: string; readonly document: ExternalCodecRecord; readonly dependencies: readonly ExternalCodecRecord[] }[];
}

export interface ValidatedExternalCodecInputs {
  readonly fixtures: readonly ExternalCodecFixture[];
  readonly inputPaths: readonly string[];
  readonly limits: ExternalCodecLimits;
  readonly policySha256: string;
}

export interface ExternalCodecCandidateContext {
  readonly schema: "aura3d.external-codec-candidate-context/1";
  readonly runId: string;
  readonly gate: Readonly<NativeFileReference>;
  readonly freezeCommit: string;
  readonly sourceInputDigest: string;
  readonly candidatePlan: Readonly<NativeFileReference>;
  readonly fixtureLock: Readonly<NativeFileReference>;
  readonly npmInventory: Readonly<NativeFileReference>;
  readonly matrixProject: "npm-react19-peer-present";
  readonly projectRealpath: string;
  readonly installedTreeSha256: string;
}

export function validateExternalCodecInstalledProject(input: {
  readonly root: string;
  readonly projectPath: string;
  readonly project: { readonly id: string; readonly projectSha256: string };
  readonly packageLock: { readonly lockfileVersion: number; readonly packages: Record<string, unknown> };
  readonly archives: readonly { readonly resolved: string; readonly path: string }[];
  readonly readArchive: (path: string, maxBytes: number) => Uint8Array;
}): { readonly projectRealpath: string; readonly installedTreeSha256: string };
export function validateExternalCodecRunContext(input: {
  readonly context: unknown;
  readonly runId: string;
  readonly gate: NativeCodeCompleteGate;
  readonly gatePath: string;
  readonly gateSha256: string;
  readonly lockPath: string;
  readonly lockSha256: string;
  readonly npmPath: string;
  readonly npmSha256: string;
  readonly projectRealpath: string;
  readonly installedTreeSha256: string;
}): ExternalCodecCandidateContext;

export function validateExternalCodecPolicy(policyBytes: Uint8Array): { readonly policy: ExternalCodecPolicy; readonly sha256: string };
export function verifyExternalCodecGitProof(provenance: ExternalCodecProof, expectedRevision: string, limits: ExternalCodecLimits): (path: string) => string;
export function validateExternalCodecFixtureRecords(input: {
  readonly policy: ExternalCodecPolicy;
  readonly runId: string;
  readonly fixtures: ExternalCodecLock["fixtures"];
  readonly treeBlob: (path: string) => string;
  readonly readBytes: (path: string, maxBytes: number) => Uint8Array;
}): Omit<ValidatedExternalCodecInputs, "policySha256">;
export function validateExternalCodecInputs(input: {
  readonly policyBytes: Uint8Array;
  readonly gate: NativeCodeCompleteGate;
  readonly gatePath: string;
  readonly gateSha256: string;
  readonly lock: ExternalCodecLock;
  readonly readBytes: (path: string, maxBytes: number) => Uint8Array;
}): ValidatedExternalCodecInputs;
export function createExternalCodecFetch(input: {
  readonly fixtures: readonly ExternalCodecFixture[];
  readonly limits: ExternalCodecLimits;
  readonly fetchImpl: typeof fetch;
}): typeof fetch;
export function evaluateExternalCodecResults(report: unknown, root: string): {
  readonly status: "passed" | "failed";
  readonly expected: readonly string[];
  readonly passed: readonly string[];
  readonly failed: readonly string[];
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
};
