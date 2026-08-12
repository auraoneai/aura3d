# Aura3D 2.0 benchmark fixtures

This directory contains executable benchmark inputs and runner utilities. It is
not the public Three.js parity claim and it does not decide release readiness.
Current competitive conclusions come from the installed-package head-to-head
reports and the documentation under `docs/project/parity/threejs/`.

## Inputs

- `workloads.json` is the machine-readable, frozen ten-workload agent benchmark
  input. It replaces the former Markdown prompt packet.
- `assets/sneaker.glb` is the only prompt-provided external asset and is allowed
  only by the product-viewer workload.
- `context/` contains frozen package/source context bundles. Their manifests and
  hashes define the exact context; snapshot Markdown inside a bundle is input
  data, not current repository guidance.
- `runner/` contains finite setup, capture, validation, asset/source-audit,
  visual-QA, and performance utilities.

## Current commands

```bash
pnpm benchmark:guard-full
pnpm benchmark:tarball-audit
pnpm benchmark:validate-engine
pnpm benchmark:render-material-quality
pnpm benchmark:scene-kits
pnpm benchmark:contact-sheet
pnpm benchmark:visual-qa
pnpm benchmark:performance-budgets
```

Each command documents its actual inputs in source and writes generated output
under `benchmark/runs/` or `tests/reports/`. Generated screenshots, notes, and
contact sheets are evidence artifacts, not maintained documentation.

## Claim boundary

Frozen historical contexts or results cannot establish current renderer,
workflow, performance, or ecosystem parity. A current claim requires locked
versions and companion packages, identical workload inputs, installed Aura3D
tarballs, browser evidence, disclosed losses, and the current comparison gate.
