# PRD-08 Phase 5 exit evidence

Phase 5: facts, codemod/doctor hand-off, deprecations, request filing. Exit: S17 (doctor rule + codemod report), S19 (per-tier budgets), every §12.3 item filed in `requests.md`; `A3D_QR_CAMERA` → `standalone-accepted` once S1-S19 are green on one lane CI run.

Status (P-54): **NOT MET**. S19 per-tier numbers and S1-S19 on one run are still open.

| Row | Proof | Status on main |
|---|---|---|
| S17 doctor + codemod report | unit `camera-cast-codemod.test.ts`, `feel-lint.test.ts` (doctor rule on the three evidence-only fixtures + clean fixture); the unit-job report step lists all six known cast sites; report committed as `camera-cast-report.md` | green 38113231509 |
| S19 bundle | unit `bundle.test.ts` (typical ≤ 15 KB, everything ≤ 24 KB gzip; tree-shake gate); `s19-bundle.md` | green 38113231509 |
| S19 per-tier CPU/GPU/memory | browser `tier-budgets.spec.ts` (#946, merged 3a19a29f3); method and table in `s19-bundle.md` | pending the first browser-gpu run on a main commit at or after 3a19a29f3. If macos-14 Chrome lacks `EXT_disjoint_timer_query_webgl2` the GPU part is reported BLOCKED with the run id (no capability skip). |
| §12.3 requests filed | `requests.md`: every row maps to an issue (P-64) | done |
| Facts F-08-* | `facts.md`; CONTRACTS F-08-2/F-08-5 status and duplicate rows: lane-15 edit requested in #629 | waiting on G5 (#629) |

Flag promotion (08-PROMO) waits on the Track 0 all-flags exit and G5 (`flags.state.ts:18` stays `"dev"`).
