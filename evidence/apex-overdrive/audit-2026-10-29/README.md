# Apex Overdrive audit fixes: before and after (2026-10-29)

Lane G02 of the live-games audit (`docs/audits/sections/game-02-roadster-rush.md`, report `docs/audits/lanes/g02.md`).

- **Runner:** serverless ACR Chromium, software WebGL2 (SwiftShader). Not a GPU: these are not real-GPU frames.
- **Spec:** `tests/browser/audit-fix/roadster-rush.spec.ts`, seed 42, manual stepping through `window.__GAME__.game`. Every state is presented and drawn a few more frames before the `.b` shot; judge `.b`. The title is also shot early (`.a`).
- **Builds:** `before` is `audit-fix/integration` (b2dba3713, the 4.5.0 game source). `v437` is tag v4.3.7 (desktop only; the 60 min ACR step ended after mid-drive). `after` is `audit-fix/g02`.
- **Decoder:** `node decode.mjs <acr-run.log> <out-dir>` writes `<target>/<shot>.jpg`, `meta.jsonl` (luma of the canvas only, plus the probe) and `probes.jsonl`.
- **Probe fields:** `sim` counts what the simulation holds within 120 m ahead of the player; `drawn` counts what the renderer draws in the same range (before: visible pool nodes; after: the renderer's own slot lists). `drawCalls` is `app.diagnostics().drawCalls`.

## Folders

| Folder | Build | Run ids |
|---|---|---|
| `before/` | 4.5.0 base | g02b-20261029T131209Z-{dm,dd,pm,pd,x,y} |
| `after/` | audit-fix/g02 | g02c-20261029T140227Z-{dm,dd,pm,pd,x,y} |
| `v437/` | v4.3.7 | g02-v437b-20261029T* (desktop main) |

`summary.tsv` lists every shot with its luma, draw calls and the sim/drawn counts side by side.
