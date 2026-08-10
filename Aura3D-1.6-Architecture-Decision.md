# Aura3D 1.6 Architecture Decision

> Historical architecture input. Aura3D 2.0 uses this record as background,
> while `1.6-FINAL-PRD-Finishes.md` and current claim-boundary documentation
> govern the final public surface and release decision.

**Date:** 2026-08-05
**Basis:** `main` at `be86c73e`, 66 commits past `v1.5.2`, working tree clean.
**Method:** every number below came from a command against this worktree or from a
retained report on disk. Where a report is not trustworthy I say so and explain why.
Nothing here is derived from `logs.txt` (a stale 2026-08-03 transcript), from
`resetprompt.md` (closed at 1.5.2), or from `anotherprompt.md`.

**Status: decision document. No code was changed, nothing was published, nothing was deleted.**

> **Comparison-scope note — 2026-08-08:** Three.js measurements in this
> historical decision use the then-frozen `three@0.165.0` context. They remain
> evidence for the decisions made here, but they are not a current-market
> comparison with `three@0.185.1`. `1.6-FINAL-PRD-Finishes.md` controls current
> competitive and release completion.

> **Amendment 2026-08-05 — three conclusions in this document have been superseded during
> execution, and the superseding evidence is stronger than the evidence here.** This audit
> scanned consumers in `apps/`, `examples/`, `templates/` and `packages/engine`, which turned out
> to be the wrong denominator: it omitted `apps/editor`, public `exports` subpaths in the root
> `package.json`, re-exports on the `engine` barrel, and `tests/browser`. The affected rows are
> marked **SUPERSEDED** inline.
>
> | Original conclusion | Actual outcome | Authority |
> |---|---|---|
> | `packages/ecs` — archive (0 consumers) | **Retained** — public `./ecs` subpath, re-exported at `engine/src/index.ts:61` | [ADR 0001](docs/architecture/adr/0001-retain-ecs-and-scripting.md) |
> | `packages/scripting` — archive (0 `engine` refs) | **Retained** — public subpath, live `apps/editor` consumer, 8 production-path browser assertions backing 9 parity rows | [ADR 0001](docs/architecture/adr/0001-retain-ecs-and-scripting.md) |
> | Audio DSP (69 lines) — delete as trivial Web Audio aliases | **Retained** — adds real validation and disposal behaviour | PRD WS-3.2 |
>
> The pattern is one mistake made three times: **absence of a consumer in the directories I
> searched was treated as absence of a consumer.** R8's six-point dependency report exists
> precisely because that inference is unsafe, and it blocked all three deletions before any
> `git rm` ran. The renderer findings, the three fabricated-gate findings, the anisotropy root
> cause, and the physics findings were each verified by direct command output and are unaffected.

---

## 0. The short version

We did build a real Three.js competitor at the rendering layer, and it is worth
finishing. We also built four things around it that no external library gives us
and that are the actual reason a developer would choose us. And we built roughly
30,000–35,000 lines that are either duplicate systems, unused subsystems, or
descriptor files shaped like evidence, and those are what has been making every
release feel like a patch job.

The single most consequential finding is not about physics. It is that **three of
our performance and parity gates cannot fail for the right reason**, and one of
them contains hardcoded numbers behind a Canvas-2D drawing. Details in §3.4. Until
that is fixed, no amount of engine work will feel like progress, because the
instruments are not reading the engine.

---

## 1. Competitive boundary

### Category A — must be Aura3D-owned (this *is* the competitor)

Renderer, render device abstraction, WebGL2 backend, WebGPU backend, scene graph,
cameras, geometry, materials and the shader library, lighting, shadows, textures,
GPU resource lifecycle, instancing, skinning, morph targets, particles, render
targets, postprocess composer, tone mapping and colour management, render
diagnostics, the typed scene-authoring API.

**Measured size:** `packages/rendering` 55,761 lines / 297 files, of which 24,815
lines live in files that actually touch a `RenderDevice` or raw `gl.`/WebGPU calls.

### Category B — integrated platform capabilities (differentiation, keep)

Typed asset map and provenance, asset discovery across 9 external sources, role-aware
asset admission, bounds-derived placement, the public agent API, deterministic project
scaffolding, CLI workflows, route-health and interaction-audit harnesses, Three.js
migration surface.

### Category C — commodity subsystems (do not own the solver)

Rigid-body solving, collision narrow phase, vehicle suspension, character controller
internals, navmesh generation, audio DSP, general state containers, cloth/fluid/
fracture/soft-body simulation.

---

## 2. Subsystem audit

Consumers = files under `apps/`, `examples/`, `templates/` that import the package
(`git grep -l`). "src" excludes tests.

| Subsystem | src lines | Consumers | Maturity | Differentiation | Maint. burden | External alternative | Recommendation |
|---|---:|---:|---|---|---|---|---|
| rendering (device + pipeline) | 24,815 | 94 | Real WebGL2 + real WebGPU device, 85 glTF assets render close to Three.js | High — this is the product | High but justified | Three.js | **Keep and strengthen** |
| rendering (descriptor/fixture files) | ~7,900 | ~0 | Descriptors, not renderers | None | Pure drag | — | **Delete/archive** |
| rendering/threejs-compatibility | 354 | 0 | `SceneRenderer` returns hardcoded `{meshes:72, instances:12000}` | Negative (misleads audits) | — | — | **Delete** |
| engine agent API | 55,368 (14,628 in one file) | 163 | Works; unsplittable | High (API shape) | High | none | **Keep, split the barrel** |
| engine video/episode surface | 10,389 | 0 | Ffmpeg/PNG/MediaRecorder/Cloud encoders in a browser package | Low | High (blocks tree-shaking) | — | **Archive to own package** |
| assets (glTF/KTX2/Draco/Meshopt/HDR) | 16,574 | 27 | Real decoders, real extension table | Medium-high | Medium | three loaders | **Keep and strengthen** |
| asset-index + CLI + create-aura3d | 20,768 | CLI-invoked | 90 catalogued assets, 9 source adapters, 20 templates | **Highest in repo** | Medium | none | **Keep and strengthen** |
| physics (solver + internals) | ~9,000 of 12,631 | 11 | Two backends, one silently broken (see §4) | Negative | Very high | Rapier | **Replace internals, preserve API** |
| physics (racing line, driver, telemetry, surface query) | ~1,100 | 11 | Sound in isolation, unit-tested | Real | Low | none | **Keep** |
| physics fixtures (cloth/fluid/fracture/soft-body/fire) | 2,076 | 0 | Not solvers — descriptor objects with `blockedClaims` arrays | None | Drag | Rapier/others | **Delete** |
| animation | 7,988 | 24 | Mixers, morph, IK, retarget | Medium | Medium | three AnimationMixer | **Keep** |
| ecs | 1,480 | **0** | Archetype/sparse-set, competent | Unused | Low | — | **Archive** |
| scripting (GOAP/HTN/BT/UtilityAI/VisualGraph) | 5,837 | 1–2 | Tested, referenced by 0 engine files | Unused | Medium | Yuka | **Archive** |
| input | 2,463 | 6 | Keyboard/pointer/gamepad/gesture/XR/replay | Medium | Medium | none | **Consolidate — engine has a second one** |
| audio | 2,205 | **1** | Thin Web Audio wrapper; custom DSP is only 69 lines | Low | Low | Howler | **Consolidate — engine has a second one** |
| navigation / crowd / steering | ~1,135 | 2–8 | In use, unlike scripting | Medium | Low | Yuka, recast | **Keep, revisit after Rapier** |
| editor-runtime | 7,915 | 11 | In use | Medium | Medium | none | **Keep, out of core** |
| three-compat | 1,210 | 1 | Only place `three` is a dependency; API-shape inventory + Compat classes | Real (migration on-ramp) | Low | — | **Keep and strengthen** |
| scene / math / core / materials / environments / debug / react / workflows / product-studio / apps | ~7,600 | 0–42 | Mixed | Mixed | Low | — | **Keep, consolidate the empty ones** |

Dependency reality check: the entire monorepo's external runtime dependencies are
`cannon-es@0.20.0`, `@loaders.gl/core`, `@loaders.gl/textures`, and `three@^0.165.0`
(only in `three-compat`). Everything else is ours.

---

## 3. Rendering audit — the decision that matters

### 3.1 What is genuinely real

- `WebGL2Device.ts`, 3,793 lines, ~700 `gl.*` call sites. Real
  `getExtension("EXT_color_buffer_float")` gating for HDR targets,
  `EXT_texture_filter_anisotropic`, S3TC and ASTC compressed-texture paths, and
  real `webglcontextlost`/`webglcontextrestored` listeners at lines 349–350.
- `WebGPUDevice.ts`, 2,980 lines, real `createShaderModule`, `createRenderPipeline`,
  `createBindGroup`, `beginRenderPass`, `queue.writeBuffer`. `ProductionWebGPURenderer`
  **refuses to construct** unless the device reports `native-render-pipeline`,
  `native-sampled-textures` and `native-texture-readback`. Captured route screenshots
  show `adapter: apple metal-3`, 6,720 native submissions, 47.3 fps on the instancing
  route. This is not a stub.
- `ShaderLibrary.ts`, 3,609 lines, with real uniforms for clearcoat, transmission +
  volume, sheen, anisotropy, iridescence, specular.
- `Renderer.ts`, 3,054 lines: cascaded shadow maps, depth prepass, transmission
  prepass, HDR postprocess with enforced tone mapping before presentation, reused
  render targets across frames.

### 3.2 The strongest evidence we have, and what it actually shows

`tests/reports/external-parity-gltf-loader-visual-parity.json`: **85 Khronos sample
assets rendered by our loader + renderer in a browser and pixel-diffed against real
Three.js renders of the same asset.** All 85 pass. Median mean-absolute-error 6.73,
best 1.34, worst 28.18, thresholds MAE ≤ 32 and changed-pixel-ratio ≤ 0.45.

That is a real, reproducible, in-browser comparison and it is the best asset this
project has. I inspected the images rather than trusting the numbers:

- `abeautiful-game` (MAE 2.3): essentially indistinguishable from Three.js. Genuinely good.
- `boom-box` (MAE 1.3): close, minor exposure/scale difference.
- **`anisotropy-strength-test` (MAE 17.9, marked pass): qualitatively wrong.** Three.js
  renders the anisotropic highlight streaks and dark grazing base the test exists to
  show. We render near-uniform pale spheres with no anisotropic response at all. The
  material feature is declared, uniformed, and not shading.
- `animated-morph-cube` (MAE 22.1, marked pass): both are grey squares at different
  sizes. It proves nothing about morph targets either way.

**Conclusion: the renderer is credible, and the parity gate is not calibrated to
catch a wrong BRDF.** A material that ignores its own feature passes at MAE 17.9
against a 32 threshold. This is the mechanism by which "we hit parity" and "the
demo looks wrong" have both been true at the same time.

### 3.3 Our own parity generator's verdict

`tools/product-remediation/build-threejs-parity.mjs` is an honest tool — it downgrades
rows lacking a real consumer or retained evidence. Output: 56 rows, **3 exceed, 42
parity, 8 parity-unproven, 3 gap.** The 3 gaps:

- **text rendering** — real. No `TextGeometry`, no 3D text. Labels are DOM.
- **morph targets** — *generator false negative.* It searches for `MorphTargetMixer`
  and finds nothing, but `packages/animation/src/threejs-compatibility/MorphTargetMixer.ts`
  and `packages/rendering/src/MorphTarget.ts` both exist. The row understates us.
- **context loss recovery** — half-real. The device listens for the events
  (`WebGL2Device.ts:349`); nothing surfaces or recovers through the root API.

### 3.4 The instrumentation problem — read this section twice

Three gates that are supposed to measure rendering performance do not measure it.

1. **`tests/browser/external-parity-large-scene.spec.ts`** calls
   `canvas.getContext("2d")`, draws 640 rectangles with `fillRect`, and returns
   `drawCalls: 146, cpuFrameMs: 13.8` as **literal constants in the source**. It then
   asserts `cpuFrameMs < 16.7`. `tools/external-parity-performance-readiness/index.ts:28`
   consumes that file as its `browser-large-scene` check, and
   `external-parity-release-readiness` consumes it too. **A performance release gate is
   currently satisfied by a hardcoded number behind a 2D drawing.** This is the single
   worst artifact I found and it is a five-line fix to delete.

2. **`tools/compare-engines/index.ts` (lines ~1860–1960), the Aura3D-vs-Three.js-vs-Babylon
   benchmark**, creates a raw WebGL2 context, compiles its own 6-line shader, and draws
   a 3-vertex triangle N times. It **never imports Aura3D, Three.js, or Babylon.js.**
   The report says so itself in its own `rule` text. Every "tie" in frame time is two
   runs of the same raw triangle. The report is honest about this — `claimUsable: false`,
   `supportedNicheClaims: []`, `broadSuperiority.threejs: false` with "9 benchmark
   dimensions still lose" — but the *numbers inside it* have been read as parity evidence.
   The only real measurement in it is bundle size.

3. **`tests/performance/rendering-frame-budgets.ts`, `system-baselines.ts`, and
   `production-runtime-performance-baselines.ts`** all call
   `Renderer.create({ backend: "mock" })`. They measure our CPU-side traversal, which is
   worth measuring, but they are not GPU frame times and the `frameMs: 8.508` figure
   should never be quoted as render performance.

The one honest render measurement on disk:
`production-runtime-large-scene-performance.json` — `realWebGL2: true`, `frameMs: 15.4`,
33 draw calls, 4,096 candidate instances culled to 2,048, 84,977 non-black pixels.
Real, and small.

### 3.5 Bundle size — the clearest place we are worse

`tests/reports/bundle-size.json`, generated 2026-08-05:

| Target | gzip | Budget | Ratio |
|---|---:|---:|---:|
| `@aura3d/engine` agent API | 579,953 B | 80,000 B | **7.25x over** |
| product-viewer starter | 356,079 B | 250,000 B | 1.42x over |
| mini-game starter | 373,905 B | 250,000 B | 1.50x over |

And on the equivalent-workload benchmark: Aura3D 1,145,689 B vs Three.js 671,968 B —
**1.70x larger for the same scene.**

Cause is diagnosed and correct in `BUNDLE_SIZES.md`: `agent-api/index.ts` is 14,628
lines with 361 `export` statements re-exporting the entire surface from one module,
including Node-only video encoders (`FfmpegFrameEncoder`, `PngSequenceEncoder`,
`MediaRecorderFrameEncoder`, `CloudRenderAdapter`, `PublishingPipeline`). Nothing
tree-shakes. A developer evaluating us downloads 580 KB gzip to draw a cube. **This
is the first thing a Three.js user will notice and the reason they will leave.**

### 3.6 The public path still has a Canvas-2D renderer in it

`agent-api/index.ts:14225` `renderSceneToCanvas()` draws the scene with
`getContext("2d")`, gradients, and `fillRect`. It is selected whenever
`shouldUseProductionRendererForCurrentScene()` is false — i.e. any scene with no
model or primitive node, or any non-browser context. Diagnostics then report
`backend: "canvas2d"`. It exists for headless/degenerate cases and it is *labelled*,
but it means the phrase "the scene rendered" is ambiguous in our own API surface,
and it has already caused one real defect class (world labels reaching the scene
graph but only being drawn in the 2D fallback, fixed later).

### 3.7 Verdict on the renderer

**Option 1 with a scoped Option 2 inside it: keep and finish the current renderer;
rewrite nothing at the device layer.**

Not because we already spent 55,761 lines on it — because 85 real assets render
recognisably like Three.js in a real browser, on both a real WebGL2 device and a
real WebGPU device with native pipelines. That is not salvageable-with-effort; that
is working. Replacing it would throw away the only thing here that is genuinely
hard and genuinely done.

What must change to make it credible to an outside developer, in priority order:

1. Delete the fabricated Canvas-2D performance gate and the raw-triangle benchmark's
   claim to be a render benchmark. Replace with real-device frame measurement on the
   existing production-runtime harness.
2. Tighten glTF parity thresholds until `anisotropy-strength-test` fails, then fix
   anisotropy. Repeat for iridescence and sheen. A gate that a wrong BRDF passes is
   worse than no gate.
3. Split `agent-api/index.ts`. Target ≤ 100 KB gzip for a cube. Move video/episode
   encoders out of the browser package entirely.
4. Surface context loss + recovery through the root API.
5. Add 3D text (`TextGeometry` equivalent). It is a visible, checkable gap.
6. Delete `rendering/threejs-compatibility/` stub systems and the ~7,900 lines of
   descriptor files.
7. Decide explicitly whether the Canvas-2D fallback is public. My recommendation: make
   it internal and diagnostic-only, never selected for a scene a developer authored.

---

## 4. Physics audit

**Is it a complete engine?** No. It is a wrapper around `cannon-es` plus a second
hand-written solver plus a set of partial simulation systems.

Measured facts:

- `cannon-es` is imported in exactly **one** file: `PhysicsWorld.ts`. One import line
  in 12,631 lines of physics.
- `PhysicsWorld.ts:66` declares `export type PhysicsBackend = "cannon-es" | "aura-js"`.
  We wrote our own fallback solver alongside the dependency.
- **The two backends do not agree.** `PhysicsWorld.ts:682-685`, our own comment: joints
  were "a silent no-op" on the default `cannon-es` backend while "the aura-js branch
  always solved them, which is why the joint unit tests passed while the shipped
  default backend ignored joints entirely." Tests green on the path users don't take.
- `node_modules/cannon-es/dist/cannon-es.d.ts` exports **`RaycastVehicle` and
  `RigidVehicle`**. `grep -n "RaycastVehicle\|RigidVehicle"` across `packages/` and
  `apps/` returns **empty**. We ship a dependency containing raycast-suspension vehicle
  physics and wrote 1,081 lines of our own instead (`VehicleDynamics.ts` 553 +
  `VehicleMotion.ts` 528), including a Pacejka tyre model.
- And per our own parity report: `game.racing` **does not use** `VehicleMotion.ts`. The
  kit integrates its own kinematic motion. So the force model was written, tested, and
  is not in the shipping path.
- **Outcome (2026-08-08):** ADR 0003 classified the public racing contract as authored-unit arcade
  motion, moved its pose integration to a shared `GameRuntime` owner, and removed the unused,
  unreleased force-motion prototype under a six-point R8 dependency proof. Its unreleased
  force-model-only racing-line/path-follow experiment was also removed: the shipped arcade driver
  path is the retained owner. This preserves the audit measurement above while making clear that
  those prototypes are no longer current source.
- Defect history, each a textbook-solved problem rediscovered from scratch: `maxLoad`
  never passed to `samplePacejkaTireForces`, costing ~10x grip (`ae71897a`); yaw
  integrated with no kinematic ceiling reaching -55 rad/s at 24.5 g (`0e031904`);
  missing speed profile so no route was driveable (`be86c73e`).

To answer the Google question you asked directly: **yes, we wrote our own physics
engine, and no, Three.js does not do that.** Three.js renders and delegates simulation
to Rapier/Cannon/Ammo. Owning the solver is where our defect budget went, and it bought
us nothing a user can see.

**Recommendation: replace the internals, preserve the public API.**

```
@aura3d/physics public API                      (unchanged surface)
├── Rapier backend                              production default
├── cannon-es backend                           compatibility, deprecated
└── aura-arcade backend                          explicit opt-in, honestly labelled
Above the solver, kept where consumed:
    VehicleChassis spec-from-bounds · SurfaceQuery / MeshBVH · telemetry
    PhysicsDebugDraw · deterministic stepper · shared arcade driver runtime
```

Keep the shipped arcade driver AI, telemetry and the
agent-facing API — that is game-driving logic, not solver work, it is genuinely ours,
and Rapier does not provide it. Delete the `aura-js` solver as a *default*. Delete
`ClothFixtures`, `FluidFixtures`, `FractureFixtures`, `SoftBodyFixtures`,
`FireSmokeFixtures` (2,076 lines, zero app consumers) — reading `ClothFixtures.ts`,
it is not a PBD solver, it is a descriptor object carrying a `blockedClaims` array
listing the eight things it cannot do.

This is a **1.6 re-platform, not a 1.5.3 patch.** It deletes more than it adds.

---

## 5. State, ECS, input, audio, AI

| Question | Answer from the code |
|---|---|
| Is the ECS used? | **SUPERSEDED — see ADR 0001.** This row read "0 consumers in `apps/`/`examples/`/`templates/`, one 233-line file in `engine` imports it → archive." Both facts held; the conclusion did not. That file is `engine/src/ecs/ECSRenderSource.ts`, re-exported at `engine/src/index.ts:61`, and `./ecs` is a **public published subpath**. The consumer scan omitted `apps/editor`, `packages/engine`'s barrel, and `tests/browser`. R8 blocked the deletion (43 refs). → **Retained.** |
| Is there one input system? | **No, two.** `packages/input` (2,463 lines, 6 consumers) and a second one inside `engine/src/agent-api/GameRuntime.ts` — `createGameInput` at :1618 with its own `addEventListener("keydown")` at :1855. Every shipped game route uses the engine one. → **Consolidate on one; the input package's gamepad/gesture/XR/replay work is good and should be the survivor.** |
| Did we write an audio engine? | **Overstated.** 2,205 lines, but the custom DSP is 69 lines total (`Reverb.ts` 30, `Filter.ts` 39) and everything sits on real Web Audio `createGain`/`createBiquadFilter`/`createConvolver`. The problem is again duplication: `engine/src/game/GameAudio.ts` is a second, separate audio layer. 1 consumer for the package. → **Keep the scene-integration API, delete the 69 lines of custom DSP, consolidate the two layers.** |
| Is the AI layer used? | **SUPERSEDED — see ADR 0001.** The measurement ("0 files in `engine` reference any of it") was correct and the inference was wrong: nothing required the consumer to be `engine`. `apps/editor/src/panels/VisualScriptPanel.ts:1` imports `VisualGraph`, and `tests/browser/runtime-external-parity.spec.ts` proves GOAP/HTN/BT/UtilityAI/DecisionTree/StateMachine/Perception/WeaponSystem through a live WebGL2 route — **8 assertions, R1's strongest evidence class, backing 9 parity rows.** `./scripting` is a public subpath. R8 blocked deletion (94 refs). → **Retained.** |
| Navigation and steering? | Different story — `Navigation` appears in 8 app files, `Crowd` in 5, `Steering` in 2, and engine references them. → **Keep**, re-evaluate against Rapier's queries after the backend swap. |

---

## 6. Salvage matrix

| Component | Competes with Three.js? | Worth keeping? | Current quality | 1.6 treatment | Reason |
|---|---|---|---|---|---|
| WebGL2 renderer | Yes | Yes | Good | Keep + strengthen | 85 glTF assets render close to Three.js in-browser |
| WebGPU renderer | Yes | Yes | Good, narrow | Keep + strengthen | Real native pipelines, refuses to fake a device |
| Scene graph | Yes | Yes | Good | Keep | Only `exceed` row that survived its own downgrade rules |
| Geometry | Yes | Yes | Good | Keep | Real buffers, instancing, morph, skinning bounds |
| Materials / shaders | Yes | Yes | **Mixed** | Keep + fix | Anisotropy visibly not shading; PBR base is solid |
| Lighting | Yes | Yes | Good | Keep | Clustered forward, real light collection |
| Shadows | Yes | Yes | Good | Keep | CSM implemented, target reuse across frames |
| Postprocess | Yes | Yes | Adequate | Keep | Composer + bloom/SSAO/DoF/grading, HDR tone-map enforced |
| Animation | Yes | Yes | Good | Keep | 24 consumers, mixers/IK/retarget |
| Asset loading | Yes | Yes | Good | Keep + strengthen | Real Draco/Meshopt/KTX2/HDR, extension support table |
| Asset discovery / provenance / admission | **No — no Three.js equivalent** | **Yes, highest** | Good | Keep + strengthen | 90 assets with hash, bounds, materials, humanoid classification; 9 adapters |
| Physics public API | No | Yes | Adequate | **Keep API** | Shape is fine; guts are not |
| Physics solver | No | **No** | Poor | **Replace with Rapier** | Joints silently no-op on default backend, by our own comment |
| Vehicle dynamics | No | Internals no, layer yes | Poor→Fair | Replace solver, keep racing line/driver | We never imported the `RaycastVehicle` we already ship |
| Character controller | No | Internals no | Fair | Replace internals | Rapier's is better-tested than ours will ever be |
| Collision / BVH | No | Maybe | Fair | Re-evaluate vs Rapier queries | `MeshBVH` 326 lines, works, may be redundant |
| ECS | No | **Yes — public API** | Competent, publicly exported | **Retain (ADR 0001)** | Public `./ecs` subpath; re-exported at `engine/src/index.ts:61`; R8 blocked 43 refs |
| Scripting / AI | No | **No** | Tested, unused | **Archive** | 0 engine references |
| Input | Partly | Yes, one of them | Good | Consolidate | Two systems, shipped routes use the other |
| Audio | No | API yes, DSP no | Thin | Consolidate, drop 69 lines of DSP | Real Web Audio underneath; duplicate layer |
| Navigation / path-follow | No | **Yes** | Fair | Keep | In actual use; Yuka existing is not an argument |
| Combat / frame data | No | Yes | Fair | Keep | Genuinely no standard solution |
| Game kits | No | Yes, rebuild on shared runtime | **Poor** | Rebuild | The open PRD item; kits bypass the shared model |
| Application kits | No | Yes | Fair | Keep | Product/twin/architecture/dataviz routes ship |
| CLI | No | **Yes, highest** | Good | Keep + strengthen | Generates the typed asset map that nothing else does |
| Agent APIs | Partly | **Yes** | Good but monolithic | Keep, split | 163 consumers; 580 KB gzip is the cost |
| Evidence / diagnostics | No | Yes, after a purge | **Mixed** | Keep harnesses, delete fabricated gates | §3.4 |
| three-compat | Migration on-ramp | **Yes** | Fair | Keep + strengthen | Only place `three` is a dep; this is how users arrive |
| `rendering/threejs-compatibility` | No | **No** | Stub | **Delete** | `SceneRenderer` returns `{meshes:72, instances:12000}` |
| All 38 `*Fixtures.ts` | No | **No** | Descriptors | **Triage per-file under R8; delete only cleared files** | 10,720 lines. "All 38" was never safe as a blanket action — 7 have internal importers and 8 belong to the now-retained `packages/scripting` |
| Video / episode / publishing surface | No | Not in core | Fair | **Split by runtime, not moved wholesale** (WS-2.3) | 10,389 lines; blocks tree-shaking. Correction: only `FfmpegFrameEncoder` is Node-only; `MediaRecorderFrameEncoder` is **browser-only** (17 browser APIs, 0 `node:`) |

---

## 7. Proposed 1.6 architecture

```
                    ── Aura3D-owned core (the competitor) ──
  rendering: RenderDevice · WebGL2Device · WebGPUDevice · Renderer
             ShaderLibrary · materials · lighting · shadows · postprocess
             instancing · skinning · morph · particles · render targets
  scene graph + typed scene authoring + cameras + geometry
  assets: glTF/GLB · Draco · Meshopt · KTX2 · HDR · extension support
  animation: mixer · crossfade · additive · IK · retarget · morph

              ── Aura3D-owned platform (the actual moat) ──
  asset intelligence: catalogue · provenance · hashes · bounds ·
                      role admission · semantic metadata · 9 adapters
  CLI + typed asset map + create-aura3d (20 templates)
  agent API (split into entry points, ≤100 KB gzip for a cube)
  route-health · interaction audit · runtime invariants · replay
  three-compat migration surface

                     ── integrated external backends ──
  Rapier            rigid bodies · colliders · joints · CCD ·
                    character controller · raycast vehicle
  Web Audio         audio backend (no custom DSP)
  loaders.gl        Basis/KTX2 transcode (already)
  browser APIs      gamepad · pointer · WebXR

                      ── Aura3D integration layer ──
  physics API over swappable backends
  racing line · speed profile · path-follow driver · telemetry
  navigation semantics · game kits rebuilt on the shared runtime
  one input system · one audio layer · deterministic stepping
```

---

## 8. Migration strategy

**Unchanged:** every public `createAuraApp` / `scene` / `game` / `assets` signature.
The rendering device layer. The CLI and asset formats. `aura.assets.json` and
`src/aura-assets.ts` schemas. All 20 templates keep working.

**Internals replaced:** physics solver, vehicle contact/suspension, character
controller. Behind the existing API.

**Consolidated:** input (two → one), audio (two → one), engine barrel (one file →
several entry points).

**Deprecated with a release note:** `cannon-es` backend, `aura-js` backend as default.

**Deleted:** 38 `*Fixtures.ts`, `rendering/threejs-compatibility/` stubs,
`external-parity-large-scene.spec.ts`'s hardcoded gate, the raw-triangle benchmark's
performance claims.

**Archived (not deleted):** `packages/ecs`, `packages/scripting`, the video/episode
surface — moved out of the browser bundle, kept in the repo.

**Must be rebuilt:** the four game kits on the shared runtime (the open PRD item),
and the three `prototype-blocked` routes. **They stay `prototype-blocked` until a
human looks at them.** I cannot self-grant that and will not.

**Must be rewritten as tests:** real-device frame measurement, calibrated glTF parity
thresholds, a bundle-size gate that fails the build.

**Release risks:** 26 packages publish together and 1.5.1 already split the registry
on an SSL error — verify every package landed, not just `@aura3d/engine`. Tightening
parity thresholds will turn currently-green rows red; that is the point and the
release notes must say so plainly rather than restoring the loose threshold.

---

## 9. Required final answers

**1. Are we genuinely building a Three.js competitor?** **Partially — and the part
that qualifies is the important part.** Rendering, scene graph, geometry, materials,
lighting, shadows, postprocess, WebGL2, WebGPU, glTF loading and animation are a real
competing implementation, evidenced by 85 sample assets rendered in-browser against
Three.js. Physics, ECS, scripting, audio and half the input layer are not competing
with Three.js at all — Three.js does not ship those — they are competing with Rapier
and Yuka, and losing.

**2. Is the existing renderer worth salvaging?** **Yes. Option 1 — keep and finish it.**
Do not rewrite the device layer. Fix six things (§3.7), starting with the
instrumentation and the bundle.

**3. Which additional systems are worth keeping?** Asset intelligence (catalogue,
provenance, hashes, bounds, role admission, semantic metadata, 9 source adapters);
CLI and typed asset map; `create-aura3d` and its 20 templates; the agent API shape;
route-health and interaction-audit harnesses; runtime invariant reporting; animation;
navigation and path-following; racing line, speed profile and driver AI; combat frame
data; application kits; `three-compat`; one input system; the audio scene-integration
API; `editor-runtime`.

**4. Which systems should use external engines internally?** Rigid bodies, colliders,
joints, CCD, character controller and vehicle suspension → **Rapier**. Audio DSP →
**Web Audio only**. Basis/KTX2 transcode → **loaders.gl** (already). Navmesh
generation → evaluate **recast** after the Rapier swap.

**5. Which systems should be deleted or archived?** Confirmed, per-file:

| Target | Lines | Basis |
|---|---:|---|
| 38 `*Fixtures.ts` across 8 packages | 10,720 | Descriptor objects, not simulations; ~0 app consumers |
| `packages/scripting` (GOAP/HTN/BT/UtilityAI/VisualGraph) | 5,837 | **SUPERSEDED (ADR 0001) — retained.** Public `./scripting` subpath; live `apps/editor` consumer; 8 production-path browser assertions |
| Video / episode / publishing surface in `engine` | 10,389 | 0 consumers; Node encoders in a browser package — **archive to own package** |
| `packages/ecs` | 1,480 | **SUPERSEDED (ADR 0001) — retained.** Public `./ecs` subpath, re-exported on the engine barrel; R8 blocked deletion |
| `rendering/threejs-compatibility/` stub systems | 354 | `SceneRenderer` returns hardcoded scene stats |
| Custom audio DSP (`Reverb.ts`, `Filter.ts`) | 69 | Web Audio already provides both |
| `external-parity-large-scene.spec.ts` hardcoded gate | ~60 | §3.4 |
| **Total** | **~28,900** | |

Plus `aura-js` demoted from default solver. A further ~11,100 lines of non-device
descriptor files in `packages/rendering` (`EnvironmentPlatform.ts`, `PbrReference.ts`,
`LightingRig.ts`, capability-report modules) are *candidates* — I did not verify each
one and some are load-bearing, so they need file-by-file triage rather than a bulk
delete.

**6. What is Aura3D's real moat?** Four concrete things, none of which Three.js has
any answer to:
- `aura.assets.json` — 90 assets, each with sha256, byte size, real bounds and centre,
  material readability, animation clip inventory, and humanoid-rig classification with
  matched/missing bone lists. Nothing in the Three.js ecosystem produces this.
- The CLI → typed `assets.*` map, so a route cannot reference an asset that doesn't
  exist, and provenance is machine-checkable.
- `create-aura3d` — 20 templates that scaffold a *running, tested* project.
- The evidence harnesses: route-health snapshots, the interaction audit that discovers
  and operates controls, and `checkSpatialInvariants`. These are why our own audits
  keep catching our own lies — including everything in §3.4.

**7. What did we build that is genuinely better than using Three.js?** Setup cost, and
it is measured, not asserted — from `external-parity-threejs-visual-parity/gap-report.md`,
same scene, same output: product configurator 15 lines vs 74; glTF asset review 10 vs
68; interior gallery 7 vs 54; interactive orbit 7 vs 48. Plus asset provenance,
scaffolding, and the audit harnesses (items in answer 6), all of which have no Three.js
counterpart.

**8. What did we build that is worse than an established external library?**
- Bundle size: **1.70x Three.js** on the equivalent benchmark (1,145,689 vs 671,968 B),
  and 7.25x over our own 80 KB budget at 579,953 B gzip.
- Physics solver: joints silently no-op'd on the default backend by our own comment;
  three separately-rediscovered vehicle defects; 1,081 lines duplicating a
  `RaycastVehicle` we ship and never import.
- Anisotropic material shading: visibly wrong against Three.js on Khronos'
  purpose-built test asset, and passing our gate anyway.
- 3D text: absent; Three.js has `TextGeometry`, troika, CSS2D/3D renderers.
- Breadth: Three.js has hundreds of examples and loaders. We have 11 showcase routes,
  3 of which are `prototype-blocked`.

**9. What would Aura3D 1.6 contain?** §7.

**10. How much existing work survives?** Of ~200,900 lines in `packages/*/src`:
- **Survives load-bearing and unchanged: ~75,000 lines (~37%)** — rendering's
  device+pipeline core (24,815), assets (16,574), CLI + create-aura3d + asset-index
  (20,768), animation (7,988), scene/math/core (~4,110), three-compat (1,210).
- **Survives with internals replaced or split: ~57,600 lines (~29%)** — the engine
  agent API minus the archived video surface (~45,000; needs splitting, not rewriting)
  and physics (12,631; API kept, solver swapped).
- **Archived or deleted: ~28,900 lines (~14%)** — itemised in answer 5.
- **Remainder ~39,000 (~19%): evidence tooling, editor-runtime, input, audio,
  navigation, workflows, product-studio, and the rendering descriptor files pending
  file-by-file triage** — kept and consolidated, not yet allocated.
- Public API surface: **effectively 100% preserved.** Packages: 27 → ~20.
- Examples: all 20 templates survive; the 3 blocked game routes need rebuilding.
- Tests: 421 unit + 331 browser files mostly survive; the mock-device performance
  baselines and the parity thresholds must be rewritten, and three gates deleted.
- Migration effort: the Rapier swap and the barrel split are each a multi-week
  workstream. The deletions are days.

**11. Can Aura3D credibly reach or exceed Three.js?** By category:
- **PBR / glTF product visualisation: yes, and we are close now.** 85 assets, median
  MAE 6.73. Fix anisotropy/iridescence/sheen and this is defensible.
- **Developer setup cost: already exceeds it.** Measured, 7 lines vs 48.
- **Asset pipeline and provenance: already exceeds it,** because Three.js does not
  compete here.
- **Bundle size: no, not until the barrel is split.** Currently disqualifying.
- **Breadth of features and loaders: no, and not in 1.6.** Do not claim it.
- **Physics and game feel: no on our own solver. Yes via Rapier plus our racing-line
  and kit layer** — but only after the kits actually consume the shared runtime.
- **WebGPU: genuinely competitive and genuinely narrow.** Real native pipelines, few
  routes.

**12. What should happen next?** Prioritised, and deliberately front-loaded with the
things that make every later measurement trustworthy:

1. **Delete the fabricated gates.** `external-parity-large-scene.spec.ts`'s hardcoded
   `cpuFrameMs`, and the raw-triangle benchmark's standing as render evidence. Nothing
   else can be believed until these are gone.
2. **Recalibrate glTF parity thresholds** until `anisotropy-strength-test` fails.
3. **Fix anisotropy, then iridescence and sheen** in `ShaderLibrary`.
4. **Split `agent-api/index.ts`;** move video/episode encoders out. Target ≤100 KB gzip
   for a cube. Make the bundle gate fail the build.
5. **Purge:** 38 fixtures files, `threejs-compatibility` stubs, custom audio DSP.
   Archive ECS, scripting, video surface.
6. **Rapier backend** behind the existing physics API; keep racing line, driver,
   telemetry, surface query. Delete `aura-js` as default.
7. **Rebuild the four game kits on the shared runtime** — the open PRD item WS-3.8/3.9.
8. **Consolidate** input and audio to one layer each.
9. **Real-device performance baselines** to replace the mock-device ones.
10. **3D text** and **context-loss recovery through the root API.**
11. **Then, and only then,** re-run the parity generator, re-measure the bundle, get a
    human visual review on the three blocked routes, and cut **1.6**.

Correct the record before any of this: `GameEngine-PRD.md` WS-3.8 still records
"route re-certification" as the blocker. Commit `be86c73e` disproved that — the real
gap was that nothing converted a route into a driveable speed plan. Fix the PRD text
first so the next session doesn't re-solve the wrong problem.

---

## 10. Two things I could not verify

- **Whether the renderer is fast.** Every GPU-timed measurement on disk is either
  mock-backed, hardcoded, or a raw triangle. The one real number is 15.4 ms for 33 draw
  calls and 2,048 instances. I cannot tell you how we compare to Three.js on frame time,
  and neither can any artifact in this repo. Item 9 above exists to change that.
- **Whether the three blocked routes are now acceptable.** That requires a human looking
  at them. Route statuses are untouched: `blockfall-reactor`, `skyline-runner` and
  `turbo-drift-circuit` all remain `prototype-blocked`.
