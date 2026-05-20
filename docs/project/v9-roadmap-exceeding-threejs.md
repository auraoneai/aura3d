# V9 Exceeding Three.js

V9 does not currently exceed Three.js broadly. The current reports allow scoped developer-experience advantages only.

## Scoped Advantages That Are Real

### Workflow Defaults

G3D exposes workflow and renderer wrappers that can reduce setup for supported paths:

- `@galileo3d/engine/v9` provides `G3DRenderer`, `G3DScene`, and `G3DAppLifecycle`.
- `@galileo3d/workflows` and `packages/workflows/src/v6/*` provide higher-level product, asset, material, cinematic, and architecture workflow structure.
- `apps/v9-public-scene/` demonstrates public V9 imports rather than private app-only helpers.

Allowed claim: for supported G3D workflows, setup can be more structured than hand-wiring raw Three.js scene/camera/renderer/loop/disposal code.

### Diagnostics And Claims

V9 has structured reports and claim gates:

- `tests/reports/v9/api-surface.json`
- `tests/reports/v9/claim-registry.json`
- `tests/reports/v9/route-health.json`
- `tests/reports/v9/runtime-import-audit.json`
- `tests/reports/v9/package-smoke.json`
- `tests/reports/v9/external-consumer.json`

Allowed claim: G3D has stronger built-in claim discipline and machine-readable evidence for the scoped parity surface.

### Package Surface

The root package exports focused subpaths including `./math`, `./scene`, `./rendering`, `./controls`, `./assets`, `./animation`, `./input`, `./workflows`, `./three-compat`, `./debug`, `./rendering/v9`, `./assets/v9`, and `./v9`.

Allowed claim: G3D has an auditable package surface for its supported modules.

## Claims Still Blocked

- Overall render quality superiority.
- Overall performance superiority.
- Full example parity.
- WebGPU superiority.
- WebXR production readiness.
- Ecosystem maturity comparable to Three.js.

## GTM Interpretation

The credible positioning is not "Three.js is obsolete." The credible positioning is:

> G3D is an evidence-driven TypeScript 3D engine with a growing Three.js parity suite, stronger diagnostics, scoped workflow APIs, and explicit claim gates.

Use this as a developer preview / parity-program narrative until the 24 partial inventory items are closed and visual quality consistently matches or beats Three.js.
