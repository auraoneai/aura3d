# WP-8: first-frame init, one cube (software WebGL2)

Owner: beat-three.js PRD-2 WP-8. Target P3: time to first frame for the cube <= 500 ms. The target is not moved.

Method: `tests/browser/first-frame-init.spec.ts` on the remote ACR runner (`tools/remote-acr/run.sh`, `KEEP_IMAGE=0`), 3 cold loads per run, each in a fresh browser context, through the in-repo example dev server (unbundled, esbuild per file) and `tests/browser/frame-cost-harness.html?scene=cube&quality=auto`. Software rasteriser (SwiftShader, 2 CPUs), shared runner: these are not GPU times and they move by tens of ms between runs.

- `mountMs`: `createAuraApp` call to first frame finished (engine-owned work, includes `app.ready()`, one `step()` and a `readPixels` sync).
- `firstFrameMs`: navigation start to first frame finished. It also contains loading the dev server's module graph, so it is build-mode inflated; the bundle and request count belong to the agent-first-authoring PRD, Track C.
- The first load of every run is a fresh dev-server cache (3.1 to 4.9 s before and after, no relation to the change); the medians below are over 3 loads, so they are the warm loads.

## Before and after (median of 3 cold loads, ms)

| Run | Code | navigation to first frame | createAuraApp to first frame | per load (nav / mount) |
| --- | --- | --- | --- | --- |
| wp8base1 | 4.5.0 integration (544b73bd4) + instrumentation | 873 | 491 | 3507, 873, 822 / 630, 491, 429 |
| wp8base2 | same | 755 | 407 | 3094, 755, 710 / 482, 385, 407 |
| wp8after1 | WP-8 | 641 | 252 | 4894, 609, 641 / 469, 222, 252 |
| wp8after2 | WP-8 | 596 | 235 | 3544, 542, 596 / 318, 209, 235 |
| wp8final1 | WP-8 (final commit) | 649 | 209 | 3627, 547, 649 / 332, 209, 207 |

Before: 755 to 873 ms navigation, 407 to 491 ms createAuraApp. After: 596 to 649 ms navigation, 209 to 252 ms createAuraApp. That is about 200 ms less on both figures. P3 (<= 500 ms) is met for the engine-owned part (createAuraApp to first frame, 209 to 252 ms) and not met for navigation to first frame on this dev-server build (596 to 649 ms). The navigation figure needs the bundle work in Track C; it is recorded as measured. For reference RESULTS-candidate.md has 696 ms for the published-style bench build at 4.5.0 prep.

## What the profile showed (before)

V8 profile of the first frame (`FIRST_FRAME_PROFILE_TREE` in the run logs, inclusive ms):

| Cause | ms | Where |
| --- | --- | --- |
| `probeToEquirectTexture` of the analytic floor probe | 152 | `resolvePrd02EnvironmentLighting`, inside the first `renderFrame`. 131k nearest-cube lookups, then `faceToHalf` of the 512x256 equirect and four mips, for a cube whose every texel is one constant |
| `buildNeutralFloorProbe` | 73 | `cache.neutral(tier)` inside `updateCompiledScene`, before the first draw. Six identical 256x256 float faces, each half-encoded texel by texel (`faceToHalf` 61 ms) |
| `readError` (`getError` sync, first 30 frames) | 36 | waits for the software GPU; moved, not removed, by anything on the CPU side |
| first cube upload and uniforms | 21 | `uploadCubeTexture` 11.5 |
| `warmGeneratedProgramsSync` | 9.5 | JS side of program generation |
| baked default probe decode (`loadEmbeddedNeutralProbe`) | 64 | base64, readRgb9e5Cube, half encode of five mips |

The 4.3.7 note (RESULTS-4.3.7.md section 11a) attributed about 454 ms to `Rgb9e5Cube`. At 4.5.0 that cost is the floor probe (the first two rows) and the baked probe decode (last row); the P1 bit-exact encode already made each texel cheaper.

## What changed

1. `buildNeutralFloorProbe` (`packages/rendering/src/environment/probeBuild.ts`) writes one half-float face directly (`uniformRadianceHalf`) and shares it across the six faces (`Texture` copies what it is given). Same bits as before; no 1.5 M-element float allocation and encode.
2. `probeToEquirectTexture` has a fast path for a probe that carries `uniformRadiance` (only the floor does): the equirect and every mip are filled with the same half value. This is bit-identical to the sampled result because sampling is nearest-texel, the half encode of a value that is already a half is the identity, and the 2x2 box mean of four equal halves is exact in float32. A unit test asserts every mip against the general path.
3. The baked default probe (`defaultProbeLoader`, preset `neutral`) now waits for the first frame (`packages/rendering/src/environment/FirstFrameGate.ts`): a `Renderer` arms the gate when created and notifies it after its first submitted frame; waiters are released in a later task, or after 3 s if no frame arrives, or at once where no renderer exists. The embedded chunk is still requested at once. The first frame is lit by the synchronous floor probe, as it was before.
4. Measurement only: `a3d:` marks for the env upgrade and the first render frame, first-frame pixel statistics and probe marks in `frame-cost-harness.ts`, and the new spec.

Frames after the first are unchanged:

- Settled frame (30 frames after the default probe landed), SHA-256 of the full RGBA read: `4b0df92445453a5dd7925ccd1a2e6370f48b425c07c0bcbd5d96eef07d1cb00b` before (wp8base1) and after (wp8after1, wp8after2, wp8final1), on all 15 loads.
- First frame pixel statistics (mean RGB over the buffer, mean colour of the cube pixels, lit pixel count 10,475) are identical before and after and identical on every load.

## First frame looks right (asserted)

`first-frame-init.spec.ts` asserts on every load: no console warning or page error; more than half of the first frame's pixels are non-black; the cube is drawn (more than 1,000 lit pixels); the mean colour of the cube pixels in the first frame is within 8/255 per channel of the settled frame (measured: [133.27, 46.51, 19] against [133.10, 46.47, 19]); the cube is not drawn dark; `a3d:env:upgrade:ready` is absent at the first frame and present once settled; the first frame and the settled frame are identical across cold loads.

Unit tests: `tests/unit/environment-first-frame/uniform-floor.test.ts` (floor encode, equirect fast path against the general path for every mip and for explicit sizes) and `first-frame-gate.test.ts` (gate states, release in a later task, timeout, and the default probe loader holding until the first frame).

## Effect of the deferral, stated honestly

In this harness the baked probe decode already ran after the first frame before the change (no `a3d:env:upgrade:ready` mark at the first frame in the baseline runs), because the gunzip is an async stream whose turns land after the synchronous mount. So the measured gain comes from items 1 and 2; item 3 shows no difference here. It is kept as a guard: a build where the chunk and the gunzip complete earlier (a bundle with the chunk resident) could run the roughly 65 ms decode inside the mount, and the gate makes the order deterministic. That effect is not measured here.

## Remaining causes (createAuraApp to first frame, ~210 to 250 ms after)

From wp8final1 and the wp8after1 profile; GL call timings from `__FF_GL__` before the first frame:

- Software rasteriser wait: `getError` sync 35 to 39 ms plus the harness `finish` (`readPixels`) 73 to 81 ms, about 110 to 120 ms. This is the GPU work of the first MSAA frame in SwiftShader; no init change moves it.
- Shader programs: 1 program (2 shaders, 1 link) is compiled before the first frame; `getShaderParameter` plus `getProgramParameter` cost 2 to 3 ms warm (23 ms on a cold first load). "Warm only the programs the first frame needs" and `KHR_parallel_shader_compile` therefore have nothing to win for the cube; the 60 to 90 ms shown as `(program)` in the profile is the native wait for the GPU process, not compile.
- `createRenderDevice` (context and extension setup) 14 to 16 ms.
- Texture uploads (`texImage2D`, 7 calls) 10 to 14 ms, of which the floor cube and its equirect are most.
- `Texture` copies the pixel data of all six floor faces (`clonePixelData`, about 8 to 13 ms in the profile). Skipping the copy needs an ownership flag on `Texture`; not done here.
- GC 15 to 19 ms.

Outside `createAuraApp` and not owned by this WP: about 360 to 400 ms of the navigation figure is the dev server loading the module graph (Track C); `packages/physics-rapier/src/rapierInit.ts` decodes the rapier wasm base64 and instantiates it at module evaluation (13 to 28 ms) for every app that imports the engine, a deliberate trade for `app.physics` being live synchronously.

## Checks

- `tsc -p tsconfig.check.json`: 58 errors, same as main.
- Unit run over `tests/unit/{rendering,environments,production-runtime,perf-frame-cost,render-fix,engine,agent-api,contracts,environment-embedded}`: 60 failing tests before (commit aaf328e65) and after (cdc33dc86), the identical set (list diffed). They are environment failures present on the parent commit.
- Raw run logs: `tests/reports/remote-acr/wp8base1`, `wp8base2`, `wp8after1`, `wp8after2`, `wp8final1` (gitignored).
