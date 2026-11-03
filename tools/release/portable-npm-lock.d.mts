import type { ArchiveAdmissionCapability } from './archive-admission.mjs';
export interface NpmArchiveInput { readonly resolved: string; readonly path: string }
export interface NpmCandidateIdentity { readonly name: string; readonly version: string; readonly sha256: string; readonly integrity: string }
export interface NpmAdmissionInput { readonly capability: ArchiveAdmissionCapability; readonly manifestBytes: Uint8Array; readonly lockBytes: Uint8Array }
export interface NpmConsumerInput { readonly manifest: unknown; readonly lock: unknown; readonly archives: readonly NpmArchiveInput[]; readonly readArchive: (path: string) => Uint8Array; readonly candidatePackages: readonly NpmCandidateIdentity[]; readonly admission?: NpmAdmissionInput }
export interface NpmArchiveSnapshot extends NpmArchiveInput { readonly sha256: string; readonly integrity: string; readonly bytes: Uint8Array; readonly manifest: Record<string, unknown> }
export function assertIndependentNpmGraph(input: { readonly manifest: unknown; readonly lock: unknown }): { packagePaths: string[] };
/** Inspection returns private-copy bytes for further review; it never grants admission. */
export function inspectNpmArchive(bytes: Uint8Array): { manifest: Record<string, unknown>; files: { path: string; bytes: Uint8Array }[] };
/** Structural inspection only, not authorization to restore or execute. */
export function inspectIndependentNpmConsumer(input: NpmConsumerInput): { packagePaths: string[]; inputPaths: string[]; archives: NpmArchiveSnapshot[] };
/** Requires an opaque, independently verified admission capability for every archive. */
export function assertIndependentNpmConsumer(input: NpmConsumerInput): { inputPaths: string[] };
/** Seeds a fresh isolated cache only from bytes bound to an admission capability. */
export function seedVerifiedNpmCache(input: { readonly lock: unknown; readonly archives: readonly NpmArchiveInput[]; readonly readArchive: (path: string) => Uint8Array; readonly cacheDir: string; readonly npmPath?: string; readonly admission?: NpmAdmissionInput }): Promise<void>;
