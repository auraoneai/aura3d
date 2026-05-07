# Galileo3D Known Limits

This page records limits that affect public demos, benchmarks, docs, and claims as of the current v2 execution slice. It exists to prevent demos and comparison scaffolds from implying broader production readiness.

## Product Demos

- `examples/product-configurator` uses procedural geometry and PBR parameter variants. It does not yet load a real commercial glTF product asset, compressed textures, or externally authored material variants.
- `examples/architecture-viewer` uses a small procedural massing scene. It does not yet load a heavy BIM/glTF scene, stream large floors, or provide CAD-grade measurement.
- `examples/game-slice` demonstrates a bounded browser loop with rendering, physics, animation, particles, input, and audio state. It is not a complete game framework, level pipeline, or authoring workflow.

## Competitive Benchmarks

- `tools/compare-engines` currently verifies equivalent benchmark scaffolds, capped Playwright Chromium WebGL2 microbenchmark timing, and esbuild benchmark bundle artifacts.
- The generated `comparison-threejs.json` and `comparison-babylon.json` reports include Node, OS, hardware, browser, GPU, screenshot-artifact, raw-sample, benchmark-bundle, and failure-log fields. The timing samples are bounded microbenchmarks over equivalent workload metadata, not rendered product-scene parity.
- The comparison reports are not production app performance evidence and do not include rendered screenshot diffs.
- The only current supported stronger competitive wording is the exact bundle-size niche registered in `docs/v2/claim-registry.md`: Galileo3D generated smaller esbuild browser benchmark bundles than Three.js and Babylon.js for all three checked-in equivalent scaffold scenes on this run.
- No broad "better than Three.js," broad "better than Babylon.js," "Unity/Unreal for the web," or "production-ready" claim is supported by the current benchmark scaffolds.
- Real external claim evidence still requires broader pinned package installs, browser/device matrix data, rendered-scene raw frame samples, GPU memory data, screenshots, release-bundle artifacts, and failure logs.
- `docs/comparisons/threejs.md` and `docs/comparisons/babylonjs.md` classify Galileo3D as smaller only for generated esbuild browser benchmark bundle bytes in the checked-in equivalent scaffold scenes. They classify the current scaffold as equal for checked-in workload definitions and bounded browser microbenchmark coverage, and classify Three.js and Babylon.js as stronger for ecosystem maturity, loader maturity, public examples, and proven browser history.
- The browser/native-engine comparison page limits the scope to browser-first TypeScript workflows and classifies those native authoring engines as stronger for visual authoring, asset pipeline maturity, profiling/debugging tools, platform breadth, and production editor workflows.
- Future narrower claims beyond the exact scaffold bundle-size wording must name the measured dimension, cite browser/device artifacts, and list exclusions where competitors remain stronger.

## WebGPU

- GPU particle and WebGPU renderer evidence is still limited unless a browser exposes a real `navigator.gpu` adapter during verification.
- Fallback behavior must be documented when WebGPU is unavailable or an adapter request is denied.

## Rendering

- Renderer scene frustum culling is implemented for resource-backed scene renderables and covered by `tests/unit/rendering/renderer.test.ts` for active scene cameras, transformed bounds, instanced bounds, and explicit authoring/debug disable. The basic scene, shadows, glTF asset, and editor-runtime roadmap examples now render with actual scene cameras, transforms, lights, render resources, and renderables through the WebGL2 example harness. This is renderer-level visibility and example evidence, not a broad large-scene performance claim.
- The large-scene benchmark scaffold is not a WebGL2 large-scene harness. A real claim still needs a browser test with thousands of static meshes, instancing, material diversity, texture diversity, culling policy, raw frame samples, and screenshots.
- PBR evidence includes direct-light/material paths, texture binding contracts, a renderer-level diffuse ambient `environmentLighting` approximation, procedural environment-map uniforms, sampled equirectangular RGBA8 environment-map texture input with roughness-dependent mip sampling, bounded CPU-generated RGBA8 environment mip helpers, bounded BRDF LUT modulation for the default PBR shader, and one bounded perspective-camera WebGL2 PBR comparison scene next to a same-page Three.js reference. HDR environment map input, irradiance convolution, physically calibrated specular prefiltering, production-calibrated split-sum BRDF integration, reflection probes, broad material-corpus parity, loader visual parity, and physically complete image-based lighting are not claimed.
- Current material limitations include one primary UV path for glTF render resources, bounded KTX2/Basis transcoding coverage rather than a broad production texture corpus, no v2 material-matrix visual coverage for all glTF extensions, and no production claim for alpha sorting across large mixed transparent scenes. The renderer has compressed mip upload and RGBA8 fallback diagnostics, and the asset path can transcode a real KTX2/Basis fixture through loaders.gl, but GPU capability-driven format selection and broad corpus/visual validation are still not claimed.
- Current shadow evidence covers the existing unit/browser/visual slices, including bounded moved-caster projection, transparent-caster filtering, multiple opaque casters, and unit-level moving-camera cascade split stress. It does not yet include point/spot shadow maps, production shadow filtering, browser visual stress for long moving-camera paths, or cascade stability across a broad real-scene camera-path corpus.
- Current postprocess evidence covers ordered tone mapping, bloom, and FXAA graph execution with deterministic LDR pixels. HDR render-target formats, color-management policy, temporal history, depth-aware effects, TAA, DOF, SSR, and SSAO are not claimed.

## Asset Pipeline

- The product demos in this slice use procedural assets. External glTF product assets, broad Khronos corpus validation, and compatibility comparisons remain separate asset-track work. Draco/Meshopt package-backed decoder evidence exists only for pinned Khronos test assets.
- `tests/assets/corpus/gltf-corpus.manifest.json` is the bounded 17-entry loader-compatibility corpus. `tests/assets/corpus/gltf-100-classification.manifest.json` and `tests/reports/gltf-100-classification.json` add 100 pinned Khronos GLB source classifications with SHA-256 hashes, but that broader report is classification evidence only, not loader/render/visual validation.
- `tests/reports/asset-compatibility-threejs.json` now records pinned Three.js and Babylon.js loader imports for the current 17-entry Khronos compatibility corpus. This is loader-import evidence only: it is not visual output parity or 100-asset loader parity. The same-corpus Blender-export rows remain `not-run` because that corpus is not a Blender re-export corpus.
- `tests/reports/blender-export-validation.json` now validates three pinned Khronos Vulkan Samples glTF fixtures with Blender generator metadata through Galileo3D's glTF loader. This is bounded checked-in fixture evidence, not a local Blender executable export round trip, broad Blender/exporter corpus coverage, or visual output parity.
- `multi-uv-test` is an expected-fail corpus entry with diagnostic `ASSET_RENDERER_MULTI_UV_UNSUPPORTED`. The current `GLTFRenderResources` material path supports one UV set per draw, while this asset intentionally uses multiple texture coordinate sets. Next action: keep the asset expected-fail until renderer materials support multiple UV sets.
- `meshopt-cube-test` is an expected-fail corpus entry in the default no-decoder profile with diagnostic `ASSET_MESHOPT_DECODER_REQUIRED`. The package-backed decoder test injects `meshoptimizer` and loads the same pinned Khronos asset successfully; the default corpus report remains no-decoder by design.
- `box-textured` is classified as warn with diagnostic `ASSET_LICENSE_TRADEMARK_LIMIT` because the sample includes non-copyrightable Cesium logo/trademark markings. Next action: use it for importer validation only, not product art.
- `duck`, `cesium-man`, and `damaged-helmet` are classified as warn because their source licenses include SCEA, trademark-restricted, or non-commercial terms. Next action: use them for importer validation only under their source license constraints.

## Physics

- Supported collision shapes are box, sphere, capsule, plane, and indexed triangle mesh.
- Supported constraint contracts are fixed, hinge, slider, and spring-style constraints.
- Continuous collision detection is not supported in the current built-in physics path; fast bodies are handled by discrete fixed-step collision checks only.
- The current broadphase is deterministic sweep-and-prune with profiling counters, not a production-grade native physics backend.
- The physics package does not claim vehicle dynamics, cloth, soft bodies, fluids, destructible simulation, or large-world streaming physics.
- `tests/reports/physics-comparison-baseline.json` records the built-in Galileo3D physics baseline and external package availability. Rapier, Cannon, and Ammo are currently reported as unavailable when their packages are not installed, so this report does not enable a physics-engine superiority claim.

## Documentation Status

- API docs in `docs/api` are generated entrypoint export summaries, not symbol-level reference output.
- Starter templates are scaffolds intended for local validation; they are not published packages. Template verification currently checks file structure, public `@galileo3d/rendering` imports, Vite build scripts, and absence of `workspace:` dependency protocols. It does not prove install-from-registry builds because `0.0.0-rebuild` packages are not published.
