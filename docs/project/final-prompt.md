# Final Project Execution Prompt

This file is no longer the primary rebuild prompt. The old final prompt was written for a generated rebuild phase and referenced stale root-level PRD files. Current work should start from the live repository, the V9 roadmap docs, and executable reports.

## Objective

Build G3D into a credible TypeScript-first browser 3D engine and workflow SDK that can replace custom Three.js stacks for scoped product, asset, material, animation, and interactive-scene workflows.

The objective is code and evidence, not more generated status documents.

## Current Source Of Truth

Use these files first:

- `README.md`
- `docs/project/documentation-index.md`
- `docs/project/v9-roadmap-status.md`
- `docs/project/v9-roadmap-parity-matrix.md`
- `docs/project/v9-roadmap-claim-boundary.md`
- `docs/project/v9-roadmap-three-js-parity-plan.md`
- `docs/project/v9-roadmap-code-backlog.md`
- `tests/reports/v9/threejs-inventory.json`
- `tests/reports/v9/completion-audit.json`
- `tests/reports/v9/route-health.json`

## Operating Rules

- Treat the package code as the product surface.
- Treat apps, screenshots, and route dashboards as evidence, not the product itself.
- Move behavior out of route-local demos and into public package/runtime APIs.
- Keep all claims inside the current V9 claim boundary.
- Prefer a failing diagnostic over silent fake parity.
- Verify route behavior with browser, unit, visual, and report evidence where the claim requires it.

## Current Priority

Continue maintaining V10 parity/exceeds areas as package-level code:

- WebGPU backend maturity and real-browser evidence.
- Postprocessing depth, bloom, outline, SSAO, and composer behavior.
- Controls, camera, stereo, WebXR, and route-backed interaction APIs.
- Lines, points, sprites, helpers, and geometry edge cases.
- Remaining asset-loader, material-extension, and physical-lighting boundaries.
- Performance, memory lifecycle, disposal, and diagnostics.

## Completion Definition

A feature is complete only when these agree:

- Public package API.
- Runtime implementation.
- Unit or integration tests.
- Browser or visual route evidence when visual behavior is claimed.
- Report output.
- Documentation claim boundary.

Generated checklists alone are not completion evidence.
