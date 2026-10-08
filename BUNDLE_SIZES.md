# Aura3D Bundle Sizes

Generated reproducibly by `pnpm check:bundle-size` from the current source and `tests/reports/bundle-size.json`.

Measurement method: esbuild ESM splitting, minify, statically reachable critical-path
chunks, conservative per-chunk gzip sum, and `size-limit` against the concatenated gzip members.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |
|---|---:|---:|---:|---:|
| `@aura3d/engine "." core primitive critical path` | 3,154,095 | 891,076 | 920,000 | pass |
| `@aura3d/engine compatibility root (informational, not the new-app entry)` | 3,304,094 | 935,914 | 80,000 | informational |
| `@aura3d/react adapter excluding React and core` | 7,639 | 3,249 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 710 | 20,000 | pass |
| `cinematic presets/effects helpers` | 82,265 | 23,145 | 45,000 | pass |
| `product-viewer starter app before user assets` | 2,664,508 | 739,704 | 780,000 | pass |
| `cinematic-scene starter app before user assets` | 2,692,182 | 746,290 | 790,000 | pass |
| `mini-game starter app before user assets` | 2,876,437 | 809,347 | 850,000 | pass |

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
