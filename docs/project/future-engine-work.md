# Future engine work: WebGPU, worker rendering, wide gamut

Status: backlog for a future release. Not in 5.2.0 or 5.2.1. Recorded 2026-11-07 after a real-GPU investigation of every experimental 5.x feature across the 25 showcase games (headless Chrome, ANGLE Metal, Apple M-series; evidence was kept under `/tmp/a3d-exp-out/` on the investigation machine).

Owner rule for these features: on by default in a game only after it passes a real-GPU check (renders, no errors, look matches the WebGL2 default, no large fps loss). Until then they stay behind the lab flags (`?backend=`, `?worker=1`, `?gamut=p3`, parsed in `examples/shared/lab-flags.ts`).

## Already fixed (5.2.1 engine patch and the 5.2.0 site)

- `?backend=webgpu` never gives a black game: unsupported scenes fall back to WebGL2 before a WebGPU context is taken, and log `[aura3d] BACKEND_FALLBACK: ...` (was silent).
- WebGPU accepts partly filled array uniforms (Gridlock Courier went black on `u_instanceMatrices`).
- `?gamut=p3` falls back to sRGB instead of failing to mount (Slingshot Siege, Saltwind Highway drew nothing).
- Aura FC 3D no longer crashes on `?worker=1`; Aura FC 3D, Pips' Big Leap and Glint Courier now pass the lab flags to the engine.

## 1. WebGPU as a working backend (about 100 h)

Today no game renders on WebGPU. 13 games fall back because their post stack needs depth textures WebGPU does not have; the rest hit missing WGSL passes. Work packages, in the order that unblocks the most games:

| # | Work | Games unblocked | Est. |
|---|---|---|---|
| W1 | Depth textures on the WebGPU device plus a WGSL SSAO pass; remove `ssao` from the pre-check (`packages/engine/src/agent-api/compiler/postprocess.ts:441-455`; `packages/rendering/src/WebGPUDevice.ts:2709-2731`; `packages/rendering/src/webgpu/WebGPUPostShaders.ts`) | 12 (Hoops and Cross Hop need only this) | 20 h |
| W2 | Depth of field in the native WebGPU LDR chain with MSAA resolve, motion blur, vignette, grain, chromatic aberration, outline (`packages/rendering/src/renderer/PostprocessExecution.ts:227-293`) | 9 | 16 h |
| W3 | WGSL SSR on top of W1 | 6 | 16 h |
| W4 | WGSL volumetric light and motion blur (`packages/rendering/src/webgpu/WebGPUTemporal.ts`) | 4 | 20 h |
| W5 | Point-topology particles in WebGPU depth and shadow passes (`packages/rendering/src/DepthPass.ts:458-470`); wind-sway depth deform (`WGSL_DEPTH_DEFORM_UNSUPPORTED`); fog contributor in generated PBR (`WGSL_PROGRAM_MISSING`); unlit billboard sprites (`NATIVE_UNLIT_SPRITE_UNSUPPORTED`) | Saltwind, Shadowstep, Gridlock | 12 h |
| W6 | WGSL versions of custom GLSL through the portable shader path (Roadster Rush, Cumulus Dash first; the 11 GLSL-heavy ports after) | 2+ | 12 h+ |
| W7 | Real-GPU pass per game, then turn on `backend: "auto"` where the look matches | all that pass | 4 h |

Acceptance: a game counts as WebGPU-on only when the canvas holds a `webgpu` context, there are no mount errors, and the frame matches the WebGL2 default in static regions.

## 2. Worker-owned rendering (about 100 h + 8 h per game)

No game can run on it. The worker app cannot host game code: `app.nodes`, `app.physics`, `onFrame` and `step` throw, and the protocol can only replace the whole scene (`packages/engine/src/agent-api/app/workerRootApp.ts`, `workerProtocol.ts:148-160`). `createGame` drops worker requests by design (`packages/game/src/createGameCore.ts:129-139`), and the site build ships no render worker bundle.

| # | Work | Est. |
|---|---|---|
| K1 | Patch protocol message: batched node transform, visibility, material, animation-param changes; host-side `app.nodes.require` proxies that queue patches flushed in `stepAsync` | 40 h |
| K2 | Async game loop in `createGame` (rAF → logic and physics on the main thread → `await stepAsync`) | 24 h |
| K3 | Host-side picking (CPU raycast mirror or async worker pick), camera and animation options, host-projected DOM labels | 30 h |
| K4 | Bundle `render.worker` in the site Vite build; games pass `createWorkerRendererWorker` to `labAppOptions(flags, createWorker)` | 4 h |
| K5 | Per-game port and real-GPU parity/fps check | 8 h per game |

Gain to verify before investing: main-thread headroom on heavy games (input latency, HUD smoothness). Not a visual change.

## 3. Wide-gamut (Display-P3) output (about 13 h)

Every game's post chain has a legacy colour-grade pass that the P3 output route rejects, so P3 never becomes active. With those fixes P3 works, but for this content (sRGB-authored, ACES-tonemapped) a correct P3 frame matched the sRGB frame within 0.1 mean RGB on Aura Hoops 3D: no visible gain today.

| # | Work | Est. |
|---|---|---|
| P1 | Colour grade inside the OutputPass epilogue (`OUTPUT_COLOR_GRADE`), admit `color-grade` in `outputPassRouteTone`, map `fxaa` to the fused FXAA (`packages/rendering/src/webgl2/LegacyPost.ts:3074`, `output/OutputPass.ts`); paired sRGB look check on all games | 10 h |
| P2 | Allow vignette, film grain, SMAA and FXAA in `prepareP3DisplayTail`; use `tailPipeline` for the plan (`packages/rendering/src/post/v2Stages.ts:2089-2098`, `LegacyPost.ts:3253`) | 2 h |
| P3 | Turn on only for content that actually uses colours outside sRGB (wide-gamut textures or HDR-graded scenes), after a paired check on a P3 display | 1 h |

## Related, in progress

Reversed depth precision: engine fixes for contact shadows, sky, fog, SSAO/SSR/DoF and shadows under reversed depth are a separate lane targeted at 5.2.1; it is on by default in Ion Circuit already. Logarithmic depth stays off (hand-written GLSL does not write log depth, and reversed float depth already gives full precision).
