# P-60 retro-review: direct push 2ed5c16e

Track P row P-60 (PRD-16 §3.5). This draft PR exists only to give the direct
push a reviewable diff and a CI run. Never merge it.

## Scope

- Commit: `2ed5c16eccf14b5ba296c1525060103179f71b76`, "merge(origin/main):
  lane-13 QR-13 push into lane-15 stack merge", Gurbaksh Chahal,
  2026-10-07 02:40 UTC. Pushed to main with no PR.
- Parents: `fd2e8060` (first, the PR base `audit/retro-2ed5c16e`) and
  `4dafae4b` (merged side).
- Diff vs first parent: 2,670 files, +176,592 / -11,858.
- Files per owning lane (longest prefix in `.github/QR_OWNERSHIP.json` at
  origin/main 00c56b1b; "15 default" = paths with no rule):

| Lane | Files |
| --- | --- |
| 01 | 84 |
| 02 | 55 |
| 03 | 16 |
| 04 | 27 |
| 05 | 40 |
| 07 | 43 |
| 08 | 97 |
| 09 | 636 |
| 10 | 70 |
| 11 | 79 |
| 12 | 255 |
| 13 | 642 |
| 15 | 266 |
| 15 default | 360 |

Lanes 06, 14 and 16 are not touched.

## Lane matrix to run

Run each on this PR head and on the base, flags `none` and `$ALL`
(GitLab captures through `qr-gitlab-ci.yml`, never locally):

| Lane | Workflow / suite |
| --- | --- |
| 01 | `qr-prd01-core.yml` |
| 02 | `lighting-quality.yml` |
| 03 | `post-quality.yml`, `qr-prd03-captures.yml` |
| 04 | `qr-prd04-materials.yml` |
| 05 | `qr-prd05-gates.yml`, `qr-prd05-assets-browser.yml` |
| 07 | `prd07-vfx.yml` |
| 08 | `qr-prd08-camera.yml` |
| 09 | `qr-prd09-game.yml`, `qr-prd09-routes.yml` |
| 10 | `qr-prd10-world.yml` |
| 11 | `qr-prd11-perf.yml` |
| 12 | `quality-gate.yml`, `quality-rebuild-capture.yml`, GitLab `suite=benchmark` |
| 13 | `qr-prd13-authoring.yml`, `template-lookdev.yml` |
| 15 | `ci.yml` (Type Check, unit), `qr-prd15-arch-gates.yml`, `qr-prd15-bundle-size.yml`, `qr-prd15-pack-check.yml` |
| all | `qr-contracts.yml`, `qr-required.yml` (allflags-smoke, ownership) |

## Report

Each owning lane comments on this PR with either an acceptance of its files or
the list of hunks it reverts in its own PR. Cross-lane hunks (an author outside
the owning lane) need the owner's recorded acceptance (P-61 rule).

## Done when

Every lane in the table has a run id (head and base, `none` and `$ALL`) and a
recorded accept/revert comment here; then this draft is closed unmerged and
the result is recorded in `process/TRACK-P-STATUS.md`.

Refs #376 #839
