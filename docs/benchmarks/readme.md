# Benchmark And Comparison Evidence

Version: `1.0.0`

Benchmark docs summarize current comparison code and generated report targets. Report files under `tests/reports/` are ignored by git and may be absent until commands run.

## Current Benchmark Code

- `benchmarks/aura3d/`
- `benchmarks/threejs/`
- `benchmarks/babylon/`
- `benchmarks/shared/`
- `tools/compare-engines/`
- `tools/threejs-parity-performance/`
- `tools/superiority-performance/`

## Current Report Layout

- Engine comparison reports: `tests/reports/comparison-threejs.json`, `tests/reports/comparison-babylon.json`
- Current Three.js parity reports: `tests/reports/threejs-parity/`
- Three.js superiority aggregate reports: `tests/reports/superiority/`

## Commands

```sh
pnpm test:performance
pnpm threejs-parity:performance
pnpm superiority:performance
```

## Boundary

Performance and visual comparison claims are valid only for the scenes, hardware, browser, and report run named by the evidence. Do not convert a benchmark slice into a blanket superiority claim.
