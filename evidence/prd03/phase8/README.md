# PRD-03 Phase 8 — flag removal (GATED, not yet implementable)

## Status

`A3D_QR_POST` is `"dev"` in `packages/rendering/src/contracts/flags.state.ts` (custodian-owned;
lane 15 flips states only at §7 checkpoints). Phase 8 is legally blocked until the flag is
`default-on` for two consecutive checkpoints (CONTRACTS §5.4). The chain is:

`dev` → `standalone-accepted` (lane standalone acceptance S1–S20 green in lane CI) →
`integrated-accepted` (G-PANEL checkpoint) → `default-on` after two clean checkpoints →
Phase 8 deletion PR.

QR-03-22 (phase7/qr-requests.md) files the `standalone-accepted` ask with the instrument list.

## Work pre-mapped for when the gate opens (PRD-03 §Phase 8 verbatim)

Delete in one PR:
- legacy programs + `presentLdrPostprocess` in `packages/rendering/src/webgl2/LegacyPost.ts`
- `ensureBloomLutTextures`, `ensureOutlineBlendLutTexture`
- `postprocess/NativeLdrEffectLuts.ts`
- `resolveBloomPyramidResponseGain`
- CPU-readback branch of `renderer/PostprocessExecution.ts`
- `reference/` shims and the root re-export (`compat.post` deprecation → type error per §11)
- `compat.post` handling; slot `get()` ignores the flag; add `A3D_QR_POST` to
  `REMOVED_QR_FLAGS` **through lane 15** (custodian file)

File (already open or to open): Q-01-5 (ensure the `cpu-deterministic` golden path keeps its
frozen shaders), Q-15-3 and Q-15-4.

Exit criteria: bundle targets ≤ Phase-0 baselines; `subpixelBlend` and `ResponseGain` do not
appear in lane-03-owned paths.

## What landed before the gate (main, 2026-10-07)

Phases 0–7 all on main: #133, #174, #356, #359, #361, #362, #363, #364.
See `phase0..phase7/README.md` + `qr-requests.md` and CONTRACTS F-03-* rows for the record.
