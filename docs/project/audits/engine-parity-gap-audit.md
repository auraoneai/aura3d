# Aura3D Engine Parity Gap Audit

> **Status note — superseded for remaining work (2026-07-29).**
> This document is retained as a historical record. The authoritative list of
> still-open work is `docs/project/plans/final-remaining-work-prd.md`, whose FS IDs
> supersede any checkbox, status line, or completion claim here. A checked item in
> this file does not override a failing or stale current artifact; where the two
> disagree, the current generated report wins.
> Three.js comparisons in this audit used the historical frozen
> `three@0.165.0` baseline and cannot support a current-market verdict.


Audit date: 2026-07-26 · Verified against commit `43ec8f59` (worktree at `e0f7e2e0` + prompt)
Scope: `@aura3d/engine` v1.4.5 rendering, physics, controls, and the root agent API path.

This is the Phase 1 deliverable of `docs/project/plans/engine-game-parity-execution-plan.md`. It records the
measured baseline, the nine ranked gaps against three.js, and for each: file:line evidence,
visual-quality cost, fix cost, and whether it blocks the Phase 3 game rebuilds.

Nothing was fixed while producing this document. Findings only.

Task tracking lives in `docs/project/plans/engine-game-parity-execution-plan.md` — that file is the numbered
checklist of open work and the handoff document. This file is the evidence behind it.

Status legend: `open` · `partial` · `done` · `dead-code`

---

## 1. Baseline — what the numbers actually are today

`tests/reports/` is gitignored (`.gitignore:43`), so no parity score was committed and there
was no "before" column to regress against. The four baseline commands were run fresh on
2026-07-27T04:55Z. The Phase 2 after run completed at 2026-07-28T04:59Z:

| Command | Before | After |
|---|---|---|
| `threejs-parity:inventory` | `pass: true`; 54 examples, 30 high-priority, 0 high-priority open, 54 matched | `pass: true`; 54 examples, 30 high-priority, **1 high-priority open**, 53 matched, 1 partial (`misc_controls_transform`) |
| `threejs-parity:same-scene-render` | `pass: true`; 54 candidates, 0 missing, 0 issues | unchanged: `pass: true`; 54 candidates, 0 missing, 0 issues |
| `threejs-parity:performance` | **`pass: false`**; all 6 evidence reports missing | unchanged: **`pass: false`**; the same 6 evidence reports remain missing |
| `engine-readiness:visual-quality` | `ok: true`; 187 canonical draw calls, `nonDarkRatio 0.674`, `salientRatio 0.109` | metrics unchanged because the command still reads the 2026-06-19 capture: `ok: true`; 187 canonical draw calls, `nonDarkRatio 0.674`, `salientRatio 0.109` |

The inventory change is an honesty correction, not a rendering regression:
`misc_controls_transform` now records the compatibility wrapper as partial because it does
not implement rendered handles, pointer dragging, axis/plane constraints, snapping, or
local/world gizmo spaces. The tool remains a hand-authored inventory rather than visual
proof.

### 1.1 The inventory "54/54 matched" number is not a quality measurement

Two independent reasons it cannot be used as a parity baseline:

**It is hand-authored.** `tools/threejs-parity-threejs-inventory/index.ts` contains 54
literal `item(...)` calls. The `a3dStatus` on each is a string typed by a human. Running the
tool re-serializes those literals to JSON; it renders nothing and compares nothing. A
`"matched"` entry means someone asserted a route exists, not that its output resembles the
three.js example.

**Its own claim boundary says so.** The report carries a `claimBoundary` field, and
`docs/project/status/known-limits.md` is the declared authority. Where the two disagree, the narrower
wording wins.

Concretely: `webgl_postprocessing_ssao` and `webgl_postprocessing_dof` are both listed
`"matched"`, yet SSAO and DOF have no GPU implementation at all (gap 1). `webgl_shadowmap` is
`"matched"` at `priority: "high"` while cascaded shadows are dead code (gap 3).
`misc_controls_orbit` is `"matched"` at `priority: "high"` on the strength of the `input`
package implementation, not the `controls` one (gap 8). The inventory is a coverage
checklist, not a fidelity measure.

### 1.2 The performance gate fails on missing evidence

`performance.json` reports `pass: false` with six `missing` entries, each a `warning`:
`production-runtime-performance-baselines.json`,
`production-runtime-large-scene-performance.json`,
`three-compat-performance-baselines.json`, `comparison-threejs.json`,
`threejs-parity/instancing-parity.json`,
`superiority/resource-lifecycle-100-reloads.json`.

There is currently **no frame-time or draw-call comparison against three.js in this
worktree.** The tool's `claim` string asserts A3D "matches or exceeds Three.js … where the
evidence supports it" — the evidence set is empty, so the claim is presently unsupported.
Any performance statement in docs or marketing must be treated as unbacked until these six
reports are regenerated.

### 1.3 The visual-quality capture is five weeks stale

`engine-readiness-visual-quality.json` reports `ok: true`, but it derives entirely from
`tests/reports/engine-readiness-canonical-scene/manifest.json`, whose `generatedAt` is
**2026-06-19T08:50:14Z** — 38 days before this audit, and well before the PMREM and
OrbitControls work at `606c826d`. The `ok: true` describes June geometry.

Recorded for the "after" column anyway, since it is the only visual metric that exists:
canonical `drawCalls 187`, `hash d1142bab`, `nonDarkRatio 0.6738`, `salientRatio 0.1093`,
`edgePixelRatio 0.0138`, `flatPixelRatio 0.9176`, `colorBuckets 298`,
`dominantBucketRatio 0.5625`; material-variant `drawCalls 187`, `hash 4d9fc1db`,
`colorBuckets 326`, `dominantBucketRatio 0.3105`; shadow-toggle `drawCalls 94`,
`hash 4d56c39e`.

`flatPixelRatio 0.9176` — 92% of the canonical frame has no local contrast — is itself
consistent with the gaps below: no MSAA on offscreen targets, no cascades, and a
tone-map/color-grade/FXAA-only GPU post chain.

### 1.4 The only committed verdicts are both non-passing

Per task 1.3, neither may be treated as a baseline pass:

`benchmark/results/aura3d-106-peer-benchmark-report.json` — release **1.0.9** (three minor
versions behind the current 1.4.5), `status: "scoped-pass"`. Its
`scope` reads: "Aura3D public agent API versus low-level Three.js-style renderer evidence.
This is not Unity or Unreal parity evidence." Metrics: `auraDrawCalls 333` /
`auraNonDarkPixels 45866` versus `threeChildren 75` / `threeNonDarkPixels 13289`. Note the
axes are not comparable — draw calls against child count — so this is not a like-for-like
render comparison. It explicitly does not rank Aura3D above Unity, Unreal, or Babylon.

`benchmark/results/round-50.md` — `owner-skipped / pending`, blocked on a missing
`benchmark/runs/round-50/human-review.json`.

### 1.5 Tooling caveat — most gates assert on source tokens

Recorded per task 1.5. Most `tools/` gates emit a boolean `checks[]` of
`{ id, ok, detail }`. Several assert on the presence of **source tokens** rather than on
behavior: `game-runtime-readiness` greps `package.json` and greps an agent report for literal
strings. `threejs-parity-threejs-inventory` is the 54 hand-authored entries described above.

Passing a gate is therefore not proof of quality, and token-shaped gates are trivially
gameable. Per `benchmark/rubric.md`, internal tools "cannot score visual quality, decide
wins, or certify release readiness." Do not self-certify. The frozen release bar is ≥7/10
prompts per agent, ≥2 wins from prompts 7/8/10, ≥4 visual scores ≥4, none <3 — none of which
an internal tool can adjudicate.

---

## 2. Ranked gaps

Ranking is by visual-quality cost weighted by whether it blocks Phase 3.

| # | Gap | Priority | Status | Blocks games? |
|---|---|---|---|---|
| 1 | Post-processing runs on the CPU | P0 | renderer-owned ports native; explicit CPU reference retained | **Yes — all four** |
| 2 | PMREM was a box blur | P0 | done | No |
| 3 | Cascaded shadow maps are dead code | P0 | done — live renderer wiring and pixel proof | **Yes — racing, runner** |
| 4 | Root agent path disables its own optimizations | P0 | done | No |
| 5 | MSAA is only the context flag | P1 | done — offscreen resolve on WebGL2 and WebGPU | Yes — quality ceiling |
| 6 | Hard 16-light cap | P1 | implemented — clustered forward with safe fallback | No |
| 7 | Physics fidelity ceiling | P1 | route decision implemented | No |
| 8 | Duplicate OrbitControls | P1 | done | No |
| 9 | Features the codebase already declares missing | P1 | correctly disclosed | No |

---

### Gap 1 — Post-processing runs on the CPU · P0 · partial

The largest architectural divergence from three.js.

**Evidence.** `postprocess/EffectComposer.ts:149` and `:158` call a synchronous
`this.device.readPixels(0, 0, current.width, current.height)`, then dispatch to
`bloomPixels:317`, `ssaoPixels:333`, `taaPixels:337`. The implementations are JavaScript
loops over `Uint8Array` in `PostProcessPass.ts`: `ssaoPixels:1182`, `taaPixels:1344`,
`bloomPixels:1370`, `ssrPixels:1302`, `depthOfFieldPixels:1077`, `motionBlurPixels:1130`,
`outlinePixels:969`, `contactShadowPixels:1230`, `chromaticAberrationPixels:930`,
`filmGrainPixels:1036`. The same pattern repeats in `ExternalParityRenderPreset.ts:409-427`.
Readback is a blocking `gl.readPixels` (`WebGL2Device.ts:642-660`). `Renderer.ts` calls
`readRenderTargetPixelsAsync` at `:907`, `:967`, `:973`, `:976`, `:999`, `:1049`.

The only GPU path is `presentLdrPostprocess` (`WebGL2Device.ts:555`, interface declared
`RenderDevice.ts:231`, called `Renderer.ts:870-871` and `:987-988`).
`canFuseLdrPostprocess` (`Renderer.ts:1783-1792`) admits only `tone-mapping`,
`color-grade`, and `fxaa`, and only in `ldrFusionPassRank` order (`:1794-1799`).

**Implemented (2.1-2.9).** Bloom now runs as bright extract, horizontal/vertical ping-pong
blur, and composite fullscreen stages using the precomputed threshold/composite LUTs.
Outline runs an integer Sobel predicate, circular dilation, and blend-LUT fullscreen stage.
Bloom, outline, SSAO, SSR, depth-of-field, explicit-velocity motion blur, and
explicit-history TAA extend renderer and plan fusion consistently. Real WebGL2 readback
matches the CPU fixtures within a stated one-byte tolerance (with exact fixed-fixture
matches for bloom and outline). `postprocess.execution: "cpu-deterministic"` retains the
reference kernels behind an explicit flag.

**Visual cost.** Every frame stalls the GPU pipeline on a synchronous readback, then burns
CPU on per-pixel JS. In practice this forces routes to disable post-processing to stay
interactive, which is why the games read flat — see `flatPixelRatio 0.9176` in §1.3. Bloom,
ambient occlusion, and depth of field are the three effects that most separate a
"renderer that draws triangles" from one that looks finished, and none of them are available
at interactive rates.

**Fix cost.** Large. Seven fragment-shader ports (2.1-2.7) plus ping-pong FBO plumbing and
fusion-rank extension. Bloom and outline are cheapest because their exact lookup tables
already exist.

**Blocks games?** Yes, all four. Rebuilding game visuals on a CPU post chain wastes the
effort — this is why the prompt gates Phase 3 behind it.

**Note on prior work.** `packages/rendering/src/postprocess/NativeLdrEffectLuts.ts` (landed
`e0f7e2e0`) holds exact LUTs: a bloom bright-extract bitset, a 256×256 composite table, a
256-entry outline blend table, and a BigInt outline gradient bound. Bloom and outline now
consume these tables in `WebGL2Device`; the verifier reports all
checks passing over 134,217,728 colors, 589,824 byte pairs, 15,360 channel entries, and
32,880 numerator pairs, with 2 known float64-vs-exact disagreements at
`t=0.02 gx=51000` and `t=0.22 gx=561000`.

---

### Gap 2 — PMREM was a box blur · P0 · done

**Resolved at `606c826d`.** `EnvironmentMapResources.ts:244` now runs GGX
importance-sampled prefiltering via the 628-line `SpecularPrefilter.ts`. Per-level roughness
comes from the filter's own `specularPrefilterLevelRoughness` schedule instead of the old
post-hoc `index / (levels - 1)`. `PMREM.ts` reports
`filterModel: "ggx-importance-sampled-equirect-prefilter"`. Covered by
`tests/unit/rendering/specular-prefilter.test.ts`, `environment-map-resources.test.ts`,
`shader-library.test.ts`.

**Sub-item 2.10 verified complete 2026-07-27.** Despite its historical
`generateApproximateBrdfLutPixels` export name, the implementation at `606c826d` performs
deterministic Hammersley-sampled GGX split-sum integration. The test oracle uses independent
midpoint quadrature, locks reference bytes, and includes a white-furnace energy-conservation
check. `pnpm exec vitest run tests/unit/rendering/environment-map-resources.test.ts` passes
14/14.

---

### Gap 3 — Cascaded shadow maps are dead code · P0 · done

**Original evidence.** `CascadedShadowMaps.ts` and `shadows/CascadedShadowPipeline.ts` export
`CascadedShadowMaps`, `CascadedShadowPass`, and `supportsCascadedShadowLight`.
`rg -c "cascade" packages/rendering/src/Renderer.ts packages/rendering/src/ForwardPass.ts`
returned **zero matches in both files** on 2026-07-26. No render path reached the cascade
code at audit time.

Consumers are: `packages/rendering/src/index.ts` (re-export),
`packages/rendering/src/LightingDebug.ts` (a `CascadeSplit` *type* import only),
`shadows/ShadowDebugViews.ts`, `packages/rendering/README.md`, `docs/api/public-api.md`,
`tools/external-parity-shadow-readiness/`, `tools/external-parity-shadow-map-readiness/`,
`tools/requirements-trace/`, and four test files
(`lighting-debug-cascades.test.ts`, `shadow-pass.test.ts`,
`rendering-foundation-labs.spec.ts`, `external-parity-shadow-quality.spec.ts`).

**Implemented (2.11-2.12).** Directional renderer shadows now accept two to four cascades,
compute stabilized frustum fits, render and retain a live depth target per cascade, and
select the binding and light matrix in `ForwardPass` from camera-space draw depth. A live
renderer test proves four depth passes and distinct near/far bindings; a deterministic
pixel-buffer test shows the selected mid-distance cascade has smaller world-space texels and
more distinct diagonal edge steps than one full-range map.

**Visual cost.** Severe aliasing at distance in any scene with a large view frustum. A
1024px map stretched across a race track or a runner's draw distance gives roughly
metre-scale shadow texels — stair-stepped, swimming shadow edges.

**Fix cost.** Medium to wire (2.11a): the pipeline exists and is tested in isolation, so the
work is frustum-split selection and per-cascade matrix upload in `Renderer.ts` +
`ForwardPass.ts`. Small to delete (2.11b), but touches nine non-test files and four test
files.

**Blocks games?** Yes for Turbo Drift Circuit and Skyline Runner, both of which have long
sight lines. Aura Clash is a bounded arena and Blockfall a bounded board, so both tolerate a
single map.

**Recommendation.** Wire it. The expensive part is already written and tested; deleting
would discard a working implementation and would also require walking back the shadow claims
in `docs/api/public-api.md` and two shadow-readiness gates.

**DECISION (2026-07-26, owner): wire it.** Task 2.11a proceeds; 2.11b (delete) is cancelled.
Frustum-split selection and per-cascade matrix upload go into `Renderer.ts` and
`ForwardPass.ts`. The existing `CascadedShadowPipeline` is the implementation — do not
rewrite it. Shadow claims in `docs/api/public-api.md` stay as written only once a pixel test
proves cascades are reached from a live render path.

---

### Gap 4 — Root agent path disables its own optimizations · P0 · partial

**Fixed.** `createProductionRendererInput` now sets `staticBatching: true` and
`frustumCulling: true` (`packages/engine/src/agent-api/index.ts:10423-10424`; both were
`false`).

**Fixed (2.13).** `createProductionRuntimeCollectedLights` now derives directional, point,
studio, rect, and softbox direct-light descriptors from the authored scene snapshot, keeps
ambient intent separate, and selects one shadow caster deterministically. The old key/fill/rim
rig remains only as an explicitly diagnosed fallback for scenes without authored direct
lights.

**Fixed (2.14).** The frozen postprocess and shadow constants are removed. Production-runtime
postprocess responds to category, authored bloom, and emissive content. Shadow enablement,
1024/2048/4096 resolution, bias, strength, and PCF settings respond to the selected caster,
scene extent, and category.

**Remaining visual cost.** The root bridge now distinguishes authored lighting and quality
profiles, but its scene-category heuristics remain bounded production-runtime defaults rather
than an automatic art-direction system.

**Fix cost.** Medium for 2.13 — needs a light-derivation pass over scene content. Small for
2.14 once 2.13 establishes the scene-inspection plumbing.

**Blocks games?** Yes, all four. Scene-driven lighting is a precondition for the games
looking distinct from one another.

**Note.** `index.ts` is ~13,500 lines. Splitting it (2.15) must be a separate isolated
change; bundling it with 2.13/2.14 would make both unreviewable.

---

### Gap 5 — MSAA is only the context flag · P1 · done

**Original evidence.** `antialias: true` was passed at context creation, but
`rg -c "sampleCount|renderbufferStorageMultisample" packages/rendering/src/WebGL2Device.ts`
returned **zero matches** on 2026-07-26.

**Implemented (2.16-2.17).** Render targets expose `sampleCount`. WebGL2 allocates
multisampled color/depth renderbuffers and resolves into sampleable textures with
`blitFramebuffer`; WebGPU allocates a four-sample attachment, matching pipeline multisample
state, and a color `resolveTarget`. Renderer-owned postprocess requests four samples by
default where its attachment requirements permit. Diagnostics expose the maximum live
render-target sample count, and a real WebGL2 pixel fixture proves a diagonal four-sample
edge contains intermediate coverage pixels while the single-sample edge remains binary.

**Visual cost.** Jagged geometry edges throughout. FXAA is a blur heuristic over an already
aliased image; it cannot recover subpixel coverage. Consistent with the measured
`edgePixelRatio 0.0138`.

**Fix cost.** Medium. Needs `renderbufferStorageMultisample`, a `sampleCount` render-target
option, and a `blitFramebuffer` resolve-to-texture step, plus the WebGPU equivalent for
backend parity.

**Blocks games?** Not functionally, but it is a hard ceiling on how finished any route can
look.

---

### Gap 6 — Hard 16-light cap · P1 · implemented

**Evidence.** `MAX_DIRECT_LIGHTS = 16` (`packages/rendering/src/LightUniforms.ts:4`), packed
into a fixed `u_lightData` array of `MAX_DIRECT_LIGHTS * 4` vec4 slots (`:17`) backed by a
`Float32Array(MAX_DIRECT_LIGHTS * floatsPerLight)` (`:25`). There is no clustered or deferred
path. Point-light shadows throw when the device lacks render-target pixel upload
(`Renderer.ts:1196`).

**Interim safety fixed (2.18a).** `LightUniforms.pack()` now scores contribution
deterministically, retains the strongest 16 lights, and returns structured diagnostics naming
the selected and dropped lights. Exact-boundary and above-boundary tests verify input-order
preservation at 16 and deterministic graceful degradation above 16.

**Clustered-forward fix (2.18b-2.19).** Forward rendering now builds a 64-pixel screen-tile
grid, projects point and spot light ranges into affected tiles, retains directional lights
globally, uploads an RGBA32F light-data texture plus per-tile index texture, and performs
shader-side tile lookup. The global 16-light truncation is removed for the core, instanced,
skinned, normal-mapped, and default textured PBR paths on WebGL2 and for native PBR paths on
WebGPU. Texture-heavy extension variants preserve the deterministic 16-light fallback to
stay within the common WebGL2 16-fragment-sampler budget.

The 64-light bound is per tile rather than global. Diagnostics report requested and indexed
lights, local lights culled outside the viewport, total tile references, peak tile
occupancy, and lights dropped by per-tile overflow.

**Proof.** Unit coverage verifies the exact 16-light boundary, deterministic degradation,
17-light cluster packing, projected local-light tile assignment, renderer texture binding,
native WebGPU cluster bindings/WGSL lookup, and sampler-budget fallback. A real Chromium
WebGL2 pixel test renders 16 weak white lights and then a weaker 17th red light; only the red
channel increases, proving that a light excluded by the legacy fallback contributes through
the clustered shader path. The WebGPU parity browser suite and focused rendering tests pass.

**Fix cost.** Implemented.

**Blocks games?** No.

**Recommendation.** The prompt requires a recorded decision (2.18). Take the documented cap
plus graceful diagnostic: sort by contribution, keep 16, emit a diagnostic naming the
dropped count. Clustered forward is a multi-week project and none of the four games need
more than a bounded light count if the degradation is honest. **Do not silently raise the
constant** — that trades a loud failure for a quiet performance cliff.

**DECISION (2026-07-26, owner): implement clustered forward rendering.** The cap is removed
properly rather than documented. This overrides the recommendation above and is the largest
single item in Phase 2 — a light-cluster grid (froxel or screen-tile), a per-cluster light
index list in a storage/texture buffer, and shader-side cluster lookup replacing the fixed
`u_lightData` array walk, on both the WebGL2 and WebGPU backends.

Sequencing consequence: this lands **after** gaps 1, 3, and 4 so the Phase 3 gate has
passing pixel tests to show before the multi-week item completes. Graceful degradation is
still implemented first as an interim safety net, so the `RangeError` at
`LightUniforms.ts:21-22` stops being a live crash path while clustered work proceeds.

---

### Gap 7 — Physics fidelity ceiling · P1 · route decision implemented

**Evidence.** `buildContact()` at `packages/physics/src/PhysicsWorld.ts:686` (called from
`:330`) implements hand-written narrow-phase for six pairs only: plane↔any, sphere↔sphere,
sphere↔box, capsule↔sphere, capsule↔box, capsule↔capsule. **Everything else falls back to
AABB overlap resolved on the minimum penetration axis.**

At the 2026-07-26 baseline,
`rg -c "gjk|convexHull|timeOfImpact" packages/physics/src` returned **zero matches**. There
was no convex hull, GJK/EPA, mesh or heightfield narrow-phase, or CCD.

`inverseInertia` is a diagonal `Vec3` (`RigidBody.ts:30`, constructed `:88`, inverted
`:264`). Contact impulses generate **no torque** — `applyImpulse` touches
`angularVelocity` (`:155`) but the contact resolver does not route through it — so contact
resolution is purely linear. At the baseline, friction also clamped against
`μ·(|Jn| + penetration)` rather than a Coulomb cone on accumulated normal impulse.

**Visual cost.** Boxes do not tumble. A box dropped on a corner settles flat, which reads as
obviously wrong to anyone who has seen a physics engine. Fast movers tunnel through
geometry. Box↔box — the single most common game collision pair — resolves as AABB overlap,
so stacked or angled boxes interpenetrate and jitter.

**Fix cost.** Large for full narrow-phase. Medium for the minimum viable set: angular
response from contact impulses, plus CCD or a documented tunneling limit.

**Blocks games?** Yes for Blockfall Reactor (stacked boxes are the entire game) and Turbo
Drift Circuit (fast movers tunnel).

**DECISION (2026-07-26, owner): route Blockfall Reactor and Turbo Drift Circuit through the
existing `cannon-es@0.20.0` backend.** No new native solver work. The `aura-js` narrow-phase
keeps its six pairs and its AABB fallback, and that limitation is documented rather than
fixed. Aura Clash Arena stays on `HitboxWorld`; Skyline Runner is unaffected.

**Implemented (2.20-2.22).** Both routes select `cannon-es` in source and publish the
selection in runtime evidence. Route and package tests prove Cannon angular contact response
with an off-axis falling box. Because `cannon-es@0.20.0` does not expose native swept
time-of-impact, Aura3D's explicitly named adaptive-substep wrapper bounds per-step motion,
rejects steps that exceed its configured guarantee, and prevents the tested fast mover from
tunneling. The evidence names the provider rather than attributing CCD to Cannon itself.

**Phase 2B update.** Native friction now projects accumulated tangent impulse onto the
`|Jt| <= μ·Jn` Coulomb cone. `@aura3d/physics` exports a conservative swept-bounds
`timeOfImpact(...)` query, and the existing adaptive-substep continuous-collision contract
now protects `aura-js` as well as `cannon-es`, including force/history preservation and a
configured-guarantee rejection path. Native oriented box SAT, convex/mesh/heightfield
narrow-phase, and angular contact impulses did not land after their two allowed attempts.

**Follow-on remediation update.** A later explicitly requested pass added rotation-aware
broadphase bounds, 15-axis OBB SAT, convex-hull GJK/EPA with a degeneracy fallback, and
triangle-backed contacts for box/convex/sphere/capsule shapes against indexed meshes and
heightfields. Focused tests prove both rotated AABB false-positive rejection and real
rotated overlap, plus each new shape family. The next remediation task routed proven
contact points through linear/angular relative velocity and world-space principal inertia,
with point-aware normal and friction effective mass. A native corner-drop box develops
angular velocity and tumbles, while centered support faces, the three-box sleep test, and
capsule settling remain stable. The per-game backend choice must still be stated wherever
physics fidelity is claimed.

---

### Gap 8 — Duplicate OrbitControls · P1 · done, stubs open

**Resolved at `606c826d`.** `packages/controls/src/OrbitControls.ts` went 25 → 176 lines and
now delegates all camera math to the `@aura3d/input` engine when a camera is attached.
Detached mode is documented as bookkeeping-only and carries no parity claim. `MapControls`
delegates damping. Covered by `tests/unit/controls/orbit-controls-delegation.test.ts`.

**Resolved (2.23).** Fly, first-person, map, and pointer-lock controls now delegate to the
input engines; selection is observable. DragControls and TransformControls retain functional
explicit-delta compatibility shims with typed deprecation contracts that name their supported
replacements.

**Resolved (2.24).** The inventory now scopes `misc_controls_orbit` to the delegated proof
and cites the controls-package delegation test. `misc_controls_transform` is lowered from
`"matched"` to `"partial"` and names the missing interactive gizmo, picking, constraint,
snapping, and local/world-space semantics.

**Blocks games?** No.

---

### Gap 9 — Features the codebase already declares missing · P1 · correctly disclosed

`packages/rendering/src/EnvironmentPlatform.ts` maintains an honest ledger with a
`"missing" | "partial" | "helper"` status enum (`:29`). Notable entries: `exr-parser` —
"EXRLoaderThreeCompat is diagnostic-only and does not decode OpenEXR pixels" (`:260`);
`cube-camera-reflections` was descriptor-only at this Phase 1 baseline and was subsequently
implemented by task 2B.3 with six-face capture and moving-object reflective pixel evidence;
`atmospheric-scattering` is documented unsupported. Phase 2B subsequently added bounded
scene-space transmission/refraction, depth-aware radial volumetric light, and generated
terrain heightfield geometry with browser pixels. The follow-on remediation pass added
finite, one-sided rectangular emitters using deterministic surface quadrature across all
PBR-family shaders, with size-dependent WebGL2 pixel evidence. Exact three.js LTC
lookup-table identity and rectangular-light shadow maps remain separately excluded, as do
planar mirrors, physical caustics, physical atmosphere, and native terrain collision
response.

Ten environment presets are `"helper"` — geometry descriptors, not rendering features —
consistent with `packages/environments/src` totalling only 469 LOC.

**Phase 1 assessment:** the disclosures were honest. Phase 2B resolved eight implemented
ledger entries and documented atmospheric scattering and EXR as unsupported. The follow-on
remediation pass then promoted linear and exponential fog after a deterministic synthetic
WebGL2 harness proved no-fog/linear/exponential-squared object-pixel deltas and retained a
full-page screenshot without relying on authored GLBs. The ledger changes carry their proof
in the same task commits. The same rule promoted `analytical-studio-box` only after the
rectangular-emitter harness proved more than 1,000 size-dependent and one-sided changed
pixels and retained its own screenshot.

**Standing rule (2.25).** If a Phase 2 task implements a ledger entry, flip its status **and**
attach the proof in the same commit. Never flip without proof.

---

## 3. Cross-cutting findings

**The four games look basic for four compounding reasons, not one.** Gap 1 removes bloom,
AO, and DOF from the interactive budget. Gap 4 gives every scene the same three-light rig
and the same 1024px shadow map. Gap 5 leaves all offscreen rendering unantialiased. Gap 3
makes distant shadows alias. Fixing any one in isolation will not visibly change the
screenshots — which is the argument for the prompt's Phase 2 → Phase 3 gate.

**The renderer itself is not the problem.** Cook-Torrance GGX with a separate clearcoat lobe
(`ShaderChunks.ts:57-113`), IBL via `textureLod` with equirect and cube bindings
(`ShaderLibrary.ts:382-543`), instanced drawing (`WebGL2Device.ts:807-817`), GPU skinning
with per-geometry joint validation (`ForwardPass.ts:272-300`), GPU morph targets with CPU
fallback (`ForwardPass.ts:1418-1440`), frustum culling against real AABBs
(`Renderer.ts:1981`), a distinct transmission sort bucket (`RenderItemSorting.ts:41-71`),
and a ~2,877-line WebGPU backend are all real. The gaps are in the post-chain, the shadow
path, the light packing, and the agent-API defaults.

**Three of the nine gaps were decisions, not implementations — all three are now taken.**
Gap 3: **wire** the cascade pipeline. Gap 6: **implement clustered forward**, removing the
16-light cap properly. Gap 7: **route Blockfall and Turbo Drift through `cannon-es`**, leaving
the native solver's limits documented rather than fixed. Recorded 2026-07-26 by the owner;
see each gap section for the full decision text and its consequences.

Gap 6 taking the clustered path rather than the documented-cap path makes it the largest item
in Phase 2. It is therefore sequenced last among the P0/P1 renderer work, with graceful
degradation landing first as an interim safety net so the `RangeError` stops being a live
crash path in the meantime.

**Evidence hygiene is the binding constraint on claims.** The performance gate fails on six
missing reports (§1.2), the visual-quality capture is 38 days stale (§1.3), both committed
verdicts are non-passing (§1.4), and the headline 54/54 inventory number is hand-authored
(§1.1). Until those are addressed, no performance or parity claim in docs or marketing has
backing, and Phase 4 must lower rather than raise the affected labels.
