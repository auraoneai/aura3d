# Retro-review: direct push 2ed5c16e (P-60)

Status 2026-10-10: draft PR open, lane matrix NOT RUN.

- Commit `2ed5c16ec` "merge(origin/main): lane-13 QR-13 push into lane-15 stack merge", 2026-10-07, pushed to
  main with no PR. Parents `fd2e8060` (first) and `4dafae4b`.
- Diff vs first parent: 2,670 files, +176,592 / -11,858.
- Draft PR: #976 (base `audit/retro-2ed5c16e` = `fd2e8060`, head `audit/retro-2ed5c16e-review` = `2ed5c16e` +
  one README commit). Never merged.
- Scope and matrix: `docs/project/aura3d-quality-rebuild/process-audit/retro-2ed5c16e.README.md` on the head branch.

## Files per owning lane (`.github/QR_OWNERSHIP.json` at 00c56b1b)

| Lane | 01 | 02 | 03 | 04 | 05 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 15 | no rule |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Files | 84 | 55 | 16 | 27 | 40 | 43 | 97 | 636 | 70 | 79 | 255 | 642 | 266 | 360 |

Lanes 06, 14 and 16 are not touched.

## Lane matrix result

| Lane | Workflow / suite | Head run | Base run | Result |
|---|---|---|---|---|
| all | checks triggered by opening #976 | pending | — | 9 pending, 5 skipping at time of writing |
| 01-15 | per-lane workflows listed in the README, flags `none` and `$ALL` | NOT RUN | NOT RUN | dispatch pending |

NOT RUN reason: the PR was opened 2026-10-10; per-lane dispatches and GitLab captures (`qr-gitlab-ci.yml`) have not
been launched yet. Each lane records accept/revert on #976.

## Follow-up issues

None filed yet from this push. File one per lane gate that is red on the head but green on the base.

Refs #376 #839
