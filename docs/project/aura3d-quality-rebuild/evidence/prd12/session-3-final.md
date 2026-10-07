# PRD-12 session 3 — PR C/D/E/F + dispatches (2026-10-07)

## PRs opened/merged

| PR | Branch | Content | State |
|---|---|---|---|
| #341 | qr/prd12-gate-internals | calibrate.ts, golden.ts + manifest, rubric.ts (+blind A/B, calibration items), judge-prism.ts (Prism /v1/messages, ≤4 JPEG q90, X-Prism-* headers), history.ts (appendRound/trend), report.ts ($GITHUB_STEP_SUMMARY table), types.ts §7.2–7.3, verdicts from | merged |
| #345 | qr/prd12-variants-showcase | three/lib/showcase.ts + three/lib/variants.ts (7 broken controls), aura3d/lib/variants.ts (+NotExpressibleVariantError), prd12-ref-01..06 + skinned-character-walk scenes, games.prd12.json (scenarios/hud/keyboard selectors for 18 games), steps/strip.mjs + steps/webm.mjs, refs/canary-01.png (LFS) | merged |
| #352 | qr/prd12-workflows-gate | quality-gate.yml (capture shards, metrics, gate verdicts + SUMMARY), playwright.quality-gate.config.ts + GPU global-setup guard, reusable-capture cleanup (continue-on-error removed, bench selector), capture.mjs runnerImage (T3.7), runner-image-changed flag, visual-baseline deleted (T3.8), quality-review.yml + judge-round.ts + canary abort, quality-devices.yml + denial record, release.yml gate + round-verdict (3.0.1 REFUSED verified), classify-tools CLASSIFICATION.json + 115 dirs → tools/_quarantine/, source-substring audit + 43 invariant annotations, scripts ≤80 assert, injected-regressions test | merged |
| #353 | qr/prd12-capture-inputs | capture workflow `ref` input (T1.12 dispatch support), `--title-repeats`/QRC_TITLE_REPEATS (T1.13) | merged |

## Actions runs

- IC-0 dry-run (quality-checkpoint.yml, workflow_dispatch): run `37565849900` — dispatched 2026-10-07T03:14Z (T1.17; deadline 2026-10-08 met).
- T1.12 baseline dispatch (quality-rebuild-capture.yml, `ref=c08d8acb`, bench only): run `37565971130` — dispatched; the 3.0.1 harness predates benchmarks/quality-rebuild, so the benchmark job may no-op; result recorded when run completes.
- T1.13 titles dispatch (`title_repeats=5`, all games): first dispatch cancelled by the workflow concurrency group (same `github.ref`); re-dispatch after the baseline run completes, then compare `01-title.repeat-*` frames byte-wise / FLIP ≤ floor and write `titleDeterministic` per game in games.prd12.json.
- T3.6 injected-regressions branch `qr/injected-regressions` pushed (shadow-half, ibl-zero, dpr-half commits); gate assertions read `out/injected-<id>/verdicts.json` and pending-skip until a gate run executes against the branch.
- T5.7 release dry-run: `release-round-check.mjs` exits 1 on empty index.jsonl — REFUSED verified locally (3.0.1 equivalent, no passing round).
- T5.6 device farm: provisioning DENIED (operator action required); minimal grant + skeleton workflow recorded in phase-5-devices.md; emulated lane kept.

## qr-request / ccr activity

- #344 (to:prd14) — adopt strip/webm steps + overlay fields in games.json (filed with PR D).
- #44 (Q-15-6) and #49 (Q-13-2) — CLASSIFICATION.json slices attached as comments (T4.9 non-owned families).
- All 17 §12.3 day-0 issues remain open for their owners (#38–54).

## Open risks

- PRISM_API_KEY not provisioned in repo secrets → quality-review/judge rounds (T2.7 admission round) cannot run; once provisioned, dispatch quality-review.yml with `gate_run_id` + `round=R-1`.
- T2.8 game-visual-qa threshold re-derivation needs the T2.7 admitted set — blocked behind the same secret.
- T1.12 may produce no captures at c08d8acb (harness absent at that commit); if so, the baseline must be produced by checking out main's tools against a baseline build — operator guidance needed if the run no-ops.
- Other lanes' pre-existing unit-test failures observed (prd01-render-targets, prd13-looks) — not lane-12 scope.

## NOT RUN (with reasons)

- End-to-end `quality-gate.yml` run — gated on first pull_request/push:main trigger after merge; the file only became dispatchable on merge.
- FLIP/LPIPS on real captures — runner-bound (pip pins install in CI; local captures forbidden by lane rules).
- Panel admission round T2.7 / threshold re-derivation T2.8 — blocked on PRISM_API_KEY repo secret.
- Real-device run T5.6 — AWS provisioning denied; denial + minimal grant recorded.
- titleDeterministic measurement T1.13 — dispatched, awaiting run + artifact diff.
- Baseline detectors T1.12 — dispatched at ref c08d8acb; may no-op (harness predates commit).
- Bundle-gzip delta for lanes/prd12.ts — measured in CI artifacts, not locally.
