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

## 4. Agent authoring: native baseline, three.js asset bridge, fixed comparison (next active work after 5.2.0)

Source: neutral benchmark `tests/reports/benchmark-505/REPORT.md` (24 tasks x 3 runs; median turns 25 docs / 14 cheat sheet / 5 three.js; median tokens 1.45M / 420K / 63K; visual wins vs three.js 23.5% / 25%; 52 of 77 clear three.js wins attributed to engine defaults: look/lighting 21, materials 9, framing 8, silent fallbacks 8, missing helpers 6; 18 to less agent detail). "Finished" there means "did not hit the 40-turn cap", not "acceptable result".

Order: native baseline first, bridge second, comparison third. Each item starts after 5.2.0 is published and must not touch a release candidate under test.

| # | Deliverable | Owner | Starts from | Done when |
|---|---|---|---|---|
| N1 | Colour input: every CSS colour form parses in materials, background, lights, fog; invalid values error loudly (no near-black fallback) | engine lane | `packages/engine/src/agent-api/colorUtils.ts:25-33` | benchmark games-2 stacker renders its colours; unit tests for each form and the error |
| N2 | Structured reflection environment for metal and glass (room-style, generated in code, no HDRI file) as the default IBL when none is authored | rendering lane | softbox environment (5.2.0) + three.js RoomEnvironment as a reference for the idea only | materials-1 glass and steel spheres readable against a light backdrop on real GPU |
| N3 | Plain look path that matches authored colours (no ACES desaturation by default on simple lit scenes, no stacked fill washout) | rendering lane | `postprocess.ts:249-254` default operator, benchmark cause A frames | the cause-A benchmark scenes re-rendered: luma/saturation within the three.js band |
| N4 | Framing and shadows by default in the standard creation path (use existing `frameCameraPose`/`measureFrameFill`; key light casts shadows) | docs + templates lane | templates, cheat sheet, `llms.txt` | the cause-E scenes frame the subject at the target fill without hand-placed cameras |
| N5 | Starter scenes, verified on real GPU: product viewer, outdoor, interior, small game, animated presentation | templates lane | `create-aura3d` templates | each renders, passes check-deploy, and is linked from the cheat sheet |
| N6 | Agent tools: installed version and API surface, matching example lookup, validate, render with diagnostics, exercise an interaction, batched scene edits | agent-tools lane | existing CLI checks and render probe | an agent can run author, validate, render, inspect, correct without leaving the tools |
| N7 | Guessed-name handling: mine benchmark transcripts; same-semantics names become aliases, different-semantics names give an error naming the native call | engine lane | 5.2 guessable-API work | top recurring wrong guesses from the transcripts covered by tests |
| N8 | Declaration cleanup: `SOFTBOX_SPECULAR_GZIP_BASE64` (and any similar generated literal) typed as `string` so `.d.ts` stays small (5.2.1) | rendering lane | `tools/environments/bake-softbox.ts` output | packed `.d.ts` has no base64 literal; runtime bytes unchanged |
| B1 | Narrow three.js bridge: a structured scene factory (returns scene, assets, clips) runs at build time with a fixed seed and asset-readiness wait; exports via three's GLTFExporter (export hidden objects and the supplied clips explicitly); maps into Aura3D typed assets; writes a supported / approximated / unsupported report; keeps generator source, parameters, seed and stable IDs so regeneration preserves native edits; first mode preserves the authored look, restyling is a separate explicit step. Behaviour (input, physics, scoring, UI) stays native. Shaders: standard materials plus an explicit effect-mapping list; static procedural patterns may be baked to textures; everything else reported, never silently substituted | bridge lane | `aura3d migrate three` codemod, `@aura3d/three-compat` (reuse what applies) | 3 procedural asset recipes import, render on real GPU, and regenerate without losing native edits |
| C1 | Fixed comparison: 8 tasks chosen before results, 3 runs each; arms: improved native Aura3D (same version), three.js, three.js + bridge (all authoring, export and repair counted) | benchmark lane | `tools/agent-eval` | report with visual quality, functional correctness (requested interactions work), billed cost (actual, incl. cache), wall time and tool time, failed and capped runs, asset size, load time, runtime fps, and one predefined follow-up edit per task |

Decision rule for the bridge: keep it as a supported route if it gives about 25% lower time or cost at comparable quality and correctness, or clearly better quality at comparable time and cost, against the improved native workflow on the same Aura3D version. If the gain is only in procedural assets, support it only for assets. If native authoring is competitive after N1-N7, native stays the default.

Related ideas from other engines (ideas only, no code): Babylon's one-call default environment and content-based camera framing (N2-N4); a public runnable playground with shareable example URLs (separate, longer project); keeping the core API stable so model knowledge stays correct; PlayCanvas shipping skills and verification in new projects (already done in `create-aura3d`).
