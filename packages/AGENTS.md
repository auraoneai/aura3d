# PACKAGES KNOWLEDGE BASE

**Scope:** `packages/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 18 - monorepo package boundary and export surface.

## OVERVIEW

Packages are the source-owned library layer. Distinguish root safe API,
production-runtime, rendering internals, CLI pipeline, and compatibility
packages before changing imports or claims.

## STRUCTURE

```text
packages/
|-- engine/          # public agent API, runtime, production/advanced bridges
|-- rendering/       # renderer internals and parity/runtime proof
|-- assets/          # loaders, browser asset runtime, asset corpus exports
|-- aura3d-cli/      # asset CLI and static source gates
|-- asset-index/     # catalog adapters and ranking
|-- create-aura3d/   # scaffold generator plus templates
|-- three-compat/    # migration/compatibility package
`-- */src/index.ts   # package export entry points
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Package aliases | `tsconfig.base.json` | Source path mapping for every package. |
| Build include set | `tsconfig.build.json` | Emits package source plus test/tool types. |
| Import boundary | `eslint.config.js` | Blocks cross-package deep imports. |
| Root package export | root `package.json` | Published `@aura3d/engine` export map. |

## CONVENTIONS

- Use package exports for cross-package imports. Relative imports are fine
  inside the owning package.
- Keep `src/index.ts` and package `exports` aligned when adding public symbols.
- Internal packages may use lower-level renderer or loader code, but public docs
  must label that capability correctly.
- Build output under any `dist/` folder is generated. Edit `src/`, tests, and
  package metadata instead.
- When a package owns a generated report shape, update the generator and tests;
  do not patch checked-in evidence JSON manually.

## ANTI-PATTERNS

- Do not import `@aura3d/*/src/*` across package boundaries.
- Do not add public exports without a test and docs/claim boundary review.
- Do not use renderer-internal success as evidence for root `createAuraApp`
  unless the root browser path is tested.
- Do not change generated declarations or built JS in `dist/` as source.

## VERIFY

For package changes start with `pnpm typecheck` plus the narrow package/unit
suite. For public surface changes also run the relevant browser or package
smoke command from root `package.json`.
