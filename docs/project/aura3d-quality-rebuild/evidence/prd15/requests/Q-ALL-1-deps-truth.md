# Q-ALL-1 — deps-truth residual findings on non-lane-15 manifests

**Filed by:** Lane 15 (PRD-15 T6.11)
**Status:** request — lane 15 does not edit foreign manifests
**PRD refs:** T6.11 (line 1730), research/13 §9 "Declared vs actual dependencies".

## What this is

New arch gate `deps-truth` (`tools/arch-gates/rules/depsTruth.ts`, wired in
`tools/arch-gates/index.ts`) compares each package manifest's declared workspace
dependencies against the `src/` import graph — `@aura3d/*` specifiers resolved
through the generated tsconfig paths map, plus cross-package relative escapes.
`@aura3d/engine` (the root product package) counts as satisfying a dep on
`packages/engine`.

- **15-owned manifests: fail mode** — root `package.json` and the 17 lane-15
  `packages/*/package.json` are enforced; this phase fixed every finding (see
  `phase6-honest-packages.md`).
- **Foreign manifests: report mode** — remaining findings below, with the
  suggested per-package diffs. Manifest owners apply (or reject) them.

## Residual findings (3)

### `packages/animation` (lane 06) — unused-dependency

`src/` never imports `@aura3d/math`.

```diff
   "dependencies": {
-    "@aura3d/math": "workspace:*",
     ...
   }
```

### `packages/aura3d-cli` (lane 05) — missing-dependency

`src/` imports `@aura3d/rendering` (`import type { AuraQualityTier } from
"@aura3d/rendering/contracts"`, e.g. `src/contracts/assetManifest.ts`) but the
manifest declares only `@aura3d/asset-index`.

```diff
   "dependencies": {
     "@aura3d/asset-index": "workspace:*",
+    "@aura3d/rendering": "workspace:*"
   }
```

### `packages/game` (lane 09) — unused-dependency

`src/` never imports `@aura3d/rendering`.

```diff
   "dependencies": {
-    "@aura3d/rendering": "workspace:*",
     ...
   }
```

## Methodology / caveats

- Specifier scan is statement-position only (line-start/`;`-anchored
  `import`/`export … from`, `import("…")`, `require("…")`); block comments and
  full-line `//` comments are stripped first so JSDoc examples and codemod
  payload strings do not count as usage.
- `src/` scope only — test-only usage outside `src/` is intentionally treated
  as devDependency territory.
- The gate emits `missing-dependency`, `unused-dependency`, and
  `unknown-dependency` (dep name resolves to no workspace package).
