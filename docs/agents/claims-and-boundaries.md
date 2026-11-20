# Claims and Boundaries

Version: 5.7.0

Aura3D is a complete engine for browser games and interactive 3D apps: one `@aura3d/engine` import gives you WebGPU and WebGL2 rendering from the same code, PBR, IBL, shadows, post-processing, particles, water, sky and weather, Rapier physics, an animation controller with retargeting, game kits, typed provenance-checked assets and a CLI that finds, converts, generates and admits them. Use all of it freely.

This page is the quality standard that makes every public statement about that work stand up: how you build, how you label it, and the evidence each claim carries. It absorbs the former anti-hallucination and no-hackjob lists (`anti-hallucination-rules.md` and `no-hackjob-rules.md` now redirect here). Read it after `llms.txt`, before writing examples, routes, templates, README copy or release notes.

**Core standard: every public claim ships with its evidence.** Work still being proven carries the `prototype` or `roadmap` label and names the next proof.

## 1. Claim labels

Pick exactly one per claim.

| Label | Meaning | Evidence required |
| --- | --- | --- |
| `createAuraApp` root safe API | A route imports only public `@aura3d/engine` APIs and mounts through `createAuraApp(...)`. | Build, route-health or diagnostics, typed asset manifest, browser screenshot, a claim-specific pixel or runtime assertion. |
| `production-runtime` | Exists in production-runtime packages, not necessarily in root agent APIs. | Package or browser tests for that package; wording that does not imply root support. |
| `rendering` package | Exists in the lower-level `@aura3d/rendering` package. | Public exports plus renderer unit or browser evidence; package-level wording. |
| CLI asset pipeline | Asset search, add, resolve, convert, normalize, validate, provenance, typegen, thumbnails, deploy checks; paid fal.ai generation (`assets generate`, `animation generate`) and motion retargeting (`animation import`). | CLI output, `aura.assets.json`, generated `src/aura-assets.ts`, license metadata, validation reports. |
| Template-only scaffold | A template is a running starting point; the finished project's claims come from its own evidence. | Template generation smoke test and scaffold wording that matches what the template does. |
| `prototype` | Illustrates direction without release-quality evidence. | The label on the route and docs; no flagship or production wording. |
| `roadmap` | Planned, not implemented or not public. | Future tense and a linked plan. |

Evidence is a pixel or runtime assertion of the claimed behaviour; loading, compiling and a large screenshot are steps toward it. See [rendering-proof-required.md](rendering-proof-required.md) for the evidence each rendering claim needs.

For the [native capability roadmap](../prds/aura3d-native-capability-roadmap.md), a source export, unit test, mock device, parser result or generated declaration establishes only the path it exercises. An installed-package claim also needs the actual packed entrypoint and its consumer test. A rendering or interaction claim needs the matching browser result and pixels or runtime assertion; a physical-device claim needs its own device result. Record backend, browser, hardware or software renderer, feature flags, fixture and artifact identity with the evidence. A receipt from an earlier candidate remains historical evidence and does not certify a changed implementation, fixture or package. Record untested combinations as `unverified` and use the `prototype` or `roadmap` public claim label as applicable. An available source-completion record is not a browser, device or release receipt.

## 2. Never invent (anti-hallucination)

- **APIs.** Use only public exports in `docs/agents/api-surface.md` and the root imports shown in `llms.txt`. Check a name exists (`rg` the export list or let `tsc` fail) before teaching it.
- **Assets.** Never invent paths, ids, URLs or GLB names, and never paste a remembered CDN URL (a remembered URL is hallucinated provenance). Add a file with `npx @aura3d/cli@latest assets add ./assets/model.glb --name model`, read `src/aura-assets.ts`, and use `model(assets.model)`. For a named real-world object, run `assets search "<object>"` then `assets resolve "<object>" --name <name>`; pick an auto-pullable candidate (CC0 or CC-BY, verified, direct download). Do not fall back to a primitive or an invented URL.
- **Forbidden forms:** `model("robot")`, `model("/assets/x.glb")`, `model("https://...")`, `unsafeModelUrl(...)` in release-facing code.
- **three.js.** No `import * as THREE`, no `three` or `three/examples/...` imports, no `new GLTFLoader()`, no hand-wired scene, renderer, camera loop, loader or controls. `createAuraApp(...)` owns the renderer, scene graph, camera and loop. If the task is explicitly about renderer internals or migration, label it internal and do not use it as root proof.
- **Physics.** Do not import `PhysicsWorld`, `Shape` or `PhysicsDebugAdapter` from `@aura3d/engine`; use the root `physics` namespace (`physics.world`, `physics.box`, `physics.sphere`, `physics.step`, `physics.worldFromScene`, `physics.debugNodes`).
- **Kits before custom systems.** Start from the matching `sceneKits.*`, `prefabs.*` or `game.*` helper (mini golf, charts, city, product, humanoid, particles, racket sports) and make only prompt-required edits.
- **Product identity.** Aura3D is a complete engine for browser games and interactive 3D apps: a TypeScript/JavaScript engine API, an asset CLI with built-in AI generation (`assets generate`, `animation generate`), templates, game kits, diagnostics and a deploy checker, designed for coding agents. Generation runs in the CLI at build time; scenes load admitted, typed assets.
- **Naming.** New files, docs, routes, packages, tests and APIs are named for what they do, not for release numbers (`v2`, `v3`, `v4`). Do not revive legacy provider runtimes or legacy scene IR in new examples.
- **Done.** Do not say a route, feature or performance comparison works until the finite build, test or check command passes with all evidence inputs present.

## 3. No hackjobs

The right response to a bad screenshot is root-cause work, not a route-local illusion.

Do not ship or present examples that rely on:

- CSS, DOM or canvas stand-ins for particles, bloom, trails, labels, lighting, scanlines, shadows or 3D effects (DOM is fine for HUD, menus and debug panels);
- primitives as the main character, vehicle, product, world, track, weapon or hero object for a named real-world or game prompt;
- autoplay or deterministic replay as a substitute for player input (every game ships `?autoplay=1` as a hands-free demo and QA mode, but the default route stays player-controlled);
- route-local scale, camera or gameplay math that contradicts the public API docs;
- a blanket `qualityRebuild` pin or post-processing disabled for everyone to hide a GPU fault (ship `installSafetyNet` instead);
- stale route-health, README or launch evidence that names assets or claims the source no longer uses.

When a screenshot is tiny, cropped, blank, floating, primitive-heavy or unplayable:

1. Classify it: renderer or material gap, asset quality or provenance gap, scale or camera gap, effects gap, game-runtime gap, docs or claim gap, unknown.
2. Map it to exact source files and the public API boundary.
3. Prove the fix in a root-only validation app or test before touching showcase presentation.
4. Update docs and route evidence after the proof passes.

Swapping GLBs, repainting primitives or changing a look preset without a recapture and re-judge is the same hack.

## 4. What the root API claims

Root `createAuraApp` covers: typed GLB/glTF via `model(assets.name)`; scene composition with the public helpers (`scene`, `camera`, `lights`, `material`, `effects`, `prefabs`, `sceneKits`, `primitives`, `group`, `timeline`, `interactions`, `physics`, `labels`, `environments`, `game`, `games`, `particles`, `instances`, `distanceLod`, `text3D`, `geometry`, `looks` and the rest of the root surface, when exported and tested); one `createAuraApp(...)` mount per route; runtime node mutation; diagnostics, evidence helpers, screenshots and deploy checks that were actually run and attached.

These root claims go public with a root-only browser capture of the exact result: renderer-quality comparisons with another engine ("Three.js-quality"); full PBR parity; HDR, IBL, PMREM filtering, tone mapping or shadow quality; FXAA/TAA and any effect without a receipt (ambient occlusion, colour grade, vignette and depth of field have one, see below); native WebGPU or compute; skinned animation or morphs beyond the receipts below; finished-game quality for a character, racing, platformer or falling-block kit; collision beyond box, sphere and capsule bodies against static and dynamic bodies.

### Bounded evidence by area

Each receipt covers the named behaviours. To claim more, add a receipt for it.

| Area | Receipt | Needs its own receipt |
| --- | --- | --- |
| Custom shaders | `docs/rendering/portable-custom-materials.md` (`PortableShaderMaterial`, paired GLSL/WGSL, a `@aura3d/rendering` package API) | Custom shader authoring as a root claim, general TSL or node-material parity |
| PBR/glTF | `docs/rendering/pbr-gltf-correctness.md` (selected root primitives, production-runtime textured materials and transmission, package loader semantics) | Full textured PBR, skinning, morphs or every glTF extension on the root; universal three.js parity |
| Lighting, environment | `docs/rendering/lighting-environment-color.md` (selected production-runtime light, shadow, HDR/IBL, PMREM, background, color workloads) | Rectangular lights or the receiver-contact approximation as automatic root claims; general screen-space or ray-traced contact shadows |
| Geometry | `docs/rendering/geometry-instancing-lod-text.md` (native lit instancing for supported materials, distance LOD with hysteresis, uppercase alphanumeric mesh text, custom indexed geometry, CPU frustum culling, static bounds BVH) | One draw for every advanced material, arbitrary fonts, SDF text, GPU occlusion. DOM labels are UI, never 3D text |
| Animation | `docs/rendering/animation.md` (root typed-GLB skinned playback, named clips, named morph targets, subject-region pixels); `docs/api/animation-root.md` with receipts `animation-layers`, `animation-root-motion`, `animation-retargeting`, `animation-two-bone-ik` (masked layers, root motion apply and extract, `addClipsFrom` retargeting, two-bone IK, each on a typed GLB) | Full-body IK, retargeting beyond the fixture rigs, universal animation parity. Receipts are software WebGL2 |
| Controls, XR | `docs/rendering/controls-picking-xr-context.md` (named orbit, trackball, first-person, picking, gizmo; injected XR sessions; app-owned context-loss pause and remount) | Physical-device XR, transparent recovery of every external GPU resource |
| Physics | `docs/concepts/physics.md` collision matrix with receipt `physics-root-collision` (box, sphere and capsule bodies against a static box and a dynamic crate, resting heights within 0.001 m, visible nodes following bodies); `@aura3d/physics` native backend (adaptive CCD, Coulomb friction, rotated box SAT, convex GJK/EPA, mesh and heightfield contacts) at package level | Mesh and heightfield colliders, joints and vehicles as root claims; solver parity with another engine; anything from a `cannon-es` route |
| Effects | `docs/agents/effects-and-scene-kits.md` with receipts `effects-ambient-occlusion`, `effects-color-grade`, `effects-vignette`, `effects-depth-of-field` (on/off frames differ as described). The historical [4.5.0 contact-shadow receipt](../../evidence/receipts/effects-contact-shadows/4.5.0.json) records a screen-space directional-light mask on software WebGL2. | General or ray-traced contact shadows, physical-GPU behavior or arbitrary materials: the recorded mask needs a shadow-casting directional light, is main-view only and is not sampled by nine textured-PBR extension variants. Colour-grade fields other than `contrast` and `saturation` need separate evidence. |
| Scene kits | `docs/agents/effects-and-scene-kits.md` with a receipt for nine kits (two frames each; animated kits change between them) plus the original `materialLab` | That a kit is a finished product: its art direction, rules and assets stay yours |
| Performance | A current like-for-like comparative report | Parity from an inventory, a stale capture, a package benchmark or a report with missing inputs |
| Agent verify loop | `docs/agents/verify-loop.md` (`aura3d verify` report schema `aura3d.verify/1`; 10 seeded broken scenes; unit tests with a mocked driver; real-Chrome reports in `tests/reports/agent-loop/` for the machine and Chrome build they record; one n=1 subject repair run) | That an agent authors faster or better with it than without it or than with another engine; a lint hit rate on real agent projects; scene quality (the frame check only finds black, flat, texture-poor or frozen frames); WebGPU, other browsers or other GPUs; deterministic replay or physics |

**Comparing with three.js.** three.js is a rendering library; Aura3D is the engine around the renderer. Lead with scope and workflow, which is where Aura3D wins: one import and one `createAuraApp` / `scene` API instead of up to 8 modules, fewer scene lines in 4 of 5 benchmark scenes (viewer 24 vs 49, forest 49 vs 71, character 45 vs 62, game loop 61 vs 82) and fewer distinct APIs in every scene (`evidence/vs-threejs/RESULTS.md`), plus typed provenance-checked assets, built-in AI generation, game kits, physics and deterministic QA hooks that a three.js project assembles from separate libraries. Comparisons use repository-locked `three@0.185.1`. Runtime measurements (bundle size, frame cost) were taken on software GL and live with their conditions in `evidence/vs-threejs/RESULTS*.md`; public copy cites the gate-backed Aura3D-side facts listed in `docs/comparisons/threejs-positioning.md` (first frame of the cube, draw calls, console warnings, option coverage, scene source size), each with its method, and keeps side-by-side runtime columns out until the benchmark gate's T1 target passes.

### Render path, exposure, options and instancing

What each of these does, and how to describe it.

- **Render path.** `createAuraApp` takes `quality: "auto" | "production" | "safe-basic" | "cinematic"` (default `auto`). On `auto`, a scene with no post-processing, output options, transmission or custom shader draws in one pass to the canvas; anything else, and `quality: "production"`, uses the HDR chain. `app.diagnostics().renderPath` and the reason say which one ran. `preserveDrawingBuffer` is off unless the page is in capture or QA mode (`?capture=1`, `?qa=1`). Describe it as "a simple scene takes a cheaper path", with the measured numbers and the software-GL qualifier. It is a within-engine optimisation and matches `production` within 2/255 mean difference. Since 5.7.0 the HDR route creates the canvas without MSAA (the scene's MSAA is on the HDR target; `?canvasmsaa=on` restores it), so do not cite canvas `antialias` as the scene's anti-aliasing.
- **Exposure.** A scene with authored lights and no `environments.*` node no longer gets an implicit fill, so it renders darker than before. Add any `environments.*` node to restore the old look. The calibration is checked against a CPU reference of three.js physically-based lights (within about 2%); say "calibrated against", not "identical to".
- **Ignored options.** An option that a builder accepts but does not apply raises an `OPTION_IGNORED` diagnostic naming the valid keys (in `app.diagnostics()`, a throw in strict mode). Do not write an option into an example unless it takes effect.
- **Instancing.** `setInstanceTransforms(typedArray)` is the per-frame update path. Dense shadow-casting instanced nodes (1,024 or more instances of a builtin primitive) use a coarser shadow stand-in, so their shadows are slightly more faceted; opt out with `shadowproxy=off`. A 10,000-instance forest completes on software GL; describe instancing by its draw-call counts.
- **Codemod.** `aura3d migrate three` ports three.js files to Aura3D's API: it rewrites what maps and lists the rest as a worklist. Rows marked `exact` in `mappings.ts` are proven against real three.js. The APIs differ by design (Aura3D math classes are immutable values; three's mutate in place), so describe it as a porting tool ("ports three.js code to Aura3D"), not a drop-in.
- **Speed and GPUs.** The speed and frame-cost numbers in `evidence/` (benchmarks, three.js comparisons) were taken on software WebGL2 on a remote runner unless the file says otherwise; keep "software WebGL2" beside them. Since 5.0.1, release and game QA also capture frames on one real GPU (headless Chrome on Apple silicon over loopback CDP, `tools/release/render-gate/cdp-capture.mjs`); 5.6.0 accepted all 30 games that way with full `?autoplay=1` runs. Those receipts prove the frames and motion they show on that machine; frame-rate claims for other GPUs or devices take their own runs.

## 5. Assets, primitives, DOM

- **Provenance.** Primary assets appear in `aura.assets.json` and generated `src/aura-assets.ts`, with durable source page, download URL, license name and URL, author, acquisition time, hash and typed key. Temp paths (`/var/folders/.../aura3d-resolve-*`) are not provenance unless the asset is marked local-only and excluded from public claims.
- **Primitives** are allowed for set dressing, collision guides and debug markers, HUD anchors, local prototypes and labelled abstract visualization. A primitive-only public showcase must be labelled abstract or blocked.
- **DOM and CSS** may provide UI, controls, menus, HUD text and debug panels. They are not scene geometry, particles, bloom, shadows or renderer evidence. If a route claims Aura3D particles, changing the controls must change rendered pixels and runtime telemetry, not just DOM nodes.

## 6. Games, ports and the production bridge

A public game route proves: input visibly changes state; an objective, score or fail, reset and progression loop; automated tests for movement, restart and at least one win, fail, score or completion mechanic; typed primary assets unless explicitly abstract; route-health that names primary assets, primitive count, renderer mode and claims.

Reusable and public: the game kit (`@aura3d/engine/game`: HUD, touch, session, juice, game sound), the QA kit, the audio synth kit and `game.racketSports()`. In current source, root `createGame` throws `AuraGameMigrationError` (`CREATE_GAME_ROOT_UNAVAILABLE_V1`, code `CREATE_GAME_ROOT_UNAVAILABLE`, version 1) before mounting or evaluating the scene; it no longer returns a headless game. Import `createGame` from `@aura3d/engine/game`, or from `@aura3d/engine/v5/game` for the staged v5 entry. If the game subpath reports the same error, remove any explicit `-game` or `none` opt-out and enable `A3D_QR_GAME`; installed-package behavior requires separate verification. Opponent behavior, level layout, art and challenge scoring are per game; the reusable layer is the root-tested `game.*` genre kits. The per-kit boundary (what the kit provides, what stays per game) and a runnable example for each of platformer, arcade kart, car soccer, fighting and racket sports is in [genre-kits.md](genre-kits.md). The genre kits are building blocks: credit them as "built on the Aura3D platformer kit"; "a complete platformer" or "a playable kit" comes with that game's own input, objective, reset and pixel evidence.

In source, the mounted `game.shell` loading indicator is a document-level fallback, visible during the session's `loading` state; it requires a document body and is not scoped to the game target. Tracked promises do not delay `game.ready()`. The separately mounted `createGameShell` has a `finishLoading()` operation that waits for promises tracked when its loading timer finishes. Browser and installed-package behavior for the mounted indicator are unverified.

The production bridge selects GLB/glTF model nodes classified as typed manifest assets. Hash metadata is required for that classification; remote URLs also need the durable manifest provenance recognized by the bridge. Raw unsafe URLs and inline models without hash metadata are not admitted. A hash field alone is not proof that downloaded bytes and dependencies were verified: require the applicable integrity tests and reports for that claim. After deploying, request every asset URL and expect 200.

Ports and rebuilds add three limits:

- **"Same simulation"** needs a recorded reference and a replay test with a stated tolerance (bit for bit, or 1e-6) and the game build that produced the reference.
- **"Looks the same"** needs matched-state frames and metrics (luma and RGB JSD, edge-density ratio, mean luma delta). A blind model judge is a model's opinion, reported as identification accuracy against 50% chance with trial count and seed; it is never "pixel parity" and never a human review.
- **"Works on GPUs"** needs a real-device run. Software GL (SwiftShader) evidence is labelled "software GL" and proves correctness and draw-call counts only.

## 7. Checklist before calling anything ready

- [ ] No raw string model ids, raw `.glb`/`.gltf` URLs or `unsafeModelUrl(...)` in public examples.
- [ ] No `three`, `three/examples/...` or `GLTFLoader` imports.
- [ ] No DOM/CSS particles in a route that claims Aura3D particles.
- [ ] No primitive-only primary subject unless labelled abstract.
- [ ] Primary assets are in `aura.assets.json` and `src/aura-assets.ts` with durable provenance.
- [ ] Desktop and mobile screenshots show the subject readable at first load.
- [ ] Games prove movement, reset, objective and score or fail.
- [ ] Animation claims show the animated subject changing in subject-region pixels.
- [ ] WebGPU claims include adapter, backend, dispatch, rendering and pixels.
- [ ] Route-health declares assets, fallback status, primitive count, backend, screenshots and claims, and matches source.
- [ ] Wording matches detected capability. If a required command does not exist, the work is `blocked` or `prototype`; never weaken the check.

## 8. Short claims

Lead with these; each is backed by the repository and its evidence:

- Aura3D is a complete engine for browser games and interactive 3D apps, built for coding agents: rendering, physics, animation, game kits, typed assets and an asset CLI in one `@aura3d/engine` install.
- The same scene code renders on WebGPU and WebGL2; all 30 live games on aura3d.auraone.ai run on Aura3D and were accepted on a real GPU with full `?autoplay=1` runs.
- One import and one scene API: fewer scene lines than three.js in 4 of 5 benchmark scenes, and fewer distinct APIs in every scene (`evidence/vs-threejs/RESULTS.md`).
- `assets generate` creates lifelike, rigged models and `animation generate` / `animation import` create or retarget motion, admitted as typed assets with provenance.
- Agents write editable TypeScript or JavaScript against public `@aura3d/engine` APIs.
- The CLI adds, resolves, validates, hashes, type-generates and tracks GLB/glTF assets, when those commands were run.
- A route uses typed assets when it imports `assets` from `src/aura-assets.ts` and calls `model(assets.name)`.
- A screenshot proves only what is visible in that screenshot. An `assets preview` sheet or an `assets thumbnail` PNG is a CPU base-colour preview in the bind pose, never a render or GPU evidence.
- `assets convert` brings FBX, OBJ, DAE, USD, PLY, STL, 3MF, VOX and BVH into the typed pipeline and prints every importer loss as a diagnostic; cite those with the converted asset.

Phrases that need their specific evidence first: "matches production renderer quality" (without root pixel proof); "WebGPU particle lab" (without native adapter, backend, dispatch, pixels); "PBR parity" (without exact tested features); "skinned character animation" (without pixel-backed pose change); "playable kit" (without root exports and input tests); "real-time simulation" (when telemetry is disconnected from scene state); "asset-backed" (when the subject is primitives or raw URLs); "pixel parity" or "indistinguishable" (from histograms and a model judge); "runs on every GPU" (from a software run); "fixed on real hardware" (without a real-device confirmation); "same as the original" (without a reference and a replay test).

Compare with three.js on scope and workflow, never as "faster", "lighter" or "smaller": the one runtime measurement (software GL) favours three.js on bundle size and frame cost.
