# Aura3D Bundle Sizes

**Historical measurement, not a result for the current candidate.** The table
below was last committed in `3bce07cb79d11c3630672e997db27f03aa1a55f2` on
2026-10-22. It must not be used to assert the size or outcome of later source
changes. Run `pnpm check:bundle-size` in the approved remote source job against
the staged candidate to regenerate this report and
`tests/reports/bundle-size.json`; retain the staged-source and candidate hashes
with the job output. No candidate measurement has been made in this phase yet.

Measurement method: esbuild ESM splitting, minify, statically reachable critical-path
chunks, conservative per-chunk gzip sum, and `size-limit` against the concatenated gzip members.

| Target | JavaScript Bytes | Gzip Bytes | Budget | Historical result |
|---|---:|---:|---:|---:|
| `@aura3d/engine "." core primitive critical path` | 3,924,895 | 1,141,998 | 190,000 | fail |
| `@aura3d/engine compatibility root (informational, not the new-app entry)` | 3,988,384 | 1,157,256 | 80,000 | informational |
| `@aura3d/react adapter excluding React and core` | 7,639 | 3,261 | 15,000 | pass |
| `opt-in devtools exports` | 1,297 | 705 | 20,000 | pass |
| `cinematic presets/effects helpers` | 86,257 | 23,920 | 45,000 | pass |
| `product-viewer starter app before user assets` | 3,412,922 | 983,874 | 250,000 | fail |
| `cinematic-scene starter app before user assets` | 3,440,025 | 990,264 | 400,000 | fail |
| `mini-game starter app before user assets` | 3,653,610 | 1,063,602 | 480,000 | fail |

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
