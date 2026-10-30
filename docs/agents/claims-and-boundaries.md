# Claims and Boundaries

Version: 4.6.1

The one rulebook for agent-authored Aura3D work: what you may build, what you may say, and what evidence a claim needs. It absorbs the former anti-hallucination and no-hackjob lists (`anti-hallucination-rules.md` and `no-hackjob-rules.md` now redirect here). Read it after `llms.txt`, before writing examples, routes, templates, README copy or release notes.

**Core rule: a public claim may describe only the path that has evidence.** When evidence is missing, label the work `prototype` or `roadmap` and say what is missing.

## 1. Claim labels

Pick exactly one per claim.

| Label | Meaning | Evidence required |
| --- | --- | --- |
| `createAuraApp` root safe API | A route imports only public `@aura3d/engine` APIs and mounts through `createAuraApp(...)`. | Build, route-health or diagnostics, typed asset manifest, browser screenshot, a claim-specific pixel or runtime assertion. |
| `production-runtime` | Exists in production-runtime packages, not necessarily in root agent APIs. | Package or browser tests for that package; wording that does not imply root support. |
| `rendering` package | Exists in the lower-level `@aura3d/rendering` package. | Public exports plus renderer unit or browser evidence; package-level wording. |
| CLI asset pipeline | Asset search, add, resolve, validate, provenance, typegen, thumbnails, deploy checks. | CLI output, `aura.assets.json`, generated `src/aura-assets.ts`, license metadata, validation reports. |
| Template-only scaffold | A template starts a project; it proves nothing by itself. | Template generation smoke test and honest scaffold wording. |
| `prototype` | Illustrates direction without release-quality evidence. | The label on the route and docs; no flagship or production wording. |
| `roadmap` | Planned, not implemented or not public. | Future tense and a linked plan. |

A route that loads, compiles or produces a large screenshot is not evidence. See [rendering-proof-required.md](rendering-proof-required.md) for the evidence each rendering claim needs.

## 2. Never invent (anti-hallucination)

- **APIs.** Use only public exports in `docs/agents/api-surface.md` and the root imports shown in `llms.txt`. Check a name exists (`rg` the export list or let `tsc` fail) before teaching it.
- **Assets.** Never invent paths, ids, URLs or GLB names, and never paste a remembered CDN URL (a remembered URL is hallucinated provenance). Add a file with `npx @aura3d/cli@latest assets add ./assets/model.glb --name model`, read `src/aura-assets.ts`, and use `model(assets.model)`. For a named real-world object, run `assets search "<object>"` then `assets resolve "<object>" --name <name>`; pick an auto-pullable candidate (CC0 or CC-BY, verified, direct download). Do not fall back to a primitive or an invented URL.
- **Forbidden forms:** `model("robot")`, `model("/assets/x.glb")`, `model("https://...")`, `unsafeModelUrl(...)` in release-facing code.
- **three.js.** No `import * as THREE`, no `three` or `three/examples/...` imports, no `new GLTFLoader()`, no hand-wired scene, renderer, camera loop, loader or controls. `createAuraApp(...)` owns the renderer, scene graph, camera and loop. If the task is explicitly about renderer internals or migration, label it internal and do not use it as root proof.
- **Physics.** Do not import `PhysicsWorld`, `Shape` or `PhysicsDebugAdapter` from `@aura3d/engine`; use the root `physics` namespace (`physics.world`, `physics.box`, `physics.sphere`, `physics.step`, `physics.worldFromScene`, `physics.debugNodes`).
- **Kits before custom systems.** Start from the matching `sceneKits.*`, `prefabs.*` or `game.*` helper (mini golf, charts, city, product, humanoid, particles, racket sports) and make only prompt-required edits.
- **Product identity.** Aura3D is a TypeScript/JavaScript engine API, asset CLI, template system, diagnostics surface and deploy checker. It is not an AI model, an asset store, or a runtime for arbitrary generated code.
- **Naming.** New files, docs, routes, packages, tests and APIs are named for what they do, not for release numbers (`v2`, `v3`, `v4`). Do not revive legacy provider runtimes or legacy scene IR in new examples.
- **Done.** Do not say a route, feature or performance comparison works until the finite build, test or check command passes with all evidence inputs present.

## 3. No hackjobs

The right response to a bad screenshot is root-cause work, not a route-local illusion.

Do not ship or present examples that rely on:

- CSS, DOM or canvas stand-ins for particles, bloom, trails, labels, lighting, scanlines, shadows or 3D effects (DOM is fine for HUD, menus and debug panels);
- primitives as the main character, vehicle, product, world, track, weapon or hero object for a named real-world or game prompt;
- autoplay or deterministic replay as a substitute for player input;
- route-local scale, camera or gameplay math that contradicts the public API docs;
- a blanket `qualityRebuild` pin or post-processing disabled for everyone to hide a GPU fault (ship `installSafetyNet` instead);
- stale route-health, README or launch evidence that names assets or claims the source no longer uses.

When a screenshot is tiny, cropped, blank, floating, primitive-heavy or unplayable:

1. Classify it: renderer or material gap, asset quality or provenance gap, scale or camera gap, effects gap, game-runtime gap, docs or claim gap, unknown.
2. Map it to exact source files and the public API boundary.
3. Prove the fix in a root-only validation app or test before touching showcase presentation.
4. Update docs and route evidence after the proof passes.

Swapping GLBs, repainting primitives or changing a look preset without a recapture and re-judge is the same hack.

## 4. What the root API may claim

Root `createAuraApp` can claim: typed GLB/glTF via `model(assets.name)`; scene composition with the public helpers (`scene`, `camera`, `lights`, `material`, `effects`, `prefabs`, `sceneKits`, `primitives`, `group`, `timeline`, `interactions`, `physics`, `labels`, `environments`, `game`, `games`, `particles`, `instances`, `distanceLod`, `text3D`, `geometry`, `looks` and the rest of the root surface, when exported and tested); one `createAuraApp(...)` mount per route; runtime node mutation; diagnostics, evidence helpers, screenshots and deploy checks that were actually run and attached.

Do not claim for the root API, without root-only browser evidence of the exact result: production renderer parity or "Three.js-quality" rendering; full PBR parity; HDR, IBL, PMREM filtering, tone mapping or high-quality shadows; pixel-backed FXAA/TAA or other effects without a receipt (ambient occlusion, colour grade, vignette and depth of field have one, see below); native WebGPU or compute; skinned animation or morphs beyond the bounded fixtures; production-quality character, racing, platformer or falling-block kits; collision beyond box, sphere and capsule bodies against static and dynamic bodies.

### Bounded evidence by area

Each receipt proves only the named behaviors. Anything beyond it needs its own evidence.

| Area | Receipt | Does not prove |
| --- | --- | --- |
| Custom shaders | `docs/rendering/portable-custom-materials.md` (`PortableShaderMaterial`, paired GLSL/WGSL, a `@aura3d/rendering` package API) | Custom shader authoring as a root claim, general TSL or node-material parity |
| PBR/glTF | `docs/rendering/pbr-gltf-correctness.md` (selected root primitives, production-runtime textured materials and transmission, package loader semantics) | Full textured PBR, skinning, morphs or every glTF extension on the root; universal three.js parity |
| Lighting, environment | `docs/rendering/lighting-environment-color.md` (selected production-runtime light, shadow, HDR/IBL, PMREM, background, color workloads) | Rectangular lights or the receiver-contact approximation as automatic root claims; general screen-space or ray-traced contact shadows |
| Geometry | `docs/rendering/geometry-instancing-lod-text.md` (native lit instancing for supported materials, distance LOD with hysteresis, uppercase alphanumeric mesh text, custom indexed geometry, CPU frustum culling, static bounds BVH) | One draw for every advanced material, arbitrary fonts, SDF text, GPU occlusion. DOM labels are UI, never 3D text |
| Animation | `docs/rendering/animation.md` (root typed-GLB skinned playback, named clips, named morph targets, subject-region pixels); `docs/api/animation-root.md` with receipts `animation-layers`, `animation-root-motion`, `animation-retargeting`, `animation-two-bone-ik` (masked layers, root motion apply and extract, `addClipsFrom` retargeting, two-bone IK, each on a typed GLB) | Full-body IK, retargeting beyond the fixture rigs, universal animation parity. Receipts are software WebGL2 |
| Controls, XR | `docs/rendering/controls-picking-xr-context.md` (named orbit, trackball, first-person, picking, gizmo; injected XR sessions; app-owned context-loss pause and remount) | Physical-device XR, transparent recovery of every external GPU resource |
| Physics | `docs/concepts/physics.md` collision matrix with receipt `physics-root-collision` (box, sphere and capsule bodies against a static box and a dynamic crate, resting heights within 0.001 m, visible nodes following bodies); `@aura3d/physics` native backend (adaptive CCD, Coulomb friction, rotated box SAT, convex GJK/EPA, mesh and heightfield contacts) at package level | Mesh and heightfield colliders, joints and vehicles as root claims; solver parity with another engine; anything from a `cannon-es` route |
| Effects | `docs/agents/effects-and-scene-kits.md` with receipts `effects-ambient-occlusion`, `effects-color-grade`, `effects-vignette`, `effects-depth-of-field` (on/off frames differ as described) | `effects.contactShadows` as a contact-shadow pass: it is lowered to the ambient-occlusion pass, so say "contact darkening". Colour-grade fields other than `contrast` and `saturation` |
| Scene kits | `docs/agents/effects-and-scene-kits.md` with a receipt for nine kits (two frames each; animated kits change between them) plus the original `materialLab` | That a kit is a finished product: its art direction, rules and assets stay yours |
| Performance | A current like-for-like comparative report | Parity from an inventory, a stale capture, a package benchmark or a report with missing inputs |

Comparison claims use repository-locked `three@0.185.1`; the selected correctness workloads are bounded evidence, not a universal verdict. Honest numbers against three.js live in `evidence/vs-threejs/RESULTS.md`, `RESULTS-4.3.7.md` and `RESULTS-4.5.0.md` (software GL, not GPU). At 4.5.0 the benchmark gate passes 7 targets, fails 7 and has no data for the real-GPU target; it fails on T1 (81 rows where three.js is better, limit 30). Public copy may state only the Aura3D-side facts from passing gate lines (first frame of the cube, draw calls, console warnings, option coverage, scene source size), each with its method, and never a three.js column, until T1 passes. The list is in `docs/comparisons/threejs-positioning.md`, "Claims to unlock".

### Render path, exposure, options and instancing

What each of these does, and what you may and may not say about it.

- **Render path.** `createAuraApp` takes `quality: "auto" | "production" | "safe-basic" | "cinematic"` (default `auto`). On `auto`, a scene with no post-processing, output options, transmission or custom shader draws in one pass to the canvas; anything else, and `quality: "production"`, uses the HDR chain. `app.diagnostics().renderPath` and the reason say which one ran. `preserveDrawingBuffer` is off unless the page is in capture or QA mode (`?capture=1`, `?qa=1`). Claim "a simple scene takes a cheaper path", with the measured numbers and the software-GL qualifier. Do not claim it is faster than another engine, or that it looks different from `production`: the two are compared within 2/255 mean difference.
- **Exposure.** A scene with authored lights and no `environments.*` node no longer gets an implicit fill, so it renders darker than before. Add any `environments.*` node to restore the old look. The calibration is checked against a CPU reference of three.js physically-based lights (within about 2%); say "calibrated against", not "identical to".
- **Ignored options.** An option that a builder accepts but does not apply raises an `OPTION_IGNORED` diagnostic naming the valid keys (in `app.diagnostics()`, a throw in strict mode). Do not write an option into an example unless it takes effect.
- **Instancing.** `setInstanceTransforms(typedArray)` is the per-frame update path. Dense shadow-casting instanced nodes (1,024 or more instances of a builtin primitive) use a coarser shadow stand-in, so their shadows are slightly more faceted; opt out with `shadowproxy=off`. A 10,000-instance forest completes on software GL; it is still slower than the same scene in three.js there, so make no speed claim for it.
- **Codemod.** `aura3d migrate three` is a worklist: only the rows marked `exact` in `mappings.ts` are proven against real three.js. Aura3D's math classes are immutable values and three's mutate in place, so write "helps port", never "drop-in".
- **Speed and GPUs.** Every number in `evidence/` was taken on software WebGL2 on a remote runner. No real-GPU run has been made; keep "software WebGL2" beside every speed or frame-cost statement and make no GPU claim until an owner-run receipt exists (`evidence/real-gpu/README.md`).

## 5. Assets, primitives, DOM

- **Provenance.** Primary assets appear in `aura.assets.json` and generated `src/aura-assets.ts`, with durable source page, download URL, license name and URL, author, acquisition time, hash and typed key. Temp paths (`/var/folders/.../aura3d-resolve-*`) are not provenance unless the asset is marked local-only and excluded from public claims.
- **Primitives** are allowed for set dressing, collision guides and debug markers, HUD anchors, local prototypes and labelled abstract visualization. A primitive-only public showcase must be labelled abstract or blocked.
- **DOM and CSS** may provide UI, controls, menus, HUD text and debug panels. They are not scene geometry, particles, bloom, shadows or renderer evidence. If a route claims Aura3D particles, changing the controls must change rendered pixels and runtime telemetry, not just DOM nodes.

## 6. Games, ports and the production bridge

A route is not a game claim because it has a 3D scene and key listeners. A public game route proves: input visibly changes state; an objective, score or fail, reset and progression loop; automated tests for movement, restart and at least one win, fail, score or completion mechanic; typed primary assets unless explicitly abstract; route-health that names primary assets, primitive count, renderer mode and claims.

Reusable and public: the game kit (`@aura3d/engine/game`: HUD, touch, session, juice, game sound), the QA kit, the audio synth kit and `game.racketSports()`. The root `createGame` is a headless stub (no HUD, touch or sound; it logs `CREATE_GAME_STUB` once) and stays out of every public claim; use `@aura3d/engine/game`. Opponent behavior, level layout, art and challenge scoring are route-local: say so, and claim no reusable platformer, racing, falling-block or character-controller kit beyond the root-tested `game.*` genre kits. The per-kit boundary (what the kit provides, what stays per game) and a runnable example for each of platformer, arcade kart, car soccer, fighting and racket sports is in [genre-kits.md](genre-kits.md). The genre kits are building blocks: write "built on the Aura3D platformer kit", never "a complete platformer" or "a playable kit" without that game's own input, objective, reset and pixel evidence.

The production bridge draws a model only for a same-origin URL with a valid `sha256`; http(s) and unhashed models draw nothing. After deploying, request every asset URL and expect 200.

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
- [ ] Wording does not exceed detected capability. If a required command does not exist, the work is `blocked` or `prototype`; never weaken the claim.

## 8. Short claims

Safe when backed by the app's files and evidence:

- Aura3D is a TypeScript SDK and asset pipeline for agent-authored browser 3D.
- Agents write editable TypeScript or JavaScript against public `@aura3d/engine` APIs.
- The CLI adds, resolves, validates, hashes, type-generates and tracks GLB/glTF assets, when those commands were run.
- A route uses typed assets when it imports `assets` from `src/aura-assets.ts` and calls `model(assets.name)`.
- A screenshot proves only what is visible in that screenshot.

Never write: "matches production renderer quality" (without root pixel proof); "WebGPU particle lab" (without native adapter, backend, dispatch, pixels); "PBR parity" (without exact tested features); "skinned character animation" (without pixel-backed pose change); "playable kit" (without root exports and input tests); "real-time simulation" (when telemetry is disconnected from scene state); "asset-backed" (when the subject is primitives or raw URLs); "pixel parity" or "indistinguishable" (from histograms and a model judge); "runs on every GPU" (from a software run); "fixed on real hardware" (without a real-device confirmation); "same as the original" (without a reference and a replay test); "faster" or "smaller" than three.js (the measured results favor three.js on bundle size and software-GL frame cost).
