# Aura3D Bundle Sizes

Generated from `tests/reports/bundle-size.json` on 2026-05-28.

Measurement method: esbuild bundle, minify, gzip artifact, and `size-limit`
against the gzip artifact.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/engine` agent API | 12,855 | 5,008 | 80,000 | pass |
| `@aura3d/react` adapter excluding React and core | 2,097 | 948 | 15,000 | pass |
| Opt-in devtools exports | 1,297 | 710 | 20,000 | pass |
| Cinematic presets/effects helpers | 45,894 | 12,681 | 45,000 | pass |
| `product-viewer` starter before user assets | 11,867 | 4,777 | 250,000 | pass |
| `cinematic-scene` starter before user assets | 12,366 | 4,951 | 250,000 | pass |
| `mini-game` starter before user assets | 11,839 | 4,707 | 250,000 | pass |

The authoritative machine-readable report is
`tests/reports/bundle-size.json`.
