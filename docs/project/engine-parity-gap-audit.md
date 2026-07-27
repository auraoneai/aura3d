# Engine Parity Gap Audit

Audit date: 2026-07-26 · Verified against commit `43ec8f59` (worktree at `e0f7e2e0` + prompt)
Scope: `@aura3d/engine` v1.4.5 rendering, physics, controls, and the root agent API path.

This is the Phase 1 deliverable of `docs/project/parity-execution-prompt.md`. It records the
measured baseline, the nine ranked gaps against three.js, and for each: file:line evidence,
visual-quality cost, fix cost, and whether it blocks the Phase 3 game rebuilds.

Nothing was fixed while producing this document. Findings only.

Status legend: `open` · `partial` · `done` · `dead-code`

---

## 1. Baseline — what the numbers actually are today

`tests/reports/` is gitignored (`.gitignore:43`), so no parity score was committed and there
was no "before" column to regress against. The four baseline commands were run fresh on
2026-07-27T04:55Z. Results:

| Command | Report | Verdict | Key numbers |
|---|---|---|---|
| `threejs-parity:inventory` | `threejs-parity/threejs-inventory.json` | `pass: true` | 54 examples, 30 high-priority, 0 high-priority open, `byStatus: { matched: 54 }` |
| `threejs-parity:same-scene-render` | `threejs-parity/same-scene-render.json` | `pass: true` | 54 candidates, 0 missing, 0 issues |
| `threejs-parity:performance` | `threejs-parity/performance.json` | **`pass: false`** | all 6 evidence reports missing |
| `engine-readiness:visual-quality` | `engine-readiness-visual-quality.json` | `ok: true` | 187 draw calls canonical, `nonDarkRatio 0.674`, `salientRatio 0.109` |

### 1.1 The inventory "54/54 matched" number is not a quality measurement

Two independent reasons it cannot be used as a parity baseline:

**It is hand-authored.** `tools/threejs-parity-threejs-inventory/index.ts` contains 54
literal `item(...)` calls. The `a3dStatus` on each is a string typed by a human. Running the
tool re-serializes those literals to JSON; it renders nothing and compares nothing. A
`"matched"` entry means someone asserted a route exists, not that its output resembles the
three.js example.

**Its own claim boundary says so.** The report carries a `claimBoundary` field, and
`docs/project/known-limits.md` is the declared authority. Where the two disagree, the narrower
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
| 1 | Post-processing runs on the CPU | P0 | open | **Yes — all four** |
| 2 | PMREM was a box blur | P0 | done, 1 sub-item open | No |
| 3 | Cascaded shadow maps are dead code | P0 | dead-code | **Yes — racing, runner** |
| 4 | Root agent path disables its own optimizations | P0 | partial | **Yes — all four** |
| 5 | MSAA is only the context flag | P1 | open | Yes — quality ceiling |
| 6 | Hard 16-light cap | P1 | open | Yes — arena |
| 7 | Physics fidelity ceiling | P1 | open | **Yes — blockfall, racing** |
| 8 | Duplicate OrbitControls | P1 | done, stubs open | No |
| 9 | Features the codebase already declares missing | P1 | correctly disclosed | No |

---

### Gap 1 — Post-processing runs on the CPU · P0 · open

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

**SSAO, SSR, DOF, motion blur, TAA, and bloom have no GPU implementation.** In three.js all
six are fullscreen fragment shaders.

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
256-entry outline blend table, and a BigInt outline gradient bound. Its verifier reports all
checks passing over 134,217,728 colors, 589,824 byte pairs, 15,360 channel entries, and
32,880 numerator pairs, with 2 known float64-vs-exact disagreements at
`t=0.02 gx=51000` and `t=0.22 gx=561000`. **Nothing consumes these LUTs outside
`tools/verify-native-ldr-luts.ts`** — confirmed by search: the only three files referencing
them are `PostProcessPass.ts`, the LUT module itself, and the verifier. This is the
highest-value unconsumed asset in the repo. Do not extend it; consume it in 2.1-2.2.

---

### Gap 2 — PMREM was a box blur · P0 · done, one sub-item open

**Resolved at `606c826d`.** `EnvironmentMapResources.ts:244` now runs GGX
importance-sampled prefiltering via the 628-line `SpecularPrefilter.ts`. Per-level roughness
comes from the filter's own `specularPrefilterLevelRoughness` schedule instead of the old
post-hoc `index / (levels - 1)`. `PMREM.ts` reports
`filterModel: "ggx-importance-sampled-equirect-prefilter"`. Covered by
`tests/unit/rendering/specular-prefilter.test.ts`, `environment-map-resources.test.ts`,
`shader-library.test.ts`.

**Open sub-item (2.10).** The split-sum BRDF LUT is still `generateApproximateBrdfLutPixels`
— an analytic approximation, not a real split-sum integration. Cost: small, self-contained.
Visual impact: modest and mostly at grazing angles on smooth metals. Does not block games.

---

### Gap 3 — Cascaded shadow maps are dead code · P0 · dead-code

**Evidence.** `CascadedShadowMaps.ts` and `shadows/CascadedShadowPipeline.ts` export
`CascadedShadowMaps`, `CascadedShadowPass`, and `supportsCascadedShadowLight`.
`rg -c "cascade" packages/rendering/src/Renderer.ts packages/rendering/src/ForwardPass.ts`
returns **zero matches in both files** (verified 2026-07-26). No render path reaches the
cascade code.

Consumers are: `packages/rendering/src/index.ts` (re-export),
`packages/rendering/src/LightingDebug.ts` (a `CascadeSplit` *type* import only),
`shadows/ShadowDebugViews.ts`, `packages/rendering/README.md`, `docs/api/public-api.md`,
`tools/external-parity-shadow-readiness/`, `tools/external-parity-shadow-map-readiness/`,
`tools/requirements-trace/`, and four test files
(`lighting-debug-cascades.test.ts`, `shadow-pass.test.ts`,
`rendering-foundation-labs.spec.ts`, `external-parity-shadow-quality.spec.ts`).

Directional shadows therefore use a single 1024px map.

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

---

### Gap 4 — Root agent path disables its own optimizations · P0 · partial

**Fixed.** `createProductionRendererInput` now sets `staticBatching: true` and
`frustumCulling: true` (`packages/engine/src/agent-api/index.ts:10423-10424`; both were
`false`).

**Still open.** `createProductionRuntimeCollectedLights` (`:10240`) returns a hardcoded
three-directional-light rig — key, fill, rim, one shadow caster — regardless of scene
content (2.13). `PRODUCTION_RUNTIME_POSTPROCESS` (`:10157`) and
`PRODUCTION_RUNTIME_SHADOWS` (`:10179`, 1024px PCF) are frozen module constants (2.14).

**Visual cost.** Every scene built through the root agent API is lit identically. A dark
interior, a bright outdoor track, and a neon arena all receive the same three-light rig and
the same 1024px shadow map. This is a large part of why the four games look like each other.

**Fix cost.** Medium for 2.13 — needs a light-derivation pass over scene content. Small for
2.14 once 2.13 establishes the scene-inspection plumbing.

**Blocks games?** Yes, all four. Scene-driven lighting is a precondition for the games
looking distinct from one another.

**Note.** `index.ts` is ~13,500 lines. Splitting it (2.15) must be a separate isolated
change; bundling it with 2.13/2.14 would make both unreviewable.

---

### Gap 5 — MSAA is only the context flag · P1 · open

**Evidence.** `antialias: true` is passed at context creation (`WebGL2Device.ts:191`), but
`rg -c "sampleCount|renderbufferStorageMultisample" packages/rendering/src/WebGL2Device.ts`
returns **zero matches** (verified 2026-07-26). FBOs are created with plain
`DEPTH_COMPONENT24` and single-sampled colour attachments (`:409-432`).

Every render target is single-sampled. The context flag only affects the default framebuffer,
so any scene that routes through an offscreen target — which is every scene with
post-processing — gets no MSAA whatsoever. The sole edge-antialiasing available is the fused
FXAA pass.

**Visual cost.** Jagged geometry edges throughout. FXAA is a blur heuristic over an already
aliased image; it cannot recover subpixel coverage. Consistent with the measured
`edgePixelRatio 0.0138`.

**Fix cost.** Medium. Needs `renderbufferStorageMultisample`, a `sampleCount` render-target
option, and a `blitFramebuffer` resolve-to-texture step, plus the WebGPU equivalent for
backend parity.

**Blocks games?** Not functionally, but it is a hard ceiling on how finished any route can
look.

---

### Gap 6 — Hard 16-light cap · P1 · open

**Evidence.** `MAX_DIRECT_LIGHTS = 16` (`packages/rendering/src/LightUniforms.ts:4`), packed
into a fixed `u_lightData` array of `MAX_DIRECT_LIGHTS * 4` vec4 slots (`:17`) backed by a
`Float32Array(MAX_DIRECT_LIGHTS * floatsPerLight)` (`:25`). `pack()` hard-throws a
`RangeError` above the cap (`:21-22`). There is no clustered or deferred path. Point-light
shadows throw when the device lacks render-target pixel upload (`Renderer.ts:1196`).

**Visual cost.** Caps scene complexity for any lighting-dense scene. A neon arena wants far
more than 16 emissive sources. The failure mode is worse than the cap itself: a `RangeError`
thrown from the render path rather than graceful degradation to the 16 most significant
lights.

**Fix cost.** Large for clustered forward. Small for the graceful-degradation path.

**Blocks games?** Yes for Aura Clash Arena — a neon arena is exactly the lighting-dense case
the cap forbids.

**Recommendation.** The prompt requires a recorded decision (2.18). Take the documented cap
plus graceful diagnostic: sort by contribution, keep 16, emit a diagnostic naming the
dropped count. Clustered forward is a multi-week project and none of the four games need
more than a bounded light count if the degradation is honest. **Do not silently raise the
constant** — that trades a loud failure for a quiet performance cliff.

---

### Gap 7 — Physics fidelity ceiling · P1 · open, no decision recorded

**Evidence.** `buildContact()` at `packages/physics/src/PhysicsWorld.ts:686` (called from
`:330`) implements hand-written narrow-phase for six pairs only: plane↔any, sphere↔sphere,
sphere↔box, capsule↔sphere, capsule↔box, capsule↔capsule. **Everything else falls back to
AABB overlap resolved on the minimum penetration axis.**

`rg -c "gjk|convexHull|timeOfImpact" packages/physics/src` returns **zero matches**
(verified 2026-07-26). No convex hull, no GJK/EPA, no mesh or heightfield narrow-phase, no
CCD.

`inverseInertia` is a diagonal `Vec3` (`RigidBody.ts:30`, constructed `:88`, inverted
`:264`). Contact impulses generate **no torque** — `applyImpulse` touches
`angularVelocity` (`:155`) but the contact resolver does not route through it — so contact
resolution is purely linear. Friction clamps against `μ·(|Jn| + penetration)` rather than a
Coulomb cone on accumulated normal impulse.

**Visual cost.** Boxes do not tumble. A box dropped on a corner settles flat, which reads as
obviously wrong to anyone who has seen a physics engine. Fast movers tunnel through
geometry. Box↔box — the single most common game collision pair — resolves as AABB overlap,
so stacked or angled boxes interpenetrate and jitter.

**Fix cost.** Large for full narrow-phase. Medium for the minimum viable set: angular
response from contact impulses, plus CCD or a documented tunneling limit.

**Blocks games?** Yes for Blockfall Reactor (stacked boxes are the entire game) and Turbo
Drift Circuit (fast movers tunnel).

**Required decision (2.20).** The prompt requires stating per-game whether to route through
the `cannon-es@0.20.0` backend or extend the native `aura-js` solver. This decision was
required by the original prompt and **was never made** — recording that omission is part of
this audit. Recommendation: route Blockfall and Turbo Drift through `cannon-es`, which
already has box↔box, angular response, and CCD; extend `aura-js` only if a
dependency-free path is a hard requirement. Aura Clash uses `HitboxWorld` rather than rigid
bodies and is unaffected.

---

### Gap 8 — Duplicate OrbitControls · P1 · done, stubs open

**Resolved at `606c826d`.** `packages/controls/src/OrbitControls.ts` went 25 → 176 lines and
now delegates all camera math to the `@aura3d/input` engine when a camera is attached.
Detached mode is documented as bookkeeping-only and carries no parity claim. `MapControls`
delegates damping. Covered by `tests/unit/controls/orbit-controls-delegation.test.ts`.

**Still open (2.23).** Seven exported placeholders remain in the same package:
`FirstPersonControls` (8 lines), `FlyControls` (14), `MapControls` (15),
`PointerLockControls` (15), `DragControls` (17), `SelectionManager` (18),
`TransformControls` (19). Each is a public export that does nothing. Resolve or explicitly
deprecate.

**Also open (2.24).** The inventory's `misc_controls_orbit` `"matched"` entry
(`priority: "high"`) was written against the `input` implementation. Re-check it against the
now-delegating `controls` version. Related: `misc_controls_transform` is also listed
`"matched"` at `priority: "high"` while `TransformControls` is a 19-line stub — that entry
is not defensible as written.

**Blocks games?** No.

---

### Gap 9 — Features the codebase already declares missing · P1 · correctly disclosed

`packages/rendering/src/EnvironmentPlatform.ts` maintains an honest ledger with a
`"missing" | "partial" | "helper"` status enum (`:29`). Notable entries: `exr-parser` —
"EXRLoaderThreeCompat is diagnostic-only and does not decode OpenEXR pixels" (`:260`);
`cube-camera-reflections` — "ReflectionProbe is a descriptor helper; live six-direction
capture is not implemented" (`:261`); `atmospheric-scattering` missing (`:242`). Planar
reflections, scene refraction/caustics, area lights, terrain/heightfield (`:1027-1069`), and
volumetrics/god rays (`:457`) are all disclosed unsupported.

Ten environment presets are `"helper"` — geometry descriptors, not rendering features —
consistent with `packages/environments/src` totalling only 469 LOC.

**Assessment: this gap is correctly handled and needs no work.** The ledger was not
downgraded or deleted, and nothing was flipped because nothing was implemented. This is the
model the rest of the repo should follow.

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

**Three of the nine gaps are decisions, not implementations.** Gap 3 (wire or delete), gap 6
(clustered or documented cap), and gap 7 (cannon-es or extend native) each need a recorded
choice before code. All three were left ambiguous by the previous attempt. Recommendations
are given above; the prompt requires the decision be written into this file when taken.

**Evidence hygiene is the binding constraint on claims.** The performance gate fails on six
missing reports (§1.2), the visual-quality capture is 38 days stale (§1.3), both committed
verdicts are non-passing (§1.4), and the headline 54/54 inventory number is hand-authored
(§1.1). Until those are addressed, no performance or parity claim in docs or marketing has
backing, and Phase 4 must lower rather than raise the affected labels.
