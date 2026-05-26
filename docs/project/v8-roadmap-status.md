# V8 Status

> Historical note: This V8 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Historical status: superseded by V9.

V8 is retained as historical planning and evidence context. Its original completion rule required route-health, animation, Three.js comparison, visual-review, legacy-prune, and completion-audit reports to pass from code-generated evidence. Current V9 docs now own the active Three.js parity inventory, code backlog, and claim boundary.

## Working Route Evidence

The current route index is expected to read `tests/reports/current-routes-route-health.json` and expose only routes that passed route health as clickable working routes.

Current known V8 route-health evidence includes:

- `/apps/regression-animation-keyframes/`
- `/apps/character-viewer/`
- `/apps/animation-keyframes/`
- `/apps/skinning-blending/`
- `/apps/skinning-additive/`
- `/apps/skinning-ik/`
- `/apps/skinning-morph/`
- `/apps/animation-multiple/`
- `/apps/animation-walk/`
- `/apps/decals/`
- `/apps/stereo-effects/`
- `/apps/physics-showcase/`

These routes remain only conditionally working. They must keep passing `tools/current-routes-route-health/index.ts`; any route that becomes slow, blank, stuck loading, or zero-draw-call must be removed from the working set or fixed.

## Slow Or Blocked Routes

- `/apps/example-parity-lab/` is an internal stress lab, not a working product route.
- Any route with `readyTimeMs > 5000` in route-health output is slow for V8 purposes.
- Any route that reports `running` while still at zero frames or zero draw calls is blocked.
- `examples/physics-sandbox/` can remain a debug sandbox, but it is not V8 visual proof.

## Visual Quality Gaps

V8 rejects screenshots that are technically nonblank but still fail the product bar. The visual-review tool checks:

- file size and dimensions
- non-black coverage
- foreground and centered subject coverage
- foreground bounds coverage
- detail edge density
- local contrast
- unique color bucket count
- debug-like or placeholder path names
- required human review notes

The required report is `tests/reports/current-routes-visual-review.json`. A missing `tests/reports/current-routes-visual-review-notes.json` is a failure, because flagship screenshots need written human review notes in addition to metrics.

## Three.js Parity Gaps

Three.js is the competitor baseline, not a runtime dependency for A3D product paths. V8 can claim route-level comparison only for scenes that have same-asset, same-environment, same-camera comparison output and explicit deltas.

Blocked claims:

- global Three.js replacement
- full Three.js API parity
- full Three.js examples parity
- performance superiority
- full WebGPU parity
- full glTF extension coverage
- Unity or Unreal replacement

## Required Reports

The following reports are required before completion:

- `tests/reports/current-routes-route-health.json`
- `tests/reports/v8-animation-examples.json`
- `tests/reports/current-routes-threejs-parity.json`
- `tests/reports/current-routes-visual-review.json`
- `tests/reports/current-routes-legacy-prune.json`
- `tests/reports/current-routes-completion-audit.json`

Missing reports mean V8 is incomplete.
