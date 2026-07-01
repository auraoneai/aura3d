# ASSETS PACKAGE KNOWLEDGE BASE

**Scope:** `packages/assets/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 15 - asset runtime and loader boundary.

## OVERVIEW

This package owns asset loading/runtime support. Public apps still consume
typed assets through `@aura3d/engine` and generated `aura-assets.ts`; loader
internals here do not authorize direct loaders in examples.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Package API | `src/index.ts`, `src/browser-index.ts` | Node/browser export split. |
| Loaders/resources | `src/loaders/`, `src/GLTFLoader.ts`, `src/GLTFRenderResources.ts` | Internal loader implementation. |
| Asset corpus | `src/asset-corpus/`, `src/advanced-gallery/` | Catalog/gallery support. |
| Tests | `packages/assets/tests/`, `tests/assets/` | Runtime, GLTF, animation, provenance checks. |

## CONVENTIONS

- It is valid for this package to implement GLTF loading; it is not valid for
  public examples to instantiate loaders directly.
- Preserve browser/Node entry separation when adding APIs.
- Keep asset metadata durable: source page, download URL when available,
  license, author, hash, bounds, clips, skeleton, morph targets, and thumbnail.
- Temporary local paths are not release provenance unless marked local-only and
  excluded from public claims.
- When generated typed asset behavior changes, update CLI, manifest tests, and
  docs together.

## ANTI-PATTERNS

- Do not leak loader classes into safe example snippets.
- Do not accept raw URL shortcuts to bypass provenance in public workflows.
- Do not treat downloaded GLB files as enough; the manifest and typed key are
  part of the contract.
- Do not edit generated public asset blobs as a substitute for rerunning CLI
  add/resolve.

## VERIFY

Use `pnpm test:packages`, targeted `tests/assets` suites, and any CLI asset
provenance gate relevant to the changed behavior.
