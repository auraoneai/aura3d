# Aura3D Bundle Sizes

Generated from `tests/reports/bundle-size.json` on 2026-08-08.

Measurement method: esbuild bundle, minify, gzip artifact, and `size-limit`
against the gzip artifact.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/engine agent API excluding lazy Three.js renderer chunk` | 2,344,285 | 622,848 | 80,000 | fail |
| `@aura3d/react adapter excluding React and core` | 2,097 | 957 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 705 | 20,000 | pass |
| `cinematic presets/effects helpers` | 49,614 | 13,514 | 45,000 | pass |
| `product-viewer starter app before user assets` | 1,455,325 | 363,627 | 250,000 | fail |
| `cinematic-scene starter app before user assets` | 1,455,192 | 363,614 | 250,000 | fail |
| `mini-game starter app before user assets` | 1,495,993 | 381,403 | 250,000 | fail |

The authoritative machine-readable report is
`tests/reports/bundle-size.json`.

## Production Renderer Bridge Watch

Any PR that routes the public safe API through production rendering, skinned animation, PBR
material parity, shadows, postprocess, or WebGPU paths must regenerate this report and call out
the bundle delta explicitly. Do not hide renderer-capability work inside showcase patches
without a bundle-size review.

## Known Overrun

The `core-agent-api` target measures the compatibility-heavy root and remains far over its
historical 80,000 B absolute budget. WS-2.2 explicitly keeps that root intact for existing
consumers; new apps use `@aura3d/engine/lean`, `/lean-product`, or `/lean-game`. Those entries
pass the canonical Three.js-relative budgets in `tests/reports/bundle-scenarios.json`, including
a real GLB loader and the production physics solver. This report keeps the separate absolute
root/template debt visible. Do not raise either set of budgets to manufacture a pass.
