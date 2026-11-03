import { packageTiers } from "./release/release-inventory.mjs";

/**
 * Canonical package tier assignment — the single source of truth for dependency direction.
 *
 * WS-3.6a established this layering and `tools/package-graph/index.ts` enforces it against the
 * measured dependency graph. WS-3.6b enforces the same layering at the import site via ESLint.
 *
 * Both consumers read this file. They must not carry their own copies: a lint rule that disagrees
 * with the graph gate is worse than no lint rule, because it makes one of the two gates lie.
 *
 * Dependencies point DOWN only. An edge from tier N to tier M where M > N is a layer violation.
 * Nothing may depend on tier 5 or 6 except tier 6.
 *
 * The tier numbers live in the one versioned package inventory
 * (`tools/release/release-inventory.mjs` `PACKAGE_INVENTORY`), which also drives release planning and
 * tarball target discovery; this module only projects it onto workspace directory names.
 *
 * Documented in `docs/architecture/package-ownership.md`, whose tier table is checked against this
 * map by `pnpm check:package-graph`.
 */
export const PACKAGE_TIERS: Record<string, number> = packageTiers();

/** Highest tier that may be imported from a package at `tier`. Lower number = lower layer. */
export function maxImportableTier(tier: number): number {
  return tier;
}
