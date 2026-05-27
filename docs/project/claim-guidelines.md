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

## WebGPU Claim Language

Allowed before a complete browser/device matrix:

- A3D includes WebGPU backend paths with explicit availability diagnostics.
- WebGPU support is conditional on browser/device availability.
- Named WebGPU workflows have generated route and hardware evidence.
- WebGL2 remains the broadly available default backend.

Allowed only for rows marked supported in `tests/reports/webgpu-feature-matrix.json`:

- A3D supports WebGPU for the named feature matrix rows marked supported.
- A3D can render the approved product-viewer and PBR asset workflows through WebGPU on verified hardware.

Do not use WebGPU wording such as:

- unqualified end-to-end WebGPU coverage;
- complete WebGPU/WebGL2 parity;
- every Aura3D example supports WebGPU;
- WebGPU works across all browsers and GPUs;
- WebGPU is always faster than WebGL2.

Before using first-class WebGPU language, run `pnpm webgpu` and confirm `tests/reports/webgpu-hardware-matrix.json` records the browser/device being claimed.

## Review Checklist

- Does the claim cite current package code, test files, route evidence, or generated reports?
- Does the claim use the current report directory `tests/reports/threejs-parity/`?
- Does the claim match the current pass/fail state in `docs/project/threejs-superiority-status.md`?
- Does the claim name exclusions and unsupported areas?
- Would a reader interpret the claim as broader than the evidence?

Claim wording and public-claim boundaries are governed by `docs/project/product-studio-claim-registry.md`.
