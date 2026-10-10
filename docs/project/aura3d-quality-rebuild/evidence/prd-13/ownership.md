# 13-OWN — out-of-lane edit acceptance record

Finish-phase record (P-61). Every lane-13 PR that touched a file owned by
another lane needs that owner's recorded acceptance, or a lane-13 revert PR.
Statuses below are honest as of this commit — "pending" rows close when the
owning lane replies on the linked issue with acceptance, or when a revert PR
lands.

| File / surface | Owner | Edited by lane-13 PR(s) | Sign-off / revert | Status |
|---|---|---|---|---|
| `tests/qr/prd06/browser/camera.ts` (folded into prd09 `CameraRig`) | 08 | lane-13 camera evidence work | #508 (`to:prd08`) | pending |
| `packages/engine/src/agent-api/nodes/camera.ts` | 08 | #269, #280, #283, #284, #287, #294, #297, #303, #305 | #508 (`to:prd08`) | pending |
| `packages/engine/src/agent-api/index.ts` | 15 | #173, #287 | #509 (`to:prd15`) | pending |
| `packages/create-aura3d` `createAuraApp.ts` | 15 | #287 | #509 (`to:prd15`) | pending |
| `packages/engine/src/contracts/looks.ts` | 15 | #287 | #509 (`to:prd15`) | pending |
| `.github/workflows/prd07-vfx.yml`, `qr-prd08-camera.yml`, `quality-checkpoint.yml`, `quality-rebuild-capture.yml` | 07/08/15 | #277 | #508 / #509 (`to:prd08`/`to:prd15`) | pending |
| `.github/QR_OWNERSHIP.json`, `AURA3D-VERIFICATION-MATRIX.md` | 15 | #277 | #509 (`to:prd15`) | pending |
| `benchmarks/production-runtime/**`, `benchmarks/quality-rebuild/**` | 11/12 | #277 | filed under #508–#510 batch | pending |
| `templates/character-controller/src/main.ts` | 13 (edited by lane 09) | #350 | #510 (`to:prd09`) — lane 13 reviews and accepts or re-authors | pending |

## Inbound edits by other lanes onto lane-13 files

| Edited surface | Editing lane / PR | Lane-13 disposition | Status |
|---|---|---|---|
| 151 lane-13 skill / AGENTS files | #357 (lane 15 sweep) | review + accept or re-author each — tracked under #509 | pending |
| `tools/agent-templates/index.ts` + `tools/agent-docs/simulation.ts` `writeWorkspaceViteConfig` (manualChunks vendor split), `templates/*/tests/look-floor.ts` + `screenshot.spec.ts` timeouts | commit `2e0f0701d` (lane 15, PR #357) | ACCEPTED — the entry↔dynamic-chunk TLA deadlock analysis is correct (alias bundles pin shared engine modules into the still-evaluating entry; the vendor chunk evaluates before entry code runs, so TypedGLBActor's lazy import resolves); the 420 s/600 s/1200 s budgets bound waits without skipping asserts. Recorded on #507. | accepted |
| `templates/character-controller/src/main.ts` | #350 (lane 09) | review + accept or re-author — #510 | pending |

## Rule

No row closes without the owner's recorded acceptance in the linked issue
thread, or a revert PR reference with a remote run id.
