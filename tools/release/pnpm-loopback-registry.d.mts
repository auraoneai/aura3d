import type { PnpmArchiveAdmissionCapability } from './archive-admission.mjs';
import type { WorkspaceArchiveCapability } from './workspace-pnpm-admission.mjs';
import type { ConsumerOfflineArchiveStoreInput, WorkspaceOfflineArchiveStoreInput } from '../remote-acr/offline-archive-store.mjs';

export interface PnpmRegistryRequest { readonly method: string; readonly target: string }
export interface PnpmRegistryResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** A new copy on each request; changing it cannot alter the admitted archive. */
  readonly body: Uint8Array;
}
export interface PnpmRegistryStatus {
  readonly closed: boolean;
  readonly requests: number;
  readonly denied: number;
  readonly servedBytes: number;
  readonly registryArchives: number;
  readonly routes: readonly { readonly path: string; readonly sha256: string; readonly integrity: string; readonly size: number; readonly served: number }[];
}
/**
 * Pure request dispatch: does not listen, establish isolation, or run pnpm.
 * Each successful archive request and finish revalidates its source-bound
 * capability; a changed or unavailable admission permanently closes the
 * dispatcher. This point-in-time recheck is not process or network custody.
 */
export interface PnpmLoopbackRegistry {
  readonly registryPath: string;
  handle(request: PnpmRegistryRequest): PnpmRegistryResponse;
  status(): PnpmRegistryStatus;
  /** Closes the dispatcher and throws if any request was denied or failed. */
  finish(): PnpmRegistryStatus;
}
export function createPnpmLoopbackRegistry(input: {
  readonly capability: PnpmArchiveAdmissionCapability;
  readonly manifestBytes: Uint8Array;
  readonly lockBytes: Uint8Array;
}): PnpmLoopbackRegistry;
/** Consumes a separately branded, staged-source-bound workspace capability. */
export function createWorkspacePnpmLoopbackRegistry(input: {
  readonly capability: WorkspaceArchiveCapability;
  readonly root: string;
  readonly sourceManifestPath: string;
}): PnpmLoopbackRegistry;
/** Reads and rechecks a private archive store and its live consumer capability. */
export function createStoredPnpmLoopbackRegistry(input: ConsumerOfflineArchiveStoreInput): PnpmLoopbackRegistry;
/** Reads and rechecks a private archive store and its live workspace capability. */
export function createStoredWorkspacePnpmLoopbackRegistry(input: WorkspaceOfflineArchiveStoreInput): PnpmLoopbackRegistry;
