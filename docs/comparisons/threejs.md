# Galileo3D and Three.js

This comparison is limited to the current v2 evidence slice. The checked-in report at `docs/benchmarks/threejs-comparison.md` verifies equivalent benchmark scaffolds for product-configurator, large-scene, and skinned-characters workloads, captures capped Playwright Chromium WebGL2 microbenchmark timing and esbuild benchmark bundle artifacts, and links pinned Three.js loader-import results for the current 17-entry Khronos corpus. The separate `docs/benchmarks/pbr-rendering-comparison.md` report covers one bounded perspective-camera PBR scene rendered next to a same-page Three.js reference. These reports do not prove production app parity, GPU-counter parity, visual loader-output parity, broad production glTF corpus results, production PBR parity, or broad engine superiority.

## Evidence

- Generated report: `docs/benchmarks/threejs-comparison.md`
- PBR rendered-scene report: `docs/benchmarks/pbr-rendering-comparison.md`
- Raw report: `tests/reports/comparison-threejs.json`
- PBR raw report: `tests/reports/pbr-rendering-comparison.json`
- Tool: `tools/compare-engines/index.ts`
- Caveats: `docs/known-limits.md`

## Current Result

| Area | Current classification | Notes |
|---|---|---|
| Equivalent scaffold coverage | Equal within scaffold | Galileo3D and Three.js use matching procedural assets, resolution, DPR, camera path, lighting intent, warmup, measurement window, and workload shape for the three scaffold scenes. |
| Browser microbenchmark timing | Equal within scaffold | The current bounded WebGL2 microbenchmark samples are captured for matching workload shapes, so they do not prove a production runtime advantage. |
| Production browser performance | Unsupported by current evidence | No rendered production-scene browser parity run exists in the comparison report. |
| Screenshots and visual diffs | One bounded PBR scene only | `tests/reports/pbr-rendering-comparison.json` records Galileo, Three.js, and diff PNG artifacts for one perspective-camera PBR scene. The broader benchmark report still records scaffold audit screenshots only, not production scene parity. |
| Benchmark bundle size | Galileo3D smaller within scaffold | `tests/reports/comparison-threejs.json` records Galileo3D esbuild browser benchmark bundles at 232746, 232742, and 232761 bytes versus Three.js at 671336, 671332, and 671351 bytes for the three checked-in equivalent scaffold scenes. This is not a production release bundle-size claim. |
| glTF compatibility | Three.js stronger | The repo now records pinned Three.js loader imports for the 17-entry Khronos compatibility corpus, a separate 100-entry pinned Khronos source-classification corpus, a bounded real KTX2/Basis transcode fixture in Galileo3D, and three checked-in Blender-export fixture validations. Three.js still has broader loader maturity, ecosystem knowledge, visual validation, and corpus coverage. Galileo3D still needs 100-asset loader/render validation, broad KTX2/Basis corpus coverage, broad Blender/exporter coverage, and visual comparisons. |
| Ecosystem and community examples | Three.js stronger | Three.js has a much larger community, third-party integration surface, and public example base. |
| Browser support history | Three.js stronger | Galileo3D does not yet have multi-browser, multi-device release history comparable to Three.js. |
| Engine-integrated app scaffolds | Galileo3D has a scoped prototype advantage only | Galileo3D includes first-party package structure, examples, validation reports, and lifecycle docs in this repo. That is not a broad engine superiority claim. |

## Claim Boundary

The current evidence supports these exact stronger wordings only:

- Galileo3D generated smaller esbuild browser benchmark bundles than Three.js for all three checked-in equivalent scaffold scenes on this run.
- Galileo3D renders one bounded perspective-camera WebGL2 PBR comparison scene next to a same-page Three.js reference on this run.

Those claims are limited to `tests/reports/comparison-threejs.json` and `tests/reports/pbr-rendering-comparison.json`. They do not support wording that Galileo3D is faster, more compatible, more mature, production-ready, production-PBR-equivalent, or broadly better than Three.js. Before any broader claim can be considered, the project needs broader browser/device matrix runs, production app browser samples, release bundle sizes, larger glTF corpus results, visual loader-output parity, production PBR/IBL evidence, and a claim-registry entry that names the exact dimension and exclusions.
