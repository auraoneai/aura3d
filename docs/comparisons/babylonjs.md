# Aura3D and Babylon.js

This comparison is limited to the current v2 evidence slice. The checked-in report at `docs/benchmarks/babylon-comparison.md` verifies equivalent benchmark scaffolds for product-configurator, large-scene, and skinned-characters workloads, captures capped Playwright Chromium WebGL2 microbenchmark timing and esbuild benchmark bundle artifacts, and links pinned Babylon.js loader-import results for the current 17-entry Khronos corpus. It does not include rendered scene screenshots, production app parity, GPU counters, visual loader-output parity, or broad production glTF corpus results.

## Evidence

- Generated report: `docs/benchmarks/babylon-comparison.md`
- Raw report: `tests/reports/comparison-babylon.json`
- Tool: `tools/compare-engines/index.ts`
- Caveats: `docs/project/known-limits.md`

## Current Result

| Area | Current classification | Notes |
|---|---|---|
| Equivalent scaffold coverage | Equal within scaffold | Aura3D and Babylon.js use matching procedural assets, resolution, DPR, camera path, lighting intent, warmup, measurement window, and workload shape for the three scaffold scenes. |
| Browser microbenchmark timing | Equal within scaffold | The current bounded WebGL2 microbenchmark samples are captured for matching workload shapes, so they do not prove a production runtime advantage. |
| Production browser performance | Unsupported by current evidence | No rendered production-scene browser parity run exists in the comparison report. |
| Screenshots and visual diffs | Unsupported by current evidence | The report records screenshot artifacts as not captured. |
| Benchmark bundle size | Aura3D smaller within scaffold | `tests/reports/comparison-babylon.json` records Aura3D esbuild browser benchmark bundles at 232746, 232742, and 232761 bytes versus Babylon.js at 4696481, 4696477, and 4696496 bytes for the three checked-in equivalent scaffold scenes. This is not a production release bundle-size claim. |
| glTF and asset pipeline maturity | Babylon.js stronger | The repo now records pinned Babylon.js loader imports for the 17-entry Khronos compatibility corpus, a separate 100-entry pinned Khronos source-classification corpus, a bounded real KTX2/Basis transcode fixture in Aura3D, and three checked-in Blender-export fixture validations. Babylon.js still has mature loader, material, tooling, documentation, and visual validation coverage. Aura3D still needs 100-asset loader/render validation, broad KTX2/Basis corpus coverage, broad Blender/exporter coverage, and visual comparisons. |
| Editor/tooling ecosystem | Babylon.js stronger | Babylon.js has established inspector/tooling workflows and a broader ecosystem. Aura3D editor-runtime evidence remains a bounded prototype slice. |
| Engine-integrated TypeScript package scaffolds | Aura3D has a scoped prototype advantage only | Aura3D's repo validates its own package boundaries, docs, examples, and release gates. That does not establish broader runtime superiority. |

## Claim Boundary

The current evidence supports this exact stronger wording only: Aura3D generated smaller esbuild browser benchmark bundles than Babylon.js for all three checked-in equivalent scaffold scenes on this run.

That claim is limited to generated benchmark bundles from `tests/reports/comparison-babylon.json`. It does not support wording that Aura3D is faster, more compatible, more mature, production-ready, or broadly stronger than Babylon.js. Before any broader claim can be considered, the project needs broader browser/device matrix runs, rendered-scene screenshot artifacts, production app browser samples, release bundle sizes, larger glTF corpus results, visual loader-output parity, and a claim-registry entry that names the exact dimension and exclusions.
