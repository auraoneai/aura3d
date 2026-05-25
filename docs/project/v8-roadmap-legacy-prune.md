# V8 Legacy Prune

> Historical note: This V8 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V8 keeps legacy cleanup explicit so old demos and screenshots do not return as current product evidence.

## Deleted Outside Quarantine

These paths must stay deleted outside `examples/_quarantine/`:

- `examples/product-configurator/`
- `examples/postprocess-lab/`
- `examples/shadow-lab/`
- `examples/portfolio/`
- `examples/architecture-viewer/`
- `examples/game-slice/`
- `examples/portfolio/screenshots/`

If any of these paths return outside quarantine, `tools/current-routes-legacy-prune/index.ts` fails.

## Quarantined Material

Quarantined examples live under `examples/_quarantine/`. They are historical source material, failed visual evidence, or regression references only.

They must not be linked from the root route registry as product examples. They must not be used as release, parity, replacement, or product-quality screenshots.

## Retained Historical Reports

Some older report directories may remain for historical comparison or regression context:

- `tests/reports/example-portfolio-screenshots/`
- `tests/reports/external-gallery/`
- `tests/reports/three-compat-gallery/`
- `tests/reports/production-runtime-gallery/`
- `tests/reports/v7/`

These are not current V8 approval evidence unless a new V8 report explicitly regenerates and validates equivalent output under `tests/reports/v8/`.

## Root Link Boundary

The root index can show internal or blocked status cards, but it must not link obsolete examples as working routes. `/apps/example-parity-lab/` remains internal until split or rebuilt into fast dedicated routes.

## Report

The generated report is `tests/reports/current-routes-legacy-prune.json`.

It lists:

- deleted paths
- quarantined paths
- retained historical artifacts
- blocked root links
- stale current-evidence references

The report must fail when old bad screenshots or obsolete routes are used as current V8 evidence.
