# PRD-13 S-rows: harness and record skeletons

Status of every row below: **NOT-RUN**. Nothing in this directory is evidence yet.
No scores, run ids, PNGs or judgements are committed here; `records/` does not
exist until a real main run produces a record.

Source of the row definitions: `prompts/finish/FINAL-REMAINING-WORK.prompt.md`,
Lane 13 section (13-BASE, 13-S1/S2, 13-S3/S4/S5, 13-S6, 13-S8, 13-S9, 13-PROMO).

## Rules that apply to every record

- Remote proof is a GitHub Actions run on `main` on `macos-14` only (GitLab is
  unavailable). Frames are compared only with frames from other GitHub macos-14
  runs; never across providers or browser channels.
- Every record is a JSON file at `records/<row>/<name>.json` with a `kind` that
  selects `schemas/<kind>.schema.json` (JSON Schema draft 2020-12).
- Every record schema requires `runId` (GitHub Actions run id, digits),
  `runUrl`, `workflow`, `job`, `branch: "main"`, `provider: "github-macos-14"`,
  `headSha` (40 hex) and `recordedAt` (ISO 8601).
- Validate before committing:
  `node tools/agent-templates/validate-s-records.mjs` (exit 1 on any invalid
  record; prints `0 records` and exits 0 while none exist). Its unit test is
  `tests/qr/prd13/s-records.test.ts`.
- Records are written by hand or by the producing job from the downloaded
  artifact. A record whose numbers miss the row's threshold is still committed
  as-is; thresholds are checked against the record, never by editing it.

## 13-BASE: v3.0.1 template baselines (do-first, P0)

- Needs: 19 templates x 3 shots (opening, mid, action) x 2 viewports
  (desktop-1920x1080, mobile-390x844) = 114 PNGs, captured from the templates
  at tag `v3.0.1` (commit `3cfdb423af1e51867bab0dd438b8c937ec097fb2`) with
  `qr_flags=none`; committed under `benchmarks/agent-eval/baseline/templates/`
  with `report.json`. Plus a real `round-0.json` from an `agent-output-eval.yml`
  run (the existing `benchmarks/quality-rebuild/history/rounds/round-0.json` is
  the pre-afb475c2 placeholder and does not count).
- Command: dispatch `.github/workflows/template-lookdev.yml` on `main`, job
  `capture` (macos-14), inputs `source_ref=v3.0.1`, `qr_flags=none`,
  `templates=` (empty = all). The `Check out templates from source_ref` step
  replaces `packages/create-aura3d/templates` with the tag's tree (so
  `arena-shooter`, added after 4.0.0, is not captured) and
  `capture-templates.mjs` records `templateSource: { ref, commit }` in
  `report.json`. Packages (packed tarballs) and the capture tool stay at the
  dispatched main commit (`environment.sha`). Then dispatch
  `.github/workflows/agent-output-eval.yml` for round-0.
- Record: `records/13-BASE/template-baseline.json`, schema
  `schemas/template-baseline.schema.json`. Fields: common fields;
  `sourceRef: "v3.0.1"`, `sourceRefCommit` (const), `flags: "none"`,
  `reportPath`, `reportSha256`, `baselineDir`, `templates[19]` of
  `{ template, shots[6] of { shot, viewport, file (.png), sha256 } }`,
  `summary { templatesCaptured: 19, shotsExpected: 114, shotsCaptured: 114, failures: 0 }`,
  `round0 { runId, workflow, path, sha256 }`.
- Waits on: 13-CYCLE (#427 `template-lookdev.yml`; the `@aura3d/controls` <->
  `@aura3d/input` cycle that fails `publish-all.mjs --pack-only`, #442; the
  capture step still has `continue-on-error: true`, which 13-CYCLE removes);
  #137 `KIRO_PRISM_API_KEY` (owner action) for round-0.
- Status: NOT-RUN.

## 13-S1/S2: blind A/B vs 4.0.0 and game-template panel

- Needs: S1, blind A/B of all 20 templates against their 13-BASE frames
  (median gain >= +1.5, no category drop > 0.5). S2, the 6 game templates
  judged absolutely (median >= 4.5, none < 4.0; ibl/env >= 4.5,
  atmospheric >= 4.0, shadows >= 3.5). Vision judge plus >= 1 named human,
  through the G5 panel tooling. Open question for G5: main has 20 templates but
  v3.0.1 has 19 (`arena-shooter` is new), so one of the 20 has no 4.0.0 A side.
- Command: B-side frames from `template-lookdev.yml` job `capture` on main
  (`qr_flags` as the row under test requires); A-side is the 13-BASE run. The
  panel packet is assembled by the G5 panel tooling (not yet on main).
- Record: `records/13-S1/ab-judgement.json` (`mode: "ab"`) and
  `records/13-S2/ab-judgement.json` (`mode: "absolute"`), schema
  `schemas/ab-judgement.schema.json`. Fields: common fields; `mode`,
  `baselineRunId` (null only for absolute), `rubric`, `blind`, `panelTool`,
  `judges[>=2]` (`{ type: vision|human, name, model? }`, at least one human),
  `entries[]` of `{ subject, frame, frameSha256?, baselineFrame?, judge,
  categories[] of { category, baselineScore|null, score } }`,
  `summary { subjects, median, min, medianGain|null, maxCategoryDrop|null, categoryMedians? }`.
  Published under `evidence/prd-13/s1-s2/` once judged.
- Waits on: 13-BASE; G5 panel tooling; a named human judge.
- Status: NOT-RUN.

## 13-S3: prompt-plan gate + 12-frame judgement

- Needs: the prompt-plan gate (`prompt-plan-render` spec) as a merge gate, and
  12 frames judged (vision + 1 named human).
- Command: macos-14 job in `qr-prd13-authoring.yml` (13-SPECS rework of #719).
- Record: `records/13-S3/ab-judgement.json`, `mode: "absolute"`, same schema
  as S1/S2.
- Waits on: 13-SPECS, 13-CYCLE, 13-BASE, a named human judge.
- Status: NOT-RUN.

## 13-S4: look-lint census

- Needs: `aura3d look lint` over 18 games + 19 baselines + 4 broken controls:
  100% clean, 0 errors, 4 of 4 controls flagged, human spot-check of 5.
- Command: a macos-14 job on main running `aura3d look lint` over the 13-BASE
  frames/work trees and the game routes (no such job exists yet; the intended
  host is the `qr-prd13-authoring.yml` macos-14 job from 13-SPECS).
- Record: `records/13-S4/look-lint-census.json`, schema
  `schemas/look-lint-census.schema.json`. Fields: common fields;
  `baselineRunId`, `command`, `entries[41]` of `{ subject, group:
  game|baseline|broken-control, errors, warnings, codes[] }`,
  `summary { games: 18, baselines: 19, brokenControls: 4, cleanRatio, errorCount, brokenControlsFlagged }`,
  `humanSpotCheck { name, subjects[5], agreed, comment? }`.
- Waits on: 13-BASE; the census job; a named human.
- Status: NOT-RUN.

## 13-S5: craft-ratio

- Needs: `tests/reports/craft-ratio.json` produced in CI on main and committed,
  plus a signed art-director note.
- Command: `pnpm exec tsx --tsconfig tsconfig.base.json tools/agent-skills/craft-ratio.ts`
  in a main CI job that uploads the report (no workflow runs it today).
- Record: `records/13-S5/craft-ratio.json`, schema
  `schemas/craft-ratio.schema.json`. Fields: common fields; `command`,
  `reportPath`, `reportSchema: "aura3d.craft-ratio/1"`, `reportSha256`,
  `artDirectorNote { name, signedAt, path }`.
- Waits on: a CI step for craft-ratio (lane-13 workflow); a named art director.
  The schema pins `provider: "github-macos-14"`, so the step must run in a
  macos-14 job.
- Status: NOT-RUN.

## 13-S6: look capture timing

- Needs: `aura3d look capture --runner gh-actions` on product-viewer and
  mini-game; 3 consecutive successful runs each returning PNGs +
  `appliedLook.json` in <= 8 min.
- Command: in a repo scaffolded from each template (owner action: a scratch
  GitHub repo, since the command dispatches the scaffold's own
  `.github/workflows/aura3d-lookdev.yml`, `runs-on: macos-14`, through the
  operator's `gh` auth), run
  `aura3d look capture --route / --shots opening,mid,action --viewports desktop,mobile --runner gh-actions --json`
  three times.
- Record: `records/13-S6/look-capture-timing-<template>.json`, schema
  `schemas/look-capture-timing.schema.json`. Fields: common fields
  (`workflow: ".github/workflows/aura3d-lookdev.yml"`); `template`,
  `command`, `runs[3]` of `{ runId, repository, conclusion: "success",
  durationSeconds <= 480, pngs[] of { file, sha256 }, appliedLookPath,
  appliedLookSha256 }`.
- Waits on: 13-CYCLE (templates must pack/install); owner-created scaffold repo.
- Status: NOT-RUN.

## 13-S8: three-compat vs three.js r185

- Needs: the 8 three-compat templates captured on macos-14 and judged against
  named three.js r185 examples; each >= its 13-BASE score + 1.5; gap recorded;
  parity never claimed.
- Command: `template-lookdev.yml` job `capture` on main with
  `templates=three-compat-...` (8 dirs); r185 example frames captured on the
  same provider (no harness for the three.js side exists yet).
- Record: `records/13-S8/three-compat-comparison.json`, schema
  `schemas/three-compat-comparison.schema.json`. Fields: common fields;
  `baselineRunId`, `threeRevision: "r185"`, `judges[>=2]` (one human),
  `entries[8]` of `{ template, threeExample, threeExampleFrame, aura3dFrame,
  baselineScore, score, threeExampleScore, gap, parityClaimed: false }`.
- Waits on: 13-BASE; an r185 example capture harness; judges.
- Status: NOT-RUN.

## 13-S9: flag-off identity

- Needs: with flags `none`, `compilePromptPlan` outputs, the `index.ts:18256`
  warning text, the recipe census and the C-36 RenderSource of the 18 base
  snapshots byte/deep-equal to `85aafcd0b50f86d1b1c487cee4753a1145f79b6c`.
- Command: a CI job on main that builds the reference at 85aafcd0 and compares
  (no harness exists yet).
- Record: `records/13-S9/flag-off-identity.json`, schema
  `schemas/flag-off-identity.schema.json`. Fields: common fields;
  `referenceSha` (const), `flags: "none"`, `checks { compilePromptPlan,
  warningText, recipeCensus, renderSourceC36 (compared: 18) }`, each
  `{ equal, comparison: byte|deep, compared, differing, diffSample? }`.
- Waits on: T0-31 (G5 typecheck); the comparison harness.
- Status: NOT-RUN.

## 13-PROMO: A3D_QR_LOOKS promotion

- Needs: ship `character-hero` once an F-06 row is verified, pass standalone,
  then I1-I6 at G-PANEL, then T7.1 at flag removal; G5 promotes
  `A3D_QR_LOOKS` (`flags.state.ts:23`) at a checkpoint with S1-S9 green in one
  main run set.
- Command / record: none of its own. It is satisfied by every S-row record
  above validating and passing in one main run set, plus G5's promotion
  commit. No schema is added for it.
- Waits on: F-06 (06-REC/06-ALL), #156, #137, and all S-rows above.
- Status: NOT-RUN.
