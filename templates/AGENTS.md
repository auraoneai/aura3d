# ROOT TEMPLATE KNOWLEDGE BASE

**Scope:** `templates/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 15 - root package template surface.

## OVERVIEW

Top-level templates are shipped or referenced as public starter material. Treat
them like product examples: safe API, typed assets, honest README copy, and
browser evidence for visible behavior.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Public starters | `product-viewer/`, `cinematic-scene/`, `mini-game/` | Included in root package files. |
| Game starters | `racing-starter/`, `falling-blocks-starter/`, `game-slice/` | Input/progression proof required. |
| Production-labeled templates | `production-*` | Claims need matching evidence; do not infer from name. |
| Migration templates | `three-compat-*`, `external-parity-*` | Compatibility scope only. |
| Framework templates | `react/`, `vue/`, `svelte/`, `vite-vanilla/` | Keep framework setup minimal and current. |

## CONVENTIONS

- Keep overlapping names aligned with `packages/create-aura3d/templates/`.
- Use typed asset references and public `@aura3d/engine` imports.
- README/package scripts should work when the folder is copied out of the repo.
- For production-labeled folders, verify the evidence before preserving the
  label in docs or final answers.
- Framework templates should not import internal package source to make local
  repo aliases work.

## ANTI-PATTERNS

- Do not hand-edit copied `node_modules`, `dist`, `test-results`, or generated
  screenshots as template source.
- Do not add raw GLB URLs or string model IDs for convenience.
- Do not claim production renderer or game-kit behavior from a template-only
  scaffold.
- Do not use DOM/CSS to fake Aura3D visuals.

## VERIFY

Use the template-local script if present, then the root `test:templates` or
template smoke route checks.
