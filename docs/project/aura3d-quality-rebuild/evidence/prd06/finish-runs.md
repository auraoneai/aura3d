# PRD-06 finish rows that wait on a main run or an owner

Every row below is **NOT RUN**. No result is recorded until a cited GitHub
macos-14 run on a `main` commit exists. GitLab is out of quota, so GitHub
macos-14 runs on main count as remote proof (§0.2). Compare frames only within
GitHub macos-14 runs.

| Row | What it waits for | Workflow / harness already on main | Result |
|---|---|---|---|
| 06-ALL | #919 merged, then one `qr-prd06-animation-browser.yml` push run on main with all 4 jobs green on chromium, webkit and firefox | `.github/workflows/qr-prd06-animation-browser.yml` (push: main) | NOT RUN |
| 06-FIREFOX | Same main run: texture-array, skinned-shadow-onscreen and taa-skinned-ghosting green on firefox/webkit. The 10-09 timeouts came from the ktx-parse 404 (#865, fixed by #914) | `tests/qr/prd06/browser/*.spec.ts` | NOT RUN |
| 06-S6 | Same main run: `crossfade-filmstrip.spec.ts` green on 3 browsers. Artifacts: `test-results/crossfade-filmstrip/{aura3d,three}-report.json` and `*-strip-{0..7}.png` (uploaded as `prd06-animation-matrix-<browser>`) | `crossfade-filmstrip.spec.ts` (already emits JSON and strip) | NOT RUN |
| 06-S6 checklist | Owner-signed "smooth, no foot skate" review of that run's strip | below | UNSIGNED |
| 06-S7 | Same main run: `ik-slope.spec.ts` aura leg green with penetration ≤ 1 cm and float ≤ 2 cm (signed gate, this PR). The depth-readback artifact is still to be built | `ik-slope.spec.ts`, `aura3d/scenes/prd06/ik-slope.ts` | NOT RUN |
| 06-S10 | A green prd06 `unit` job on main that runs `tests/qr/prd06/unit/hero-validator.test.ts`; then cite it in `standalone-complete.md` | `qr-prd06-animation-browser.yml` job `unit` | NOT RUN |
| 06 §20 A/B | `quality-rebuild-capture.yml` on main with `qr_flags=animation` vs `none` (same provider) for skinned-character-posed, crossfade-filmstrip, morph-face, ik-slope, character-hero, perf-tier-* and base 08/15/18; output under `evidence/prd06/benchmark/` | `.github/workflows/quality-rebuild-capture.yml` (G5) | NOT RUN |
| 06-S8 | The capture run above for CesiumMan and auraClashPlayerRig with `qr_flags=animation`; owner-signed review in `retarget-bake.md` | capture workflow | NOT RUN |
| 06-P5 | Q-05-2 (#658), Q-13-1 (#488), Q-11-1 (#451); then `native-webgpu-functional-301.yml` | — | BLOCKED |
| 06-S4 | G5: `tests/browser/contracts/C-18-deform.spec.ts` and `C-19-tracks-applied.spec.ts` (#688, lane 15) | — | BLOCKED-ON G5 |
| 06-OWN (P-61) | Owner replies on #346. Recorded so far: G4/lane 14 accepts the `AuraClashArenaApp.ts` move (2026-10-10T19:34Z, with its own follow-up fix). G1, G2, lane 05 and G5 have not replied | #346 thread | OPEN |
| 06-PROMO | Every S-row above green in one main lane run, bundle ≤ +8 KB, F-06 verified (#861); G5 records the promotion at a checkpoint | — | BLOCKED |

## 06-S6 human checklist (owner fills in against the cited run)

- Run id: _(none yet)_
- Crossfades read smooth on the 8-frame strip (no pops): [ ]
- No visible foot skate during the walk→run blend: [ ]
- Signed: _(owner)_
