# Agent-eval baselines

Lane 13 (PRD-13 §15 Phase 1, §22) baseline evidence for the agent-output-eval and
template-lookdev harnesses. Everything here is a **baseline record**, never an
approved golden: it describes what 3.0.1 produced so later rounds can be compared
against it.

## Layout

- `templates/baseline-3.0.1/<template>/<shot>-<viewport>.png` — the 3.0.1 template
  capture set: 19 templates × 3 shots (`opening`, `mid`, `action`) × 2 viewports
  (`desktop-1920x1080`, `mobile-390x844`), produced by
  `tools/agent-templates/capture-templates.mjs` inside `template-lookdev.yml`
  (GitHub `macos-14`, Chromium, ANGLE Metal, flags `none`). `report.json` in the
  run artifact records per-shot sha256, the packed tarball hashes, the run id and
  `ciProvider`/`browserChannel`; frames are only compared within one provider and
  channel (CI-ROUTING.md §3).
- `round-0.json` — the agent-eval round-0 record: 12 prompts × 3 seeds against the
  3.0.1 skills/templates, judged as a C-32 `PanelRoundRecord` (`rubricVersion`
  `rubric-v1-qr0`, marked `screening` unless the round coincides with a G-PANEL;
  vision + ≥ 1 named human per PRD-13 §18.1).

## Runs

| Run | Purpose | Workflow / pipeline | Result |
|---|---|---|---|
| pending | first template-lookdev green run (T0.2) | `template-lookdev.yml` on `main` | link lands with the run |

_Note: `workflow_dispatch` can only run `template-lookdev.yml` once the workflow
file is on `main`; the first green run is linked here and in `evidence/prd-13/`._
