import type { WorkspaceArchiveCapability, WorkspacePnpmGraph } from './workspace-pnpm-admission.mjs';
import type { ArchiveAdmissionCapability, PnpmArchiveAdmissionCapability } from './archive-admission.mjs';
import type { InstalledPnpmConsumerReport } from './portable-pnpm-lock.mjs';

/** A provisional plan is not evidence of the host or its isolation. */
export interface PnpmPlatformDescription {
  readonly schema: 'aura3d.pnpm-platform-description/1';
  readonly platform: { readonly os: string; readonly cpu: string; readonly libc: string };
  readonly selected: readonly string[];
  readonly skipped: readonly { readonly id: string; readonly reason: 'platform-incompatible' | 'ancestor-incompatible' }[];
  readonly assumptions: { readonly include: 'all-importers-and-dependency-groups'; readonly engineStrict: false;
    readonly includeIncompatiblePackages: false; readonly initialSkipped: 'empty'; readonly supportedArchitectures: 'current' };
  readonly authority: string;
}
/**
 * Describes a conservative closure for an explicitly supplied platform tuple.
 * The tuple is not authenticated, and the result cannot authorize an install
 * or substitute for independently established runtime/OS isolation custody.
 */
export function describePnpmPlatformClosure(input: {
  readonly graph: WorkspacePnpmGraph;
  readonly platform: { readonly os: string; readonly cpu: string; readonly libc: string };
  readonly supportedArchitectures?: Partial<Record<'os' | 'cpu' | 'libc', readonly string[]>>;
}): PnpmPlatformDescription;

/** A report describes one checked snapshot. It is not an execution capability. */
export interface InstalledPnpmWorkspaceReport {
  readonly schema: 'aura3d.pnpm-installed-workspace/1';
  readonly sourceInputDigest: string;
  readonly lockfileSha256: string;
  readonly snapshotKeys: readonly string[];
  readonly importerCount: number;
  readonly fileCount: number;
  readonly bytes: number;
  readonly scope: string;
}
/** Conditional observation only, not proof that pnpm ran on this platform. */
export interface InstalledPnpmWorkspacePlatformReport {
  readonly schema: 'aura3d.pnpm-installed-workspace-platform/1';
  readonly sourceInputDigest: string;
  readonly lockfileSha256: string;
  readonly snapshotKeys: readonly string[];
  readonly omittedSnapshotKeys: readonly string[];
  readonly platform: { readonly os: string; readonly cpu: string; readonly libc: string };
  readonly importerCount: number;
  readonly fileCount: number;
  readonly bytes: number;
  readonly installationAuthorized: false;
  readonly scope: string;
}

/**
 * Requires the workspace verifier's opaque archive-custody capability. The
 * installed source must match the admitted staged-source manifest. All
 * supported importer and snapshot links, package bytes, executable modes and
 * the virtual-store lock are checked; undeclared node_modules directories are
 * refused. Flat peer/patch snapshot names must match the pnpm 11.1.3 virtual
 * store location; nested or hashed (>120-byte) names fail closed. A
 * source-bound, independently reviewed, no-mode-change patch is
 * checked against its original archive and exact authenticated output bytes.
 * A confined manifest-declared bin target may instead match the pinned
 * package manager's deterministic chmod and valid-UTF-8 CRLF shebang cleanup;
 * patches touching that target are not yet supported.
 * Each admitted deferred workspace bin's excluded output ancestor must be
 * absent under the installed root at the beginning and end of inspection,
 * including when it differs from the admitted source root. This is a
 * point-in-time condition, not proof that the output was always absent.
 * Generated pnpm metadata/bin files, omitted optional packages and unsupported
 * patch forms fail closed, even if their archives are platform-specific.
 * Callers must freeze
 * the process tree and revalidate before and after use: this point-in-time
 * report does not prove execution isolation. No package manager or installed
 * code is executed by this function.
 */
export function verifyInstalledPnpmWorkspace(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly capability: WorkspaceArchiveCapability;
  readonly installRoot: string;
}): InstalledPnpmWorkspaceReport;

/**
 * Conditional point-in-time report for positive-list OS/CPU/libc mismatches
 * on directly optional edges. Every archive (including omitted packages) is
 * still verified against the live admission. The observed tuple is from this
 * process, not authenticated proof of the pnpm process, command flags,
 * supported architectures or isolation; the result is never install or
 * execution authority. Unknown libc, negated/any/current constraints,
 * lifecycle failures and other unexplained omissions do not justify a skip.
 */
export function verifyInstalledPnpmWorkspaceForPlatform(input: {
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly capability: WorkspaceArchiveCapability;
  readonly installRoot: string;
}): InstalledPnpmWorkspacePlatformReport;

/** Neither an archive-bound nor an unbound tree observation authorizes execution. */
export interface InstalledNpmConsumerReport {
  readonly schema: 'aura3d.npm-installed-consumer/1';
  readonly archiveAdmissionBound: boolean;
  readonly packagePaths: readonly string[];
  readonly fileCount: number;
  readonly bytes: number;
  readonly installationAuthorized: false;
  readonly executionAuthorized: false;
  readonly scope: string;
  readonly manifestSha256?: string;
  readonly lockfileSha256?: string;
}

/**
 * Structural inspection of a complete npm tree. Supplied lock and archive
 * bytes are not authority; no missing optional package is excused. Every
 * supported .bin command is bound to the exact declared target.
 */
export function inspectInstalledNpmConsumer(input: {
  readonly projectDir: string;
  readonly lock: { readonly packages: Readonly<Record<string, unknown>> };
  readonly archives: readonly { readonly resolved: string; readonly bytes: Uint8Array }[];
}): InstalledNpmConsumerReport;

/**
 * Consume a genuine live npm admission before and after checking the exact
 * manifest, lock, local tarballs, complete installed graph and declared bins.
 * This remains a point-in-time observation, not installer-platform, network,
 * process-isolation or execution custody. Dynamic loopback lock resolutions
 * are refused until they can be bound to a sealed dispatcher authority.
 */
export function verifyInstalledNpmConsumer(input: {
  readonly projectDir: string;
  readonly admission: { readonly capability: ArchiveAdmissionCapability;
    readonly manifestBytes: Uint8Array; readonly lockBytes: Uint8Array };
}): InstalledNpmConsumerReport;

/**
 * Requires pnpm archive admission. Dynamic loopback registry metadata is not
 * admitted: the pure dispatcher does not yet provide sealed socket authority.
 * The resulting observation never establishes installer or network isolation.
 */
export function verifyInstalledPnpmConsumer(input: {
  readonly projectDir: string;
  readonly storeDir?: string;
  readonly admission: { readonly capability: PnpmArchiveAdmissionCapability;
    readonly manifestBytes: Uint8Array; readonly lockBytes: Uint8Array };
}): InstalledPnpmConsumerReport;
