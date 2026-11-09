# Aura3D Known Limits

Date: 2026-10-15
Status: canonical limitations doc

This file is the public limitations source for project docs, release copy, and
showcase review. If a guide or README makes a claim narrowed by this file, the
guide or README must include the narrower wording.

## Release limits

Aura3D 5.5.0 is the current release. Capability claims remain limited to the named public
API, packages, routes, and retained evidence. The project does not claim a
universal replacement for Three.js, Unity, or Unreal, and route-specific visual
approval does not transfer automatically to other examples.

## Evidence dating

Unless identified as 4.0.0 source implementation, measured examples below are
historical retained workload evidence. Relevant records include the August 9
2026 public-renderer, animation, WebGPU architecture, shadow-cascade and Rapier
validation reports, and the August 10 portable-custom-material report. They
establish the described prior bounded runs, not freshness for the current
candidate. Final release claims require regeneration and source-bound receipts.

## Root `createAuraApp` Renderer Limits

- The public root path defaults to `production-runtime` for renderable safe
  authored scenes. This proves backend selection and lifecycle plumbing, not
  every renderer feature.
- Prior root screenshots record basic GLB rendering, base-color material and
  texture paths, scene composition, simple effects, runtime transforms, and
  non-skinned node animation on tested routes.
- Root-wide PBR parity is not a current public claim. HDR/IBL lighting,
  PMREM-style filtering, production tone mapping, high-quality shadows, and
  broad postprocess likewise require path-specific evidence.
- Bloom, SSAO, DOF, FXAA/TAA, color grading, cinematic fog, and similar effects
  require exact route screenshot proof before public use.
- Internal renderer evidence still does not prove root `createAuraApp` feature
  support unless a root-only browser route proves that exact behavior.

## Animation Limits

- Non-skinned glTF node animation can be claimed only for routes that prove it.
- Root skinned-animation evidence is bounded to routes that import only
  `@aura3d/engine`, play a typed real skinned asset, and retain meaningful
  character-region pixel deltas. The prior character animation viewer receipt records that contract for one CC0 Robot Expressive GLB, not arbitrary rigs.
- Morph rendering uses direct uniforms for small target sets and a
  texture-backed position-and-normal delta plan for larger sets, with a
  device-limit-driven CPU fallback. The prior character animation viewer receipt records the
  three named Robot Expressive facial targets; broader facial rigs and
  viseme/lip-sync behavior still require route-specific pixel evidence.
- Counters, metadata, or camera movement are not enough to prove animated
  character motion.

## Game Runtime Limits

- The current public game story includes useful input, runtime node, frame loop,
  replay, HUD, and fighting-game helper surfaces.
- Platformer and racing helpers support bounded certified presentations; they are not production game-generation APIs or automatic arbitrary-mesh converters.
- Route-local game logic can be a prototype or showcase candidate, but it is not
  a reusable game runtime claim.
- A game route is not public-ready unless input visibly changes state and tests
  prove objective/scoring/fail/reset/progression.
- Public racing routes require retained topology evidence that binds the car,
  route, checkpoints, camera, and visible road surface.
- Public platformer routes require retained playable-surface evidence that
  binds the character, contact point, collision, checkpoint path, hazards,
  finish, camera, and visible world geometry.
- Blockfall Reactor, Turbo Drift Circuit, and Skyline Runner have materially
  rebuilt gameplay and retained bounded route evidence that requires current-source revalidation. Skyline's authored
  Level 1 is constrained to a 70–115-second completion window (authored 95
  seconds) with coins and ember volleys; Turbo retains distinct typed
  vehicles, four-lap progression, per-wheel circuit contact, and visual
  asphalt wide enough to pass on tarmac;
  Blockfall retains hold/queue, line-clear, game-over, reset, and progression
  proof. All three remain playable-showcase until independent review approves
  their exact final artifacts. None of this generalizes to arbitrary assets,
  physical tyre simulation, or production games.

## Asset Limits

- The CLI asset workflow provides typed references and metadata; it does not
  create new production art.
- Catalog search can find candidates, but search success is not proof of visual
  quality, rig quality, scale suitability, license readiness, or gameplay
  readiness.
- Primary showcase assets require durable source/license/provenance metadata,
  bounds/material/texture/animation inspection where relevant, screenshots, and
  visual review.
- Temp-path provenance, duplicate hashes without explanation, placeholder-like
  assets, unreadable materials, and primitive substitutions are release blockers
  for public showcases.
- No current 77-asset glTF corpus entry is expected-fail.
  The corpus (`tests/assets/corpus/gltf-corpus.manifest.json`) is importer
  evidence for the named assets only.

## WebGPU Limits

- WebGPU behavior depends on browser and hardware support.
- Native WebGPU claims require adapter/backend state, dispatch/render evidence,
  fallback state, telemetry, and pixels.
- A route named "WebGPU" must demote itself when running in WebGL or simulated
  fallback mode.
- The six named WebGPU evidence routes and the production SDK imported-asset
  workload have historical bounded native proof in
  `tests/reports/webgpu-current-architecture/report.json`. This does not
  generalize to root-default WebGPU, general TSL/node-material parity, WebXR,
  or every renderer feature. The separate selected custom-material workload is
  recorded in the August 10 receipt `tests/reports/portable-custom-materials/report.json`.

## Evidence Limits

- The retained 54-row Three.js comparison and its bundle/developer-friction
  measurements use `three@0.165.0`. They are historical regression evidence,
  not evidence of parity with the locked current `three@0.185.1` ecosystem.
- The prior r185.1 comparison recorded passes for 15 selected correctness
  workloads from 29 freshly packed and npm-installed Aura3D 4.0.0 tarballs
  (K2 `fresh-installed-2.0-packages-prove-all-workloads` gate green at the
  release commit; the check id retains its 2.0-era name).
  These prior package receipts do not certify the 4.0.0 worktree.
  Every workload retains explicit losses and a claim boundary. The aggregate
  remains incomplete because the full repeated-performance protocol,
  clean-machine reproduction, independent gallery review, general TSL/node-
  material breadth, and real-device XR are open. Aura3D therefore makes no
  current broad replacement or ecosystem-parity claim.
- `tests/reports/` artifacts may be local or ignored; they must be regenerated
  in release runs or attached as immutable artifacts.
- Nonblank screenshots prove only that something rendered.
- Browser route boot success does not prove readability, interaction quality,
  animation, material correctness, or game playability.
- A deployed URL proves hosting only when route/asset checks and hosted
  screenshots are generated from that origin.

## Lower-Level Renderer Coverage And Limits

- Renderer scene frustum culling is implemented and covered by focused moving-camera unit tests; this is not a broad large-scene performance claim.
- Rendering-internal cubemap and equirectangular backgrounds, GGX PMREM, RGBE HDR file loading, live cube-camera probes, bounded scene-color transmission/refraction, depth-aware radial volumetric light, and generated terrain heightfields have focused unit and browser-pixel evidence. None of those package-level proofs automatically establishes root `createAuraApp` support.
- OpenEXR decoding and physical Rayleigh/Mie atmosphere remain explicitly unsupported. Rendering-internal finite rectangular emitters now have deterministic size-dependent and one-sided WebGL2 PBR pixel proof; exact three.js LTC lookup-table identity, rectangular-light shadow maps, GI, automatic preset attachment, and root `createAuraApp` support remain excluded. Rendering-internal linear and exponential-squared fog also have deterministic WebGL2 object-pixel proof, but this does not establish volumetric scattering or physical atmosphere.
- glTF render resources bind TEXCOORD_0 and TEXCOORD_1. Higher sets are diagnosed and fall back; generated tangents derive from TEXCOORD_0 when authored tangents are absent. See `packages/assets/src/GLTFRenderResources.ts`.
- Texture support has bounded KTX2/Basis transcoding coverage and GPU capability-driven format selection; it is not universal compressed-texture support.
- There is no product-studio material-matrix visual coverage broad enough to claim all material combinations.
- Shadow coverage includes unit-level moving-camera cascade split stress. Directional cascades do not imply production-ready point/spot shadow maps.
- Directional shadow maps now carry mounted browser evidence with a caster-free negative control
  (`tests/browser/external-parity-shadow-cascade-evidence.spec.ts`): a measured 1,538-pixel
  shadow footprint whose mean darkening is roughly 20x the whole-receiver mean, against a receiver
  that darkens by 0.024 when no occluder is present at all. Bounded same-scene shadow visual comparison against Three.js and Babylon.js also
  passes with all three engines using their real shadow pipelines. None of this establishes
  Unity/Unreal shadow parity or production shadow atlas/cascade selection, which remain blocked.
- Slope-scaled shadow bias is evaluated per PCF sample and scaled by the tangent of the
  receiver/light angle. Before this, wide PCF kernels made every receiver shadow itself
  (measured mean RGB-sum 15.31 with no occluder in the scene); the clamp on the tangent bounds
  worst-case bias so removing acne does not introduce peter-panning.
- browser visual stress for long moving-camera paths remains required before broad shadow or culling claims.

## Instanced Rendering Limits

- Native instanced submission requires an instancing-aware material. `InstancedPBRMaterial`
  selects `aura3d/instanced-pbr`, whose vertex stage declares the per-instance matrix and colour
  attributes. A plain `PBRMaterial` compiles `aura3d/pbr-direct`, which declares none of them, so
  the forward pass correctly falls back to expanding the batch into one draw per instance. The
  fallback is a correct degradation, not a defect, but the cost difference is large and silent:
  a prior 4,096-instance scene measured **1 draw call at ~88 FPS** with `InstancedPBRMaterial`
  and **4,096 draw calls at 9 FPS** with `PBRMaterial`. Check actual per-route draw diagnostics; that historical timing does not establish current performance.
- `Scene.createInstancedMesh` registers the node in the scene's id map but does not parent it.
  Callers must attach it (for example `scene.root.addChild(mesh)`) or the renderer collects
  nothing and reports zero draw calls. This matches the rest of the `Scene.create*` family.
- Instanced evidence is bounded to the 4,096-instance shared benchmark descriptor. Historical frame time and
  draw calls tied with Three.js on that scene; bundle size is a measured loss. No general
  instancing performance advantage is claimed.

## Physics Backend Limits

- `@aura3d/physics` has one production solver owner since 2.0 (current in 4.0.0):
  `@dimforge/rapier3d-compat@0.20.0`. Removed Cannon and custom-solver paths are
  not fallbacks and must not be described as current production owners.
- The public contract has named production-backend invariants for stacking,
  fixed joints, adaptive-substep tunnelling protection, sleeping/waking,
  repeatability, grounding, slope/step movement, suspension response, and
  browser lifecycle. Those bounded fixtures do not establish universal physics
  or arbitrary-mesh game-engine parity.
- Capsule grounding, CCD, and rotated ray/sphere queries use the selected
  Rapier adapter and remain bounded by their named browser and package tests.
- Capsule grounding and rotated ray/sphere queries are corrected in 2.0.0. A
  project that compensated for the earlier flat-ended capsule or axis-aligned
  query behavior should remove and retest that workaround.
- Racing uses shared authored-unit arcade motion, not a physical tyre model.
  It does not claim weight transfer, understeer, slip/yaw inertia, or physical
  vehicle parity. See ADR 0003 for the ownership decision.

## Budget re-baselines

- **Installed tree-shaking optional backends** (`tools/installed-tree-shaking/index.ts`):
  the 4.x-compatible `@aura3d/engine` root, its `/game` addon and `@aura3d/react`
  (via `createAuraApp`) keep synchronous `app.physics`, so 28,697 B of the
  `physics-rapier` adapter is retained on purpose through the single documented
  gateway `public/legacy-physics-access.js` (`docs/migration/4-to-5.md`,
  `retired-tests.md` 12b). The `*-excludes-optional-backend-subtrees` checks accept
  that one route only (reported as `documentedSynchronousBackends`); any other
  static or dynamic route still fails. `finalize-dist` internalizes the lazy
  `import("@aura3d/navigation-recast")` as a relative dynamic import, so the tool
  now treats that single lazy load as the declared optional peer (external).
  The lazy isolated entry (`public/v5.ts`) retains neither backend.

- **PRD-13 lane bundle delta** (`tests/qr/prd13/bundle-delta.test.ts`):
  re-baselined 2026-11-02 for 5.0 (owner-delegated) from 9,216 B to
  19,968 B gzip (measured 18,091 B + 10%, rounded up to the next 256 B). The
  lane intentionally contains looks/promptPlanV2/structuralQA/lookLint/lookPresets
  (4.x growth; P-24 kept structuralQA in-lane). Previous 9,216 B predates
  those modules. The check was already failing on `main` before 5.0.
- **`@aura3d/input` package budget** (`input-package` in
  `tools/bundle-size/index.ts`): new target added 2026-11-02 at 17,408 B gzip
  (barrel incl. `PointerLeases.ts`, measured 17,225 B, rounded up to the next
  512 B). The PRD-08 lane test (`tests/qr/prd08/unit/bundle.test.ts`) now
  externalizes `@aura3d/input` because this target prices it; its 24,000 B
  "everything" budget is unchanged.
- **Root `package.json` script count** (`tests/unit/quality-gate/scripts.test.ts`):
  re-baselined 2026-11-02 for 5.0 (owner-delegated) from the Q-15-1 target of
  ≤ 80 to a cap of 121 (the exact current count: 120 on `main` plus
  `verify:api-docs`; the `check:clean-install:source` and
  `check:clean-install:browser` aliases first counted in the cap of 123 were
  unreferenced and removed by `tools/script-prune --check`, which CI enforces;
  `verify:asset-urls` is kept through the pruner's `REVIEW_KEEP`). The ≤ 80 target is carried as 5.x debt; the cap
  prevents growth. The check was already failing on `main` before 5.0. No
  scripts were removed: the four `external-parity-*` scripts whose tools are
  quarantined are still invoked by `.github/workflows/public-demo-deploy.yml`
  and `tools/public-demo-deployment-artifacts`, so they are not dead.
- **Bundle-size critical paths** (`core-agent-api`, `template-product-viewer`,
  `template-cinematic-scene`, `template-mini-game` in `tools/bundle-size/index.ts`; the budget-continuity baseline literal in
  `tools/release/budget-continuity.mjs` and the `native-installed-tree-shaking`
  starter-budget test carry the same four values):
  re-baselined 2026-11-03 for 5.0 (owner-delegated) from 190,000 / 250,000 /
  400,000 / 480,000 B to 2,056,000 / 1,796,000 / 1,804,000 / 1,910,000 B gzip
  (measured 1,868,919 / 1,632,392 / 1,639,097 / 1,735,649 B + 10%, rounded up
  to the next 1 KB). The 190/250/400/480 KB targets were never met on 4.x
  (`BUNDLE_SIZES.md`, 2026-10-22: core 1,141,998 B gzip). Before any fix 5.0
  measured 2,222,881 / 2,008,833 / 2,014,106 / 2,111,783 B (about double 4.x).
  Recovered 354 KB (-16%) on the core path without changing behavior or public
  API: (1) `compiler/bitmapAsset.ts` took `createAssetTransportTracker` from the
  `@aura3d/assets/importers` barrel, whose modules (all native loaders, the
  format catalog, material/scientific/vector/voxel loaders) are not
  tree-shakeable, so every loader landed on the static path (-117 KB); that
  helper is now also exported from `@aura3d/assets/browser` (additive).
  (2) `import("@aura3d/rendering")`, `import("@aura3d/assets/browser")` and
  `import("@aura3d/assets/importers")` in the engine made each barrel
  namespace live; they now import narrow facades under
  `packages/engine/src/agent-api/lazy/` that re-export only the destructured
  names (-205 KB). (3) `Renderer` no longer statically imports the WebGPU scalar
  volume pass (and `VolumeRenderer` behind it); the pass registers its draw in
  `renderer/ScalarVolumeFrame.ts` when `@aura3d/rendering/volumetrics` loads,
  which is the only way a WebGPU volume record can exist (-15 KB). (4)
  `sideEffects: false` on seven audited-pure packages (audio, math, scripting,
  input, editor-runtime, debug, core) (-6 KB).
  **Remaining (5.x debt), measured on the core path:** the WebGL2 renderer and
  the engine authoring API are statically reachable by design and account for
  most of the 6.3 MB raw: `agent-api` 1.8 MB raw, `Renderer`/`ForwardPass`/
  `WebGL2Device` plus `ShaderLibrary` (about 0.7 MB raw), `webgl2/LegacyPost`
  (100 KB raw, about 26 KB gzip), `ShaderGraphCompiler` via sync `tsl` and
  compute (120 KB raw, about 29 KB gzip), the WGSL twin templates reached from
  `ProgramGenerator` (about 45 KB gzip; deferring them needs a registration
  slot plus about 12 tests that call `generateProgram` with `target: "wgsl"`
  to import it), GLB loader and animation runtime (about 0.3 MB raw),
  `GaussianSplatLoader` and `EXRLoader` (about 16 KB gzip; they stay eager
  because esbuild keeps any module that is live through a lazy facade in the
  shared chunk when a statically imported barrel also re-exports it), and
  sync physics root semantics (`PhysicsWorld` plus `physics-rapier`, 56 KB raw).
  `check:bundle-size` still reports the `.` entry with every export as an entry
  point; the one-cube observation (1,631,581 B gzip) is the user-facing floor.

## 5.x architecture-gate debt

The architecture gates (`tools/arch-gates`, live assertion in
`tests/qr/prd15/arch-gates-rules.test.ts`) had 91 enforced findings with no
allowlist row on 2026-11-02. Fixed for 5.0:

- 11 `nodes/ → compiler/errors.ts` layering edges: `AuraRuntimeError` and
  `AuraMigrationError` moved to `packages/engine/src/contracts/runtimeError.ts`;
  `compiler/errors.ts` re-exports the same classes, so `instanceof` and existing
  importers are unchanged. (`nodes/effects.post.ts` keeps the old import because
  `tests/fixtures/native-examples-catalog/expectations.json` pins its SHA-256.)
- 2 `export-budget` findings: `./geometry-tools` and `./media-node` are
  documented 5.0 entries (`docs/migration/4-to-5.md`) and were added to the
  explicit subpath list.
- 1 `glsl-location` false positive: JSDoc wording in `nodes/types.ts`.

The remaining 77 findings are allowlisted in `tools/arch-gates/allowlist.json`.
Each has its own row with a concrete reason, expiry 2027-01-31 and reviewer
"agent (owner-delegated, 2026-11-02)". They are 5.x tech debt:

| Rule | Rows | What remains |
| --- | --- | --- |
| `layering` compiler/ → app/ | 13 | Compiler lowering still calls code in `app/runtimeNodes.ts` (the runtime-node store), `app/renderPath.ts`, `app/actorAnimationHandle.ts`, `app/advancedLightingState.ts`, `app/colorManagement.ts` and `app/outputColorDiagnostics.ts`. |
| `layering` nodes/ → @aura3d/rendering | 12 | Node builders call rendering runtime code (constructors, validators, `instanceof` checks), so a type-only import is not enough. The fix is compiler-side lowering. |
| `layering` nodes/ → compiler/ or app/ | 11 | Custom-material validator, primitive and texture factories, scene-graph transform helpers, `runtimeNodeQueryState`, and the pinned `effects.post.ts` error import. |
| `layering` → devtools/ | 1 | `sceneKitDiagnosticsCore.ts` reads the devtools budget table. |
| `no-cycles` | 1 | 60-file agent-api SCC: exact snapshot, 8 members newer than the Phase-8 row. |
| `max-file-lines` | 3 | `GameRuntimeCore.ts` (5,059), `nodes/types.ts` (3,158), `app/createAuraAppCore.ts` (2,654). |
| `single-renderer` | 4 | WebGL2 context reads in the debug GPU probe, `compiler/renderer.ts`, and lane-01 output diagnostics; since 5.3.0 also the plain look's one-time `EXT_color_buffer_float` probe in `looks/plainLook.ts` (moves behind RenderBackend capabilities). |
| `glsl-location` | 15 | 12 renderer/pass modules with inline GLSL (paths referenced by ledger locators), 2 false positives (`migrate-three/emit.ts`, `compiler/customMaterial.ts`) and, since 5.4.0, the CLI three.js bridge's GLSL rewrite (`import-three/shader.ts`). |
| `no-evidence-in-runtime` | 9 | Published evidence/readiness names on `.` and `./renderer` (for example `collectAuraSceneEvidence`, `TypedGLBActorEvidence`). Removing them needs a deprecation cycle. The rule now accepts dated `{ rule, file, name }` rows. |
| `unique-ownership` | 9 | `Vec3Like`, `ParticleBurst`, `earcut`, `shapeArea`, `isClockWise`, `triangulateShape`, `Shape` have different declarations in different packages; `ensurePhysics` and `physicsInitMode` are re-declared by `@aura3d/physics` over the optional `@aura3d/physics-rapier` solver so the backend-neutral contract never names the backend. |

Rows written before 5.0 (unique-ownership `2026-11-03`, glsl-location,
single-renderer and the Phase-8 SCC row `2026-11-15` / `2026-11-30`) keep
their original expiry dates.

## Runtime-edge debt

`tests/unit/runtime-edge-coverage.test.ts` flags every line in `packages/*/src` that says
`unavailable`, `not implemented`, `placeholder`, `stub`, `fake success` or `deferred`. On
2026-11-03 869 flagged lines (844 unique, in 298 files) had no allowlist entry. Each was triaged
and allowlisted in `tests/unit/runtime-edge-coverage.allowlist.ts`, grouped per file with a reason.
Every group expires on `2027-01-31` (reviewer: agent, owner-delegated, 2026-11-03). A new test
case fails once any group is past its expiry. None of the lines is an open FINISH-5.0 row in
[`docs/prds/aura3d-5.0-scope.md`](../../prds/aura3d-5.0-scope.md).

| Module | Lines | Files |
| --- | ---: | ---: |
| `rendering` | 513 | 140 |
| `engine` | 231 | 90 |
| `assets` | 52 | 23 |
| `aura3d-cli` | 21 | 14 |
| `debug` | 10 | 6 |
| `audio` | 9 | 2 |
| `controls` | 8 | 6 |
| `game` | 7 | 6 |
| `input` | 7 | 2 |
| `animation` | 3 | 3 |
| `physics` | 3 | 1 |
| `editor-runtime` | 2 | 2 |
| `addons` | 1 | 1 |
| `math` | 1 | 1 |
| `scene` | 1 | 1 |
| **Total** | **869** | **298** |

The lines by kind:

| Kind | Lines |
| --- | ---: |
| Contract-seam stub used only while a lane provider is absent or its `A3D_QR_*` flag is off (C-xx / PR 0a slots) | 200 |
| Fail-closed refusal that throws a typed error when a host API, backend feature or binding is absent | 193 |
| `deferred` naming a real mechanism (the deferred drawing path, deferred loads, queues or chunks) | 151 |
| Explicit `unavailable` status value or reason reported to callers | 83 |
| Comment describing the fail-closed or fallback path | 68 |
| Warned fallback or diagnostic | 40 |
| Internal placeholder object that is never displayed or submitted | 36 |
| Deferred GPU retirement behind a completion fence | 24 |
| Note that a former stub or placeholder was removed | 21 |
| Error-detail redaction fallback text | 15 |
| Unsupported-option row reported as `option-ignored` (S5-WP19-04) | 15 |
| Explicit `not implemented` refusal with a stable error code | 14 |
| Other stub-wording comments | 7 |
| Legacy throwing stub with a replacement hint | 2 |

Debt to retire before the expiry:

- The contract-seam stubs (200 lines) exist only for the flag-off path.
- The removed-stub notes and the PRD 11 deprecated backend shims under
  `rendering/src/production-runtime/backends/` can be deleted with the barrel
  export they wait on (Q-15-5).
- `auditArtDirection` from the `@aura3d/engine` root is still the PR 0a stub. It returns
  `["PENDING"]`. The working audit is in `@aura3d/game`.
