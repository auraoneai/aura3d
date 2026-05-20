# Completion Audit

## Current Result

G3D has a passing V10 superiority audit for the measured browser 3D categories.

The current claim is evidence-scoped: G3D matches or exceeds Three.js across the measured graphics, animation, asset, physics, performance, and developer-workflow categories documented by the V10 reports.

## Latest V10 Snapshot

| Source | Result |
|---|---|
| `tests/reports/v10/superiority-audit.json` | Pass |
| `tests/reports/v10/feature-parity.json` | Pass |
| `tests/reports/v10/visual-quality.json` | Pass |
| `tests/reports/v10/performance.json` | Pass |
| `tests/reports/v10/animation-fidelity.json` | Pass |
| `tests/reports/v10/physics-fidelity.json` | Pass |
| `tests/reports/v10/memory-lifecycle.json` | Pass |
| `tests/reports/v10/developer-workflow.json` | Pass |
| `tests/reports/v10/claim-defense.json` | Pass |

## What Can Be Claimed

G3D has evidence-backed parity/exceeds claims for:

- Product and asset viewer workflows.
- Public package-backed renderer foundations.
- glTF/GLB loading and render-resource conversion.
- PBR/HDR/material work.
- Animation, skinning, morph, IK, retargeting, and crowd workflows.
- Physics and interaction workflows.
- WebGL2/WebGPU route evidence.
- Same-scene comparison work against Three.js examples.

## Claim Discipline

Public claims must link to `tests/reports/v10/claim-defense.json` and `docs/project/v10-superiority-status.md`. Claims outside the measured categories need a new report and gate before they become public copy.

## Audit Rule

A feature remains in the parity/exceeds set only when package code, tests, route evidence where relevant, reports, and docs all agree.
