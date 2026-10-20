# Track P status (P-01..P-64)

Snapshot: origin/main `00c56b1b1`, 2026-10-10. Tracking issue: #376. Source rows: PRD-16 §3.1-§3.5.
IDs not listed (P-11..P-19, P-39..P-49, P-59) are not defined in PRD-16.

Status values:
- `DONE-VERIFIED`: fix merged and a main run that executes the gate concluded `success` (or truthfully fails).
- `MERGED-UNVERIFIED`: fix merged, but no main run has executed the gate yet.
- `OPEN-PR`: fix is in an open PR.
- `NOT-STARTED`: no PR.

Main run ids come from `gh run list --branch main` (last 500 runs, read 2026-10-10). "none yet" means no
completed run on main executes the gate. A green run of a workflow that still contains the mask is not evidence.

## 3.1 CI masks

| ID | Owner | Status | PR | Main run id | Note |
|---|---|---|---|---|---|
| P-01 | 12 (= T0-11) | MERGED-UNVERIFIED | #424, #513 | none yet | needs a GitLab main pipeline failing on a blank/zero-draw frame; tracked by #968 |
| P-02 | 15 | MERGED-UNVERIFIED | #512 | none yet | QR contracts on main: 4 failure, rest queued; no success |
| P-03 | 07 | MERGED-UNVERIFIED | #418 | none yet | qr-prd07-vfx on main: 16 failure, 2 queued |
| P-04 | 10 | MERGED-UNVERIFIED | #830 | none yet | QR PRD-10 World latest main run 38100763012 failure |
| P-05 | 14 | MERGED-UNVERIFIED | #636, #916 | 38113760311 (unit only) | static-gate and capture jobs were skipped in that run, so the art-direction gate itself has not executed |
| P-06 | 02 | DONE-VERIFIED | #766 | 38086978481 | push run at 503624cf2 (after #766): browser conformance, capture and unit all success |
| P-07 | 01 | MERGED-UNVERIFIED | #918 | none yet | qr-prd01-core main run 38111664770 queued |
| P-08 | 03 | MERGED-UNVERIFIED | #781 | none yet | QR-03 post quality on main: 3 failure, 3 queued |
| P-09 | 11 | NOT-STARTED | — | none yet | no PR fixes `qr-prd11-perf.yml:181-184` naga exit 0 (#845 closed) |
| P-10 | 15 / 13 | OPEN-PR | #915 (TP), #953 (13) | none yet | ci.yml part landed in #424 |

## 3.2 Masking tests and loosened thresholds

| ID | Owner | Status | PR | Main run id | Note |
|---|---|---|---|---|---|
| P-20 | 04 | MERGED-UNVERIFIED | #784 | none yet | QR PRD-04 materials main run 38111664794 queued |
| P-21 | 06 | OPEN-PR | #919 | none yet | #436 closed unmerged |
| P-22 | each lane + TP helper | OPEN-PR (helper) | #915 (helper); lane parts #786, #831, #905, #906, #908, #911, #916, #935 merged; #919, #940, #952 open | none yet | no main browser run has failed on an unlisted skip yet |
| P-23 | 15 (+ G2 hunk) | NOT-STARTED | — | none yet | `BUNDLE_SIZES.md` caps not restored; QR-15 bundle size success on main (38113760341) is against the raised caps |
| P-24 | 13 | OPEN-PR | #953 | none yet | #427 closed unmerged |
| P-25 | 09 | MERGED-UNVERIFIED | #610 | none yet | |
| P-26 | 03 | MERGED-UNVERIFIED | #786 | none yet | |
| P-27 | 06 | NOT-STARTED | — | none yet | #650 closed unmerged |
| P-28 | 06 | NOT-STARTED | — | none yet | #501 closed unmerged |
| P-29 | 06, 04, 15 | NOT-STARTED | — | none yet | #651 closed; repo-wide 240 s → 90 s is TP (`playwright.config.ts`) |
| P-30 | 11 | OPEN-PR | #923 | none yet | |
| P-31 | 11 | NOT-STARTED | — | none yet | |
| P-32 | 12 | NOT-STARTED | — | none yet | |
| P-33 | 07 | MERGED-UNVERIFIED | #418 | none yet | |
| P-34 | 07 | MERGED-UNVERIFIED | #418 | none yet | |
| P-35 | 04 | MERGED-UNVERIFIED | #784 | none yet | |
| P-36 | 13 | OPEN-PR | #953 | none yet | |
| P-37 | 15 → 13 | OPEN-PR | #953 (G3 revert; TP reviews only) | none yet | |
| P-38 | 08, 05 | MERGED-UNVERIFIED (08 part) | #627, #631; #920 open (05) | none yet | `.gitignore` negations still pending (15) |

## 3.4 Records

| ID | Owner | Status | PR | Main run id | Note |
|---|---|---|---|---|---|
| P-50 | TP | OPEN-PR | this PR (qr/tp-batch-2) | n/a (records) | F-07 rows → `proposed` |
| P-51 | TP | OPEN-PR | this PR | n/a (records) | F-02, F-06, F-01-02 → `proposed` |
| P-52 | TP | OPEN-PR | this PR | n/a (records) | F-08/F-03/F-05 table fixes; C-40 notes on #50 #69 #106 #216 #217 #218 #264 #351 |
| P-53 | 09 | MERGED-UNVERIFIED | #608, #819 | none yet | `rg '^(<<<<<<<\|\|\|\|\|\|\| \|>>>>>>>)' docs packages` empty on 00c56b1b1; QR-09 game runtime main runs all queued |
| P-54 | each lane | MERGED-UNVERIFIED (partial) | #419, #608, #631, #803, #810, #928 merged; #907, #912, #919, #920 open | none yet | checklist-lint has not run as a gate on main (see P-55) |
| P-55 | each lane | MERGED-UNVERIFIED (partial) | #918 merged; #910, #912, #917 open | none yet | qr-required 38114141267 (schedule) succeeded with checklist-lint `skipped` |
| P-56 | each lane | MERGED-UNVERIFIED (partial) | #784, #918 merged; #912, #920 open | n/a (records) | |
| P-57 | 02 / 13 / 05 | NOT-STARTED (2 of 3 paths) | #766 (02 path); #917, #957 open | n/a | see "P-57 verification" below |
| P-58 | 03 / 07 | MERGED-UNVERIFIED | #803 | n/a | #313 withdrawal comments: [6074875269](https://github.com/auraoneai/aura3d/issues/313#issuecomment-6074875269), [6100541605](https://github.com/auraoneai/aura3d/issues/313#issuecomment-6100541605); #313 stays open |

## 3.5 Retro-review and ownership

| ID | Owner | Status | PR | Main run id | Note |
|---|---|---|---|---|---|
| P-60 | TP | OPEN-PR (drafts, never merged) | #976 (2ed5c16e), #981 (1f579954) | none yet | lane matrix NOT RUN yet; reports: `retro-2ed5c16e.md`, `retro-1f579954.md`; 822c19fc lane-15 edits re-filed as #983 |
| P-61 | each owning lane | MERGED-UNVERIFIED (partial) | merged PRs citing P-61: #592, #599, #604, #607, #911, #916; open: #917, #920 | n/a | lane-15 acceptances posted; not every listed cross-lane PR has a recorded owner sign-off yet |
| P-62 | owner (release) | OPEN-PR | #915 (OWNER-ACTIONS text) | n/a | no 3.1.0 published; owner decision |
| P-63 | owner (scope) | OPEN-PR | #915 (OWNER-ACTIONS text) | n/a | owner decision (#525) |
| P-64 | each lane; TP for 12/15 | OPEN-PR (12/15 part) | #785, #803, #908, #935 merged (03/04); this PR (12/15) | n/a | every lane-12 (PRD-12 §12.3, prd12 phase-1/2) and lane-15 (`evidence/prd15/requests/*.md`, 87 files) row carries an issue #: 69 filed (#980, #987-#1049, #1051), 22 reused; other lanes' ledgers stay with their lanes |

## P-57 verification (2026-10-10, origin/main 00c56b1b1)

| Old path | Expected | Result |
|---|---|---|
| `docs/project/aura3d-quality-rebuild/evidence/prd02/baseline/` | `lighting-baseline/` | Done for the workflow. #766 (01ef8d830) changed the `lighting-quality.yml` commit step to `evidence/prd02/lighting-baseline` (`:178-180`). The old `baseline/` directory was never committed (`git log --all` empty), and no `lighting-baseline/` is committed yet because no `update_baseline` dispatch has run. |
| root `evidence/prd13/` (5 files: `pr-a`, `pr-b`, `pr-d`, `pr-e`, `pr-f`) | `docs/project/aura3d-quality-rebuild/evidence/prd-13/` | NOT DONE. Still on main. #503 closed unmerged; #917 (G3, open) adds the files under `evidence/prd-13/`. |
| root `evidence/prd05/assets/optimize-dry-run.json` | lane-05 evidence tree | NOT DONE. Still on main. No open PR moves it (#957 and #920 do not touch it). Lane 05 owns the move. |

TP moved no files. The two open moves stay with their owning lanes (13, 05).

## Track 0 tracking (#375)

Every T0-01..T0-35 row on #375 now links an issue (mapping comment
[6105825954](https://github.com/auraoneai/aura3d/issues/375#issuecomment-6105825954)). New `qr-ic-regression` issues:
T0-04 #963, T0-05 #964, T0-06 #965, T0-09 #966, T0-10 #967, T0-11 #968, T0-17 #969, T0-18 #970, T0-19 #971,
T0-23 #972, T0-24 #974, T0-25 #975, T0-26 #977, T0-27 #978, T0-29 #979.

## Main CI facts used above (00c56b1b1 and parents)

- Workflows with a `success` on main in the last 500 runs: Build and Test, CI, QR PRD-05 admission gates,
  QR PRD-05 asset optimize, QR PRD-14 games, QR prd02 lighting quality (38086978481), QR-15 bundle size,
  QR-15 packed consumer check, Test & Coverage (38100763030), qr-required (38114141267).
- qr-required 38114141267 was a `schedule` run: `allflags-smoke`, `checklist-lint` and `ownership` were `skipped`.
  It does not satisfy §2.5.
- Quality Devices (13 failure), QR-15 architecture gates (12 failure), Template lookdev (2 failure) and
  Agent output eval (1 failure) have no success on main.
