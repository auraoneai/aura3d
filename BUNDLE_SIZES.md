# Aura3D Bundle Sizes

Generated from `tests/reports/bundle-size.json` on 2026-05-29.

Measurement method: esbuild bundle, minify, gzip artifact, and `size-limit`
against the gzip artifact.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/engine agent API excluding lazy Three.js renderer chunk` | 57,788 | 19,112 | 80,000 | pass |
| `@aura3d/react adapter excluding React and core` | 2,097 | 948 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 710 | 20,000 | pass |
| `cinematic presets/effects helpers` | 47,215 | 13,064 | 45,000 | pass |
| `product-viewer starter app before user assets` | 776,813 | 207,450 | 250,000 | pass |
| `cinematic-scene starter app before user assets` | 776,941 | 207,521 | 250,000 | pass |
| `mini-game starter app before user assets` | 776,946 | 207,521 | 250,000 | pass |

The authoritative machine-readable report is
`tests/reports/bundle-size.json`.
