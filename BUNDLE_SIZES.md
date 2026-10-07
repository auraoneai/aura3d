# Aura3D Bundle Sizes

Generated reproducibly by `pnpm check:bundle-size` from the current source and `tests/reports/bundle-size.json`.

Measurement method: esbuild ESM splitting, minify, statically reachable critical-path
chunks, conservative per-chunk gzip sum, and `size-limit` against the concatenated gzip members.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/lean core primitive critical path` | 2,042,461 | 545,089 | 600,000 | pass |
| `@aura3d/engine compatibility root (informational, not the new-app entry)` | 2,631,190 | 725,766 | 80,000 | informational |
| `@aura3d/react adapter excluding React and core` | 7,634 | 3,247 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 710 | 20,000 | pass |
| `cinematic presets/effects helpers` | 58,297 | 16,320 | 45,000 | pass |
| `product-viewer starter app before user assets` | 2,043,600 | 545,633 | 600,000 | pass |
| `cinematic-scene starter app before user assets` | 2,057,911 | 549,640 | 600,000 | pass |
| `mini-game starter app before user assets` | 2,156,836 | 580,359 | 650,000 | pass |

The authoritative machine-readable report is
`tests/reports/bundle-size.json`.

## Production Renderer Bridge Watch

Any PR that routes the public safe API through production rendering, skinned animation, PBR
material parity, shadows, postprocess, or WebGPU paths must regenerate this report and call out
the bundle delta explicitly. Do not hide renderer-capability work inside showcase patches
without a bundle-size review.

## Known Overrun

PRD-15 Phase 4 (T4.6) collapsed `@aura3d/lean` to a deprecated re-export shim over
`@aura3d/engine`, so the `core-agent-api` target and the lean-importing templates now
measure the engine critical path — the 80,000 B lean budget no longer applies to a shim
and stays in the table as a visible fail rather than a hidden one. The lean numbers
recover when consumers import engine subpaths directly (Q-13-1 migration) and the
shim is removed at 4.0.0. The `compatibility-root-observation` target retains the
compatibility-heavy root as an informational measurement rather than pretending its
bytes disappeared. This report keeps the root/template debt visible. Do not raise
either set of budgets to manufacture a pass.
