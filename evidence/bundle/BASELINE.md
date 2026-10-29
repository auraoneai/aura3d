# Bundle composition baseline (WP-C1), Aura3D 4.5.0

Measured 2026-10-29 by lane E5 of the audit-fix program (`docs/audits/execution-plan.md`, audit row RH-12). This is the first deliverable of WP-C1 in `docs/prds/agent-first-authoring/PRD-agent-first-game-authoring.md` (Track C), which `docs/prds/beat-threejs/PRD-beat-threejs-3-after-450.md` names as the owner of the 42 bundle and request rows (group G1).

## Method

- Packages from the npm registry: `@aura3d/engine@4.5.0`, `@aura3d/assets@4.5.0`, `vite@7.3.2`; templates scaffolded with `npx create-aura3d@4.5.0 <dir> --template <t> --no-agent` and installed with `npm install`. No workspace sources.
- Builds: `vite build --sourcemap` (stock template configs; the two bench apps use the bench's `shared/aura-vite.ts` config plus `build.sourcemap: true`).
- Report: `node tools/bundle-report/report.mjs <dist> --name <label> --json evidence/bundle/baseline-<app>.json`. Each emitted JS byte is attributed through its sourcemap to the file it came from, then rolled up to a package and to the first folders of that package's published `dist/` (two levels under `dist/engine` and `dist/rendering`). The published engine ships one `dist/` tree without chained sourcemaps, so that folder level is the finest attribution a consumer build allows. Gzip is per file at level 9, summed.
- Static only: this says what is emitted, not what loads on first paint (that is `RESULTS-4.5.0.md` section 5: 31 requests for the cube).
- Cross-check: the cube total here, 4,048 KB raw, matches `RESULTS-4.5.0.md` section 4 (4,046 KB, 30 JS files on first load; the extra 12 files here are decoders and lazily imported chunks).

## Totals

| App | JS files | Raw | Gzip | `@aura3d/engine` | Decoder JS (no sourcemap) | App code |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hello-world cube | 42 | 4048 KB | 1208 KB | 3432 KB | 585 KB | 2.0 KB |
| PBR viewer (bench) | 42 | 4051 KB | 1209 KB | 3435 KB | 585 KB | 2.5 KB |
| product-viewer template | 42 | 4048 KB | 1208 KB | 3432 KB | 585 KB | 1.7 KB |
| mini-game template | 42 | 4297 KB | 1291 KB | 3673 KB | 585 KB | 10.9 KB |

## What a one-cube scene ships (hello-world cube)

| Area (package > dist folder) | Raw bytes in JS | Share |
| --- | ---: | ---: |
| @aura3d/engine > rendering | 804.6 KB | 19.9% |
| @aura3d/engine > engine/agent-api | 724.5 KB | 17.9% |
| (no sourcemap) | 585.0 KB | 14.5% |
| @aura3d/engine > assets | 313.3 KB | 7.7% |
| @aura3d/engine > rendering/environment | 160.6 KB | 4.0% |
| @aura3d/engine > rendering/webgl2 | 155.4 KB | 3.8% |
| @aura3d/engine > rendering/post | 146.3 KB | 3.6% |
| @aura3d/engine > rendering/shaders | 144.5 KB | 3.6% |
| @aura3d/engine > animation | 127.0 KB | 3.1% |
| @aura3d/engine > engine/production-runtime | 79.5 KB | 2.0% |
| @aura3d/engine > rendering/vfx | 77.5 KB | 1.9% |
| @aura3d/engine > rendering/world | 71.6 KB | 1.8% |
| @aura3d/engine > rendering/renderer | 51.0 KB | 1.3% |
| @aura3d/engine > rendering/program | 50.5 KB | 1.2% |
| @aura3d/engine > rendering/atmosphere | 44.5 KB | 1.1% |
| @aura3d/engine > physics | 43.8 KB | 1.1% |
| @aura3d/engine > rendering/reference | 35.2 KB | 0.9% |
| @aura3d/engine > rendering/shadows | 34.2 KB | 0.8% |
| @aura3d/engine > rendering/geometry | 33.8 KB | 0.8% |
| @aura3d/engine > math | 29.7 KB | 0.7% |
| @aura3d/engine > rendering/forward | 29.3 KB | 0.7% |
| @aura3d/engine > audio | 24.0 KB | 0.6% |
| @aura3d/engine > engine/lanes | 23.9 KB | 0.6% |
| (unmapped) | 23.4 KB | 0.6% |
| @aura3d/engine > scene | 22.9 KB | 0.6% |


| Chunk | Raw | Gzip | Largest contributors |
| --- | ---: | ---: | --- |
| assets/index-CUYvv0aJ.js | 948.8 KB | 309.0 KB | @aura3d/engine > engine/agent-api 722.8 KB, @aura3d/engine > engine/production-runtime 59.0 KB, @aura3d/engine > physics 43.8 KB |
| assets/DirectPath-DuMIRqYY.js | 837.5 KB | 241.0 KB | @aura3d/engine > rendering 162.1 KB, @aura3d/engine > rendering/webgl2 155.4 KB, @aura3d/engine > rendering/vfx 77.5 KB |
| aura-decoders/draco/draco_decoder.js | 500.5 KB | 104.3 KB | (no sourcemap) 500.5 KB |
| assets/GLTFSharedTextureCache-B3_7ndl4.js | 224.5 KB | 64.1 KB | @aura3d/engine > assets 200.7 KB, @aura3d/engine > animation 18.4 KB, ktx-parse 4.5 KB |
| assets/TexturedPBRMaterial-BX28NTvB.js | 186.1 KB | 39.0 KB | @aura3d/engine > rendering/shaders 86.8 KB, @aura3d/engine > rendering 86.8 KB, @aura3d/engine > rendering/materials 5.8 KB |
| assets/ForwardPass-BmCG2hQj.js | 180.5 KB | 53.9 KB | @aura3d/engine > rendering 102.1 KB, @aura3d/engine > rendering/forward 25.8 KB, @aura3d/engine > rendering/shaders 16.6 KB |
| assets/ShaderLibrary-C7IFAbVL.js | 172.2 KB | 20.9 KB | @aura3d/engine > rendering 169.3 KB, @aura3d/engine > rendering/animation 2.4 KB, (unmapped) 0.5 KB |
| assets/neutralEmbedded-B8SmvjFq.js | 130.1 KB | 97.2 KB | @aura3d/engine > rendering/environment 130.0 KB, (unmapped) 0.1 KB |
| assets/WebGPUDevice-DQKHl2GQ.js | 119.4 KB | 32.3 KB | @aura3d/engine > rendering 107.4 KB, @aura3d/engine > rendering/webgpu 11.5 KB, (unmapped) 0.5 KB |
| assets/program-BDd3Pkzw.js | 102.0 KB | 25.4 KB | @aura3d/engine > rendering 84.3 KB, @aura3d/engine > rendering/materials 9.5 KB, @aura3d/engine > rendering/program 4.0 KB |
| assets/browser-index-DQNSczom.js | 85.8 KB | 21.6 KB | @aura3d/engine > assets 84.4 KB, (unmapped) 1.5 KB |
| assets/v2Entry-ChePOerD.js | 84.4 KB | 24.0 KB | @aura3d/engine > rendering/post 83.7 KB, (unmapped) 0.7 KB |
| assets/FrameGraph-B-LbNidb.js | 74.9 KB | 20.8 KB | @aura3d/engine > rendering 24.5 KB, @aura3d/engine > scene 22.9 KB, @aura3d/engine > math 22.5 KB |
| assets/RetargetWorker-DPIS4syV.js | 62.2 KB | 21.6 KB | @aura3d/engine > animation 62.1 KB, (unmapped) 0.1 KB |
| aura-decoders/basis/basis_transcoder.js | 56.2 KB | 14.7 KB | (no sourcemap) 56.2 KB |
| (27 more) | 282.9 KB | 118.3 KB | |


Non-JS files over 50 KB: aura-decoders/basis/basis_transcoder.wasm 515.0 KB, aura-decoders/draco/draco_decoder.wasm 187.9 KB.

## Findings (hypotheses from WP-C1, tested)

1. **The scene does not change the bundle.** The cube, the PBR viewer and the product-viewer template emit the same 42 files within 3 KB of each other (4,048 to 4,051 KB raw). The mini-game adds 249 KB, almost all engine code (game kit and genre helpers), and 11 KB of its own code. App code is under 0.3% of every bundle.
2. **Render lanes and subsystems the cube never uses are emitted, confirmed.** A one-cube scene emits the post stack (150 KB under `rendering/post`), animation and retargeting (129 KB, including the 62 KB `RetargetWorker` chunk), VFX (78 KB), physics (58 KB), atmosphere, water and world (116 KB) and the WebGPU device (119 KB chunk). This is the WP-C2 and WP-C3 target.
3. **Two chunks hold 44% of the JS.** `index-*.js` (949 KB, 723 KB of it `engine/agent-api`) and `DirectPath-*.js` (838 KB, rendering core plus WebGL2 and VFX). Splitting along the folders above is the first measurable cut.
4. **Decoders are copied whatever the scene uses.** `auraDecodersPlugin` writes Draco (500 KB JS plus 188 KB wasm) and Basis (56 KB JS plus 515 KB wasm) into every build. They have no sourcemap, so they appear as "(no sourcemap)" (585 KB, 14.5% of the JS). Whether they load on first paint is a request-level question for WP-C3.
5. **The embedded neutral environment is 130 KB raw and 97 KB gzip** (`neutralEmbedded-*.js`), the least compressible chunk; it is the fallback that keeps a lights-only scene lit, so lazy-loading it trades first-frame light for size.
6. **The `node:fs` warning is real and comes from physics.** The stock product-viewer build logs `Module "node:fs" has been externalized for browser compatibility, imported by @gltf-transform/core`. The import is `import("@gltf-transform/core")` and `import("@gltf-transform/extensions")` in `@aura3d/engine/dist/physics-rapier/index.js:607-608`, so a scene with no physics still emits glTF-Transform. WP-C3 should gate it behind the mesh-collider path.
7. **The "vendor/basis latent bug" is a Node-only path compiled into the browser build.** Vite warns that `new URL("../vendor/basis/basis_transcoder.js", import.meta.url)` and `../../vendor/...` do not exist at build time (`packages/assets/src/KTX2BasisTextureTranscoder.ts:155-156`, `loadBasisModuleNode`). The browser path takes its transcoder from `aura-decoders/basis/`, so nothing breaks today; the Node loader should move behind a Node-only entry so the browser build stops carrying it.

Next steps belong to WP-C2 to WP-C6; this file is the "before" that WP-C6's `AFTER.md` compares against. Re-run with the commands above on the new published version.
