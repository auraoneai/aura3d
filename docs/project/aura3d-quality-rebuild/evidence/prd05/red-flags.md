# PRD-05 red flags 1-11: disposition record

Source: `prompts/finish/briefs/FINISH-LANE-05.prompt.md` "Red flags" and FINAL-REMAINING-WORK row
**05 red flags 1-11**. Recorded 2026-10-10 against origin/main b60a669a. A flag is closed only when the
linked revert or annotation PR is merged **and** its lane run on main is green. Every row below is
`OPEN` until a main run id is written next to it.

| # | Flag | Disposition | PR / issue | Main run |
|---|---|---|---|---|
| 1 | Unbacked PRD-05 §14 ticks `:1348`, `:1354`, `:1355`, `:1366`, `:1382`, `:1394` (Phase 3 LOD exit) | Revert: unticked | #605 | OPEN |
| 1a | "Phase 1 build-copy item" | No separate §14 checkbox exists; it is the `Vite/tsup copy to /aura-decoders/` clause inside `:1355`, unticked by #605. The app/template copy path is 05-PKG | #605, #615 | OPEN |
| 2 | wasm README sha256 values for files that were not committed | Fix: wasm committed under `public/aura-decoders/` and `packages/assets/vendor/`; sha256 checked against both READMEs | #601 (`.gitignore` negation #394, G5) | OPEN |
| 3 | `benchmarks/.../scenes/prd05/common.ts` false C-16 capability claim and no-draw → READY | Fix: `waitForFirstDraw` throws `NoDrawError`; the log is `partial` and no longer claims C-16 | #393 (serving: #857, G5) | OPEN |
| 4 | #347 (f29b1da4), #360 (f7ab6880), #365 (7758a271), #366 (45316e60) merged with the lane browser, unit, arch-gates, bundle-size and pack-check jobs red, labelled "main baseline" | Annotation (this file). Nothing they claim counts until the lane workflows are green on main. From now on no lane-05 merge with any red, cancelled or pending check (FINAL-REMAINING-WORK 0.2) | this PR | OPEN |
| 5 | #365's look-dev verification ran on SwiftShader | Re-run under 05-S8 without SwiftShader and without `A3D_LOOKDEV_ALLOW_SWIFTSHADER`. Until then, no look-dev verdict from #365 is cited | #635 (05-S8) | OPEN |
| 6 | `codemod-report.json` and `tier-measurements.json` are placeholders (P-56) | `tier-measurements.json` is now marked `"status": "placeholder"` (stub tier controller, `tierObserved=auto` on all 6 rows, SwiftShader renderer). On main `codemod-report.json` is not even valid JSON (trailing data at line 81); #605 replaces it with a valid local report, marked placeholder until a run backs it | this PR, #605, #732 | OPEN |
| 7 | Root `evidence/prd05/assets/optimize-dry-run.json` (213 rows) at the wrong path (P-57) | Move: regenerate all 226 rows under `docs/project/aura3d-quality-rebuild/evidence/prd05/assets/`. The root path is lane-15 owned, so its deletion goes to G5 | #630 | OPEN |
| 8 | "S1: 0 release assets fail G1-G11" was reached by demoting everything | Annotated at PRD-05 §16.0 S1: `migration-1.1.json` summary `keep: 0`, `downgradedToCandidate: 96`, `demotedToProxyPrototype: 35`, `nonRelease: 287`. S1 passes vacuously; zero release assets remain | this PR | OPEN |
| 9 | Cross-lane edits without recorded sign-off (P-61): lane 01 `lod-dither.glsl.ts`, `contracts/renderItem.ts`; lane 04 `GLTFRenderResources.ts`; lane 15 `aura.library.json` | Acceptance requested from each owner (G1 for 01/04, G5 for 15); revert if refused. The reverse direction is done: lane 05 accepted G1's #782 `MikkTSpaceTangents.ts` edit (comment on #782) | G1 / G5 threads | OPEN |
| 10 | `A3D_QR_ASSETS_LOOKDEV` sits outside the CONTRACTS §5 flag table | Register (lane 05's choice); the CONTRACTS.md row is G5's to write | #540 | OPEN |
| 11 | Thresholds intact (ΔE2000 ≤ 2.0, 1 cm contact bound) | Holds on main b60a669a. Every lane-05 PR is scanned for loosened thresholds and timeouts, `test.fail`/skip/`continue-on-error`. Masks removed so far: #716's heavy-source skip, existence guards and non-failing aggregate (split 1) | all lane-05 PRs | OPEN |

Pre-existing masks found on main (lane 05, not in the brief list):
- `tests/qr/prd05/template-starters.test.ts:152` `templateId !== undefined || true` always passed. **Removed in this
  PR**: every generated route-module id must now map to a gated starter row (6/6 pass locally; not evidence).
- `tests/unit/contracts/impl/prd05-asset-optimize.test.ts:19` `describe.runIf(hasToolDeps)` skips all four tests when
`tools/asset-optimize/node_modules` is absent (true in every root `pnpm install`). It needs the workspace fix Q-15-6
(#470) before the guard can go without turning the unit job red for an install reason.
