# V4 Release Notes

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Release date: 2026-05-14

V4 completes the local V4 product release gate for the supported `@aura3d/engine` SDK, pro app suite, scaffolder templates, visual gallery, external consumer build, and claim registry.

## Shipped

- Public app runtime through `createA3DApp`.
- Product, material, asset, scene, character, and interactive workflows.
- Four installable V4 templates: product viewer, material studio, asset gallery, and interactive scene.
- HDR, IBL, PBR material, shadows, postprocess, glTF corpus, performance, diagnostics, and screenshot evidence.
- Same-scene Three.js parity reports, including a large-scene performance comparison.
- Human visual review for flagship screenshots.

## Verification

- Full release command: `pnpm v4:release`
- Release report: `tests/reports/external-parity-release-readiness.json`
- Completion audit: `tests/reports/external-parity-completion-audit.json`

## Blocked Claims

Broad Three.js replacement, full Three.js API replacement, Unity replacement, Unreal replacement, full game-engine replacement, full glTF ecosystem parity, full WebGPU parity, broad performance superiority, and full commercial DCC pipeline parity remain blocked.

