# BROWSER TEST KNOWLEDGE BASE

**Scope:** `tests/browser/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 20 - highest browser evidence concentration.

## OVERVIEW

Browser tests are the proof surface for routes, screenshots, visual behavior,
runtime mutation, and public claims. They must drive a real page, not just
inspect source.

## WHERE TO LOOK

| Task | Pattern | Notes |
| --- | --- | --- |
| Route health | `current-routes-*`, `*-route-health.spec.ts` | Ready state, draw calls, canvas, screenshots, no console/page errors. |
| Runtime/game proof | `game-runtime-*`, `fighting-game-*`, `keyboard-*` | Input must change state visibly. |
| Rendering proof | `production-runtime-*`, `runtime-parity-*`, `webgpu-*`, `external-parity-*` | Pixel/diagnostic evidence required. |
| Template proof | `templates-*`, template harness specs | Scaffold routes and screenshot contracts. |
| Harness pages | `*-harness.html`, `*-harness.ts` | Keep test-only setup isolated here. |

## CONVENTIONS

- Start the dev server through the shared helper when available; avoid bespoke
  server setup unless the scenario needs it.
- Capture page console, page errors, failed responses, canvas state, and
  screenshots for route-health style tests.
- Pixel checks should verify nonblank/nonblack content or claim-specific visual
  change, not only file existence.
- Gameplay tests should press keys and assert state, score/fail/progression,
  reset, or movement.
- Keep screenshots deterministic enough for CI: fixed viewport, stable route,
  and explicit ready condition.

## ANTI-PATTERNS

- Do not accept DOM text or CSS animation as renderer evidence.
- Do not hide browser errors to pass a screenshot assertion.
- Do not make a WebGPU/postprocess/skinning/morph claim pass without backend,
  diagnostic, and pixel evidence for that exact claim.
- Do not write tests that depend on local absolute paths or untracked assets.

## VERIFY

Run the focused Playwright spec first. For route/public changes, finish with the
matching grouped script such as `pnpm test:browser`, `pnpm advanced-gallery`, or
the feature-specific readiness command.
