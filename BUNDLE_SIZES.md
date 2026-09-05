# Aura3D Bundle Sizes

Generated reproducibly by `pnpm check:bundle-size` from the current source and `tests/reports/bundle-size.json`.

Measurement method: esbuild ESM splitting, minify, statically reachable critical-path
chunks, conservative per-chunk gzip sum, and `size-limit` against the concatenated gzip members.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/lean core primitive critical path` | 323,034 | 78,068 | 80,000 | pass |
| `@aura3d/engine compatibility root (informational, not the new-app entry)` | 2,105,816 | 560,786 | 80,000 | informational |
| `@aura3d/react adapter excluding React and core` | 7,634 | 3,260 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 705 | 20,000 | pass |
| `cinematic presets/effects helpers` | 50,869 | 13,787 | 45,000 | pass |
| `product-viewer starter app before user assets` | 898,316 | 202,839 | 250,000 | pass |
| `cinematic-scene starter app before user assets` | 1,525,773 | 384,326 | 400,000 | pass |
| `mini-game starter app before user assets` | 915,297 | 208,902 | 250,000 | pass |

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
to `@aura3d/lean`. New product and game apps use `@aura3d/lean/product` or `@aura3d/lean/game`. Those
entries pass the canonical Three.js-relative budgets in `tests/reports/bundle-scenarios.json`,
including a real GLB loader and the solver-free deterministic arcade runtime. Physical simulation
remains an explicit optional-package workload rather than entering the game starter critical path.
This report keeps the separate
root/template debt visible. Do not raise either set of budgets to manufacture a pass.
