# Galileo3D vs Babylon.js Benchmark Scaffold

Generated: 2026-05-07T05:41:00.073Z

This document is intentionally limited to reproducible benchmark scaffolding. It verifies that Galileo3D and Babylon.js scene definitions use the same procedural assets, render resolution, camera path, lighting intent, warmup policy, measurement window, and workload shape, then captures a bounded Playwright Chromium WebGL2 microbenchmark plus esbuild browser bundle artifacts. It does not claim a runtime performance win.

Pinned versions in the generated JSON: Galileo3D 0.0.0-rebuild, Three.js 0.165.0, Babylon.js 7.16.1. Browser timing is a capped WebGL2 microbenchmark over equivalent workload metadata; it is not rendered product-scene parity.

## Captured Environment

| Field | Value |
|---|---|
| Node | v22.22.0 |
| Package manager | pnpm/10.33.2 |
| OS | Darwin 25.3.0 (darwin, arm64) |
| Hardware | Apple M4 Max; 16 CPUs; 131072 MB RAM |
| Browser | playwright-chromium-headless-audit; 147.0.7727.15; {"headless":true,"viewport":{"width":1280,"height":720},"deviceScaleFactor":1,"colorScheme":"light","reducedMotion":"reduce","javaScriptEnabled":true} |
| Browser executable | /Users/gurbakshchahal/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing |
| Browser user agent | Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36 |
| GPU | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver); Google Inc. (Google); WebGL 2.0 (OpenGL ES 3.0 Chromium) |

## Audit Artifacts

| Artifact | Status | Notes |
|---|---|---|
| Raw samples | included inline | See JSON `scenes[].estimates.*.rawSamples`. |
| Failure logs | included inline | See JSON `scenes[].estimates.*.failureLog`. |
| Screenshots | captured-audit-report | Screenshots capture the generated comparison audit page, not rendered benchmark scenes. Paths: tests/reports/comparison-threejs-audit.png, tests/reports/comparison-babylon-audit.png. |
| Browser bundles | built-browser-benchmark-bundles | Bundles are esbuild browser artifacts for the benchmark runtime imports and scene metadata. They are measured artifacts, not public npm package release bundles. |

| Scene | Equivalent scaffold | Galileo browser frame median ms | Babylon.js browser frame median ms | Galileo executed/requested draw calls | Galileo bundle bytes | Galileo scene source bytes |
|---|---:|---:|---:|---:|---:|---:|
| product-configurator | yes | 0 | 0 | 4 / 4 | 246654 | 566 |
| large-scene | yes | 0 | 0.1 | 256 / 1200 | 246650 | 563 |
| skinned-characters | yes | 0 | 0 | 64 / 64 | 246669 | 581 |

## glTF Compatibility Linkage

Same-corpus asset compatibility is linked from `tests/reports/asset-compatibility-threejs.json`: Khronos glTF Sample Assets at revision 2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf with 17 assets. Separate Blender-export fixture validation is linked from `tests/reports/blender-export-validation.json`: Khronos Vulkan Samples Assets at revision `8db8ce9c528330f0b1261b07531b009732b08731` with 3 checked-in fixtures.

| Loader | Pass | Warn | Expected fail | Not run |
|---|---:|---:|---:|---:|
| galileo3d | 11 | 4 | 2 | 0 |
| threejs | 4 | 13 | 0 | 0 |
| babylonjs | 13 | 4 | 0 | 0 |
| blenderExport | 0 | 0 | 0 | 17 |

The linked compatibility report executes pinned Three.js and Babylon.js loaders against the same 17-entry Khronos corpus in a Node compatibility harness. It is loader import evidence, not visual/rendering parity. The same-corpus Blender-export column remains `not-run`, while the separate Blender-export validation report passes checked-in Blender-exported fixtures through Galileo3D's glTF loader.


## Supported Narrow Claim

Galileo3D generated smaller esbuild browser benchmark bundles than Babylon.js for all three checked-in equivalent scaffold scenes on this run.

Measured dimension: esbuild browser benchmark bundle bytes. Evidence report: `tests/reports/comparison-babylon.json`.

| Scene | Galileo bundle bytes | Babylon.js bundle bytes | Galileo / Babylon.js ratio |
|---|---:|---:|---:|
| product-configurator | 246654 | 4696481 | 0.053 |
| large-scene | 246650 | 4696477 | 0.053 |
| skinned-characters | 246669 | 4696496 | 0.053 |

Exclusions: This is not a runtime frame-rate claim. This is not a production release bundle-size claim. This is not rendered visual parity, loader parity, ecosystem maturity, or broad engine superiority. The claim is limited to the checked-in benchmark scene definitions, dependency versions, browser/toolchain environment, and generated reports from this run.


## Feature Comparison Coverage

| Area | Galileo3D evidence | Babylon.js evidence | Current comparison evidence | Claim impact |
|---|---|---|---|---|
| Controls | input/control unit and example evidence exists outside this scaffold | not executed by this scaffold | no same-scene control ergonomics benchmark | unsupported for better claims |
| Materials | PBR/material unit and visual slices exist outside this scaffold | not executed by this scaffold | procedural material counts are matched; visual parity is not scored | unsupported for material parity claims |
| Lights | lighting intent is matched in scaffold scene definitions | same lighting intent in scaffold scene definitions | configuration equivalence only | no quality or performance advantage |
| Shadows | quality.shadows is false in current scaffold scenes | quality.shadows is false in current scaffold scenes | not exercised | unsupported for shadow claims |
| Postprocess | quality.postprocess is false in current scaffold scenes | quality.postprocess is false in current scaffold scenes | not exercised | unsupported for postprocess claims |
| Animation | skinned-characters workload declares 32 animations | matching skinned-characters workload declares 32 animations | workload equivalence plus capped browser microbenchmark timing; no animation-system parity scoring | no runtime animation advantage |
| Particles | skinned-characters workload declares 400 particles | matching skinned-characters workload declares 400 particles | workload equivalence plus capped browser microbenchmark timing; no particle-system parity scoring | no runtime particle advantage |
| Docs | local docs and generated reports are linked | external documentation breadth is not measured by this scaffold | repo-local documentation linkage only | unsupported for ecosystem/docs superiority |

## Current Claim Status

No broad "better than Three.js" or broad competitive claim is enabled by this report. The JSON report includes browser WebGL2 microbenchmark raw samples, summary statistics, measured scene source sizes, benchmark bundle bytes, audit screenshots, glTF corpus linkage, pinned external loader import evidence, category comparison coverage, and failure logs for this scaffold run. The only usable stronger wording is the exact supported narrow claim above, if present. Rendered scene screenshots, production app parity, GPU counters, visual output parity for external loaders, broader device review, and independent review are still required before broader comparison language can become externally credible.
