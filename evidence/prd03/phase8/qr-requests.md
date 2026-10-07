# PRD-03 Phase 8 — qr-requests (cross-lane asks)

| id | to | ask | status |
|----|----|-----|--------|
| QR-03-22 (from P7) | lane 15/custodian | `A3D_QR_POST` `dev` → `standalone-accepted` from the checkpoint record — see `phase7/qr-requests.md` for the instrument list. | filed |
| Q-01-5 (PRD named) | lane 01 | Preserve the `cpu-deterministic` golden path's frozen shader programs when lane-03 deletes the legacy `presentLdrPostprocess`/LDR luts in the flag-removal PR — those exports are consumed by `postprocess.execution:"cpu-deterministic"` (`reference/` path must keep compiling). | open |
| Q-15-3 (PRD named) | lane 15 | Phase-8 removal PR needs custodian sign-off on `REMOVED_QR_FLAGS` + `flags.state.ts` edit and on deleting `postprocess/NativeLdrEffectLuts.ts` (shared root surface). | open |
| Q-15-4 (PRD named) | lane 15 | Dropping the root `@aura3d/rendering` re-exports of the moved CPU post exports (the `reference/` shims) is Q-15-4's decision — §11 lists it as the deprecate-then-remove item. | open |
