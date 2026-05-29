# Aura3D Bundle Sizes

Generated from `tests/reports/bundle-size.json` on 2026-05-29.

Measurement method: esbuild bundle, minify, gzip artifact, and `size-limit`
against the gzip artifact.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/engine agent API excluding lazy Three.js renderer chunk` | 52,637 | 17,372 | 80,000 | pass |
| `@aura3d/react adapter excluding React and core` | 2,097 | 948 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 710 | 20,000 | pass |
| `cinematic presets/effects helpers` | 45,894 | 12,681 | 45,000 | pass |
| `product-viewer starter app before user assets` | 771,679 | 205,689 | 250,000 | pass |
| `cinematic-scene starter app before user assets` | 771,807 | 205,762 | 250,000 | pass |
| `mini-game starter app before user assets` | 771,812 | 205,764 | 250,000 | pass |

The authoritative machine-readable report is
`tests/reports/bundle-size.json`.
