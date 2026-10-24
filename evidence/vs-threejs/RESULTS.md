# Aura3D 4.1.2 vs three.js 0.185.1: measured results

Generated 2026-10-24T09:47:43.933Z from `results.json` (run groups on separate remote runners) and `static-metrics.json`. Method: `tools/bench-vs-threejs/README.md`.

**Read this first.** All timings come from a CPU-only remote runner with **software WebGL2 (SwiftShader), not a GPU**. They compare CPU/driver cost under identical conditions; they are not GPU performance numbers and say nothing about an Apple M-series or desktop GPU. Rows are marked `tie` within 5%. Lower is better in every numeric row. Verdicts are per row and are not averaged into a score.

Runner: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (vendor Google Inc. (Google)), 2 logical CPUs reported by the browser. Libraries as installed in the container: @aura3d/engine 4.1.2, three 0.185.1, vite 7.3.2.

## Summary (read with the caveats above)

**Where three.js wins (measured):**
- **Bundle size.** One-cube app, JS only: three.js 495.7 KB raw / 124.8 KB gzip / 102.9 KB brotli in one file; Aura3D 3,841 KB raw / 1,089 KB gzip / 904 KB brotli across 25 files (7.7x / 8.7x / 8.8x). The Aura3D single largest chunk is 921 KB raw / 301 KB gzip, so the earlier "~2.9 MB engine chunk" does not reproduce as one chunk; what a page actually fetches on load is about 2.9 MB of JS (25 requests, versus 1 file and 2 requests for three.js). The earlier three.js figure of ~366 KB / ~87 KB does not reproduce either: 496 KB / 125 KB here, with `WebGLRenderer`, a mesh and a standard material, minified by Vite.
- **Frame cost on the software-GL runner.** three.js 0.9 to 225 ms per frame; Aura3D 623 to 983 ms in every scene that completed. With three.js switched to 4x MSAA to match Aura3D's default multisampled targets it is still 1.4 to 319 ms, so antialiasing alone does not explain the gap. The cause was not isolated (draw calls are within 2x; the cost is GPU-process work not visible as draws). This says nothing about a real GPU.
- **Time to first frame** in four of five scenes (e.g. 95 ms vs 3,269 ms for the cube, mostly fetching and compiling 2.9 MB).
- **Draw calls / triangles / programs** are equal or lower in three.js in most rows (game loop 19 vs 38 draws).
- **Build and install friction.** three.js built with no configuration; Aura3D needed an extra package, a plugin and a config file (section 12). First-try authoring success favoured three.js (section 13).
- **Subdivided plane** is not available in Aura3D (option accepted and ignored).

**Where Aura3D wins (measured or counted):** fewer scene lines in four of five scenes (viewer 24 vs 49, forest 49 vs 71, character 45 vs 62, game loop 61 vs 82), fewer import modules (1 vs up to 8) and fewer distinct API symbols in every scene, tokens lower in three scenes, built-in QA/replay kit, fixed-step loop and seeded RNG (section 11). Its first frame was faster in the PBR viewer (5.1 s vs 6.1 s).

**Ties / unmeasurable:** the water scene's picture is effectively identical in both libraries (JSD 0.0000). Game-loop state replay hashes are identical across libraries and across runs. Which picture is "correct" is unmeasurable without a reference image. Real-GPU performance, the Aura3D game kit HUD/shell, WebGPU and mobile behaviour were not measured.


## 1. Source size: lines of code (scene.ts only)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 15 | 18 | three.js better |
| 1 PBR viewer | 49 | 24 | Aura3D better |
| 2 forest 10k | 71 | 49 | Aura3D better |
| 3 skinned character | 62 | 45 | Aura3D better |
| 4 game loop | 82 | 61 | Aura3D better |
| 5 shader water | 86 | 87 | tie |

Extra files an Aura3D app needed to build (three.js needed none):

| Scene | assets.generated.ts | vite.config.ts | shared/aura-vite.ts (shared by all) |
| --- | --- | --- | --- |
| baseline (one cube) | 0 | 1 | 10 |
| 1 PBR viewer | 1 | 1 | 10 |
| 2 forest 10k | 0 | 1 | 10 |
| 3 skinned character | 1 | 1 | 10 |
| 4 game loop | 0 | 1 | 10 |
| 5 shader water | 0 | 1 | 10 |

## 2. Source size: tokens (gpt-tokenizer o200k_base (OpenAI BPE; a proxy: Claude's tokenizer is not public))

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 210 | 278 | three.js better |
| 1 PBR viewer | 740 | 474 | Aura3D better |
| 2 forest 10k | 1,213 | 1,008 | Aura3D better |
| 3 skinned character | 846 | 790 | Aura3D better |
| 4 game loop | 1,178 | 1,134 | tie |
| 5 shader water | 1,386 | 1,554 | three.js better |

## 3. Distinct import modules and API concepts

| Scene | three.js modules | Aura3D modules | Verdict (modules) | three.js symbols | Aura3D symbols | Verdict (symbols) |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (one cube) | 1 | 1 | tie | 8 | 6 | Aura3D better |
| 1 PBR viewer | 8 | 1 | Aura3D better | 21 | 11 | Aura3D better |
| 2 forest 10k | 1 | 1 | tie | 20 | 9 | Aura3D better |
| 3 skinned character | 2 | 1 | Aura3D better | 17 | 8 | Aura3D better |
| 4 game loop | 1 | 1 | tie | 14 | 9 | Aura3D better |
| 5 shader water | 5 | 1 | Aura3D better | 15 | 8 | Aura3D better |

## 4. Production bundle (vite build, JS only)

`raw` is the sum of every emitted `.js` file; `largest chunk` is the single biggest file. Assets (GLB, HDR) are excluded and listed in section 5.

### 4a. Total JS emitted: raw

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 495.7 KB | 3,841.1 KB | three.js better |
| 1 PBR viewer | 639.7 KB | 3,843.9 KB | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 608.8 KB | 3,844.4 KB | three.js better |
| 4 game loop | 503.2 KB | 3,847.3 KB | three.js better |
| 5 shader water | 508.2 KB | 3,860.9 KB | three.js better |

### 4b. Total JS emitted: gzip -9

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 124.8 KB | 1,089.1 KB | three.js better |
| 1 PBR viewer | 162.9 KB | 1,090.3 KB | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 155.9 KB | 1,090.6 KB | three.js better |
| 4 game loop | 127.5 KB | 1,091.8 KB | three.js better |
| 5 shader water | 128.6 KB | 1,095.7 KB | three.js better |

### 4c. Total JS emitted: brotli -11

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 102.9 KB | 904.2 KB | three.js better |
| 1 PBR viewer | 133.7 KB | 905.1 KB | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 128.4 KB | 905.4 KB | three.js better |
| 4 game loop | 105.3 KB | 906.3 KB | three.js better |
| 5 shader water | 105.7 KB | 910.0 KB | three.js better |

### 4d. Largest single chunk (raw / gzip)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 495.7 KB / 124.8 KB | 921.5 KB / 300.8 KB | three.js better |
| 1 PBR viewer | 639.7 KB / 162.9 KB | 924.3 KB / 301.9 KB | three.js better |
| 2 forest 10k | n/a / n/a | n/a / n/a | unmeasurable |
| 3 skinned character | 608.8 KB / 155.9 KB | 924.8 KB / 302.2 KB | three.js better |
| 4 game loop | 503.2 KB / 127.5 KB | 927.7 KB / 303.5 KB | three.js better |
| 5 shader water | 508.2 KB / 128.6 KB | 928.6 KB / 303.1 KB | three.js better |

**Check against the earlier figure (engine chunk ~2.9 MB raw / ~845 KB gzip vs three ~366 KB / ~87 KB).** Measured here for the one-cube baseline: three.js 495.7 KB raw / 124.8 KB gzip in its largest chunk (495.7 KB / 124.8 KB all JS); Aura3D 921.5 KB raw / 300.8 KB gzip in its largest chunk (3,841.1 KB raw / 1,089.1 KB gzip across 37 JS files). Aura3D's total is 7.75x three.js raw and 8.73x gzip. The single-chunk figure does not reproduce exactly here: the build splits the engine across several chunks, so compare the totals.

## 5. Network on first load (one cold load, uncompressed static server)

### 5a. Request count (successful responses)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 2 | 26 | three.js better |
| 1 PBR viewer | 5 | 30 | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 5 | 31 | three.js better |
| 4 game loop | 2 | 26 | three.js better |
| 5 shader water | 2 | 26 | three.js better |

### 5b. JS bytes actually fetched on load (raw)

| Scene | three.js | Aura3D | Verdict | three.js JS files | Aura3D JS files |
| --- | --- | --- | --- | --- | --- |
| baseline (one cube) | 495.7 KB | 2,911.1 KB | three.js better | 1 | 25 |
| 1 PBR viewer | 639.7 KB | 2,933.4 KB | three.js better | 1 | 27 |
| 2 forest 10k | n/a | n/a | unmeasurable | n/a | n/a |
| 3 skinned character | 608.8 KB | 2,981.2 KB | three.js better | 1 | 28 |
| 4 game loop | 503.2 KB | 2,917.2 KB | three.js better | 1 | 25 |
| 5 shader water | 508.2 KB | 2,930.7 KB | three.js better | 1 | 25 |

### 5c. Total bytes fetched on load (JS + assets + document)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 496.0 KB | 2,913.0 KB | three.js better |
| 1 PBR viewer | 2,688.6 KB | 3,658.0 KB | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 3,365.9 KB | 7,202.8 KB | three.js better |
| 4 game loop | 503.4 KB | 2,919.2 KB | three.js better |
| 5 shader water | 508.4 KB | 2,932.6 KB | three.js better |

Failed requests (status >= 400) on load: baseline three 0 / aura 1; pbr-viewer three 0 / aura 1; forest three n/a / aura n/a; skinned-character three 0 / aura 1; game-loop three 0 / aura 1; shader-water three 0 / aura 1

## 6. Time to first frame (median of 3 cold loads, ms; includes asset load and shader compile, software GL)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 95 | 3,269 | three.js better |
| 1 PBR viewer | 6,083 | 5,100 | Aura3D better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 569 | 4,783 | three.js better |
| 4 game loop | 178 | 3,662 | three.js better |
| 5 shader water | 254 | 3,529 | three.js better |

## 7. Steady-state frame time (60 frames, software WebGL2, ms)

### 7a. Total per frame, median (until gl.finish)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 0.9 | 623.2 | three.js better |
| 1 PBR viewer | 224.8 | 983.1 | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 50.9 | 832.5 | three.js better |
| 4 game loop | 19.5 | 725.2 | three.js better |
| 5 shader water | 50.2 | 690.9 | three.js better |

### 7b. Total per frame, p95

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1.7 | 838.1 | three.js better |
| 1 PBR viewer | 292.2 | 1,087.4 | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 63.5 | 1,041.2 | three.js better |
| 4 game loop | 21.1 | 848.4 | three.js better |
| 5 shader water | 56.3 | 752.0 | three.js better |

### 7c. CPU time inside frame(), median (JS + command submission, before gl.finish)

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 0.10 | 3.50 | three.js better |
| 1 PBR viewer | 0.60 | 6.30 | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 0.50 | 5.40 | three.js better |
| 4 game loop | 0.30 | 6.00 | three.js better |
| 5 shader water | 0.30 | 3.00 | three.js better |

### 7d. Total per frame, median, antialiasing equalised

The default Aura3D production profile renders into 4x multisampled RGBA16F targets (section 8d). The three.js apps above have no antialiasing, so 7a compares unequal work. This table adds three.js with 4x MSAA (`antialias: true`, or a 4-sample `EffectComposer` target for the post scenes). Both are software GL.

| Scene | three.js (no AA) | three.js (4x MSAA) | Aura3D (4x MSAA default) | Verdict (three.js 4x vs Aura3D) |
| --- | --- | --- | --- | --- |
| baseline (one cube) | 0.9 | 1.4 | 623.2 | three.js better |
| 1 PBR viewer | 224.8 | 319.3 | 983.1 | three.js better |
| 2 forest 10k | n/a | 1,437.7 | n/a | unmeasurable |
| 3 skinned character | 50.9 | 65.4 | 832.5 | three.js better |
| 4 game loop | 19.5 | 24.9 | 725.2 | three.js better |
| 5 shader water | 50.2 | 129.0 | 690.9 | three.js better |

### 7e. Time to first frame (ms), antialiasing equalised

| Scene | three.js (no AA) | three.js (4x MSAA) | Aura3D | Verdict (three.js 4x vs Aura3D) |
| --- | --- | --- | --- | --- |
| baseline (one cube) | 95 | 120 | 3,269 | three.js better |
| 1 PBR viewer | 6,083 | 6,676 | 5,100 | Aura3D better |
| 2 forest 10k | n/a | 1,848 | n/a | unmeasurable |
| 3 skinned character | 569 | 548 | 4,783 | three.js better |
| 4 game loop | 178 | 194 | 3,662 | three.js better |
| 5 shader water | 254 | 384 | 3,529 | three.js better |

## 8. Draw calls and triangles per steady frame (all passes)

### 8a. Draw calls

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1 | 2 | three.js better |
| 1 PBR viewer | 25 | 33 | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 5 | 6 | three.js better |
| 4 game loop | 19 | 38 | three.js better |
| 5 shader water | 4 | 4 | tie |

### 8b. Triangles submitted

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 12 | 13 | tie |
| 1 PBR viewer | 7,264 | 7,274 | tie |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 22,754 | 22,755 | tie |
| 4 game loop | 1,050 | 6,195 | three.js better |
| 5 shader water | 19,394 | 22,530 | three.js better |

### 8c. Distinct shader programs created by the time of measurement

| Scene | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| baseline (one cube) | 1 | 3 | three.js better |
| 1 PBR viewer | 14 | 18 | three.js better |
| 2 forest 10k | n/a | n/a | unmeasurable |
| 3 skinned character | 3 | 8 | three.js better |
| 4 game loop | 2 | 6 | three.js better |
| 5 shader water | 4 | 4 | tie |

### 8d. What the renderers set up per frame (viewport sizes, resolve blits, multisampled targets)

| Scene | three.js viewports | three.js blits | three.js MSAA targets | Aura3D viewports | Aura3D blits | Aura3D MSAA targets |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (one cube) | n/a | 0 | none | 640x360 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 1 PBR viewer | 1024x1024, 640x360, 320x180, 160x90, 80x45, 40x23, 20x12 | 0 | none | 640x360, 2048x2048, 320x180, 160x90, 80x45, 40x23, 20x12 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 2 forest 10k | n/a | n/a | none | n/a | n/a | none |
| 3 skinned character | 1024x1024, 640x360 | 0 | none | 640x360, 2048x2048 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 4 game loop | 1024x1024, 640x360 | 0 | none | 640x360, 2048x2048 | 1 | 4x 34842 640x360; 4x 33190 640x360 |
| 5 shader water | n/a | 0 | none | 640x360 | 1 | 4x 34842 640x360; 4x 33190 640x360 |

## 9. Correctness

There is no ground-truth image, so *which library is right* is `unmeasurable`; the table says how close the two libraries' pictures are at identical simulated time (frame 25; frame 85 in the JSD f85 column, frame 280 for the skinned character). JSD is Jensen-Shannon divergence of 64-bin luma histograms (0 identical, 1 maximal). Mean luma is 0-255. `gain-matched` rescales Aura3D's luma by mean(three)/mean(Aura3D) first, so a global exposure difference does not hide whether the layout agrees. The baseline cube is not a visual scene and is excluded.

| Scene | JSD f25 | JSD f85 | mean luma three / Aura (f25) | mean luma delta f25 | mean abs luma diff f25 | gain-matched JSD f25 | gain-matched mean abs diff f25 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 PBR viewer | 0.4578 | 0.4578 | 55.0 / 89.3 | 34.3 | 36.5 | 0.5219 | 19.9 | unmeasurable (no reference image); see frames |
| 2 forest 10k | n/a | n/a | n/a | n/a | n/a | n/a | n/a | unmeasurable |
| 3 skinned character | 0.9673 | 0.9721 | 144.0 / 192.5 | 48.5 | 48.6 | 0.6877 | 19.1 | unmeasurable (no reference image); see frames |
| 4 game loop | 0.4848 | 0.4848 | 59.6 / 92.2 | 32.6 | 32.6 | 0.9798 | 11.3 | unmeasurable (no reference image); see frames |
| 5 shader water | 0.0000 | 0.0000 | 175.2 / 175.2 | 0.0 | 0.2 | 0.0000 | 0.2 | unmeasurable (no reference image); see frames |

Animation and determinism checks:

| Check | three.js | Aura3D | Verdict |
| --- | --- | --- | --- |
| Game loop: two 1800-step replays hash identically | yes | yes | tie |
| Game loop: replay hash (1800 steps) | lost:60:1800:9b693d58 | lost:60:1800:9b693d58 | tie (same rules, same stream) |
| Game loop: replay hash (600 steps) | playing:30:600:321a662f | playing:30:600:321a662f | tie |
| Skinned character: luma change between frame 25 and 85 (mean abs, proves motion) | 2.59 | 1.54 | see note: both must be > 0 |
| Skinned character: clips reported | ["Idle","Run","TPose","Walk"] | ["Idle","Run","TPose","Walk"] | unmeasurable |

Console errors and warnings during the run (first few per app):

- baseline/three: 4 message(s): [warning] [.WebGL-0x379c00115a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x379c00115a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x379c00115a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- baseline/aura: 3 message(s): [warning] POSTPROCESS_V2_UNMIGRATED: legacy postprocess chain kept under A3D_QR_CORE_OUTPUT; OutputPass bypassed for this frame (the chain encodes itself) until PostGraph ; [error] Failed to load resource: the server responded with a status of 404 (Not Found) ; [warning] [aura3d] environment probe not ready; rendering with the neutral floor (ENV_FETCH_FAILED:/aura-environments/neutral.manifest.json:404)
- pbr-viewer/three: 5 message(s): [warning] RGBELoader has been deprecated. Please use HDRLoader instead. ; [warning] [.WebGL-0x1d4400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x1d4400105a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- pbr-viewer/aura: 3 message(s): [warning] POSTPROCESS_V2_UNMIGRATED: legacy postprocess chain kept under A3D_QR_CORE_OUTPUT; OutputPass bypassed for this frame (the chain encodes itself) until PostGraph ; [error] Failed to load resource: the server responded with a status of 404 (Not Found) ; [warning] [aura3d] environment probe not ready; rendering with the neutral floor (ENV_FETCH_FAILED:/aura-environments/neutral.manifest.json:404)
- forest/three: 0 message(s)
- forest/aura: 0 message(s)
- skinned-character/three: 4 message(s): [warning] [.WebGL-0x26c00135a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x26c00135a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x26c00135a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- skinned-character/aura: 4 message(s): [warning] glTF mesh 0 primitive 0 WEIGHTS_0 normalized: 0 degenerate vertex(es) set to [1,0,0,0], 52 rescaled to sum 1 ; [warning] POSTPROCESS_V2_UNMIGRATED: legacy postprocess chain kept under A3D_QR_CORE_OUTPUT; OutputPass bypassed for this frame (the chain encodes itself) until PostGraph ; [error] Failed to load resource: the server responded with a status of 404 (Not Found)
- game-loop/three: 0 message(s)
- game-loop/aura: 3 message(s): [warning] POSTPROCESS_V2_UNMIGRATED: legacy postprocess chain kept under A3D_QR_CORE_OUTPUT; OutputPass bypassed for this frame (the chain encodes itself) until PostGraph ; [error] Failed to load resource: the server responded with a status of 404 (Not Found) ; [warning] [aura3d] environment probe not ready; rendering with the neutral floor (ENV_FETCH_FAILED:/aura-environments/neutral.manifest.json:404)
- shader-water/three: 4 message(s): [warning] [.WebGL-0x29c400131a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x29c400131a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels ; [warning] [.WebGL-0x29c400131a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
- shader-water/aura: 3 message(s): [warning] POSTPROCESS_V2_UNMIGRATED: legacy postprocess chain kept under A3D_QR_CORE_OUTPUT; OutputPass bypassed for this frame (the chain encodes itself) until PostGraph ; [error] Failed to load resource: the server responded with a status of 404 (Not Found) ; [warning] [aura3d] environment probe not ready; rendering with the neutral floor (ENV_FETCH_FAILED:/aura-environments/neutral.manifest.json:404)

## 10. Repeatability: a second, independent run on fresh runners

Same code, same image tag family, separate ACR tasks. Ratios are Aura3D / three.js (steady-state total frame median and median time to first frame); if the two runs disagree about the ordering the row would show it.

| Scene | frame ratio run 1 | frame ratio run 2 | TTFF ratio run 1 | TTFF ratio run 2 | three.js frame ms run 1 / 2 | Aura3D frame ms run 1 / 2 |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (one cube) | 692.44x | 778.38x | 34.38x | 36.31x | 0.9 / 0.8 | 623.2 / 622.7 |
| 1 PBR viewer | 4.37x | 4.40x | 0.84x | 0.80x | 224.8 / 219.0 | 983.1 / 964.1 |
| 2 forest 10k | n/a | n/a | n/a | n/a | n/a / n/a | n/a / n/a |
| 3 skinned character | 16.36x | 17.97x | 8.41x | 8.39x | 50.9 / 49.9 | 832.5 / 896.6 |
| 4 game loop | 37.19x | 34.61x | 20.55x | 22.13x | 19.5 / 21.6 | 725.2 / 747.6 |
| 5 shader water | 13.76x | 14.45x | 13.91x | 12.71x | 50.2 / 48.8 | 690.9 / 705.2 |

## 11. Features needed out of the box (author-assessed from the scene sources)

`Y` = provided by the library's own public API in one call or option. `addon` = three.js needs a separate `examples/jsm` import. `hand` = the scene wrote it. Verdicts compare the *work an author does*, not the quality of the result. This section is judgement, not a measurement.

| Scene | Capability | three.js 0.185.1 | Aura3D 4.1.2 | Verdict |
| --- | --- | --- | --- | --- |
| 1 PBR viewer | GLB load + fit to height | addon `GLTFLoader` + `Box3` maths (hand, 4 lines) | `model(ref, { targetHeight })`, but the ref must come from `defineModelAssets` with a sha256 (a generated file here) | Aura3D fewer lines; three.js has no build-time hash step |
| 1 | HDR environment lighting | addon `RGBELoader` + core `PMREMGenerator` (hand, 3 lines) | `environments.hdri({ texture })`; the texture ref needed an `as never` cast | tie |
| 1 | Shadow | `castShadow`/`receiveShadow` on every mesh plus hand-set ortho extents | `shadow: true` on the light, `castShadow` on the model | Aura3D fewer lines |
| 1 | Bloom | addons `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` (4 imports) | `effects.bloom({...})` | Aura3D better |
| 1 | Orbit control | addon `OrbitControls` | `interactions.orbit({ target: "node-name" })` (takes a node name, not a point) | tie |
| 2 forest | 10,000 instances with per-instance colour | core `InstancedMesh` + hand matrix composition (hand, ~12 lines) | `instances.cone/cylinder/sphere({ transforms, colors })`, declarative | Aura3D better |
| 2 | Seeded RNG | hand-written mulberry32 (9 lines) | `createCountedRng(seed)` | Aura3D better |
| 2 | Exponential fog | core `FogExp2` | `effects.fog({ density })` | tie |
| 3 skinned | Clip lookup, cross-fade | core `AnimationMixer`, `clipAction`, `crossFadeFrom` | `handle.play(name, { crossFade })` by clip name string | Aura3D fewer lines; three.js is typed against the clip objects |
| 3 | Fit character to height | hand `Box3` | `targetHeight` | Aura3D better |
| 4 game loop | Fixed timestep | hand accumulator (5 lines) | `createFixedStepLoop` | Aura3D better |
| 4 | QA/replay hooks | hand-written | `installQaHooks` | Aura3D better (three.js has no equivalent concept) |
| 4 | HUD, pause, results | shared plain-DOM module in both. Aura3D's game kit (`@aura3d/engine/game`) has HUD, pause and results screens but needs `createGame` plus DOM adapters and was **not trialled** | not trialled | unmeasurable |
| 5 water | Custom GLSL material | core `ShaderMaterial`, uniforms and varyings declared by hand | `material.custom({ glsl, uniforms })`, uniforms auto-declared, but the prelude names (`position`, `modelMatrix`, `outColor`) are only documented in examples | Aura3D fewer lines; three.js better documented |
| 5 | Subdivided plane for vertex displacement | core `PlaneGeometry(w, h, nx, ny)` | **not available**: `primitives.plane({ params: { widthSegments } })` is accepted by the types and ignored (a 4-vertex quad); a 20-line grid via `geometry.dynamic` was written | three.js better |
| 5 | Custom post pass | addons `EffectComposer` + `ShaderPass` + `OutputPass` | `effects.shaderPass({ glsl })` | Aura3D better |
| all | Default look before any lighting is authored | none: PBR metals render dark without an environment | a built-in neutral environment floor | differs; changes the picture, see section 9 |
| all | Production build from the published packages | `vite build` works with no config | needs `@aura3d/assets`, a node-built-in stub plugin and `vite.config.ts` (section 12) | three.js better |


## 12. Failure modes observed while building and running these scenes

Each item happened in this work; none is hypothetical.

1. **Aura3D, build.** A stock `vite build` of any app importing `@aura3d/engine@4.1.2` fails: `"readFileSync" is not exported by "__vite-browser-external"` from `dist/assets/threejs-compatibility/ThreeCompatAssetRegistry.js` (Vite 7.3.2 / rollup 4.60 and Vite 7.3.7 / rollup 4.65). The shipped `mini-game` template fails the same way on a fresh `npm install`. Workaround used: a 10-line Vite plugin stubbing Node built-ins plus `@aura3d/assets/vite`. three.js: no failure.
2. **Aura3D, install.** The shipped `mini-game` template's `package-lock.json` is out of sync with its `package.json` (`npm ci` fails: lock has `@aura3d/assets@2.0.4`, manifest wants 4.1.2).
3. **Aura3D, runtime.** Every Aura3D app requested `/aura-environments/neutral.manifest.json` and got a 404; the engine logs `ENV_FETCH_FAILED` and renders with a neutral floor. The baked environment files are not in any published package I could find (they live in the repository's `public/aura-environments`). The look still renders, but it is not the look the authored environment path would give.
4. **Aura3D, API.** `primitives.plane({ params: { widthSegments, heightSegments } })` type-checks and is silently ignored (a single quad). The first water scene was therefore flat; found only by comparing frames.
5. **Aura3D, API.** `interactions.orbit` takes `{ target?: string }` (a node name). The first viewer passed a position and an `autoRotate` flag behind `as never`; the cast hid the wrong call and nothing happened.
6. **Aura3D, runtime.** A console warning `POSTPROCESS_V2_UNMIGRATED ... legacy postprocess chain kept ... OutputPass bypassed` appears in scenes that author no post effect. A `WEIGHTS_0 normalized` warning appears for the Soldier GLB (three.js loads the same file silently).
7. **Aura3D, performance default.** The default `production` profile renders into 4x multisampled RGBA16F targets and resolves with a blit (section 8d). Under software GL this costs several times what an un-antialiased three.js frame costs. Section 7d re-measures against three.js with 4x MSAA.
8. **Aura3D, exposure.** Identical nominal light intensities give a brighter picture than three.js (section 9: e.g. skinned character mean luma 144 vs 192). Matching them needs per-scene tuning; this scene set was not recalibrated for Aura3D except as noted.
9. **three.js.** `PCFSoftShadowMap` logs a deprecation warning in r185 (switched to `PCFShadowMap`). Reading the framebuffer for the capture logs a driver "GPU stall due to ReadPixels" notice (this harness, not the library).


## 13. Authoring trial (one author, not independent)

All ten scenes were written by the same agent (this one), which has far more three.js knowledge than Aura3D knowledge and read Aura3D's `.d.ts` files, docs and repository examples to write the Aura3D side. That favours three.js; the repository examples are also contaminated by being in my context. Treat the counts as anecdote.

| | three.js | Aura3D |
| --- | --- | --- |
| Edits after the first draft of all scenes | 3 (nullable clip typing, deprecated shadow type, over-exposed viewer retuned) | 7 (`.add(array)`, add `@aura3d/assets`, add `vite`, node built-in stub plugin, noise texture colour space, water grid, orbit options) |
| Type errors on the first typecheck | 1 | 1 (`.add(array)`; builders add one node) |
| Blocking build failures | 0 | 1, took 4 attempts: missing `@aura3d/assets`, missing `vite`, then the node built-in export error |
| Wrong-but-compiling API use found only at run time | 0 | 2 (`plane` segments, `orbit` options) |
| Files read to find the right API | 0 (from memory) | a dozen or more `.d.ts` files, docs pages and example ports (not counted precisely) |
| Final scene LOC (sum, five scenes) | see section 1 | see section 1 |

Aura3D's own docs and examples answered most questions, but two of the seven edits were caused by the API accepting input it then ignored (items 4 and 5 in section 12), and the build chain cost four of them before anything ran. A coding agent working only from types would hit the same silent no-ops. On first-try success, three.js was better in this trial. three.js's one self-inflicted problem was exposure: the first viewer was blown out and needed retuning.


## 14. Scene not completed: 2 forest (10,000 instances), Aura3D side

What blocked it: the Aura3D forest app never returned a result on the software-GL runner. Run `benchvs-003b` (full frame plan) ran 56 minutes and hit the 55-minute test limit; `benchvs-005b` (full plan) and `benchvs-007b` (reduced plan: 1 cold load, 12 measured frames, captures at frames 10 and 21) were still inside the Aura3D forest app after 25 to 40 minutes when the data was collected. The three.js forest apps finished normally: with 4x MSAA it took 1,438 ms per frame, 7 draw calls, about 1.17 million triangles (`three-msaa` rows). The Aura3D declarative `instances.*` path with 8,000 transforms and HSL colour strings was used; the `instances.mesh` imperative path was not tried. Per-frame cost per instance on software GL, or setup cost in JS, could be the cause; this was not isolated. Forest rows in the tables are therefore `unmeasurable` except the three.js 4x MSAA rows. Bundle, request and source-size rows do exist for the forest (builds succeeded).


## Tally of numeric rows

Aura3D better: 18; three.js better: 76; tie: 10; unmeasurable: 20. (Rows counted: every per-scene row in sections 1 to 9.)
