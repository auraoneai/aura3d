# Public Claim Guidelines

Version: 1.0.0

## Rule

Public claims must be backed by current package code, tests, routes, and generated reports. If docs and reports disagree, use the narrower claim.

The current local report state is passing after regenerating the contextual Three.js parity and superiority report suites. Because `tests/reports/` is ignored by git, clean checkouts and release jobs must regenerate those reports before repeating the claim.

## Allowed Baseline Wording

Use wording such as:

> A3D is a TypeScript-first browser 3D engine and workflow SDK with first-party renderer, asset, animation, physics, controls, workflow, diagnostics, and Three.js migration packages. Current generated reports show passing measured Three.js parity and superiority slices for the categories covered by `tests/reports/superiority/superiority-audit.json`.

Stronger wording may cite the generated superiority audit report only for the exact categories it covers and only after `pnpm superiority` has been run in the current workspace or release job.

## Blocked Wording

Do not use unqualified language such as:

- better than Three.js;
- exceeds Three.js in every sense;
- full Three.js replacement;
- Unity/Unreal replacement;
- complete WebGPU support across browsers and devices;
- complete glTF ecosystem support;
- every official Three.js example exceeded;
- production-ready for every browser 3D use case.

## Review Checklist

- Does the claim cite current package code, test files, route evidence, or generated reports?
- Does the claim use the current report directory `tests/reports/threejs-parity/`?
- Does the claim match the current pass/fail state in `docs/project/threejs-superiority-status.md`?
- Does the claim name exclusions and unsupported areas?
- Would a reader interpret the claim as broader than the evidence?

Claim wording and public-claim boundaries are governed by `docs/project/product-studio-claim-registry.md`.
