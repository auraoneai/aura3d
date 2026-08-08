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
 * Documented in `docs/architecture/package-ownership.md`, whose tier table is checked against this
 * map by `pnpm check:package-graph`.
 */
export const PACKAGE_TIERS: Record<string, number> = {
  // 0 — foundation: no Aura3D dependencies at all.
  math: 0,
  physics: 0,
  scripting: 0,
  "asset-index": 0,
  // 1 — core data model.
  core: 1,
  scene: 1,
  // 2 — subsystems over the data model.
  animation: 2,
  rendering: 2,
  input: 2,
  audio: 2,
  ecs: 2,
  // 3 — subsystems that compose other subsystems.
  assets: 3,
  controls: 3,
  materials: 3,
  environments: 3,
  debug: 3,
  "editor-runtime": 3,
  // 4 — product surfaces.
  "product-studio": 4,
  apps: 4,
  workflows: 4,
  editor: 4,
  // 5 — aggregates. Nothing may depend on these except other aggregates.
  engine: 5,
  react: 6,
  "three-compat": 6,
  "aura3d-cli": 6,
  "create-aura3d": 6
};

/** Highest tier that may be imported from a package at `tier`. Lower number = lower layer. */
export function maxImportableTier(tier: number): number {
  return tier;
}
