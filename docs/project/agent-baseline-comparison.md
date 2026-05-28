# Agent Baseline Comparison

Generated: 2026-05-28T09:05:00.000Z

This records the first raw Three.js baseline run requested by `TestV4PlanPRD.md`.
The run was performed by a fresh Codex subagent outside the repository under
`/tmp/aura3d-raw-three-baseline`.

## Result

| Baseline | Result | Score | Turns | API Hallucinations | Asset Path Errors |
|---|---:|---:|---:|---:|---:|
| Raw Three.js Codex baseline | pass | 100/100 | 1 | 0 | 0 |

## Task

Build the same developer-facing scene without Aura3D:

- Vite + TypeScript app.
- Raw Three.js renderer.
- Local GLB product loading.
- Studio lighting and orbit controls.
- Slow camera dolly.
- Rain effect.
- Reflective floor.
- Click handler that swaps to a second model.
- Static deployment-ready build.

## Verification

| Check | Result |
|---|---:|
| `npm install` | pass |
| `npm run build` | pass |
| Dev route health | pass |
| Static preview route health | pass |
| Static preview root HTTP | 200 |
| Screenshot nonblank | pass |
| Prompt-aligned pixels | pass |
| Click model swap | pass |

## Metrics

| Metric | Value |
|---|---:|
| App code | 261 lines |
| CSS | 60 lines |
| Tests | 74 lines |
| Dist output | 4.7 MB |
| Main JS minified | 573.89 kB |
| Main JS gzip | 147.36 kB |

## Notes

- The baseline used only copied local assets:
  `/Users/gurbakshchahal/aura3d/fixtures/asset-corpus/duck.glb` and
  `/Users/gurbakshchahal/aura3d/fixtures/asset-corpus/damaged-helmet.glb`.
- The subagent reported that it did not read repository source code.
- `npm install` reported two moderate audit findings in the raw Three.js
  dependency tree. They did not block build or runtime verification.
- Screenshot evidence exists outside the repo at
  `/tmp/aura3d-raw-three-baseline/test-results/viewer-ready.png`; it is not
  committed because image artifacts are excluded from commits.
