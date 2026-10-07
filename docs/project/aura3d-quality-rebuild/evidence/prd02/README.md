# PRD-02 evidence (Lighting, IBL, Reflections and Shadows)

Lane-owned evidence tree per PRD-02 §16.1. Layout:

- `baseline/prd02-YYYYMMDD/` — flag-`none` captures committed by the
  `lighting-quality.yml` `lane-capture` job (screenshots + JPEG q90 +
  `report.json` with all §16.4 metrics). Refresh via the workflow's
  `update_baseline` dispatch input.
- `features/<flag>/prd02-YYYYMMDD/` — flag-on comparison reports for the
  flag ladder in §10 (`lighting` → `lighting,csm` → `lighting,probes` →
  `lighting,contact`).
- `analysis/` — acceptance artifacts for S-02-* items (mask IoU tables,
  spectral numbers, diag dumps).

Baseline status: **pending first macos-14 capture**. The lane-capture job
uploads `prd02-lane-capture-<sha>` artifacts on every run; once a clean
flag-none run exists on `main` or `qr/prd02-lane-harness`, dispatch the
workflow with `update_baseline=true` to commit it here.

Until the baseline lands, `prd02-15` shadow-drop (≈9% Aura3D vs ≈50%
three.js on the shared receiver mask — §16.1 check) is reported in
`report.json` only.
