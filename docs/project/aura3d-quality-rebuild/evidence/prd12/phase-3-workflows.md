# Lane 12 evidence — gate workflows + triage (T3.x, T4.x, T5.6/5.7)

## Landed in this PR

- `quality-gate.yml` (T3.3): pull_request + push:main + workflow_call, no secrets.
  capture-bench + capture-games-{1,2,3} (6 games each) call the reusable
  quality-rebuild-capture.yml; `metrics` (ubuntu-latest) runs collect-checkpoint +
  `python -m metrics`; `gate` runs `cli.ts gate` + writes the step summary.
- `quality-rebuild-capture.yml` (T3.4): all three `continue-on-error: true` removed;
  converted to the reusable capture workflow (workflow_call already present);
  new `bench` input so games-only shard calls skip the benchmark job.
- `playwright.quality-gate.config.ts` + `tests/quality-gate.global-setup.ts` (T3.9):
  the three pixel specs unchanged; global setup fails on
  `/SwiftShader|llvmpipe|Software/i` via gpu-probe.
- Runner drift (T3.7): capture.mjs records `environment.runnerImage` =
  `ImageOS[/ImageVersion]`; `cli gate` emits `runner-image-changed` when it
  differs from `GoldenManifest.runnerImage` — advisory flag, blocking stays on
  re-calibrated thresholds.
- `browser-matrix.yml` visual step + `tools/visual-baseline/` removed (T3.8);
  `test:visual` recorded in root-manifest-pending.json for the Q-15-1 swap.
- `quality-review.yml` (T4.6): workflow_dispatch + `environment: quality-review`;
  canary-first judge round → PR with `history/rounds/<round>.json` + human stubs.
  `tools/quality-gate/src/judge-round.ts` implements the round; canary aborts on
  missing required tokens. Operator action recorded: dedicated Prism key as the
  `quality-review` environment secret `PRISM_API_KEY`.
- `muse301-final-review.yml` deleted (T4.12) — replaced by quality-review.yml.
  No other muse301/remote-browser-301/native-*-301 step calls a quarantined tool
  (verified by CLASSIFICATION.json path + script scan: zero hits).
- T4.9 quarantine: 115 aggregator-only lane-12-family dirs moved to
  `tools/_quarantine/` (single batch; per-family provenance is in
  CLASSIFICATION.json + git rename history). `no-verdict-literals.test.ts`
  updated to the post-quarantine invariant.
- `source-substring-audit.test.ts` (T4.10): fails on `readFileSync(apps|packages|
  templates) + toContain` without `// invariant:`; all 43 surviving files
  annotated. Zero files deleted on this pass — every matched test asserts a real
  invariant; the audit test now enforces it going forward.
- T4.11: root script count is 70 (≤80 target met); `scripts.test.ts` now asserts
  the bound. The Q-15-1 batch file records the `test:visual`→`quality:gate` swap.
- `qr/injected-regressions` branch pushed (T3.6): three commits through public
  spec fields (key intensity 3→1.5, environment.intensity→0, pixelRatioScale 0.5
  — new test-only spec field consumed in three/common.ts).
  `injected-regressions.test.ts` asserts each is blocked once the gate output is
  recorded; pending until that run.
- `quality-devices.yml` (T5.6) + `evidence/prd12/phase-5-devices.md`:
  provisioning is an operator action; the workflow fails fast with the minimal
  grant until secrets exist. Emulated lane remains blocking.
- `release.yml` (T5.7): `quality-gate` (reusable) + `round-verdict`
  (`bin/release-round-check.mjs`) precede build/publish; the 3.0.1 dry-run is
  refused because no admissible round exists — verified locally:

      $ node tools/quality-gate/bin/release-round-check.mjs
      release-round-check: REFUSED — no round index at benchmarks/quality-rebuild/history/index.jsonl

## NOT RUN (runner-required)

- quality-gate.yml end-to-end (first run on this PR or the next push to main).
- quality-review.yml judge round (needs the `quality-review` environment +
  PRISM_API_KEY secret — operator action).
- quality-devices.yml real run (awaiting provisioning).
- Gate run on `qr/injected-regressions` (assertions armed in the test).
- T2.7 panel admission round, T1.12 baseline detectors, T1.13 titleDeterministic
  measurement — all runner/panel-bound.
