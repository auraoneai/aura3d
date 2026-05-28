# Aura3D Bundle Sizes

Generated from `tests/reports/bundle-size.json` on 2026-05-28.

Measurement method: esbuild bundle, minify, gzip artifact, and `size-limit`
against the gzip artifact.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/engine agent API excluding lazy Three.js renderer chunk` | 36,389 | 12,899 | 80,000 | pass |
| `@aura3d/react adapter excluding React and core` | 2,097 | 948 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 710 | 20,000 | pass |
| `cinematic presets/effects helpers` | 45,894 | 12,681 | 45,000 | pass |
| `product-viewer starter app before user assets` | 756,363 | 201,404 | 250,000 | pass |
| `cinematic-scene starter app before user assets` | 757,015 | 201,614 | 250,000 | pass |
| `mini-game starter app before user assets` | 758,152 | 201,760 | 250,000 | pass |

The authoritative machine-readable report is
`tests/reports/bundle-size.json`.
