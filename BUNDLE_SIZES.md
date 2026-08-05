# Aura3D Bundle Sizes

Generated from `tests/reports/bundle-size.json` on 2026-08-05.

Measurement method: esbuild bundle, minify, gzip artifact, and `size-limit`
against the gzip artifact.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/engine agent API excluding lazy Three.js renderer chunk` | 2,190,228 | 583,132 | 80,000 | fail |
| `@aura3d/react adapter excluding React and core` | 2,097 | 948 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 710 | 20,000 | pass |
| `cinematic presets/effects helpers` | 49,614 | 13,582 | 45,000 | pass |
| `product-viewer starter app before user assets` | 1,439,492 | 359,304 | 250,000 | fail |
| `cinematic-scene starter app before user assets` | 1,439,359 | 359,294 | 250,000 | fail |
| `mini-game starter app before user assets` | 1,479,934 | 377,342 | 250,000 | fail |

The authoritative machine-readable report is
`tests/reports/bundle-size.json`.

## Production Renderer Bridge Watch

Any PR that routes the public safe API through production rendering, skinned animation, PBR
material parity, shadows, postprocess, or WebGPU paths must regenerate this report and call out
the bundle delta explicitly. Do not hide renderer-capability work inside showcase patches
without a bundle-size review.

## Known Overrun

The `core-agent-api` target is far over budget and has been since before 1.5.2 (measured:
567,890 B gzip at `v1.5.2` against an 80,000 B budget, 7.10x). The likely cause is that
`packages/engine/src/agent-api/index.ts` re-exports the entire surface — including Node-only
encoders and video tooling — from one module, so nothing tree-shakes. Splitting that surface is
its own workstream. Do not resolve this by raising the budget: the budget is the only artifact
recording what a browser consumer actually downloads.
