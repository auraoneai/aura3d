# Lane-13 qr-request ledger (13-REQ / P-64)

Verified 2026-10-10 with `gh issue view <n>`: each number below exists, and its title and body
match the row. All 17 rows that were PENDING were resolved on 2026-10-10 (13-REQ, P-64). Each
gap was checked against the code at origin/main `503624cf` before anything was filed:

- 12 new issues (#890–#901), each labelled `qr-request` + `to:prdNN`. Where part of a request
  had already landed on main, the issue asks only for the remainder.
- 2 reused: #242 and #243 were already filed by lane 13. They were missing `qr-request`/`to:prd05`,
  and those labels have been added.
- 3 N/A: the gap is already closed on main, or the condition was not met.
- `to:prdNN` labels were added to #192 (`to:prd04`), #193 (`to:prd15`) and #194 (`to:prd11`).

Every §14.6 row now has an issue number or an N/A reason. None is PENDING.

Moved here from root `evidence/prd13/qr-requests.md`. Under 13-EVID, root `evidence/prd13/` is
being retired, and `docs/project/aura3d-quality-rebuild/evidence/prd-13/` is the lane-13-owned
path.

## Outbound: lane 13 → other lanes

### PRD-13 §14.6 request table

| ID | To | Ask (short) | Issue | Note |
|---|---|---|---|---|
| Q-02-1 | 02 | register `look/ambient-flattens`; F-02-01 + shadow + preset-id rows | #890 (new) | narrowed to the missing preset-id row. Already landed: the rule (`lanes/prd02.ts:53`), F-02-01 and F-02-06 `verified`. See #862 |
| Q-03-1 | 03 | verified C-40 rows for the 7 `postPresets`, softKnee/FXAA | #891 (new) | F-03-28/-13/-02 still `proposed` |
| Q-04-1 | 04 | `@deprecated` JSDoc on `material.visualQA` | #192 (open) | `to:prd04` added 2026-10-10 |
| Q-05-1 | 05 | `genericAgentText` art-direction rule / load from `agent-files/AGENTS.md` | #242 (reused) | gap open: `cli/src/index.ts:3781` has no art-direction rule; labels added |
| Q-05-2 | 05 | `doctor --look` forwards to `look lint` | #243 (reused) | gap open: `cli.ts:287-288` does not forward `--look`; labels added |
| Q-05-3 | 05 | admit ≥ 2k HDRIs + curated kits with C-40 rows | #892 (new) | F-05-07/-08 staged but `proposed`. HDRI admission is #51 (lane 12), linked, not duplicated |
| Q-06-1 | 06 | verified rows: `tracksApplied`, locomotion blend, `character-hero` bar | #893 (new) | narrowed: F-06-04/-06 `verified`, but there is no locomotion-blend row. See #861 |
| Q-07-1 | 07 | refined `look/fake-effect-names`; F-07 rows | N/A | closed on main: lane 07 registers the rule (`vfx/lookLint.ts:45`), F-07-01..09 `verified`. The residual test-coverage mismatch is #879 |
| Q-08-1 | 08 | register `look/evidence-only-feel`; verified rig rows | N/A | closed on main: `feel/lint/evidenceOnlyFeel.ts:45` + `cli/commands/prd08/index.ts:13`, F-08-1 rig row `verified` |
| Q-09-1 | 09 | `look/capture-branch` doctor rule; createGame/Hud/touch/sound rows | #894 (new) | only lane 13's default rule exists. F-09-01..07 `proposed` |
| Q-10-1 | 10 | verified biome rig rows per `AuraBiomeId` | #895 (new) | F-10-02 `proposed`, and no values are listed per id |
| Q-11-1 | 11 | `lanes/prd13` entry in `tools/bundle-size` | #194 (open) | `to:prd11` added 2026-10-10 |
| Q-12-1 | 12 | templates + agent-eval in G-PANEL; `judgeWithPrism`; `--routes-file` | #896 (new) | narrowed: `judgeWithPrism` is exported (`judge-prism.ts:38`) |
| Q-12-2 | 12 | G-REG ingest of template baselines; licensed reference stills | #897 (new) | |
| Q-14-1 | 14 | publish pilot patterns as C-40 / C-35 records | #898 (new) | |
| Q-15-1 | 15 | `AuraSceneBuilder.look(id, overrides?)` | #899 (new) | builder now at `agent-api/nodes/scene.ts:23`, with no `look(` method |
| Q-15-2 | 15 | `@deprecated` JSDoc + return-type widening on six `visualQA` surfaces | #193 (open) | `to:prd15` added 2026-10-10 |
| Q-15-3 | 15 | 4.0: remove `"hud"` effect id, 1.0 report type, `visualQA` props | #900 (new) | `"hud"` is at `nodes/types.ts:2212` |
| Q-15-4 | 15 | starter bundle budget (mini-game ≤ 250,000 B) + code-splitting | #901 (new) | budget is 850,000 at `tools/bundle-size/index.ts:134`. Related to #542 (caps, to:prd11), not the same request |
| Q-15-5 | 15 | conditional: re-apply a dropped PRD-13 carve-out in `index.ts` | N/A | condition not met: `promptPlan`, `promptRecipes` and `looks` are re-exported (`agent-api/index.ts:292,297,414`), and `structuralQA` is wired into all seven kits |

### Finish-phase and other outbound requests

| Request | To | Issue | Note |
|---|---|---|---|
| `lights.ambient()` census outside PRD-13 carve-outs (`pr-d-t1.9-t1.13.md`) | all | #195 (closed) | |
| 13-CYCLE: break `@aura3d/controls ↔ @aura3d/input` | 15 | #442 (open) | |
| 13-OWN: `tests/qr/prd06/browser/camera.ts` accept-or-revert | 08 | #508 (open) | mis-scoped, see `ownership.md` |
| 13-OWN: lane-15 edits on lane-13 surfaces | 15 | #509 (open) | |
| 13-OWN: #350 template edits | 09 | #510 (open) | |
| 13-SPECS: `tests/browser/` carve-out for the three template specs | 15 | #709 (open) | |

## Inbound: other lanes → lane 13 (requests written as markdown, now filed)

These request files are owned by lane 15 (`evidence/prd15/requests/`). The issue numbers were
written back into them, which is an out-of-lane edit and is recorded in `ownership.md`. Every
issue is open and carries `qr-request` + `to:prd13`.

| Request file (`evidence/prd15/requests/`) | Issue |
|---|---|
| `Q-13-1-lean-imports-codemod.md` | #690 |
| `Q-13-2-renderer-mode-codemod.md` | #697 |
| `Q-13-2-templates-renderer-imports.md` | #706 |
| `Q-13-3-template-scripts-glb-parse.md` | #698 |
| `Q-13-4-three-compat-template-cleanup.md` | #700 |
| `Q-13-5-migration-skill-update.md` | #695 |
| `Q-13-6-external-parity-templates.md` | #704 |
| `Q-13-7-template-manifest-gaps.md` | #699 |
| `Q-13-7-templates-types-node.md` | #702 |
| `Q-13-8-agent-api-leaf-index-imports.md` | #696 |
| `Q-13-9-unreferenced-lane13-tools.md` | #692 |
| `Q-13-10-game-slice-controls-import.md` | #689 |
| `Q-13-11-look-lint-lean-rule.md` | #703 |
| `Q-13-12-animation-studio-flat-canvas.md` | #693 |
| `Q-13-12-look-floor-and-sim-readback.md` | #705 |
| `Q-13-13-game-contract-members-and-evidence-descriptors.md` | #701 |
| `Q-13-14-template-spec-timing-and-tdz-fixes.md` | #691 |
| `Q-13-15-look-floor-subject-bounds-recalibration.md` | #694 |
| `Q-13-16-vite-preview-mount-deadlock.md` | #507 (titled as the lane-13 ownership review of the fix; accepted in a comment) |

Other inbound issues that are tracked elsewhere (13-ISSUES), not as ledger rows: #48, #49, #50,
#69, #105, #106, #216, #217, #218, #264, #454, #455, #456, #467, #469, #481, #488, #493, #568,
#570, #624 and #660.
