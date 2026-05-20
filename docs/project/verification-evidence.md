# Verification Evidence

This page summarizes where current verification evidence lives. It is not a replacement for running the commands.

## Core Commands

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
pnpm test:visual
pnpm build
pnpm verify
```

## V8, V9, And V10 Commands

```sh
pnpm v8:route-health
pnpm v8:threejs-parity
pnpm v8:no-three-runtime
pnpm v9:inventory
pnpm v9:route-health
pnpm v9:official-example-parity
pnpm v9:same-scene-render
pnpm v9:performance
pnpm v9:completion-audit
pnpm v9
pnpm v10:feature-parity
pnpm v10:visual-quality
pnpm v10:performance
pnpm v10:animation-fidelity
pnpm v10:physics-fidelity
pnpm v10:memory-lifecycle
pnpm v10:developer-workflow
pnpm v10:claim-defense
pnpm v10:superiority-audit
pnpm v10
```

## Current Report Artifacts

| Evidence | Path |
|---|---|
| Final requirements trace | `tests/reports/final-requirements-trace.json` |
| Final release verification | `tests/reports/final-release-verification.json` |
| V9 Three.js inventory | `tests/reports/v9/threejs-inventory.json` |
| V9 completion audit | `tests/reports/v9/completion-audit.json` |
| V9 route health | `tests/reports/v9/route-health.json` |
| V9 same-scene render | `tests/reports/v9/same-scene-render.json` |
| V9 official example parity | `tests/reports/v9/official-example-parity.json` |
| V9 performance | `tests/reports/v9/performance.json` |
| V9 visual review | `tests/reports/v9/visual-review.json` |
| V10 feature parity | `tests/reports/v10/feature-parity.json` |
| V10 visual quality | `tests/reports/v10/visual-quality.json` |
| V10 performance | `tests/reports/v10/performance.json` |
| V10 animation fidelity | `tests/reports/v10/animation-fidelity.json` |
| V10 physics fidelity | `tests/reports/v10/physics-fidelity.json` |
| V10 memory lifecycle | `tests/reports/v10/memory-lifecycle.json` |
| V10 developer workflow | `tests/reports/v10/developer-workflow.json` |
| V10 claim defense | `tests/reports/v10/claim-defense.json` |
| V10 superiority audit | `tests/reports/v10/superiority-audit.json` |

## Evidence Boundaries

- A passing report proves the criteria named by that report.
- V10 aggregates feature, visual, animation, physics, asset, performance, workflow, memory, and documentation evidence into the current parity/exceeds position.
- New claims outside the measured categories require new evidence and a claim-defense update.
- Public claims must follow `tests/reports/v10/claim-defense.json` and `docs/project/v10-superiority-status.md`.
