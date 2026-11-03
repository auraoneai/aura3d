/** A private byte-custody token, never permission to execute an install. */
declare const workspaceCapabilityBrand: unique symbol;
export interface WorkspaceArchiveCapability { readonly [workspaceCapabilityBrand]: true }
declare const workspaceSourceApprovalBrand: unique symbol;
/** Separate in-process approval identity; it is not permission to install. */
export interface WorkspaceSourceApprovalCapability { readonly [workspaceSourceApprovalBrand]: true }

import type { NativePnpmStoreReport } from './portable-pnpm-lock.mjs';
import type { InstalledPnpmWorkspaceReport, InstalledPnpmWorkspacePlatformReport } from './pnpm-installed-tree.mjs';

export interface WorkspaceSourceIdentity {
  readonly commit: string;
  readonly tree: string;
  readonly lockfileSha256: string;
  readonly fingerprint: string;
  readonly inputDigest: string;
  readonly manifestSha256: string;
}
export interface WorkspaceArchiveInput { readonly resolved: string; readonly bytes: Uint8Array }
export interface WorkspaceArchiveFile { readonly path: string; readonly sha256: string; readonly size: number }
export interface WorkspaceArchiveIdentity {
  readonly name: string;
  readonly version: string;
  readonly sha256: string;
  readonly integrity: string;
  readonly resolved: string;
}
export interface WorkspaceReviewedArchive extends WorkspaceArchiveIdentity {
  readonly review: { readonly path: string; readonly sha256: string };
  readonly files: readonly WorkspaceArchiveFile[];
}
export interface WorkspaceImporterRoot {
  readonly group: 'dependencies' | 'devDependencies' | 'optionalDependencies';
  readonly name: string;
  readonly specifier: string;
  /** Exact original pnpm lock value, including alias and peer variants. */
  readonly version: string;
  readonly kind: 'workspace' | 'archive';
  /** For workspace links, a source-relative importer path; otherwise the actual package name. */
  readonly target: string;
}
export interface WorkspaceImporter {
  readonly path: string;
  readonly name: string;
  readonly version: string;
  readonly manifestSha256: string;
  readonly peerDependencies: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta: Readonly<Record<string, { readonly optional: boolean }>>;
  readonly roots: readonly WorkspaceImporterRoot[];
}
export interface WorkspaceLink { readonly importer: string; readonly name: string; readonly target: string; readonly version: string }
export interface WorkspacePatchFileIdentity { readonly sha256: string; readonly size: number; readonly executable: number }
export interface WorkspacePatchFile {
  readonly path: string;
  readonly before: WorkspacePatchFileIdentity;
  readonly after: WorkspacePatchFileIdentity;
}
export interface WorkspacePatch {
  readonly packageKey: string;
  readonly archive: { readonly name: string; readonly version: string; readonly sha256: string; readonly integrity: string };
  readonly patch: { readonly path: string; readonly sha256: string };
  readonly snapshotKeys: readonly string[];
  readonly files: readonly WorkspacePatchFile[];
}
export interface WorkspaceOverride {
  readonly selector: string;
  readonly parent: string;
  readonly dependency: string;
  readonly version: string;
  readonly affectedPackages: readonly string[];
}
export interface WorkspaceUnresolvedOptionalPeer {
  readonly packageKey: string;
  readonly name: string;
  readonly specifier: 'latest';
  readonly snapshotKeys: readonly string[];
}
export interface WorkspaceLockPackage {
  readonly key: string;
  readonly resolution: { readonly integrity: string; readonly tarball?: string };
  readonly engines?: Readonly<Record<string, string>>;
  readonly cpu?: readonly string[];
  readonly os?: readonly string[];
  readonly libc?: readonly string[];
  readonly hasBin?: boolean;
  readonly deprecated?: string;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional: boolean }>>;
}
export interface WorkspaceLockSnapshot {
  readonly key: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly transitivePeerDependencies?: readonly string[];
  readonly optional?: boolean;
}
export interface WorkspacePnpmGraph {
  readonly settings: { readonly autoInstallPeers?: boolean; readonly excludeLinksFromLockfile?: boolean };
  readonly importers: readonly WorkspaceImporter[];
  readonly packages: readonly WorkspaceLockPackage[];
  readonly snapshots: readonly WorkspaceLockSnapshot[];
}
/** An unresolved first-party CLI output, not reviewed bytes or execution authority. */
export interface WorkspaceDeferredBin {
  readonly importer: string;
  readonly name: string;
  readonly manifestSha256: string;
  readonly commands: readonly string[];
  /** Importer-relative target; output must be absent when inspected or consumed. */
  readonly target: string;
  /** Staged entry-point identity; no source-to-output equivalence is implied. */
  readonly source: { readonly path: string; readonly sha256: string };
}
export interface WorkspacePnpmInput {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly archives: readonly WorkspaceArchiveInput[];
  /** Default false. Allows only the verifier's fixed first-party CLI declarations. */
  readonly allowDeferredWorkspaceBins?: boolean;
}
export interface WorkspacePnpmInspection {
  readonly source: WorkspaceSourceIdentity;
  readonly workspaceSha256: string;
  readonly lockSha256: string;
  readonly graph: WorkspacePnpmGraph;
  readonly deferredBins: readonly WorkspaceDeferredBin[];
  readonly links: readonly WorkspaceLink[];
  readonly patches: readonly (WorkspacePatch & { readonly files: readonly (WorkspacePatchFile & { readonly bytes: Uint8Array })[] })[];
  readonly overrides: readonly WorkspaceOverride[];
  readonly unresolvedOptionalPeers: readonly WorkspaceUnresolvedOptionalPeer[];
  readonly archives: readonly (WorkspaceArchiveIdentity & { readonly bytes: Uint8Array })[];
  readonly allowedBuilds: readonly string[];
}
export interface WorkspacePnpmReceipt {
  readonly schema: 'aura3d.workspace-pnpm-admission/1';
  readonly source: WorkspaceSourceIdentity;
  readonly sourceManifest: { readonly path: string; readonly sha256: string };
  readonly workspaceSha256: string;
  readonly lockSha256: string;
  readonly policy: { readonly path: string; readonly sha256: string };
  readonly graph: WorkspacePnpmGraph;
  readonly deferredBins: readonly WorkspaceDeferredBin[];
  readonly links: readonly WorkspaceLink[];
  readonly patches: readonly (WorkspacePatch & { readonly review: { readonly path: string; readonly sha256: string } })[];
  readonly overrides: readonly WorkspaceOverride[];
  readonly unresolvedOptionalPeers: readonly WorkspaceUnresolvedOptionalPeer[];
  readonly archives: readonly WorkspaceReviewedArchive[];
  readonly allowedBuilds: readonly string[];
  readonly prerequisites: readonly string[];
}
export interface WorkspacePnpmSnapshots {
  readonly source: WorkspaceSourceIdentity;
  readonly workspaceSha256: string;
  readonly lockSha256: string;
  readonly workspaceBytes: Uint8Array;
  readonly lockBytes: Uint8Array;
  readonly graph: WorkspacePnpmGraph;
  readonly deferredBins: readonly WorkspaceDeferredBin[];
  readonly links: readonly WorkspaceLink[];
  readonly patches: readonly (WorkspacePatch & { readonly review: { readonly path: string; readonly sha256: string };
    readonly files: readonly (WorkspacePatchFile & { readonly bytes: Uint8Array })[] })[];
  readonly overrides: readonly WorkspaceOverride[];
  readonly unresolvedOptionalPeers: readonly WorkspaceUnresolvedOptionalPeer[];
  readonly archives: readonly (WorkspaceReviewedArchive & { readonly bytes: Uint8Array })[];
}

/** Structural inspection, not an independent review or install authorization. */
export function inspectWorkspacePnpmGraph(input: WorkspacePnpmInput): WorkspacePnpmInspection;
/** Requires a separately pinned source policy and full file-level archive reviews. */
export function verifyWorkspacePnpmAdmission(input: WorkspacePnpmInput): {
  readonly receipt: WorkspacePnpmReceipt;
  readonly capability: WorkspaceArchiveCapability;
};
/** Revalidates staged source and policy; returns fresh byte snapshots, not install authority. */
export function consumeWorkspacePnpmAdmission(input: {
  readonly capability: WorkspaceArchiveCapability;
  readonly root: string;
  readonly sourceManifestPath: string;
}): WorkspacePnpmSnapshots;

export interface WorkspaceSourceApprovalSubject {
  readonly schema: 'aura3d.workspace-source-subject/1';
  readonly sourceInputSha256: string;
  readonly sourceManifestSha256: string;
  readonly workspaceSha256: string;
  readonly lockfileSha256: string;
  readonly policySha256: string;
  /** Digest of the complete source-bound archive admission receipt. */
  readonly admissionSha256: string;
}
export interface SignedWorkspaceSourceApproval {
  readonly schema: 'aura3d.workspace-source-approval-envelope/1';
  readonly payload: {
    readonly schema: 'aura3d.workspace-source-approval/1';
    readonly subject: WorkspaceSourceApprovalSubject;
    readonly decision: 'approved';
    readonly scope: 'workspace-dependency-inputs';
    readonly reviewer: { readonly id: string; readonly kind: 'independent-source-review' };
  };
  /** Ed25519 over UTF-8 `aura3d.workspace-source-approval/1\0` plus recursively key-sorted compact payload JSON. */
  readonly signature: { readonly algorithm: 'ed25519'; readonly keyId: string; readonly value: string };
}
export interface WorkspaceSourceApprovalObservation {
  readonly schema: 'aura3d.workspace-source-approval-observation/1';
  readonly subject: WorkspaceSourceApprovalSubject;
  readonly approvalSha256: string;
  readonly keyId: string;
  readonly installationAuthorized: false;
  readonly scope: string;
}
/** Builds a review subject, without signing it or granting any authority. */
export function workspacePnpmSourceApprovalSubject(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly capability: WorkspaceArchiveCapability;
}): WorkspaceSourceApprovalSubject;
/** Requires an authorized key in the independently pinned policy and exact source-bound signed bytes. */
export function verifyWorkspacePnpmSourceApproval(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly capability: WorkspaceArchiveCapability;
  readonly approvalBytes: Uint8Array;
}): { readonly approval: WorkspaceSourceApprovalObservation; readonly approvalCapability: WorkspaceSourceApprovalCapability };
/** Rechecks the signed approval, pinned policy, staged source and same live archive capability. */
export function consumeWorkspacePnpmSourceApproval(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly capability: WorkspaceArchiveCapability;
  readonly approvalCapability: WorkspaceSourceApprovalCapability;
}): WorkspaceSourceApprovalObservation;

/**
 * Compare the entire pnpm file tree and Node binary to the separately
 * reviewed inventory within the pinned workspace policy. Does not establish
 * what code is running, OS isolation, runtime version or install authority.
 */
export function inspectWorkspacePnpmToolchain(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly capability: WorkspaceArchiveCapability;
  readonly toolchainRoot: string;
  readonly nodePath: string;
}): {
  readonly schema: 'aura3d.workspace-pnpm-toolchain-observation/1';
  readonly sourceInputDigest: string;
  readonly policySha256: string;
  readonly declaredManager: 'pnpm@11.1.3';
  readonly declaredNodeVersion: '22.23.2';
  readonly fileCount: number;
  readonly nodeSha256: string;
  readonly executionAuthorized: false;
  readonly scope: string;
};

/**
 * Review the staged graph, verify its independent signed source approval, then
 * create and recheck a new private native store in this process. Neither the
 * capabilities, the store nor this report authorize installation.
 */
export function prepareWorkspacePnpmOfflineStore(input: WorkspacePnpmInput & {
  readonly storeDir: string;
  readonly approvalBytes: Uint8Array;
}): {
  readonly receipt: WorkspacePnpmReceipt;
  readonly capability: WorkspaceArchiveCapability;
  readonly approval: WorkspaceSourceApprovalObservation;
  readonly approvalCapability: WorkspaceSourceApprovalCapability;
  readonly store: NativePnpmStoreReport;
  readonly installationAuthorized: false;
};

/**
 * Observe a separate installed root and its post-use native store. No install
 * is run, and the result cannot prove package-manager/process custody.
 */
export function verifyWorkspacePnpmInstalledSnapshot(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly capability: WorkspaceArchiveCapability;
  readonly storeDir: string;
  readonly installRoot: string;
  readonly conditionalPlatform?: boolean;
}): {
  readonly schema: 'aura3d.workspace-pnpm-installed-observation/1';
  readonly store: NativePnpmStoreReport;
  readonly tree: InstalledPnpmWorkspaceReport | InstalledPnpmWorkspacePlatformReport;
  readonly installationAuthorized: false;
  readonly scope: string;
};

/**
 * Rechecks supplied live admission and store, then fails closed until verified
 * package-manager custody, process/network isolation and installed-tree
 * lifecycle custody can actually be enforced. No receipt is install authority.
 */
export function assertWorkspacePnpmInstallReady(input?: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly capability: WorkspaceArchiveCapability;
  readonly approvalCapability: WorkspaceSourceApprovalCapability;
  readonly storeDir: string;
  readonly toolchainRoot?: string;
  readonly nodePath?: string;
}): never;
