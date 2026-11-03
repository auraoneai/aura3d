/**
 * Archive admission trusts only a separately established policy digest and
 * its source-manifest-bound independent review evidence. These types describe
 * exact byte bindings; a record or an absent scan finding is not proof of authorship.
 */
export interface ArchiveIdentity {
  readonly name: string;
  readonly version: string;
  readonly sha256: string;
  readonly integrity: string;
}
export interface SourceEvidenceReference { readonly path: string; readonly sha256: string }
export interface ArchivePolicy {
  readonly schema: 'aura3d.archive-admission-policy/1';
  readonly admissions: readonly { readonly archive: ArchiveIdentity; readonly review: SourceEvidenceReference }[];
  /** Optional authorized Ed25519 public keys; keyId is the SHA-256 of SPKI DER. */
  readonly candidateAuthorities?: readonly { readonly keyId: string; readonly spkiDerBase64: string }[];
}
/** Every file, including generated, bundled and encoded content, needs review. */
export interface ArchiveReview {
  readonly schema: 'aura3d.archive-review/1';
  readonly archive: ArchiveIdentity;
  readonly decision: 'approved';
  readonly scope: 'complete-archive';
  readonly reviewer: { readonly id: string; readonly kind: 'independent-source-review' };
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
    /** source-match checks source bytes; reviewed-output requires substantive review. */
    readonly origin: 'source-match' | 'reviewed-output';
    readonly sources: readonly SourceEvidenceReference[];
    readonly evidence: readonly SourceEvidenceReference[];
    readonly rationale: string;
  }[];
}
/** Post-pack review bytes are excluded from source inputs and signed by a pinned authority. */
export interface CandidateArchiveReview {
  readonly schema: 'aura3d.candidate-review/1';
  readonly sourceInputSha256: string;
  readonly sourceManifestSha256: string;
  readonly candidatePlanSha256: string;
  readonly archive: ArchiveIdentity;
  readonly decision: 'approved';
  readonly scope: 'complete-archive';
  readonly reviewer: { readonly id: string; readonly kind: 'independent-source-review' };
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly size: number;
    readonly origin: 'source-match' | 'reviewed-output';
    readonly sources: readonly SourceEvidenceReference[];
    readonly evidence: readonly (SourceEvidenceReference & { readonly scope: 'source' | 'sidecar' })[];
    readonly rationale: string;
  }[];
}
/** Signature covers UTF-8 `aura3d.candidate-review/1\0` + compact recursively key-sorted JSON of payload. */
export interface SignedCandidateReview {
  readonly schema: 'aura3d.candidate-review-envelope/1';
  readonly payload: CandidateArchiveReview;
  readonly signature: { readonly algorithm: 'ed25519'; readonly keyId: string; readonly value: string };
}
export interface ArchiveAdmissionReceipt {
  readonly schema: 'aura3d.archive-admission-receipt/1';
  readonly sourceInputSha256: string;
  readonly sourceManifest: SourceEvidenceReference;
  readonly testedOrigin: { readonly commit: string; readonly tree: string };
  readonly plan: SourceEvidenceReference;
  readonly policy: SourceEvidenceReference;
  readonly manifestSha256: string;
  readonly lockSha256: string;
  readonly archives: readonly (ArchiveIdentity & {
    readonly resolved: string;
    readonly review: SourceEvidenceReference & { readonly keyId?: string };
    readonly files: readonly { readonly path: string; readonly sha256: string; readonly size: number }[];
  })[];
  readonly limitations: readonly string[];
}
declare const admissionBrand: unique symbol;
/** Runtime identity is checked in a private WeakMap; receipts cannot forge it. */
export interface ArchiveAdmissionCapability { readonly [admissionBrand]: true }
declare const pnpmAdmissionBrand: unique symbol;
/** A distinct brand prevents npm and pnpm capabilities from being interchanged. */
export interface PnpmArchiveAdmissionCapability { readonly [pnpmAdmissionBrand]: true }
export interface PnpmArchiveAdmissionReceipt extends ArchiveAdmissionReceipt { readonly lockFormat: 'pnpm' }
export interface VerifyArchiveAdmissionInput {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly planPath: string;
  readonly manifestBytes: Uint8Array;
  readonly lockBytes: Uint8Array;
  readonly archives: readonly { readonly resolved: string; readonly bytes: Uint8Array }[];
  /** Sorted, unique run-scoped refs to authenticated post-pack candidate reviews. */
  readonly candidateReviews?: readonly SourceEvidenceReference[];
}
/** Configuration preflight only; it neither inspects archives nor grants admission. */
export function assertArchiveAdmissionConfigured(input?: { readonly root?: string }): void;
export function verifyArchiveAdmission(input: VerifyArchiveAdmissionInput): {
  readonly receipt: ArchiveAdmissionReceipt;
  readonly capability: ArchiveAdmissionCapability;
};
export function verifyPnpmArchiveAdmission(input: VerifyArchiveAdmissionInput): {
  readonly receipt: PnpmArchiveAdmissionReceipt;
  readonly capability: PnpmArchiveAdmissionCapability;
};
/** Batch verification performs two staged-source validations and grants no install capability. */
export function verifyArchiveAdmissionBatch(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly planPath: string;
  readonly consumers: readonly Pick<VerifyArchiveAdmissionInput, 'manifestBytes' | 'lockBytes' | 'archives'>[];
  readonly candidateReviews?: readonly SourceEvidenceReference[];
}): readonly ArchiveAdmissionReceipt[];
export function verifyPnpmArchiveAdmissionBatch(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly planPath: string;
  readonly consumers: readonly Pick<VerifyArchiveAdmissionInput, 'manifestBytes' | 'lockBytes' | 'archives'>[];
  readonly candidateReviews?: readonly SourceEvidenceReference[];
}): readonly PnpmArchiveAdmissionReceipt[];
/** Returns fresh byte copies only after rechecking the staged context and graph bytes. */
export function consumeArchiveAdmission(input: {
  readonly capability: ArchiveAdmissionCapability;
  readonly manifestBytes: Uint8Array;
  readonly lockBytes: Uint8Array;
}): { readonly resolved: string; readonly bytes: Uint8Array }[];
export function consumePnpmArchiveAdmission(input: {
  readonly capability: PnpmArchiveAdmissionCapability;
  readonly manifestBytes: Uint8Array;
  readonly lockBytes: Uint8Array;
}): { readonly resolved: string; readonly bytes: Uint8Array }[];
