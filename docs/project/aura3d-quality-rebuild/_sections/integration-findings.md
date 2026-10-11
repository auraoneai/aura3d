# Combined-flags failure: root cause (main @ afb475c2)

Evidence sources (all read-only):
- GitLab pipeline 2926601350, job 17031320091 (benchmark, flags = 13 lanes, no strict/webgpu).
  Trace + artifacts pulled to /tmp/qrfinal/gl/{trace.txt,art/}. report.json carries per-scene
  payload.errors / consoleMessages / failedRequests. GPU: ANGLE Metal (Apple Paravirtual), headless-shell.
- GitLab pipeline 2926540757 (flags=all incl. strict): bench job 17030837765 (/tmp/qrfinal/gl/bench2.txt),
  games job 17030837764 (/tmp/qrfinal/gl/games.txt, games/…/report.json).
- GitHub lane CI (gh run list/view): qr-prd01-core.yml run 37559561989 (phase4-output branch) etc.

## TL;DR

The black frames and "drawCalls 0" are not shader or perf problems. The production renderer never mounts.
On the very first frame of every Aura scene, under `A3D_QR_CORE` (which turns on `A3D_QR_CORE_OUTPUT`
by default), the renderer throws:

    RenderDeviceError: Multisample render targets do not support layered, depth-only, compare or MRT descriptors
    (code INVALID_RENDER_TARGET_SAMPLE_COUNT)

That exact string is in `payload.errors` for all 6 "ready" base scenes (01,10,11,12,14,16).
The other 12 base scenes hit the same failure but run out the harness clock first (see (b)).
The harness then reports `ready` anyway, because nothing in the readiness path treats a failed mount
or `drawCalls 0` as a failure (see (c)).

Lane 01's own browser CI never passed with the core output path (see "CI history"). So this is a lane-01
bug that merged with a red gate. It is not an interaction between lanes. `core` alone should reproduce it
(still unverified, see the bisection plan).

## (a) Why nothing is presented, not even the clear colour

Frame path with lane flags on:
createAuraApp (agent-api/app/createAuraApp.ts:381) -> startProductionRender (app/frameLoop.ts:25)
-> createProductionSceneRenderer (app/mountRenderer.ts:20) -> createProductionRuntimeSceneRenderer
(compiler/renderer.ts:33; compileScene under A3D_QR_COMPILER) -> first `renderFrame()` (frameLoop.ts:221)
-> Renderer.render (packages/rendering/src/Renderer.ts:612).

1. Renderer.ts:665 `qrOutput = qrCoreOutputOn(rendererQrFlags())`. This is true under `core`
   (renderer/qrSubFlags.ts:23: the sub-flag defaults to the lane flag). Renderer-side flags are bound
   for every app by the unconditionally registered `prd11.quality` extension
   (packages/engine/src/lanes/prd11.ts:198 `prd11SetRendererQrFlags(ctx.flags)`) and by the prd07 effects extension
   (agent-api/vfx/effects-api.ts:315).
2. Renderer.ts:666-672: the bridge's legacy postprocess chain is dropped
   (console: `POSTPROCESS_V2_UNMIGRATED`, seen in every scene). So the code takes the `else if (qrOutput)` branch at :711.
3. Renderer.ts:717 -> `ensureHdrSceneTarget` (Renderer.ts:1309-1329) always passes
   `colorAttachments: [{ format }]` (one entry when coverage is off) **and** `sampleCount: 4`.
4. WebGL2Device.ts:899 rejects ANY descriptor with `sampleCount > 1 && descriptor.colorAttachments !== undefined`.
   That rejects even a one-entry array. It throws before `beginFrame`, any clear or any draw.
   - Conflicting commits, both lane 01: e7bcafc4 "phase 2a — layered/MRT render targets" (the guard)
     and 566c4d50 "phase 4 — FrameGraph split + HDR end-to-end + OutputPass" (the HDR target).
5. frameLoop.ts:222-228 catches the error, disposes the renderer and rethrows. createAuraApp.ts:421-441 marks
   `productionMountFailed`, pushes the error to `diagnostics().errors` and (when not strict) resolves `ready()`.
   step() from then on only adds the "step() rendered nothing because the WebGL renderer failed to mount" warning
   (createAuraApp.ts:601-621). The canvas is never written, so the frame is blank (black in the PNG), with no clear colour.

Fix (lane 01, one line either side):
- Renderer.ts:1322-1324: pass `colorAttachments` only when `coverage` is true. Coverage+MSAA also needs
  either `sampleCount: 1` or real multisampled-MRT support in the device. Or:
- WebGL2Device.ts:899: treat `colorAttachments?.length === 1` as single-target (`> 1` = MRT).
- Add a unit test that mounts the v2 output path on WebGL2Device (or the mock with the same guard).

## Layers expected after (a) is fixed (ranked)

Fixing (a) will very likely expose the next layer. These are the most likely culprits, by code reading:

A2. Silent generated-program failures, which give drawCalls 0 with the clear colour visible.
   - ProgramCache.acquire (rendering/src/program/ProgramCache.ts:79-104) caches `status:"failed"` forever.
     ForwardPass.getShader (ForwardPass.ts:471-478) returns `undefined` and drawItem silently skips the draw
     (ForwardPass.ts:339). No error, degradation or console entry is emitted.
   - Lane 01's own `program-generator-compile.spec.ts` ("generated programs compile+link on WebGL2") FAILED in
     run 37559561989, so generated programs are known not to compile on ANGLE Metal.
   - Fix: surface failures. On the first failure per key, log `console.error` and record a C-36 degradation (strict -> throw).
     Then run the program-generator spec on GitLab.
A3. The sync render path never warms programs. `warmGeneratedPrograms` is only called from renderAsync
   (Renderer.ts:939). With KHR_parallel_shader_compile (ProgramCache.ts:85) the sync `step()` path
   async-skips every generated draw until compiles land. The benchmark tolerates that because its 90 s draw-wait polls.
   Games/routes on rAF show "no-draw" for many frames. Under a variant explosion (per-item features: instancing,
   skinning, morph, shadow, fog, light axes) this becomes a compile storm on Metal. That fits the games' 13-37 s firstDraw.
A4. Duplicate direct lights under COMPILER+LIGHTING. The prd02 light handler adds lights via
   `out.addLights` (engine/src/lanes/prd02.ts:115). The legacy input already carries the same collected lights
   (compiler/renderInput.ts:297). mergeContributions concatenates both (compiler/compileScene.ts:97).
   The result is double-bright direct light, and only when both flags are on. prd02.ts:133 also overrides
   source field `environment`.
A5. RenderItem reuse cache keyed by runtimeId, not by item (compileScene.ts:448-461). A multi-mesh GLB actor
   emits several `actor-N:*` items for one node. On a cache hit every one of them returns the single cached item,
   so all meshes collapse onto the first one. The cache also returns stale skinned/animated items whose
   node version did not change. COMPILER-only.
A6. Renderer flags live in a global store (rendering/src/renderer/FrameGraph.ts:30-35). They are bound by extensions
   after mount starts (createAuraApp.ts:724-728 runs after mountCurrentScene at :448). The last app wins.
   This is harmless for one app per page, but it is order-dependent and not owned by PRD 15 (prd07.ts:72 says so).

## (b) Why "ready" takes 90-135 s, or never comes

Benchmark adapter: benchmarks/quality-rebuild/aura3d/common.ts `runAuraScene`.
- Non-HDRI scenes (01,10,11,12,14,16) became ready in 93-134 s, with loadMs about equal to wallMs
  (01: loadMs 118445). The 90 s draw-wait deadline (common.ts:424-430) is the dominant term.
  - What doesn't add up: the loop breaks on `errors.length > 0`, and the mount error is pushed before `ready()`
    resolves (createAuraApp.ts:421-441). If the failure were immediate, the loop should exit on its first iteration.
    So either the mount itself takes ~90 s to reach its failing first frame, or the error lands after the loop has
    already run for ~90 s. No "step() was called before the WebGL renderer finished mounting" warning appears,
    which points to the former. I did NOT find the slow phase by reading code: no long timers, no CPU bakes in the
    C-36 handlers (prd02/prd07/prd13/world), and Renderer.create/createRenderDevice are cheap.
    The prd05 scenes (same flag list) take ~30 s to fail on a 404 that is fetched twice, so there is a fixed
    multi-second pre-mount cost per page.
  - Needed: performance.mark at createAuraApp start, Renderer.create resolved, compileScene resolved, first
    renderFrame, and mount catch. Expose them in `payload.extra.mountTiming` (harness-side: read them through
    `performance.getEntriesByType("mark")`). One remote run then pinpoints the slow phase.
- HDRI scenes (02-09,13,15,17,18 and the prd12 refs) can never finish. After the mount fails, `renderer.environment`
  is never populated. The HDRI wait (common.ts:499-509) only exits on `iblPixelBacked`/`hdriStatus ready|fallback`,
  so it runs its full 180 s. 90 s + 180 s > the 240 s capture timeout (capture.mjs:37,149) gives
  "Timeout 240000ms exceeded". This is a harness bug layered on (a).
- Fix (lane 12): break both wait loops on `diagnostics.errors.length > 0` or on a mount-failed state, and
  throw from runAuraScene when the mount failed so the page publishes `__QR_ERROR__` within ~1 s.

## (c) Why the harness reports ready with drawCalls 0

- common.ts:424-430: after 90 s with no draw, the loop falls through silently. common.ts:611-616 returns
  a ReadyPayload with `drawCalls: 0` and `errors: [the mount error]`, and main.ts:83-85 publishes `__QR_READY__`.
- capture.mjs:149-157 sets `status = "ready"` whenever `__QR_READY__` exists. It does not look at
  `payload.errors`, `payload.drawCalls` or a blank-frame check. The `--strict` guard (capture.mjs:416-420) only
  checks status and the software rasterizer.
- Fix: in runAuraScene, throw `NoDrawError` when the deadline expires with drawCalls 0 or when errors are
  non-empty. In capture.mjs, mark `status: "no-draw"` / `"renderer-error"` when `payload.errors.length > 0 ||
  payload.drawCalls === 0`, plus a pixel-variance check on the PNG (all-equal pixels = blank). Count those
  as strict failures.
- Same pattern in the prd05 adapter (aura3d/scenes/prd05/common.ts:145-151) and in prd04 common.

## (d) `TypeError: g.color is not a function` (prd05 lane scenes; flag-independent)

- benchmarks/quality-rebuild/aura3d/scenes/prd05/common.ts:74 calls `environments.color({ color })` for
  colour-background specs (scenes/prd05/index.ts:48,84,123 = damaged-helmet, skinned, game-scene).
  `environments` (engine agent-api/nodes/environments.composite.ts:9 = envSourceBuilders + worldEnvBuilders)
  has no `color` member. It throws at scene build (~380 ms), before any mount, in both pipelines.
  common.ts:71 also passes an environment node into `scene().background()`, which takes a colour.
- Fix: `scene(spec.id).background(spec.background.color)` (as in aura3d/common.ts:141-145), plus
  `environments.hdri(...)` added as a node for the HDRI case.
- The 3 prd05 HDRI scenes "succeed" but 404 on `/benchmarks/quality-rebuild/scenes/prd05/derived/*.glb`.
  common.ts:32 builds URLs from `repoPath`, but the harness build only copies the shared asset table into
  `/qr-assets/` (benchmarks/quality-rebuild/vite.config.ts:55-73, publicDir: false). Fix: register the prd05
  derived assets in the copy plugin (or the shared table) and point the URLs at `/qr-assets/<basename>`.
- The type error was not caught: the `as never` casts on the asset maps hide it, and benchmarks/quality-rebuild/
  tsconfig.typecheck.json apparently does not fail on it. Worth checking that the lane-12 typecheck covers
  aura3d/scenes/prd05.

## (e) `prd12-ref-06-product-turntable is not active` (flag-independent)

- Spec id is `prd12-ref-06-product-turntable-motion` (scenes/prd12/ref-scenes.ts:204). Both adapters look up the
  old id: aura3d/scenes/prd12/ref-06-product-turntable-motion.ts:7-8 and three/scenes/prd12/ref-06-product-turntable-motion.ts:8-9.
  Introduced in 5e60cd9a (QR-12 T2.x). Fix: use the `-motion` id (or `spec.id` passed in by main.ts).

## (f) Strict vs renderer.mode (aura3d/common.ts)

- aura3d/common.ts:396 passes `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }`.
  createAuraApp.ts:76-82 throws `AuraMigrationError("renderer.mode + renderer.fallback")` under A3D_QR_STRICT.
  This is the 0.4 s failure on every Aura scene in pipeline 2926540757 (flags=all). prd05/common.ts:145 and
  prd04 common have the same options.
- Fix: pass `renderer: { qualityProfile: "production" }` only. normalizeCreateAppRendererOptions
  (agent-api/app/rendererOptions.ts:118) derives `mode` from the profile, so the non-strict mount stays on
  the production path (verify `resolveRendererQualityProfile("production").rendererMode === "production"`).
  Under strict, mountRenderer.ts:33 skips the safe-basic branch anyway.

## Games (pipeline 2926540757, flags=all incl. strict)

- aura-clash-showcase: pageError `TypeError: Cannot read properties of undefined (reading 'mode')` at
  aura-engine-*.js:79:253782 on all 3 viewports. This needs a sourcemapped build to map it. Grep found no
  unguarded `renderer.mode`. createAuraApp.ts:76-78 is guarded.
- The other games: desktop viewports never draw (`no-draw-timeout`) and the renderer process dies
  ("Target page, context or browser has been closed"). Mobile 390x844 draws after 4-35 s at 2.5-18 fps.
  The cost scales with pixels and compile count. Consistent with A2/A3 (compile storms + skipped draws)
  plus per-frame GPU cost. Whether games hit (a) depends on whether their mount reaches the v2 output path.
  Needs the same mountTiming instrumentation and a single-game, single-viewport rerun per flag.

## CI history: lane browser gates were red when merged

- qr-prd01-core.yml: 36/40 recent runs failure, 1 success (scaffolding). Run 37559561989 (prd01-phase4-output):
  `app-capture` (none and core) had `"app.capture is not mounted"`. `program-generator-compile` failed.
  `render-targets` failed with "array: WebGL render target framebuffer status is invalid". `renderer-mount-failure` failed.
  So the browser step failed and the `--flags none,core` capture step never ran.
- post-quality 35/40 failure, qr-prd04 19 failure/21 cancelled, qr-prd05-browser 33 failure, qr-prd06-browser 22
  failure, qr-prd08 29 failure, qr-prd09 33 failure, qr-prd14 35 failure. quality-checkpoint on main: failure x2.
  qr-prd11-perf: 39 skipped, 1 failure (main). So no lane's flag-on browser path has a green CI record on main.

## Bisection plan

### Harness/CI changes needed first (lane 12)

1. Benchmark scene filter. capture.mjs already supports `--scenes a,b`, `--engines`, `--timeout`, `--flags`
   (capture.mjs:10,48-51). Only ci.sh and the pipeline do not forward them.
   - .gitlab-ci.yml spec.inputs, add:
       bench_scenes: { default: "", regex: ^[a-z0-9,-]*$ }
       bench_engines: { default: "aura3d,three", options/regex: ^(aura3d|three)(,(aura3d|three))?$ }
       bench_flag_sets: { default: "", regex: ^[A-Za-z0-9_,.;=-]*$ }   # ';'-separated sets in ONE job
     variables: QR_BENCH_SCENES / QR_BENCH_ENGINES / QR_BENCH_FLAG_SETS.
   - ci.sh: `node capture.mjs ... ${QR_BENCH_SCENES:+--scenes "$QR_BENCH_SCENES"} ${QR_BENCH_ENGINES:+--engines "$QR_BENCH_ENGINES"} --timeout 120000`.
     When QR_BENCH_FLAG_SETS is set, loop over the sets with `--flags "$set" --out "$QR_BENCH_OUT/$safe_set"`,
     one build and one runner boot (~1 min mac boot plus the cost factor 6 saved per set).
   - .github/workflows/qr-gitlab-ci.yml workflow_dispatch: add the same 3 inputs and forward them as trigger inputs.
   - Engines `aura3d` only for bisection (three is flag-independent).
2. Fail fast (from (b)/(c)) so each failing capture costs ~2 s, not 240 s.
3. Add `payload.extra.mountTiming` marks (from (b)).

### Probe scenes (cheap, cover the code paths)

- 01-simple-geometry: primitives only, no HDRI, so it exercises (a) alone.
- 16-instancing: instancing (generated-program instancing axis, A5 irrelevant).
- 12-shadows: shadow map + lights (A4 under compiler+lighting).
- 03-damaged-helmet: GLB + HDRI (actor path, HDRI wait, A5).
- 08-skinned-character: skinning.
- 14-particles: vfx contributor.

`QR_BENCH_SCENES=01-simple-geometry,16-instancing,12-shadows,03-damaged-helmet,08-skinned-character,14-particles`

### Round 1: single flags (13 sets) + controls

    gh workflow run qr-gitlab-ci.yml --ref <qr/branch> \
      -f suite=benchmark -f mobile=false -f requester=prd12-bisect -f qr_flags=none \
      -f bench_engines=aura3d \
      -f bench_scenes=01-simple-geometry,16-instancing,12-shadows,03-damaged-helmet,08-skinned-character,14-particles \
      -f bench_flag_sets='none;core;lighting;post;materials;assets;animation;vfx;camera;game;world;tiers;looks;compiler'

Expected: `none` passes. `core` reproduces the MSAA error on all 6 (confirms (a) is lane-01 only).
Any other single flag that fails is a lane-local bug.

### Round 2: core sub-flag attribution

    bench_flag_sets='core,-core_output;core,-core_generator;core,-core_output,-core_generator;core_output;core_generator'

- `core,-core_output` should pass (a) and expose A2/A3 (generator) with clear colour visible.
- `core_output` alone should fail with the MSAA error.

### Round 3: leave-one-out on the full 13 (after the (a) fix lands on the branch)

    ALL=core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler
    bench_flag_sets="$ALL;$ALL,-core;$ALL,-compiler;$ALL,-lighting;$ALL,-tiers;$ALL,-vfx;$ALL,-looks;$ALL,-post;$ALL,-materials;$ALL,-animation;$ALL,-world;$ALL,-assets;$ALL,-camera;$ALL,-game"

The first failing set whose `-X` passes names a culprit. Then confirm the pairs:
`core,compiler`; `compiler,lighting` (A4); `core,lighting`; `core,post`; `core,tiers`; `core,vfx`.
(The negation syntax `-name` is supported by contracts/flags.ts:65-75; the first source wins, so list positives first.)

### Round 4: strict

    bench_flag_sets="$ALL,strict"   (after (f) is fixed in the three adapters)

### Games (separately; costly)

    gh workflow run qr-gitlab-ci.yml --ref <qr/branch> -f suite=games -f local_build=true -f mobile=false \
      -f viewports=1280x720 -f games=showcase-blockfall-reactor,aura-clash-showcase -f qr_flags=core
    then repeat with qr_flags=core,-core_output / compiler / lighting / tiers / vfx

Build aura-clash with sourcemaps (or map aura-engine-*.js:79:253782 through the build's .map) for the `.mode` TypeError.

## Ranked culprits (file:line)

1. packages/rendering/src/Renderer.ts:1317-1327 (`ensureHdrSceneTarget`: colorAttachments + sampleCount 4) vs
   packages/rendering/src/WebGL2Device.ts:899 (rejects any colorAttachments with MSAA). Lane 01. Confirmed from the
   errors in 6/6 ready payloads; the same failure is very likely behind the 12 timeouts.
2. benchmarks/quality-rebuild/aura3d/common.ts:424-430 + :499-509 + capture.mjs:149-157 (no fail-fast, ready with
   drawCalls 0, 180 s HDRI wait after a failed mount). Lane 12. This explains the "ready at 90-135 s" and "timeout at 240 s" pattern.
3. packages/rendering/src/program/ProgramCache.ts:79-104 + ForwardPass.ts:339,471-478 (failed or pending generated
   programs silently skip draws). Lane 01's program-generator-compile browser spec was red. Next layer after #1.
4. packages/rendering/src/Renderer.ts:939 (program warmup only on renderAsync; the sync step()/rAF path async-skips
   and compiles in-frame). Explains slow or no first draw in games.
5. benchmarks/quality-rebuild/aura3d/common.ts:396 (+ prd05/common.ts:145, prd04 common) `renderer.mode/fallback`
   under strict, which throws at createAuraApp.ts:76-82.
6. benchmarks/quality-rebuild/aura3d/scenes/prd05/common.ts:74 (`environments.color` does not exist) and :32
   (derived GLB URLs are not served, see vite.config.ts:55-73).
7. benchmarks/quality-rebuild/aura3d/scenes/prd12/ref-06-product-turntable-motion.ts:7 (and the three twin :8): stale id.
8. packages/engine/src/lanes/prd02.ts:115 + agent-api/compiler/compileScene.ts:97 (duplicate lights under
   compiler+lighting); compileScene.ts:448-461 (item reuse keyed by node, not by item).
9. Unknown ~90 s pre-first-frame mount cost. Not located by reading. Needs the mountTiming marks.

## Not verified

- No local browser, build or test runs (policy). The "core alone reproduces (a)" claim is from code-path reading,
  not a run.
- Games' `.mode` TypeError source location (minified only).
- The exact slow phase in (b).
