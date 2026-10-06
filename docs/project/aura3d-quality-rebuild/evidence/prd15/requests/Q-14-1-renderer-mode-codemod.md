# Q-14-1: lane-14 `mode: "safe-basic"` hits — `renderer-mode` codemod report

**From:** lane 15 · **To:** lane 14 · **Filed:** 2026-10-06 · **SLA:** 2 working days

T4.5 removed `renderer.mode`/`renderer.fallback` (CCR-15-1): deprecated now,
`AuraMigrationError` under `A3D_QR_STRICT`, gone in 4.0.0. Replacement surface:
`renderer.quality` (C-27).

## Codemod report for your files

`aura3d codemod renderer-mode 'apps/showcase-pulse-tunnel/**' --write` rewrites
these automatically (each row `mapping: "exact"`, `target: renderer.quality`):

| File | Line | Change |
|---|---|---|
| apps/showcase-pulse-tunnel/art-review/pulse-combat-finish-v4-probe.ts | 50 | remove `mode` from `createAuraApp` renderer options |
| apps/showcase-pulse-tunnel/art-review/pulse-combat-finish-v4.ts | 112 | remove `mode` from `createAuraApp` renderer options |
| apps/showcase-pulse-tunnel/art-review/pulse-combat-kit-v2.ts | 61 | remove `mode` from `createAuraApp` renderer options |
| apps/showcase-pulse-tunnel/art-review/pulse-high-fidelity-v5-probe.ts | 55 | remove `mode` from `createAuraApp` renderer options |
| apps/showcase-pulse-tunnel/art-review/pulse-high-fidelity-v5.ts | 120 | remove `mode` from `createAuraApp` renderer options |
| apps/showcase-pulse-tunnel/art-review/pulse-structural-encounter-v3.ts | 155 | remove `mode` from `createAuraApp` renderer options |
| apps/showcase-pulse-tunnel/art-review/pulse-texture-identity-v6.ts | ~64 | remove `mode` from `createAuraApp` renderer options |

Each was `renderer: { mode: "safe-basic", qualityProfile: "safe-basic" }` — the
`qualityProfile` already carries the profile, so dropping `mode` keeps the
render identical.

## No action needed

`apps/showcase-*/scripts/write-route-health.mjs` (7 files) matched the grep but
are **diagnostic report payloads** (`renderer: { path, mode, nativeWebGPU }`
describing what ran), not `AuraCreateAppRendererOptions` — the codemod correctly
leaves them alone. The `mode` label there is your own field; keep or rename at
your discretion.

## Report-only

`AuraRendererMode`/`AuraRendererFallbackMode` type references (none in your
files) can't be rewritten mechanically — the codemod emits `mapping: "none"`
rows pointing at `renderer.quality`.
