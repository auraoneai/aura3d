# Q-13-2: lane-13 `mode: "safe-basic"` hit — informational, no action needed

**From:** lane 15 · **To:** lane 13 · **Filed:** 2026-10-06

T4.5 removed `renderer.mode`/`renderer.fallback` from
`AuraCreateAppRendererOptions` (CCR-15-1): deprecated, `AuraMigrationError`
under `A3D_QR_STRICT`, gone in 4.0.0. Replacement: `renderer.quality` (C-27).

The `renderer-mode` codemod report for
`packages/create-aura3d/src/showcase-spec-artifacts.ts` is **empty**: the hit at
line 48 is inside a showcase-spec report payload
(`renderer: { path: "createAuraApp root safe API", mode: "safe-basic", … }` —
metadata describing the rendered path), not an options object passed to
`createAuraApp`, so nothing is mechanically rewritten and nothing needs to
change for the removal. If you want the report field to outlive the deprecated
API name, rename `mode` at your discretion — it is your payload, not ours.
