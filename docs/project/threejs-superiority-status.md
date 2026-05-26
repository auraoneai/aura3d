# Three.js Superiority Status

Version: 1.0.0

This page documents the current Three.js superiority gate status against the report files and generator scripts in this worktree.

## Current Status

The Three.js superiority gate is currently passing in this workspace based on freshly generated local report evidence from `pnpm superiority`.

- Latest local audit report: `tests/reports/superiority/superiority-audit.json`
- Latest local audit timestamp: `2026-05-26T10:24:24.625Z`
- Report namespace: `tests/reports/superiority/`

The report files live under `tests/reports/`, which is ignored by git, so clean checkouts must regenerate them before making the same claim.

| Report | Current local status |
|---|---|
| `tests/reports/superiority/feature-parity.json` | Present, `pass: true` |
| `tests/reports/superiority/visual-quality.json` | Present, `pass: true` |
| `tests/reports/superiority/performance.json` | Present, `pass: true` |
| `tests/reports/superiority/animation-fidelity.json` | Present, `pass: true` |
| `tests/reports/superiority/physics-fidelity.json` | Present, `pass: true` |
| `tests/reports/superiority/resource-lifecycle-100-reloads.json` | Present, `pass: true` |
| `tests/reports/superiority/memory-lifecycle.json` | Present, `pass: true` |
| `tests/reports/superiority/developer-workflow.json` | Present, `pass: true` |
| `tests/reports/superiority/claim-defense.json` | Present, `pass: true` |
| `tests/reports/superiority/superiority-audit.json` | Present, `pass: true` |

`tests/reports/` is ignored by git, so clean checkouts may have no generated reports until commands run.

The superiority reports use contextual names only. There is no numbered release folder for this evidence set.

## Current Three.js Parity Inputs

The current parity report directory is `tests/reports/threejs-parity/`.

| Report | Current local status |
|---|---|
| `tests/reports/threejs-parity/threejs-inventory.json` | Present, `pass: true`, 54 rows matched |
| `tests/reports/threejs-parity/same-scene-render.json` | Present, `pass: true` |
| `tests/reports/threejs-parity/visual-review.json` | Present, `pass: true` |
| `tests/reports/threejs-parity/performance.json` | Present, `pass: true` |
| `tests/reports/threejs-parity/route-health.json` | Present, `pass: true` |

## Commands

```sh
pnpm superiority:feature-parity
pnpm superiority:visual-quality
pnpm superiority:performance
pnpm superiority:animation-fidelity
pnpm superiority:physics-baseline
pnpm superiority:physics-fidelity
pnpm superiority:resource-lifecycle
pnpm superiority:memory-lifecycle
pnpm superiority:developer-workflow
pnpm superiority:claim-defense
pnpm superiority:audit
pnpm superiority
```

## Public Claim Rule

Do not claim a fully passing Three.js superiority gate unless `pnpm superiority` has been run in the current workspace and `tests/reports/superiority/superiority-audit.json` has `pass: true`. If those generated reports are absent or stale, use narrower wording tied to the report categories that were actually regenerated.
