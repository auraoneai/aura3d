# GU47 lane eh: WP-8 (E-H) camera, animation, crowd kit, GLB cache

- Branch: `gu47/eh` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/eh`)
- Base commit: `f797808be`
- Wave: 1 (phase 1, code). Nothing was run in a browser, remotely or on a GPU.
- Scope: `briefs/scope-eh.md`; PRD contract lines 263-278, WP lines 434-439, PRD §4.1 E-H row.

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EH-1 contract `rigs.rail` | M | done | 707378f5b | Predecessor's uncommitted `contracts/camera.ts` reviewed and kept: `stubCameraRigFactories.rail` delegates to `createRailRig` (lazy arrow, cycle-safe). S19 tree-shake gate unchanged (typical 11979 gzip, everything 22625 gzip, identical to base). `tests/unit/gu47/eh/contract-rail-rig.test.ts`. |
| EH-2 `playLayer({ speed })` | M | done | c1f7467ea, e061f0b49 | Contract `AuraPlayLayerOptions.speed` (predecessor); forwarded as the layer action `timeScale` (`actorAnimationHandle.ts`). Iron Crown already passes `speed` (`apps/showcase-iron-crown/src/main.ts:1479`); it is no longer dropped. `tests/unit/gu47/eh/actor-play-layer-speed.test.ts`. |
| EH-3 `actor.pose.setLocalRotation` | M | done | c1f7467ea, 37075f569 | One pose constraint per actor, re-appended after every `ik.add` / `springBones.add` and after `ik.clear` (final pose-space write before skinning); quats normalise; unknown bones warn once (`ANIMATION_POSE_UNKNOWN_BONE`); set-before-load attaches on load; flag off = stub. Real-runtime + ordering tests: `tests/unit/gu47/eh/actor-pose-override.test.ts`. |
| EH-4 `handle.part(name)` | M | done (declaration: E-B) | e345d603c | `TypedGLBActor.part(name)` + C-37 member `part` on model handles (flag `A3D_QR_COMPILER`, actor resolved per call). E-B shipped `part?(name)` on `AuraRuntimeNodeHandle` (`nodes/types/runtime.ts:183` in `gu47/eb`); mirrored here as `AuraRuntimeNodeHandleParts` until merge. `tests/unit/gu47/eh/glb-part-handle.test.ts`. |
| EH-5 TypedGLBActor `crossFadeTo` / `playLayer` | M | done | ed35d6640 | Plus `stopLayer` and `advance(dt)` (the actor's mixer tick; apps that drive a root-render-source actor call it once per frame instead of `playClip`). `tests/unit/gu47/eh/typed-glb-actor-mixer.test.ts` (CesiumMan). |
| EH-6 root render sources cast/receive shadows | M | done (verified, no defect; pixels phase 2) | a2eb134d1, 25854e6af | `attachRootRenderSource` items are prepended to the frame's single item list (`compiler/renderInput.ts:190-192`), so the renderer caster filter (`Renderer.ts:1127-1132`, `castShadow !== false`), the prd02 caster rule, the contact-shadow depth pre-pass (`Prd02ContactShadowsContributor.ts:133`) and the forward contact-mask sampling (`receiveShadow !== false`, `contactShadowMaskStore.ts:119`) treat them like scene items. Contract documented on `attachRootRenderSource`; pinned by `tests/unit/gu47/eh/root-source-shadows.test.ts`. Skinned casters deform in the depth pass only with `A3D_QR_ANIMATION_SKINNED_SHADOWS` (E-G promotion). |
| EH-7 crowd kit | M | done (pixels phase 2) | 49eb1a4da | NEW `instances-model/CrowdKit.ts`: a skinned GLB clip is baked on the CPU into `poses` static meshes; the crowd draws one `instances.custom` node per pose. 480 spectators with 4 poses = 4 instanced draws (unit-tested draw plan). Per-spectator colour (instance colour x baked part colours), clip phase (balanced phase groups that step one pose node per loop frame), held pose index, optional per-spectator bob. `update()` is allocation-free in the kit. `tests/unit/gu47/eh/crowd-kit.test.ts`. Call shape under "API as shipped". |
| EH-8 `GlbResourceCache` | M | done | 8b3b1b76a, fcbe4fb5b, f32365df1 (default-on, revertable alone) | NEW `production-runtime/GlbResourceCache.ts`. A disposed actor frees its render resources and textures as before and hands its parse lease to the cache (key: asset hash + URL + decode options by value); the next actor of that asset loads with 0 GLB fetches (a kept uncompressed GLB also skips the decoder pre-scan fetch) and hands the lease back. Bounded (32 entries / 160 MiB charged, LRU), each entry disposed exactly once; `TypedGLBActor.dispose` idempotent. Fetch-counter tests: `tests/unit/gu47/eh/glb-resource-cache.test.ts`. |
| EH-9 tests + receipt spec `crowd-kit` | M | done (receipt run: phase 2) | f09f66b31 + the unit tests above | `tests/browser/gu47/crowd-kit.spec.ts` + `crowd-kit-harness.ts` + `crowd-kit.html` (not run), `evidence/receipts/crowd-kit/README.md`. Unit tests: 8 files under `tests/unit/gu47/eh/` (41 tests). |

## API as shipped

All names below are exported from the files named; the public barrel entries are a handoff (E-G, see Handoffs).

### Camera (`packages/engine/src/contracts/camera.ts`)

```ts
stubCameraRigFactories.rail(o: AuraCameraRailOptions): AuraCameraRig   // now the controller rail (createRailRig)
// AuraCameraRailOptions (unchanged): { points: readonly AuraVec3[]; lookAt: string | AuraVec3 | readonly AuraVec3[];
//   fov?: number | readonly number[]; duration: number; ease?: AuraEaseName; loop?: "none" | "loop" | "pingpong"; alpha?: number }
```

`camera.rigs.rail(...)` (node namespace) and `app.camera.rigs.rail(...)` already returned the controller rail; the contract factory now matches them. Fewer than 2 points throw `rigs.rail needs >= 2 points`.

### Animation (`packages/engine/src/contracts/animation.ts`, runtime in `agent-api/app/actorAnimationHandle.ts`)

```ts
export interface AuraPlayLayerOptions { weight?: number; fadeIn?: number; mask?: AuraBoneMaskSpec; blendMode?: "override" | "additive"; speed?: number }
export interface AuraActorPoseApi {
  setLocalRotation(bone: string, quat: AuraQuat): void;   // quat = [x, y, z, w], normalised on write
  clear(bone?: string): void;
}
// AuraActorAnimationApi gains:
playLayer(layer: string, clip: string, options?: AuraPlayLayerOptions): this;   // speed -> layer action timeScale (0 freezes; non-finite reads as 1)
readonly pose: AuraActorPoseApi;
// actorAnimationHandle.ts:
export const ANIMATION_POSE_UNKNOWN_BONE = "ANIMATION_POSE_UNKNOWN_BONE";
```

Route use: `app.nodes.get("hero").animation.playLayer("upper", "Wave", { speed: 2, mask: { humanoid: "upper-body" } })`; `app.nodes.get("hero").animation.pose.setLocalRotation("Head", [0, 0.259, 0, 0.966])` every frame (resolved bones update in place, no re-registration).

### TypedGLBActor (`packages/engine/src/production-runtime/TypedGLBActor.ts`)

```ts
export interface TypedGLBActorCrossFadeOptions { readonly speed?: number; readonly loop?: boolean; readonly warp?: boolean; readonly transition?: "crossfade" | "inertialize" }
// TypedGLBActor gains:
crossFadeTo(clip: string, seconds: number, options?: TypedGLBActorCrossFadeOptions): TypedGLBActor;
playLayer(layer: string, clip: string, options?: AuraPlayLayerOptions): TypedGLBActor;
stopLayer(layer: string, fadeOut?: number): TypedGLBActor;
advance(dt: number): GLTFSceneAnimationApplyResult;      // seconds; steps the PoseMixer and writes the pose
part(name: string): AuraRuntimeNodeHandle | undefined;   // first GLB scene node with that name, cached per name
// module exports:
export function liveTypedGLBActor(id: string): TypedGLBActor | undefined;
export type AuraRuntimeNodeHandleParts = { part?(name: string): AuraRuntimeNodeHandle | undefined };   // local mirror of E-B's declaration
// C-37 node-handle member on model nodes (flag A3D_QR_COMPILER), typed by a local augmentation of AuraNodeHandleExtensionMap:
part: (name: string) => AuraRuntimeNodeHandle | undefined;
```

G17 shape (runner drawn as a root render source): `runner.actor.crossFadeTo(CLIP.run, 0.15, { speed: rate })` when the clip changes, `runner.actor.playLayer("hit", CLIP.hit, { weight: 1, fadeIn: 0.08, mask: { humanoid: "upper-body" } })` on a stumble, `runner.actor.advance(dt)` every frame (instead of `playClip`). Parts: `app.nodes.get("heli").part?.("Rotor")?.setRotation(0, angle, 0)`; part writes draw from the next collect; a clip that animates the node overwrites them; `undefined` before the GLB loads, for unknown names and for `consolidateStaticMeshes` actors.

### GLB resource cache (`packages/engine/src/production-runtime/GlbResourceCache.ts`, NEW)

```ts
export interface GlbResourceCacheEntry { readonly bytes: number; readonly uncompressed: boolean; dispose(): void }
export interface GlbResourceCacheOptions { readonly maxEntries?: number; readonly maxBytes?: number }
export interface GlbResourceCacheSnapshot { readonly kind: "aura-glb-resource-cache"; readonly entries: number; readonly bytes: number; readonly maxEntries: number; readonly maxBytes: number; readonly hits: number; readonly misses: number; readonly kept: number; readonly evicted: number; readonly keys: readonly string[] }
export const GLB_RESOURCE_CACHE_DEFAULTS: Required<GlbResourceCacheOptions>;   // { maxEntries: 32, maxBytes: 160 MiB }
export class GlbResourceCache { constructor(options?: GlbResourceCacheOptions); readonly enabled: boolean; configure(o): void; peek(key): GlbResourceCacheEntry | undefined; noteLoad(key): boolean; keep(key, entry): boolean; consume(key): boolean; release(key): boolean; clear(): void; resetStats(): void; snapshot(): GlbResourceCacheSnapshot }
export const glbResourceCache: GlbResourceCache;                 // on by default
export function configureGlbResourceCache(options: GlbResourceCacheOptions): void;   // { maxEntries: 0 } turns it off
export function clearGlbResourceCache(): void;
export function glbResourceCacheSnapshot(): GlbResourceCacheSnapshot;
export function glbResourceCacheKey(options: { asset: { url: string; hash?: string }; maxTextureSize?: number; textureBudget?: number; imageDecoder?: unknown; decoders?: unknown; compressedTextureCapabilities?: unknown }): string;
export function estimateGlbResourceBytes(sizeBytes: number | undefined, diagnostics: { vertexCount: number; indexCount: number; imageCount: number } | undefined): number;
```

Games need no call: a second `setScene` with the same assets makes 0 GLB fetches. Memory held per kept asset is its parsed GLB (about the file size, charged from the manifest `sizeBytes` when present).

### Crowd kit (`packages/engine/src/instances-model/CrowdKit.ts`, NEW)

```ts
export interface AuraCrowdBakePrimitive { positions; normals?; uvs?; indices?; joints?; weights?; color?: [r, g, b, a]; vertexColors? }   // GLTFMeshAsset shapes
export interface AuraCrowdBakePoseFrame { readonly primitives: readonly { readonly world: ArrayLike<number>; readonly palette?: ArrayLike<number> }[] }
export interface AuraCrowdBakeOptions { readonly targetHeight?: number }
export function bakeCrowdPoses(primitives: readonly AuraCrowdBakePrimitive[], frames: readonly AuraCrowdBakePoseFrame[], options?: AuraCrowdBakeOptions): AuraCustomGeometrySpec[];
export interface AuraCrowdPoseSet { readonly poses: readonly AuraCustomGeometrySpec[]; readonly clipSeconds: number; readonly clip?: string; readonly triangles: number }
export interface AuraCrowdSampleOptions extends AuraCrowdBakeOptions { readonly clip?: string; readonly poses?: number }   // poses 1..16, default 4
export function sampleCrowdPoseSet(actor: AuraCrowdBakeActor /* a loaded TypedGLBActor */, options?: AuraCrowdSampleOptions): AuraCrowdPoseSet;
export interface AuraCrowdAsset { readonly url: string; readonly hash?: string; readonly type?: string; readonly format?: string; readonly sizeBytes?: number }
export interface AuraCrowdLoadOptions extends AuraCrowdSampleOptions { readonly decoders?: AuraAssetDecodersOption }
export function loadCrowdPoses(asset: AuraCrowdAsset, options?: AuraCrowdLoadOptions): Promise<AuraCrowdPoseSet>;   // memoised per (asset, clip, poses, targetHeight)
export function clearCrowdPoseCache(): void;
export interface AuraCrowdSpectator { readonly position: AuraVec3; readonly yaw?: number; readonly scale?: number; readonly color?: AuraColor; readonly phase?: number; readonly pose?: number }
export interface AuraCrowdOptions { readonly id: string; readonly poses: AuraCrowdPoseSet | readonly AuraCustomGeometrySpec[]; readonly spectators: readonly AuraCrowdSpectator[]; readonly material?: AuraMaterialSpec; readonly speed?: number; readonly bob?: number; readonly castShadow?: boolean; readonly receiveShadow?: boolean; readonly name?: string }
export interface AuraCrowdNodeHandle { setInstanceMatrices(matrices: Float32Array, count: number, rgba?: Float32Array): unknown; setVisible(visible: boolean): unknown }
export interface AuraCrowdTarget { readonly nodes: { get(id: string): AuraCrowdNodeHandle | undefined } }   // AuraApp satisfies it
export interface AuraCrowdDrawPlan { readonly kind: "aura-crowd-draw-plan"; readonly spectators: number; readonly poseNodes: number; readonly frame: number; readonly draws: number; readonly perNode: readonly { id: string; pose: number; count: number; capacity: number }[]; readonly trianglesPerSpectator: number; readonly triangles: number }
export interface AuraCrowd {
  readonly id: string; readonly count: number; readonly poseCount: number;
  readonly nodes: readonly AuraNodeBuilder<AuraPrimitiveNode>[]; readonly nodeIds: readonly string[];   // `${id}:pose-${k}`
  readonly positions: Float32Array; readonly yaws: Float32Array; readonly scales: Float32Array; readonly colors: Float32Array;   // live SoA
  setYaw(index: number, yaw: number): void; setPosition(index: number, x: number, y: number, z: number): void; setColor(index: number, color: AuraColor): void;
  markDirty(): void; frameAt(timeSeconds: number): number;
  update(target: AuraCrowdTarget, timeSeconds: number): number;   // allocation-free; returns this frame's instanced draws
  drawPlan(timeSeconds?: number): AuraCrowdDrawPlan;
}
export function createCrowd(options: AuraCrowdOptions): AuraCrowd;
```

Call shape for game lanes (G01, G05, G07, G08, G09, G10):

```ts
const poses = await loadCrowdPoses(assets.spectator, { clip: "Cheer_Loop", poses: 4, targetHeight: 1.7 });   // before building the scene
const crowd = createCrowd({
  id: "stands",
  poses,
  spectators: seats.map((seat, i) => ({ position: seat.position, yaw: seat.yaw, color: SECTION_COLOURS[seat.section], phase: rng() })),
  material: material.pbr({ color: "#ffffff", roughness: 0.85 }),   // optional (this is the default)
  bob: 0.03,              // optional smooth motion between pose frames
  castShadow: false       // far rows; each pose node casts once per shadow cascade when true
});
for (const node of crowd.nodes) builder.add(node);                   // 4 instanced nodes
app.onFrame(() => crowd.update(app, performance.now() / 1000));      // seconds
// head-follow (TT-AN1): crowd.setYaw(i, yaw) or write crowd.yaws[i] then crowd.markDirty(); 0 allocations in the kit
```

Notes for games: draws = `poses` (4 poses: 480 spectators in 4 draws); counts that divide evenly by `poses` keep each node's instance count constant (the engine node store is then reused every frame); a held `pose` pins a spectator to one pose node (seated / static variants); several crowds (variants, idle vs cheer) are several `createCrowd` calls; the baked meshes carry the GLB's per-part base colour factors as vertex colours and its UVs, so a texture asset passed as `material.pbr({ map })` lines up; the GLB's embedded textures are not sampled (the bake decodes no images).

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| E-G | `packages/engine/src/public/index.ts` (value + type export lists) | Export `createCrowd`, `loadCrowdPoses`, `bakeCrowdPoses`, `sampleCrowdPoseSet`, `clearCrowdPoseCache` and types `AuraCrowd`, `AuraCrowdOptions`, `AuraCrowdSpectator`, `AuraCrowdPoseSet`, `AuraCrowdDrawPlan`, `AuraCrowdTarget`, `AuraCrowdNodeHandle`, `AuraCrowdSampleOptions`, `AuraCrowdLoadOptions`, `AuraCrowdAsset`, `AuraCrowdBakePrimitive`, `AuraCrowdBakePoseFrame`, `AuraCrowdBakeOptions`, `AuraCrowdBakeActor` from `../instances-model/CrowdKit.js`; `configureGlbResourceCache`, `clearGlbResourceCache`, `glbResourceCacheSnapshot`, `GLB_RESOURCE_CACHE_DEFAULTS` and types `GlbResourceCacheOptions`, `GlbResourceCacheSnapshot` from `../production-runtime/GlbResourceCache.js`; types `TypedGLBActorCrossFadeOptions`, `AuraRuntimeNodeHandleParts` from `../production-runtime/TypedGLBActor.js`; types `AuraPlayLayerOptions`, `AuraActorPoseApi` (from `../contracts/animation.js`, or through the agent-api barrel once the row below lands). | Game lanes import only `@aura3d/engine`; the crowd harness carries a `// GU47(E-G)` swap point. |
| integration (no §4.1 owner) | `packages/engine/src/agent-api/publishedUnion.ts:9` (contracts/animation type list) | Add `AuraPlayLayerOptions`, `AuraActorPoseApi` to the `export type { ... } from "../contracts/animation.js"` list. | Same route as the existing `AuraActorAnimationApi` export. |
| E-G | `packages/engine/src/agent-api/nodes/instances.ts:59-62` (`instances.model` doc comment) | Say: skinned GLBs do not instance; for skinned crowds use the crowd kit (`loadCrowdPoses` + `createCrowd`, one draw per pose). No option is needed on `instances.model` (the bake is async; a sync builder option cannot carry it). | Points authors at the supported path instead of the single-copy fallback. |
| integration (no §4.1 owner) | `packages/engine/src/agent-api/compiler/renderInput.ts` (`warnOnInstancingFallback`, reason `skinned-palette-overflow-cpu-fallback`) | Append "use createCrowd (instances-model/CrowdKit) for skinned crowds" to the warning text. | Same, at the warning games see. |
| integration (no §4.1 owner) | `packages/engine/src/production-runtime/actor/ModelTextureShare.ts:modelTextureShareKey` | Key plain-object `decoders` / `compressedTextureCapabilities` by value (as `glbResourceCacheKey` does) instead of object identity. | `typedGLBActorDecoderOptions` builds a fresh `decoders: {}` per mount, so texture shares never survive `setScene`; with this, the GLB cache could also skip the texture decode on remount. |
| integration (no §4.1 owner) | `packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts` (decoder registry per load) and `packages/assets/src/GLTFAssetParseCache.ts` | Memoise decoder instances per (basePath, workerCount) so draco / meshopt parse-cache keys match across loads; optionally export `acquireParsedGLTFAsset` from `@aura3d/assets/gltf-runtime`. | Compressed GLBs loaded with `assets.decoders` re-fetch and re-parse on every load (and on every `setScene` despite the GLB cache); a bare parse lease would let the cache hold even less. |
| integration (no §4.1 owner) | `packages/engine/src/agent-api/app/createAuraApp.ts` (app `dispose`) | Optional: call `clearGlbResourceCache()` when an app is disposed for good (not on `setScene`). | The cache is process-wide and bounded; an SPA leaving the game route could release the kept parses at once. |

## Handoffs received

| from lane | item | status |
|---|---|---|
| E-B | `part?(name)` declared on `AuraRuntimeNodeHandle` (E-B.6, `5f9efcb6c`, `a5b0e892f`); E-H implements and mirrors until merge | applied: implemented in `TypedGLBActor.ts` (actor `part` + C-37 member), mirrored as `AuraRuntimeNodeHandleParts`; same name and shape as E-B's declaration. |
| ea, ec, ed, ef, eg, ei (re-read before finishing); ee, ej (no report yet) | nothing addressed to E-H | - |

## CHANGELOG text for WP-38

- Camera: the contract `rigs.rail({ points, lookAt, duration, ease?, fov? })` now returns the controller's arc-length rail, the same rig `camera.rigs.rail` and `app.camera.rigs.rail` hand out (it returned a static pose at the first point).
- Animation: `node.animation.playLayer(layer, clip, { speed })` plays the layer clip at that rate (the option was dropped). New `node.animation.pose.setLocalRotation(bone, quat)` / `pose.clear(bone?)`: procedural bone overrides applied after clips, layers, IK and spring bones.
- Typed GLB actors: `crossFadeTo(clip, seconds, { speed, loop })`, `playLayer(layer, clip, options)`, `stopLayer(layer)` and `advance(dt)` for actors an app draws itself; `part(name)` returns a named GLB node as a runtime handle, also available as `handle.part(name)` on model nodes.
- Root render sources: items attached with `attachRootRenderSource` cast and receive shadows like scene items (verified and documented).
- Crowd kit: `loadCrowdPoses(asset, { clip, poses, targetHeight })` bakes a skinned GLB clip into a few pose meshes and `createCrowd({ id, poses, spectators })` draws a crowd as one instanced draw per pose, with per-spectator colour, clip phase and held pose (480 spectators in 4 draws in the unit-tested draw plan; pixel receipt in phase 2).
- Assets: a GLB resource cache keeps parsed GLBs across `app.setScene`, so a scene that remounts the same assets makes no GLB fetches (bounded: 32 assets / 160 MiB; `configureGlbResourceCache({ maxEntries: 0 })` turns it off).

## Phase-2 plan

| Row | Capture | Acceptance |
|---|---|---|
| EH-7 / EH-9 | `tests/browser/gu47/crowd-kit.spec.ts` on the remote runner (software WebGL2, SwiftShader, 640x360): empty stand, crowd (t = 0), crowd one loop frame later, shadowed crowd. Stand crop = x 8-92 %, y 12-70 %. | Kit plan 480 spectators in <= 4 draws; draw-call delta over the empty stand 1..4 (castShadow off); stand crop changed >= 2 %; >= 3 of 4 palette hues present; motion >= 0.3 % of the stand one frame later; `update` <= 1 ms. Writes `evidence/receipts/crowd-kit/<version>.json` + 3 frames. |
| EH-8 | Network log of a game that remounts (G05 Iron Crown re-bout with a new arena signature, or any `setScene` round trip): count `.glb` requests on the second `setScene`. | 0 GLB requests for assets mounted in the previous scene (uncompressed GLBs; compressed GLBs with decoders still re-fetch until the assets handoff lands). |
| EH-6 | G17 (serpentine) steady-state frame with the runner as a root render source over the road, sun on. | Runner shadow visible on the road (shadow crop under the runner darker than the lit road by >= 8 luma). |
| EH-2 / EH-3 / EH-5 | Game-lane captures (G05 attack layers at `speed`, G01 crowd head-follow / bone override, G17 Hit_React layered over Run_Loop). | Per the game WPs (IC47, TT-AN1, SSR-14). |
| EH-1 / EH-4 | Game-lane captures (rail shots G03, G04, G12, G13; rotor parts). | Per the game WPs. |

## Verification

- Typecheck delta (`typecheck-delta.mjs`): first run `NEW_ERRORS 1` (my test read `source.shadow?.enabled` on `boolean | RendererShadowOptions`), fixed in 25854e6af; final run on 721fa02d9: 58 errors (baseline 58), `NEW_ERRORS 0`.
- Base (`f797808be`, predecessor files stashed): 16 covering files, 99/100 pass; 1 pre-existing failure `tests/qr/prd04/unit/typed-glb-actor-snapshot.test.ts > material variants` (ENOENT `fixtures/asset-corpus/materials-variants-shoe.glb`, LFS fixture absent in the worktree). Same single failure on the branch; no test that passes on the base fails on the branch.
- Branch runs (vitest, `--maxWorkers=2`), all green except that pre-existing failure. Final sweep of the 33 files below: 32 files pass, 191/192 tests (the 1 is the ENOENT above). One earlier sweep run while the typecheck held the machine reported a second file that did not load (7 tests uncollected, no assertion failure); two reruns were clean.
  - New: `tests/unit/gu47/eh/{contract-rail-rig,actor-play-layer-speed,actor-pose-override,typed-glb-actor-mixer,glb-part-handle,root-source-shadows,glb-resource-cache,crowd-kit}.test.ts` (8 files, 41 tests).
  - Touched / covering: `tests/qr/prd08/unit/{camera-namespace-rigs,rail-continuity,bundle,camera-rigs-view,harness-pipeline}.test.ts`; `tests/qr/prd06/unit/animation-state.test.ts`; `tests/unit/contracts/impl/{prd06-playback,prd05-typed-glb-decoder-options}.test.ts`; `tests/unit/agent-api/{actor-bone-attach,actor-bone-attach-pose-order,production-actor-dispatch,production-bridge-boundary,root-render-source-public-export,runtime-node-empty-pose}.test.ts`; `tests/unit/assets/{gltf-pose-constraints,gltf-parsed-asset-reuse}.test.ts`; `tests/unit/engine/{typed-glb-actor-asset-reuse,model-texture-share,instances-model-p2}.test.ts`; `tests/unit/production-runtime/{root-render-source-bridge,root-source-production-contract}.test.ts`; `tests/qr/prd04/unit/{typed-glb-actor-snapshot,model-tint-bridge,material-diagnostics}.test.ts`; `tests/qr/prd05/unit/q15-1-compiler-decoders.test.ts`.
  - S19 bundle gate: typical 11979 gzip (budget 15000, no optional rig pulled), everything 22625 gzip (budget 24000): identical to base.
- Lint: `eslint` clean on every touched file (engine sources, contracts, tests, receipt spec and harness).
- Skills: no skill doc edited (`pnpm check:skills` not needed).
- Bundle size (PRD §7.1): `pnpm check:bundle-size` not run in this lane: it rewrites `BUNDLE_SIZES.md` and `tests/reports/bundle-size.json` (WP-38 / shared files) and bundles every starter app; it belongs to the Merge-2 gate. What this lane adds: `TypedGLBActor.ts` (dynamically imported by the renderer when a scene has a model) now imports `createBoneMask` (one module of the side-effect-free `@aura3d/animation/lanes`), `agent-api/animationMask.ts`, `agent-api/app/runtimeNodes.ts` (already in every `createAuraApp` bundle) and the new `GlbResourceCache.ts`; `CrowdKit.ts` reaches a bundle only once exported (handoff) and loads `TypedGLBActor` lazily. The S19 lane gate above is unchanged.

## Decisions

- Predecessor's 2 uncommitted files (`contracts/camera.ts`, `contracts/animation.ts`) reviewed and committed unchanged (707378f5b, c1f7467ea): the rail delegation is cycle-safe and leaves the S19 gate untouched; the `pose` member is inherited by `Prd06ActorAnimationApi` from the stub.
- `pose.setLocalRotation` is a pose constraint (the documented post-mixer / pre-palette seam) kept last by re-appending it after every IK / spring registration and after `ik.clear`; overrides last for the loaded actor's lifetime (a scene swap starts clean). The actor registry disposer now leaves a replacement actor registered under the same id in place (it removed the newer actor before).
- `handle.part` reuses the registry's own handle factory over a proxy spec bound to the GLB node, so every handle member keeps its semantics; world getters compose the last drawn model matrix. Registered as a C-37 member with flag `A3D_QR_COMPILER` (the C-37 provider flag, default on) from `TypedGLBActor.ts`, typed by a local module augmentation of `AuraNodeHandleExtensionMap` (no edit to `contracts/runtimeNodes.ts`).
- `TypedGLBActor.advance(dt)` added beside `crossFadeTo` / `playLayer`: without a mixer tick those two would do nothing for actors drawn outside the scene graph.
- GLB cache: `@aura3d/assets` exports no parse-lease API and has no GU47 owner, so the cache keeps the disposed actor's pipeline (render resources and textures freed at once; only its parse lease is retained). Key by value, not identity, because the renderer rebuilds `decoders` per mount. The default-on switch is its own commit (f32365df1); it pins one assertion of `tests/unit/engine/typed-glb-actor-asset-reuse.test.ts` to the uncached path (ownership exception: the file has no GU47 owner; 2-line scope change, intent unchanged).
- Crowd kit: pose-baked meshes + one instanced node per pose instead of a vertex-animation texture: it uses the existing instancing, dense instance writes, shadow and colour paths with no new shader (nothing can be pixel-verified in phase 1), and lands the 4-draw target exactly. Phases are quantised into balanced groups so a group moves between pose nodes as a block and node counts stay constant. The bake decodes no textures (1x1 stand-in decoder).
