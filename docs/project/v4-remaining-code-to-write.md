# V4 Remaining Code To Write

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This document is reset for the engine-readiness direction. It is not a parity backlog.

## Done In The Engine Readiness Path

- Quarantined failed flagship examples under `examples/_quarantine/`.
- Replaced the public example index with the rebuilt V1 example set.
- Added canonical product scene fixture: `fixtures/engine-readiness/canonical-product-scene.json`.
- Added canonical renderer fixture: `packages/rendering/src/CanonicalSceneFixtures.ts`.
- Added asset-to-render APIs: `loadRenderableAsset`, `createRenderableScene`, and `AssetRenderDefaults`.
- Added lighting defaults for the engine-readiness SDK path.
- Added canonical browser screenshot test and manifest.
- Added engine-readiness visual-quality, truth, glTF-support, examples, package-smoke, and root-readiness tools.

## Remaining Future Work

- Run the package-smoke screenshot inside the temporary package app instead of reusing the canonical screenshot after package import/build smoke.
- Expand `tools/engine-readiness-gltf-support` so every matrix row is derived from machine-readable test reports instead of the current test-ownership map.
- Replace the old quarantined examples only when each one is rebuilt on the canonical SDK APIs and passes a clean screenshot gate.
- Add same-scene Three.js comparison only after the supported SDK workflows are stable.

## Active Gates

```sh
pnpm engine-readiness:root
pnpm engine-readiness:assets
pnpm engine-readiness:examples
pnpm engine-readiness:package-smoke
```

No broad parity or replacement claim is allowed while these gates are the only current evidence.
