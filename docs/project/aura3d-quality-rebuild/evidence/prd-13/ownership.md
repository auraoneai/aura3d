# 13-OWN — out-of-lane edit acceptance record (P-61)

Every lane-13 PR that touched a file owned by another lane needs that owner's recorded
acceptance in a PR/issue thread, or a lane-13 revert PR. Every inbound edit by another lane onto
a lane-13 file needs a lane-13 disposition. Statuses are as of 2026-10-10.

- ACCEPTED: a linked comment records the acceptance.
- PENDING: no acceptance and no revert recorded. "No request filed" means no open issue asks the
  owning lane about this file; the lane agent files one (`qr-request`, `to:prdNN`) and links it.
- No row is REVERTED yet.

Method: owners resolved with `.github/QR_OWNERSHIP.json` (longest prefix; default owner 15).
File lists are complete (`gh api --paginate repos/auraoneai/aura3d/pulls/<N>/files`); the
`gh pr view --json files` view stops at 100 files and undercounts #277 (654) and #305 (161).

Corrections to the earlier version of this record:

- `agent-api/index.ts` was edited by #239, #276 and #287. #173 did not touch it. #173 edited
  `createAuraApp.ts` and `contracts/looks.ts` instead, and #287 did not touch either of them.
- #276 also edited `nodes/camera.ts`, `index.ts`, `createAuraApp.ts` and `contracts/looks.ts`.
- #508 asks about `tests/qr/prd06/browser/camera.ts`. That path has never existed on main, and
  QR_OWNERSHIP maps it to lane 06, not 08 or 13. #508 does not ask lane 08 to accept lane 13's
  `nodes/camera.ts` edits.
- #509 lists `index.ts`/`createAuraApp.ts`/`contracts/looks.ts` as "lane-15 edits on lane-13
  surfaces". QR_OWNERSHIP assigns all three to lane 15, so the open question is the reverse: does
  lane 15 accept lane 13's edits? #509 has 0 comments.
- No issue covers #277's workflow, QR_OWNERSHIP or benchmark edits. The earlier "filed under
  #508–#510 batch" was not true.
- #357 edited 151 lane-13-owned files, but only 19 of them are skill files. The rest are
  templates and tools (see the inbound table).
- #350 edited the five `packages/create-aura3d/templates/*/src/main.ts` game templates, not root
  `templates/character-controller/src/main.ts`.

## Outbound: lane-13 PRs editing other lanes' files

| File / surface | Owner | Lane-13 PR(s) (verified) | Sign-off / revert | Status |
|---|---|---|---|---|
| `packages/engine/src/agent-api/nodes/camera.ts` | 08 | #269, #276, #280, #283, #284, #287, #294, #297, #303, #305 | no request filed (#508 is mis-scoped, see above) | PENDING |
| `packages/engine/src/agent-api/index.ts` | 15 | #239, #276, #287 | #509 (open, 0 comments; framed in the wrong direction) | PENDING |
| `packages/engine/src/agent-api/app/createAuraApp.ts` | 15 | #173, #276 | #509 (as above) | PENDING |
| `packages/engine/src/contracts/looks.ts` | 15 | #173, #276 | #509 (as above) | PENDING |
| `.github/workflows/prd07-vfx.yml`, `quality-checkpoint.yml`, `quality-rebuild-capture.yml`, `external-parity-external-engine-baselines.yml` | 12 | #277 | no request filed | PENDING |
| `.github/workflows/qr-prd08-camera.yml` | 08 | #277 | no request filed | PENDING |
| `.github/QR_OWNERSHIP.json` | 15 | #277 | no request filed | PENDING |
| `docs/archive/aura3d-verification-matrix.md` | 12 | #277 | no request filed | PENDING |
| `benchmarks/production-runtime/**` (4 files) | 12 | #277 | no request filed | PENDING |
| `benchmarks/quality-rebuild/**` (51 files lane 12; 24 under `aura3d`/`three`/`scenes` resolve to lane 07) | 12 / 07 | #277 | no request filed | PENDING |
| `tools/template-source-audit/index.ts` | 15 | #269, #276, #284 | moot on main: deleted by `250077b5` (#336); record lane-15 acknowledgement | PENDING |
| default-owner (15) files: `tests/unit/agent-api/{look-lint,looks,prompt-plan-v2,structural-qa}.test.ts`, `tests/unit/cli/look-{capture,judge,lint}.test.ts`, `tests/unit/create-aura3d/{templates,look-floor}.test.ts`, `tests/unit/tools/agent-skills-check.test.ts` | 15 | #173, #191, #202, #239, #244, #276, #303 | no request filed | PENDING |
| default-owner (15) files: root `evidence/prd13/*.md` | 15 | #191, #202, #239, #244, #276, #277, #305 | moving into the lane-13 tree via #503 (13-EVID) | PENDING |
| default-owner (15) files: `README.md`, `public/llms.txt`, `docs/project/showcase/visual-quality-standard.md`, `.gitignore` | 15 | #239, #244, #269, #276, #277 | no request filed | PENDING |
| `docs/project/aura3d-quality-rebuild/evidence/prd15/requests/Q-13-*.md` (19 files: issue-number write-back) | 15 | #707 (open) | no request filed; the ledger is at `evidence/prd-13/qr-requests.md` | PENDING |

### #277 (`[QR-13] T3.4 fighting-game`, 654 files, 33 commits) — out-of-lane footprint

QR_OWNERSHIP puts 383 of the 654 files outside lane 13: lane 12 (145), lane 07 (92), lane 15 (48),
lane 08 (43), lane 01 (2) and lane 11 (1). Besides the rows above, these include
`packages/rendering/src/**` (32 files: lane 07 ×28, 01 ×2, 11 ×1, 15 ×1), `tests/qr/prd07/**` (32), `tests/qr/prd08/**`
(10), `packages/engine/src/**` lane-08 files (19), `tools/head-to-head-*`,
`tools/superiority-*`, `tools/threejs-parity-*`, `tools/three-compat-*` and `tools/quality-gate/**`
(lane 12). Nobody has yet checked whether lane 13 wrote these hunks or whether they came in with
other lanes' commits on the branch. Do that check first, then file one accept-or-revert request
for each owning lane. Every file is PENDING. Get the full list with
`gh api --paginate repos/auraoneai/aura3d/pulls/277/files --jq '.[].filename'`.

## Inbound: other lanes' PRs editing lane-13 files

| Edited surface | Editing lane / PR | Lane-13 disposition | Status |
|---|---|---|---|
| `tools/agent-templates/index.ts`, `tools/agent-docs/simulation.ts` (`writeWorkspaceViteConfig` manualChunks vendor split), `templates/*/tests/look-floor.ts` + `screenshot.spec.ts` timeouts | commit `2e0f0701d` (lane 15, #357; on main) | ACCEPTED. The entry↔dynamic-chunk TLA deadlock analysis is correct: alias bundles pin shared engine modules into the still-evaluating entry, and the vendor chunk evaluates before entry code runs, so TypedGLBActor's lazy import resolves. The 420 s / 600 s / 1200 s budgets bound waits without skipping asserts. Recorded: https://github.com/auraoneai/aura3d/issues/507#issuecomment-6076230119 | accepted |
| the other lane-13-owned files in #357: 151 in total. They are 19 skill files (`.agents`/`.claude`/`.cursor/skills` ×12, `packages/create-aura3d/skills` ×4, `packages/aura3d-cli/skills` ×3), 70 other files under `packages/create-aura3d/`, 58 under root `templates/*`, and 4 more: `docs/agents/templates.md`, `tools/agent-docs/simulation.ts`, `tools/agent-templates/{index.ts,command.mjs}` (incl. `04ad39f2e`, `36171d48d`, `ade7606f3` named on #509) | #357 (lane 15) | Not reviewed yet. Accept or re-author each, and record the result here. #509 is the lane-15 thread (0 comments). | PENDING |
| `packages/create-aura3d/templates/{character-controller,falling-blocks-starter,fighting-game,mini-game,racing-starter}/src/main.ts` | #350 (lane 09, `444cbf2c7`) | Not reviewed yet: accept or re-author. #510 is open with 0 comments. | PENDING |

## Rule

A row closes only with (a) the owner's recorded acceptance linked here, or (b) a revert PR
reference with a green remote run id. A PENDING row never becomes accepted without one of these.
