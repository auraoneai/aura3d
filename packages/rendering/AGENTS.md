# RENDERING PACKAGE KNOWLEDGE BASE

**Scope:** `packages/rendering/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 19 - largest editable package, renderer internals.

## OVERVIEW

This is the renderer/internal proof layer. It may legitimately contain
low-level rendering and compatibility code, but those results are not automatic
root `createAuraApp` claims.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Renderer core | `src/Renderer.ts`, `src/ForwardPass.ts` | Draw path and diagnostics. |
| Production runtime | `src/production-runtime/` | WebGL/WebGPU proof and runtime labels. |
| Advanced runtime | `src/advanced-runtime/` | Advanced/internal capabilities. |
| Effects/postprocess | `src/effects/`, `src/threejs-compatibility/postprocess/` | Pixel-backed claims required. |
| Morph/skinning | `src/MorphTarget.ts`, related tests | Do not claim root support without browser proof. |
| Parity helpers | `src/threejs-compatibility/` | Migration/comparison scope, not public-safe example scope. |

## CONVENTIONS

- Renderer internals can discuss `rendering` or `production-runtime` labels;
  public docs must not collapse them into root safe API support.
- Every visual feature needs a test that checks pixels, diagnostics, or both.
- Keep diagnostic summaries honest: fallback, mock, canvas2d, and zero draw-call
  states must remain visible in reports.
- Compatibility with Three.js belongs in `threejs-compatibility` and docs must
  label it as migration/parity work.
- Do not patch built output in `dist/rendering`; edit `src/` and tests.

## ANTI-PATTERNS

- Do not use a renderer-internal demo as public `createAuraApp` evidence.
- Do not hide fallbacks or missing features to make a route look production.
- Do not replace pixel checks with DOM-only assertions.
- Do not describe WebGPU, PBR parity, postprocess, skinned animation, or morph
  targets as public root features unless root-only browser tests prove them.

## VERIFY

Run the focused renderer unit tests under `tests/unit/rendering`, then the
feature browser spec or readiness command named in root `package.json`.
