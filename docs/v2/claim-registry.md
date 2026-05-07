# Claim Registry

## Purpose

This file prevents marketing, README, demo, and release language from outrunning evidence. A claim is allowed only when its required gate passes and the evidence links are current.

## Registry Rules

- Every public claim must name its decision gate.
- Every claim must link to source files, tests, examples, reports, docs, and known limits.
- Every competitive claim must name the compared versions, browser/device matrix, benchmark date, and raw data.
- Every claim must include exclusions where a competitor remains stronger.
- Release verification should fail if public docs contain an unregistered stronger claim.

## Allowed Today

| Claim | Gate | Evidence required | Required wording constraints |
|---|---|---|---|
| Galileo3D is an experimental TypeScript web 3D engine prototype. | None | Existing package surface and internal tests. | Must include prototype or experimental language. |
| Galileo3D has verified internal subsystem slices. | Gate A partial evidence | Passing relevant unit/browser/visual reports for the specific subsystem. | Must not imply production readiness. |
| Galileo3D has a renderer-backed WebGL2 showcase slice. | Gate A partial evidence | `examples/11-showcase-world`, browser tests, visual tests, demo validation report. | Must call it a showcase or validation slice, not a product demo or full renderer parity proof. |
| Galileo3D generated smaller esbuild browser benchmark bundles than Three.js for all three checked-in equivalent scaffold scenes on this run. | Gate C narrow bundle-size niche | `tests/reports/comparison-threejs.json`, `docs/benchmarks/threejs-comparison.md`, `docs/comparisons/threejs.md`, and `docs/known-limits.md` | Must say esbuild browser benchmark bundles, checked-in equivalent scaffold scenes, and on this run; must not imply runtime speed, production release bundle size, rendered visual parity, loader parity, ecosystem maturity, or broad engine superiority. |
| Galileo3D generated smaller esbuild browser benchmark bundles than Babylon.js for all three checked-in equivalent scaffold scenes on this run. | Gate C narrow bundle-size niche | `tests/reports/comparison-babylon.json`, `docs/benchmarks/babylon-comparison.md`, `docs/comparisons/babylonjs.md`, and `docs/known-limits.md` | Must say esbuild browser benchmark bundles, checked-in equivalent scaffold scenes, and on this run; must not imply runtime speed, production release bundle size, rendered visual parity, loader parity, ecosystem maturity, or broad engine superiority. |
| Galileo3D renders one bounded perspective-camera WebGL2 PBR comparison scene next to a same-page Three.js reference on this run. | Gate C narrow rendered-scene niche | `tests/reports/pbr-rendering-comparison.json`, `tests/reports/pbr-material-lab-galileo.png`, `tests/reports/pbr-material-lab-threejs.png`, `tests/reports/pbr-material-lab-diff.png`, `examples/pbr-camera-comparison`, `docs/benchmarks/pbr-rendering-comparison.md`, and `docs/known-limits.md` | Must say one bounded perspective-camera WebGL2 PBR comparison scene, same-page Three.js reference, and on this run; must not imply production PBR parity, HDR IBL, loader parity, broad visual superiority, or broad engine superiority. |

## Blocked Until Gates Pass

| Claim | Required gate | Additional evidence |
|---|---|---|
| Galileo3D is better than Three.js. | Gate C | Narrow niche, raw benchmark data, known limits, Three.js/Babylon.js comparison reports, `docs/comparisons/threejs.md`, `docs/comparisons/babylonjs.md`, `tests/reports/comparison-threejs.json`, `tests/reports/comparison-babylon.json`. |
| Galileo3D is Unity/Unreal for the web. | Gate D | Browser editor, editor-authored app, export flow, workflow comparison, explicit browser-first scope, `docs/comparisons/unity-unreal-web.md`. |
| Galileo3D is production-ready. | Gate E | External apps, release history, docs site, support process, security policy, compatibility matrix. |
| Galileo3D has production PBR parity. | Gate C or E depending on wording | HDR IBL pipeline, irradiance convolution, generated specular prefiltering, production-calibrated split-sum BRDF integration, reflection probes if claimed, color management, material corpus, reference renderer comparisons, visual baselines. |
| Galileo3D has full WebGPU support. | Gate C or E depending on wording | Real hardware matrix, fallback policy, feature parity reports, shader diagnostics, performance comparison. |

## Required Enforcement Work

- Add `tools/claim-registry/index.ts` to scan `README.md`, `docs/**`, `examples/**/README.md`, package descriptions, and release notes.
- Add `tests/unit/tools/claim-registry.test.ts` with fixtures for allowed, scoped, and blocked claims.
- Add `tests/reports/claim-registry.json` to `pnpm verify:release`.
- Link each claim to the exact release-run ID that produced its evidence.
