# Aura3D Bundle Sizes

Generated from `tests/reports/bundle-size.json` on 2026-08-10.

Measurement method: esbuild ESM splitting, minify, statically reachable critical-path
chunks, conservative per-chunk gzip sum, and `size-limit` against the concatenated gzip members.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/engine/lean core primitive critical path` | 291,502 | 71,346 | 80,000 | pass |
| `@aura3d/engine compatibility root (informational, not the new-app entry)` | 997,361 | 232,105 | 80,000 | informational |
| `@aura3d/react adapter excluding React and core` | 2,097 | 948 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 710 | 20,000 | pass |
| `cinematic presets/effects helpers` | 49,614 | 13,578 | 45,000 | pass |
| `product-viewer starter app before user assets` | 980,203 | 227,015 | 250,000 | pass |
| `cinematic-scene starter app before user assets` | 980,203 | 227,015 | 250,000 | pass |
| `mini-game starter app before user assets` | 980,203 | 227,015 | 250,000 | pass |

The authoritative machine-readable report is
`tests/reports/bundle-size.json`.

## Production Renderer Bridge Watch

Any PR that routes the public safe API through production rendering, skinned animation, PBR
material parity, shadows, postprocess, or WebGPU paths must regenerate this report and call out
the bundle delta explicitly. Do not hide renderer-capability work inside showcase patches
without a bundle-size review.

## Known Overrun

The `compatibility-root-observation` target retains the compatibility-heavy root as an
informational measurement rather than pretending its bytes disappeared. WS-2.2 explicitly
keeps that root intact for existing consumers; the unchanged 80,000 B new-app budget applies
to `@aura3d/engine/lean`. New product and game apps use `/lean-product` or `/lean-game`. Those
entries pass the canonical Three.js-relative budgets in `tests/reports/bundle-scenarios.json`,
including a real GLB loader and the production physics solver. This report keeps the separate
root/template debt visible. Do not raise either set of budgets to manufacture a pass.
