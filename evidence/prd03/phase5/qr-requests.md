# PRD-03 Phase 5 — qr-requests (cross-lane asks)

| id | to | ask | status |
|----|----|-----|--------|
| QR-03-1 (open since P0) | lane 15/custodian | `tests/unit/agent-api/` + `tests/unit/tools/` aren't in the ownership map — lane tests land in `tests/unit/contracts/impl/prd03-*` slots. Phase-5 checklist names `tests/unit/agent-api/post-presets.test.ts` / `tests/unit/tools/post-v2-codemod.test.ts`; they exist as `impl/prd03-*` until the map gains test slots. | open |
| QR-03-13 | lane 14 | Q-14-1 package ready: `evidence/prd03/phase5/codemod/*.json` — per-game `--report` rows (preset insert + rewrite candidates) and `reports[].report.emissive` (luma×strength <1.0 list for the §10 emissive retune). skyline-runner `pixelRatio: 0.7` is row `createApp.pixelRatio` mapping `approximate` — decision stays yours. | filed |
| QR-03-14 | lane 13 | Q-13-1 package: same codemod covers `templates/**` — `POST_V2_DEFAULT_FILES` includes it; `templates/mini-game` gets `output:{preset:"neon-night"}` only when it's off the inert lean renderer (05 §9.5). Reports are in `codemod/` for reference. | filed |
| QR-03-15 | lane 15 | F-03-30: additive `--dry-run` branch in `commands/prd15/index.ts` (unified diff + `report` passthrough) — no behavior change for `--write`/`--report` paths; holler if the dispatcher contract drifts. | declared |
| QR-03-16 | lane 15 | F-03-28: `contracts/post.ts` `postPresets` stub → live re-export of `agent-api/postPresets.ts` per the PR-0a TODO comment in the file. | declared |
| QR-03-17 | lane 15 | F-03-31: repaired `extractFunctionBody` in `tests/unit/agent-api/production-bridge-boundary.test.ts` — my Phase-4 `attach?: { canvas?... }` param broke its first-`{` brace match (was failing on main). Also updated the `operator`/`temporal` substring assertions to the flag-on forms. | declared |
