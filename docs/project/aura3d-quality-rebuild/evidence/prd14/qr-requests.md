# Lane 14 qr-request ledger (P-64)

Issues filed by the lane-14 finish agent. Each entry records what lane 14
needs, the owning lane, and current status.

| Issue | To | Need | Status |
|-------|----|------|--------|
| #621 | prd01 | `tests/unit/contracts/impl/prd01-render-targets.test.ts` red on main: `Missing cube texture face: px` (2 tests). Lane-14 unit job scoped away; fix belongs to lane 01. | open |
| #622 | prd03 | `tests/unit/contracts/impl/prd03-post-cube-lut.test.ts` red on main: `ENOENT tests/qr/prd03/fixtures/luts/teal-orange-33.cube` — fixture missing from repo. | open |
| #623 | prd12 | `tests/unit/contracts/impl/prd12-registry.test.ts` red on main: `prd05-optimized-damaged-helmet` C-30 owner recorded as `prd05`, test expects `prd12`. | open |
| #624 | prd13 | `tests/unit/contracts/impl/prd13-looks.test.ts` red on main: `look/evidence-only-feel` leaks into lazy defaults; `LOOK_RULE_DUPLICATE:look/ambient-flattens` on re-register. | open |
| #625 | prd15 | `flags.ts:55-60` `applyList` drops `all` inside comma lists — `route_<id>,all` resolves to only the route flag. Blocks per-game all-flags URL capture (T0-29). | open |
| #626 | prd12 | `capture-games.mjs:97` unions per-game `qrFlags` into every URL including `--flags none` — flag-off baseline captures are never truly flag-off (S1/IC-0). | open |
| #638 | prd15 | `tests/unit/engine/route-cue-maps.test.ts` (lane-15 file) reads audio modules at pre-T1.x `src/` paths. Shims restored (#637); the pulse-tunnel `cueEntries` textual scan still needs the repoint to `src/legacy/tunnel-audio.ts`. | open |
| #710 | prd15 | `tests/browser/*` specs still drive deleted review globals (`__AURA3D_BLOCKFALL_BLOOM_PROBE__`, `__AURA3D_COMPOSITION_PROBE__`, `__AURA3D_BLOCKFALL_{ACCEPTANCE,ATTRACT}_PROBE__`). Post-#648 they must use `?capture=scenario&scenario=<id>` + `__AURA3D_GAME_EVIDENCE__` (spec list in issue). | open |
| #723 | prd15 | `tests/unit/apps/skyline-player-feel.test.ts` (lane-15 file): PRD-08 #221 asks to assert shake via `diagnostics().camera.layers` instead of route-unfiltered numbers (C-22/C-31). | open |
| #724 | prd09 | `sound.engine` rate introspection missing — §14.4 turbo RPM test (3,000→7,000 monotonic) needs `evidence.audio.engine {rpm,rate}` or a public `engineVoice.currentRate`. | open |
| #805 | prd15 | `text3D` exists (SdfText + extruded backends) but no dot-matrix display material — Vault §6.9.5 DMD backglass stays a stand-in (`standIns[].request` = R-14-15, now maps to this issue). | open |
| #807 | prd07 | `EffectDiagnostics` (FLAG-4 pulse): tracks `particle-pass` nodes whose draw path isn't mounted for the active flag set → `EFFECT_ZERO_PIXELS` console error on flag-off captures of particle-using legacy routes; S1 needs 0 errors in both states. | open |

## S12 request-code retag (2026-10-10)

`R-14-15` was invented in `standIns[].request` fields with no §12A.6 row and no open issue. Retagged so every entry maps to an open request: K-kit/asset admissions → `R-14-07` (#68, 27 entries), K8/other audio cue sets → `R-14-09` (#70, 9 entries + 4 `v2/boot.ts` comments). The one true engine gap — Vault's `DMD backglass` (text3D dot-matrix material) — keeps `R-14-15`, now backed by #805.

## In-group dependencies (tracked on #370, not new issues)

- lane 09: T0-30 beacon + real C-24 (#54) — FLAG-1/2 proof of real impl 18/18 waits on it; `game-sfx-core` cues (#70) before S11; 09-MIG patch sets (#278/#281-#302) gate `legacy/main.ts` edits.
- lane 08: #76 `subjectHeightFraction` on 8 rigs before T2.3 S7 framing specs; #219-#221 land in routes.
