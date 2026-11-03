import type { PnpmArchiveAdmissionCapability } from './archive-admission.mjs';
import type { WorkspaceArchiveCapability } from './workspace-pnpm-admission.mjs';

/** `resolved` is an exact registry tarball URL or `file:./tarballs/<name>.tgz`. */
export interface PnpmArchiveInput { readonly resolved: string; readonly path: string }
export interface PnpmCandidateIdentity {
  readonly name: string;
  readonly version: string;
  readonly sha256: string;
  readonly integrity: string;
  readonly tarball?: string;
}
export interface PnpmInspectionInput {
  readonly manifestBytes: Uint8Array;
  readonly lockBytes: Uint8Array;
  readonly archives: readonly PnpmArchiveInput[];
  readonly readArchive: (path: string) => Uint8Array;
  readonly candidatePackages: readonly PnpmCandidateIdentity[];
}
export interface PnpmArchiveSnapshot extends PnpmArchiveInput {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly integrity: string;
  readonly manifest: Record<string, unknown>;
}
/** A structural inspection only; it is never installation authorization. */
export function inspectIndependentPnpmConsumer(input: PnpmInspectionInput): {
  packageKeys: string[];
  inputPaths: string[];
  archives: PnpmArchiveSnapshot[];
};
/** Only a separately verified pnpm-branded capability can authorize these exact bytes. */
export function assertIndependentPnpmConsumer(input: PnpmInspectionInput & {
  readonly admission: { readonly capability: PnpmArchiveAdmissionCapability };
}): { inputPaths: string[] };
export interface AdmittedPnpmConsumerGraph {
  readonly manifestSha256: string;
  readonly lockfileSha256: string;
  readonly packages: readonly {
    readonly key: string;
    readonly name: string;
    readonly resolution: { readonly integrity: string; readonly tarball?: string };
    readonly os?: readonly string[];
    readonly cpu?: readonly string[];
    readonly libc?: readonly string[];
    readonly archive: { readonly resolved: string; readonly bytes: Uint8Array; readonly sha256: string; readonly integrity: string };
  }[];
  readonly snapshots: readonly { readonly key: string; readonly packageKey: string; readonly name: string;
    readonly optional: boolean; readonly bindings: readonly string[];
    readonly edges: readonly { readonly name: string; readonly group: string; readonly target: string }[] }[];
  readonly roots: readonly { readonly name: string; readonly group: string; readonly target: string }[];
}
export function consumePnpmConsumerGraph(input: {
  readonly capability: PnpmArchiveAdmissionCapability;
  readonly manifestBytes: Uint8Array;
  readonly lockBytes: Uint8Array;
}): AdmittedPnpmConsumerGraph;
export interface ConsumerNativePnpmStoreInput {
  readonly storeDir: string;
  readonly afterUse?: { readonly projectDir: string };
  readonly admission?: {
    readonly capability: PnpmArchiveAdmissionCapability;
    readonly manifestBytes: Uint8Array;
    readonly lockBytes: Uint8Array;
  };
}
export interface WorkspaceNativePnpmStoreInput {
  readonly storeDir: string;
  readonly afterUse?: { readonly projectDir: string };
  readonly capability: WorkspaceArchiveCapability;
  readonly root: string;
  readonly sourceManifestPath: string;
}
/** A point-in-time inventory, never installation or execution authority. */
export interface NativePnpmStoreReport {
  readonly schema: 'aura3d.pnpm-native-store/1';
  readonly binding: Readonly<Record<string, unknown>>;
  readonly manifestSha256: string;
  readonly archiveCount: number;
  readonly fileCount: number;
  readonly installationAuthorized: false;
  readonly scope: string;
}
/**
 * Build pnpm 11.1.3's v11 SQLite index and SHA-512 file store exclusively
 * from a live, source-bound reviewed capability, in a new private directory.
 * No package manager is started. Caller isolation, pnpm custody, its registry
 * supply-chain checks, and installed-tree verification remain prerequisites.
 */
export function seedVerifiedPnpmStore(input: ConsumerNativePnpmStoreInput): NativePnpmStoreReport;
export function verifyPnpmNativeStore(input: ConsumerNativePnpmStoreInput): NativePnpmStoreReport;
export function seedVerifiedWorkspacePnpmStore(input: WorkspaceNativePnpmStoreInput): NativePnpmStoreReport;
export function verifyWorkspacePnpmNativeStore(input: WorkspaceNativePnpmStoreInput): NativePnpmStoreReport;
export interface InstalledPnpmConsumerReport {
  readonly schema: 'aura3d.pnpm-installed-consumer/1';
  readonly manifestSha256: string;
  readonly lockfileSha256: string;
  readonly snapshotKeys: readonly string[];
  readonly omittedSnapshotKeys: readonly string[];
  readonly platform: { readonly os: string; readonly cpu: string; readonly libc: string };
  readonly fileCount: number;
  readonly bytes: number;
  readonly installationAuthorized: false;
  readonly scope: string;
}
export function assertInstalledPnpmArchiveSet(input: {
  readonly projectDir: string;
  readonly storeDir?: string;
  readonly admission?: { readonly capability: PnpmArchiveAdmissionCapability;
    readonly manifestBytes: Uint8Array; readonly lockBytes: Uint8Array };
}): InstalledPnpmConsumerReport;
