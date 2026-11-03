import type { WorkspaceArchiveCapability } from './workspace-pnpm-admission.mjs';

export interface ConditionalPnpmPlatform {
  readonly os: string;
  readonly cpu: string;
  /** `unknown` is allowed only when no included or directly omitted decision depends on libc. */
  readonly libc: string;
}

export interface ConditionalPnpmEdge {
  readonly ownerKind: 'importer' | 'snapshot';
  readonly owner: string;
  readonly name: string;
  readonly group: 'dependencies' | 'devDependencies' | 'optionalDependencies';
  readonly targetKind: 'workspace' | 'snapshot';
  readonly target: string;
}

export interface ConditionalPnpmOmittedEdge extends ConditionalPnpmEdge {
  readonly reason: 'platform-mismatch' | 'ancestor-omitted';
}

export interface ConditionalPnpmPlatformPlan {
  readonly schema: 'aura3d.pnpm-conditional-platform-plan/1';
  readonly sourceInputDigest: string;
  readonly sourceManifestSha256: string;
  readonly lockfileSha256: string;
  readonly workspaceSha256: string;
  readonly platform: ConditionalPnpmPlatform;
  /** All admitted archives are retained, including those whose snapshots are conditionally omitted. */
  readonly admittedArchives: readonly string[];
  readonly selectedSnapshots: readonly string[];
  readonly omittedSnapshots: readonly { readonly id: string; readonly reason: 'platform-mismatch' | 'ancestor-omitted';
    readonly mismatches: readonly ('os' | 'cpu' | 'libc')[] }[];
  readonly includedEdges: readonly ConditionalPnpmEdge[];
  readonly omittedEdges: readonly ConditionalPnpmOmittedEdge[];
  readonly assumptions: readonly string[];
  readonly authority: string;
}

/**
 * Consume and revalidate a genuine workspace-admission capability, then model
 * a caller-declared platform using a deliberately limited graph subset. The
 * model rejects unresolved or transitive peers, parenthesized peer or patch
 * bindings, patches, engine constraints on considered snapshots, negated/any
 * platform lists, ambiguous mixed-path reachability and unsupported inputs.
 * It does not infer host identity, prove pnpm behavior, inspect an installed
 * tree, or authorize an install or execution. The strict installed-tree
 * verifier does not consume this plan.
 */
export function planConditionalPnpmPlatform(input: {
  readonly capability: WorkspaceArchiveCapability;
  readonly root: string;
  readonly sourceManifestPath: string;
  readonly platform: ConditionalPnpmPlatform;
}): ConditionalPnpmPlatformPlan;
