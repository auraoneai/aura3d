# Benchmark and Comparison Evidence

This directory contains human-readable benchmark and comparison summaries for G3D. The files here are evidence indexes, not marketing claims. They should cite generated reports, browser specs, scripts, and screenshots under `tests/reports`, `tests/browser`, `tools`, and `benchmarks` instead of making broad performance or parity statements.

## Current Evidence Sources

| Evidence | Local source | What it can support |
|---|---|---|
| Engine comparison scaffold | `tools/compare-engines/index.ts`, `tests/reports/comparison-threejs.json`, `tests/reports/comparison-babylon.json` | Same workload definitions and esbuild benchmark bundle-size measurements for checked-in scaffold scenes. |
| Three.js visual/runtime parity slices | `tests/reports/v6-threejs-parity-readiness.json`, `tests/reports/v6-threejs-runtime-parity.json`, `tests/reports/v6-threejs-visual-parity.json` | Bounded same-scene visual evidence across 12 product/material/asset/architecture scenes. |
| V9 official example inventory | `tests/reports/v9/threejs-inventory.json`, `tests/reports/v9/official-example-parity.json` | Backlog and status inventory for 54 Three.js example categories; it is not a completion certificate. |
| V9 same-asset parity slices | `tests/reports/v9/*-parity.json`, `tests/browser/v9-*.spec.ts` | Individual comparisons against actual Three.js loaders, renderers, AnimationMixer, EffectComposer, or effects. |
| WebGPU availability | `tests/reports/webgpu-hardware-matrix.json`, `tests/reports/v6-webgpu-readiness.json` | Local Chromium/Mac hardware availability and G3D readiness gates; not broad WebGPU parity. |
| Performance readiness | `tests/reports/v9/performance.json`, `tests/reports/v6-performance-baselines.json`, `tests/reports/v6-large-scene-performance.json`, `tests/reports/v5-performance-baselines.json` | Current-machine performance evidence only. The report explicitly blocks broad Three.js superiority claims. |

## Supported Wording

The current repo supports narrow wording such as:

- G3D has checked-in benchmark scaffolds against Three.js and Babylon.js with generated comparison reports.
- G3D generated smaller esbuild browser benchmark bundles than Three.js and Babylon.js for the checked-in scaffold scenes on the recorded run.
- G3D has bounded same-asset and same-scene parity slices against actual Three.js code paths for glTF loading, animation sampling, skinning, morph targets, decals, lights, shadows, stereo/parallax effects, and bloom.
- G3D has local WebGPU availability evidence on the recorded Chromium/Mac run, but WebGPU parity remains bounded to the reports that exist.

Avoid wording that G3D is generally faster than Three.js or Babylon.js, fully compatible with Three.js, broadly production-ready, or a Unity/Unreal replacement. Those claims require broader device matrices, release package benchmarks, production-app traces, long-run memory data, larger asset corpora, and independent review.

## Files

- `threejs-comparison.md` summarizes current Three.js benchmark and parity evidence.
- `babylon-comparison.md` summarizes current Babylon.js benchmark evidence and limits.
- `pbr-rendering-comparison.md` summarizes the bounded PBR comparison slice and how it relates to newer V6/V9 visual evidence.

The comparison docs intentionally point to raw reports and source scripts so each statement can be regenerated or challenged.
