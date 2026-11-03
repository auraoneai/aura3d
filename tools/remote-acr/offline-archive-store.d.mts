import type { PnpmArchiveAdmissionCapability } from '../release/archive-admission.mjs';
import type { WorkspaceArchiveCapability } from '../release/workspace-pnpm-admission.mjs';

export interface WorkspaceOfflineArchiveStoreInput {
  readonly storeDir: string;
  readonly capability: WorkspaceArchiveCapability;
  readonly root: string;
  readonly sourceManifestPath: string;
}
export interface ConsumerOfflineArchiveStoreInput {
  readonly storeDir: string;
  readonly capability: PnpmArchiveAdmissionCapability;
  readonly manifestBytes: Uint8Array;
  readonly lockBytes: Uint8Array;
}
export interface OfflineArchiveStoreSnapshot {
  readonly schema: 'aura3d.pnpm-offline-archive-store/1';
  readonly binding: Readonly<Record<string, string>>;
  readonly manifestSha256: string;
  readonly archiveCount: number;
  readonly blobCount: number;
  readonly installationAuthorized: false;
  readonly archives: readonly { readonly resolved: string; readonly bytes: Uint8Array }[];
}

/**
 * These functions retain or read verified archive bytes only. They do not
 * create a native pnpm store, run a package manager, or authorize installation.
 * Every read requires the live opaque capability and revalidates its source.
 */
export function createWorkspaceOfflineArchiveStore(input: WorkspaceOfflineArchiveStoreInput): OfflineArchiveStoreSnapshot;
export function readWorkspaceOfflineArchiveStore(input: WorkspaceOfflineArchiveStoreInput): OfflineArchiveStoreSnapshot;
export function createConsumerOfflineArchiveStore(input: ConsumerOfflineArchiveStoreInput): OfflineArchiveStoreSnapshot;
export function readConsumerOfflineArchiveStore(input: ConsumerOfflineArchiveStoreInput): OfflineArchiveStoreSnapshot;
