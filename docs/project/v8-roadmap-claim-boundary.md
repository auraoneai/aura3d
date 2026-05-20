# V8 Claim Boundary

> Historical note: This V8 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V8 exists to prevent reports and screenshots from outrunning the actual renderer product. This file defines what can and cannot be claimed.

## Claims Allowed With Passing Evidence

G3D can claim a capability only when the relevant route, test, and report pass.

Allowed examples:

- "This route loads and renders a named GLB with G3D WebGL2."
- "This route reached first visible frame under the route-health budget."
- "This screenshot passed V8 metric and human visual-review gates."
- "This named material feature has same-scene comparison evidence against Three.js."
- "This named animation route advances frames and updates runtime diagnostics."

Each claim must point to generated evidence, usually under `tests/reports/`.

## Claims Not Allowed Yet

Do not claim:

- G3D fully replaces Three.js.
- G3D fully exceeds Three.js.
- G3D supports every Three.js example.
- G3D supports every GLTF extension.
- G3D has full WebGPU parity.
- G3D is faster than Three.js generally.
- G3D replaces Unity or Unreal.
- Screenshots alone prove production quality.

Do not use old EngineReadiness-era galleries, static screenshot portfolios, or quarantined examples as current proof.

## Required Gates Before Saying "Exceeds Three.js"

Before any broad "exceeds Three.js" claim, all of the following must pass:

- root route index health
- no linked blank, stuck, or zero-draw-call route
- source-boundary scan proving G3D runtime packages do not import `three`
- same-scene product-viewer comparison
- at least three same-scene official Three.js example category comparisons
- V8 visual review with human notes
- legacy prune report
- completion audit

Even after those pass, claims must remain scoped to the proven categories.

## Evidence Hierarchy

Strongest evidence:

- browser route tests
- generated JSON reports
- source-boundary scans
- same-scene comparison outputs
- screenshots that pass visual-review metrics and human notes

Weak or invalid evidence:

- static legacy screenshots
- route names that imply quality
- docs without generated reports
- screenshots with missing notes
- outputs from Three.js mislabeled as G3D
- proof scenes that are blank, flat, tiny-subject, or debug-like
