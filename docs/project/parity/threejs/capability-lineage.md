# Aura3D vs the practical Three.js ecosystem

**Generated report:** `tests/reports/aura3d-threejs-ecosystem-parity.json`
**Regenerate JSON and Markdown:** `node tools/product-remediation/build-threejs-parity.mjs`
**Frozen baseline:** three@0.165.0 historical capability inventory
**Current comparison lock:** `benchmark/context/threejs-r185.1-20260808.json`

> This is historical capability-lineage evidence. It does not establish current
> Three.js r185 renderer quality, performance, workflow, or ecosystem parity.

## Method, and why it is adversarial

The comparison inventory covers the practical stack developers assemble around
Three.js, but its expected-solution column was authored against `three@0.165.0`.
The final competitive program must use the separate current-baseline lock and
like-for-like workload evidence before making a current claim.

Every row is derived under these rules:

1. Each row's implementation must resolve to a real exported symbol or agent-API source.
2. Parity requires at least one app or example that actually imports the capability.
3. An exceed claim additionally requires retained runtime evidence that exists on disk.
4. The generator downgrades rows whose evidence is missing and records why, so this table cannot overstate the product.
5. 2.0 rule: every non-gap row names a productionPathTest that must execute the public production path. tools/claim-lineage/index.ts resolves that reachability and fails the build otherwise. A consumer proves someone imports a symbol and an artifact proves a file exists; neither proves a test observed the claimed behaviour through the public API.

This method proves implementation lineage and retained evidence. It does not, by
itself, prove equivalent pixels, runtime performance, ecosystem breadth, maintenance
risk, or installed-consumer ergonomics.

## Headline result

| Status | Rows |
| --- | ---: |
| exceed | 2 |
| parity | 33 |
| parity-unproven | 21 |
| gap | 1 |
| **total** | **57** |

### By category

| Category | exceed | parity | unproven | gap | total |
| --- | ---: | ---: | ---: | ---: | ---: |
| core rendering | 1 | 15 | 3 | 0 | 19 |
| ecosystem helpers | 0 | 7 | 4 | 1 | 12 |
| physics | 0 | 3 | 7 | 0 | 10 |
| game systems | 0 | 3 | 4 | 0 | 7 |
| application workflows | 0 | 3 | 3 | 0 | 6 |
| developer tooling | 1 | 2 | 0 | 0 | 3 |

## Where Aura3D genuinely exceeds in this historical inventory

2 rows survive the implementation, consumer, evidence, and lineage rules.
These are bounded workflow or integration results, not a universal renderer verdict.

| Capability | Why it exceeds | Evidence |
| --- | --- | --- |
| scene graph | Declarative scene builder with typed nodes; no manual add/remove bookkeeping. | `tests/reports/showcase-interaction-audit` |
| interaction testing | Route-health snapshots plus a reusable interaction-audit harness that discovers and operates controls. | `tests/reports/showcase-interaction-audit` |

## Remaining gaps and unproven rows

| Capability | Status | Why it is not proven |
| --- | --- | --- |
| custom shaders | parity-unproven | no production consumer imports this capability Available through @aura3d/rendering (ShaderLibrary/ShaderModule) and three-compat, not the root safe API. |
| instancing | parity-unproven | no production consumer imports this capability Rendering-internal; not surfaced through the root safe API. |
| LOD | parity-unproven | no production consumer imports this capability Bounded current parity: distanceLod is exposed through the root safe API, exercised by the root geometry/instancing/LOD browser spec, and compared with THREE.LOD on the locked r185 workload. The Smart City showcase and large-scene example that consumed it were removed in the 30-game prune. Imported-model instancing, draw-call, performance, and universal visual parity are not claimed. |
| transform controls / gizmos | parity-unproven | no production consumer imports this capability Available in @aura3d/controls, not through the root safe API. |
| bounds fitting / object centering | parity-unproven | no production consumer imports this capability Asset-relative anchoring derives placement and framing from typed asset bounds. |
| selection outlines / focus feedback | parity-unproven | no production consumer imports this capability Was the flattened-bar defect: every route built its own indicator. Now one system with per-result invariants. |
| scene inspector | parity-unproven | no production consumer imports this capability |
| text rendering | gap | no resolvable implementation symbol Aura3D does not ship troika-three-text or a general TextGeometry font stack. `text3D` is a bounded extruded bitmap-glyph mesh (A–Z, 0–9, space, dash, period). World labels are DOM UI — accessible, collision-avoiding, occlusion-aware — and are not lit 3D text. See docs/rendering/world-labels-and-text.md. |
| rigid bodies | parity-unproven | no production consumer imports this capability |
| raycasting | parity-unproven | no production consumer imports this capability |
| physical character controller | parity-unproven | no production consumer imports this capability |
| vehicle dynamics | parity-unproven | no production consumer imports this capability The public racing kit delegates pose integration to the shared arcade vehicle owner and its wheel contacts query the extracted circuit mesh. The unreleased force-motion prototype was removed after ADR 0003 established that its physical-unit contract cannot implement game.racing's arbitrary-unit 0.5-4x arcade pace honestly. This remains parity-unproven because it is explicitly arcade handling, not a claim of physical tyre simulation. |
| vehicle AI driving | parity-unproven | no production consumer imports this capability The shipped arcade driver path has lineage tests for deterministic seeded steering, route recovery and the certified 60-second race. Mesh-backed wheel contact and the penetration gate also pass. The unreleased force-model-only racing-line/path-follow experiment was removed with that model. This remains parity-unproven because understeer and physical tyre slip are not represented. |
| continuous collision detection | parity-unproven | no production consumer imports this capability |
| deterministic stepping | parity-unproven | no production consumer imports this capability |
| frame-based combat | parity-unproven | no production consumer imports this capability no production-path test executes this capability through the public API: its evidence, tests/browser/fighting-game-runtime.spec.ts, was deleted with the runtime-game-slice fixture in the 30-game prune (d9ac53cf7), and it exercised the game.fighting kit's hit events rather than frame data. The only surviving test of solveCombatFrameData / validateCombatFrameData / createCombatAi (tests/unit/engine/combat-frame-data.test.ts) deep-imports agent-api/CombatFrameData, which satisfies nothing under R1. Frame data validated as frame data. Aura Clash shipped 12-32 active frames against 4-5 recovery frames, inverted from any real fighting game. |
| session lifecycle / objectives | parity-unproven | no production-path test executes this capability through the public API: its evidence, tests/browser/game-runtime-visual.spec.ts, was deleted with the runtime-game-slice fixture in the 30-game prune (d9ac53cf7). The surviving specs that drive game.platformer / game.racing (clean-room-projects.spec.ts) prove input and reset are observable but assert no objective progress or completion, and the showcase gameplay proofs target deleted routes. |
| touch controls | parity-unproven | no production-path test executes this capability through the public API: its evidence, tests/browser/runtime-external-parity.spec.ts, was deleted with examples/game-slice in the 30-game prune (d9ac53cf7). showcase-touch-controls.spec.ts still targets two deleted showcase routes; the bindGameTouchControls / createGameTouchControlLayout unit tests deep-import agent-api files; tests/browser/game-shell/touch.spec.ts drives @aura3d/game's shell through a subdirectory harness page this tool cannot follow. |
| deterministic replay | parity-unproven | no production consumer imports this capability |
| digital twin | parity-unproven | no production consumer imports this capability Asset-relative anchoring replaces literal helper coordinates; no reusable twin kit yet. |
| architecture walkthrough | parity-unproven | no production-path test executes this capability through the public API: its evidence, tests/browser/production-runtime-architecture-viewer.spec.ts, drove apps/architecture-viewer, deleted in the 30-game prune (90dacc2db/d9ac53cf7). No surviving public-path test exercises createGameRacingPresentationCamera or timeline as a walkthrough; the current head-to-head cinematic-architecture workload only remounts static camera poses and is not reachable through a public entry this tool resolves. |
| data visualisation | parity-unproven | no production consumer imports this capability |

## Categories where the current Three.js ecosystem remains ahead

- **Ecosystem breadth:** official examples, addons, loaders, community libraries,
  integrations, learning material, hiring familiarity, and production history.
- **Rendering feature depth:** current WebGPURenderer, TSL/node materials, node-based
  postprocessing, and maintained WebGL2 remain moving targets outside this historical
  inventory.
- **Escape hatches:** raw Three.js and React Three Fiber expose lower-level composition
  directly; Aura3D must prove its public extension path from installed packages.
- **Adoption risk:** this inventory does not erase Three.js's larger maintainer, user,
  example, and third-party integration base.

## Full row detail

### core rendering

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| scene graph | THREE.Scene + Object3D | `scene`, `group` | yes | 39 | **exceed** | `tests/browser/agent-api-visual-smoke.spec.ts` | Declarative scene builder with typed nodes; no manual add/remove bookkeeping. |
| cameras | PerspectiveCamera / OrthographicCamera | `camera` | yes | 41 | parity | `tests/browser/createAuraApp-camera-frame-asset.spec.ts` | Orthographic is now genuinely covered: camera.orthographic()/camera.isometric() on the root API, computeOrthographicCameraFrame/computeOrthographicCameraView in rendering, and RenderSource.cameraProjection for auto-framing. Before this the row claimed OrthographicCamera while the root API exposed perspective modes only and auto-framing could build a perspective frustum only. |
| renderer configuration | WebGLRenderer options | `createAuraApp` | yes | 30 | parity | `tests/browser/production-runtime-webgl2-real-renderer.spec.ts` | Renderer selection, pixel ratio and resize handled by the app; no renderer lifecycle code in routes. |
| geometry primitives | BoxGeometry, SphereGeometry, TorusGeometry, ... | `primitives` | yes | 32 | parity | `tests/browser/multipart-primitive-draw.spec.ts` | Local axis conventions now documented via AURA_PRIMITIVE_AXES after the flattened-torus defect. |
| materials | MeshStandardMaterial / MeshPhysicalMaterial | `material` | yes | 42 | parity | `tests/browser/createAuraApp-material-pbr-contract.spec.ts` | Named material presets (clearcoatPaint, brushedMetal, clearGlass) rather than raw parameter sets. |
| custom shaders | ShaderMaterial / RawShaderMaterial | `ShaderLibrary`, `ShaderModule` | no | 0 | parity-unproven | `tests/browser/renderer-extension-escape-hatch.spec.ts` | Available through @aura3d/rendering (ShaderLibrary/ShaderModule) and three-compat, not the root safe API. |
| lights | Directional/Point/Spot/RectArea lights | `lights` | yes | 38 | parity | `tests/browser/rect-area-light.spec.ts` |  |
| shadows | shadowMap + per-light shadow config | `createProductionRuntimeShadowOptions` | yes | 35 | parity | `tests/browser/createAuraApp-shadow-contract.spec.ts` |  |
| environment maps / IBL | PMREMGenerator + RGBELoader | `environments` | yes | 24 | parity | `tests/browser/external-parity-ibl-evidence.spec.ts` | Named environment presets; no PMREM setup in user code. |
| postprocessing | EffectComposer + pass chain | `effects` | yes | 37 | parity | `tests/browser/createAuraApp-postprocess-contract.spec.ts` | Effects declared as scene nodes; no composer or pass ordering in user code. |
| tone mapping / colour management | renderer.toneMapping + outputColorSpace | `applyExternalParityToneMappingPreset`, `createExternalParityToneMappingPolicy` | yes | 36 | parity | `tests/browser/exposure-calibration.spec.ts` | Bounded feature parity: public route configuration drives the production tone-mapping/color-space path and retained browser evidence proves pixel-backed output. The current comparison retains visible material/highlight differences, so identical pixels or universal visual parity are not claimed. |
| instancing | InstancedMesh | `InstancedMesh` | no | 0 | parity-unproven | `tests/browser/root-geometry-instancing-lod-text.spec.ts` | Rendering-internal; not surfaced through the root safe API. |
| skinned animation | SkinnedMesh + AnimationMixer | `AnimationMixer`, `AnimationController` | yes | 12 | parity | `tests/browser/createAuraApp-animation-bridge-contract.spec.ts` |  |
| morph targets | morphTargetInfluences | `MorphTargetMixerThreeCompat`, `applyMorphTargets` | yes | 1 | parity | `tests/browser/createAuraApp-morph-targets.spec.ts` | Bounded current parity: the implementation symbols feed the public runtime-node setMorphTarget(s) API exercised by the character-animation example and the locked Three r185 skinned/morph workload. The retained comparison does not claim draw-call, performance, or ecosystem-wide visual parity. |
| particles | Points + custom shaders, or third-party VFX | `ParticleSystem` | yes | 8 | parity | `tests/browser/particle-browser.spec.ts` |  |
| LOD | THREE.LOD | `distanceLod` | yes | 0 | parity-unproven | `tests/browser/root-geometry-instancing-lod-text.spec.ts` | Bounded current parity: distanceLod is exposed through the root safe API, exercised by the root geometry/instancing/LOD browser spec, and compared with THREE.LOD on the locked r185 workload. The Smart City showcase and large-scene example that consumed it were removed in the 30-game prune. Imported-model instancing, draw-call, performance, and universal visual parity are not claimed. |
| WebGPU | WebGPURenderer (experimental) | `WebGPUDevice` | yes | 3 | parity | `tests/browser/webgpu-real-device.spec.ts` |  |
| context loss recovery | webglcontextlost handling by hand | `onDeviceLost`, `onDeviceRestored` | yes | 5 | parity | `tests/browser/render-path-edge-cases.spec.ts` | Closed for the bounded root path by WS-2.6 and WS-3.9. app.onDeviceLost(), app.onDeviceRestored() and app.deviceLost() surface WebGL context loss through the root API. The render-path edge-case browser spec forces a real WEBGL_lose_context loss, observes the lost and restored events, explicitly remounts the same scene after restoration on the same render path, and proves the restored frame matches the pre-loss frame within 2%. Subscriptions registered before renderer mount attach on arrival and unsubscribe is listener-specific. Not claimed: universal transparent recreation of arbitrary caller-owned GPU resources; recovery is app-driven through the public remount API. |
| resource disposal | manual geometry/material/texture dispose() | `dispose` | yes | 21 | parity | `tests/browser/rendering-context-lifecycle.spec.ts` | App owns the lifecycle; routes call app.dispose() rather than tracking GPU objects. |

### ecosystem helpers

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| orbit controls | OrbitControls from three/examples | `interactions` | yes | 2 | parity | `tests/browser/orbit-map-options-301.spec.ts` | interactions.orbit() is a scene node; no control instance to construct, update or dispose. |
| transform controls / gizmos | TransformControls | `TransformControls` | no | 0 | parity-unproven | `tests/browser/threejs-parity-transform-controls.spec.ts` | Available in @aura3d/controls, not through the root safe API. |
| bounds fitting / object centering | Box3.setFromObject + manual camera math, or drei Bounds | `placedBoundsFromAsset`, `groundedRenderedAssetPlacement`, `focusCameraIntent` | yes | 0 | parity-unproven | `tests/browser/createAuraApp-model-sizing.spec.ts` | Asset-relative anchoring derives placement and framing from typed asset bounds. |
| HTML / world labels | CSS2DRenderer or drei Html | `labels`, `createWorldLabelLayer`, `projectWorldLabels` | yes | 13 | parity | `tests/browser/label-occlusion.spec.ts` | Was a gap: labels reached the scene graph but were only drawn in the canvas2d fallback. Now a real world-anchored layer in the production path. |
| selection outlines / focus feedback | OutlinePass, or hand-built indicator geometry | `focusObject`, `focusSemanticRegion` | yes | 0 | parity-unproven | `tests/browser/native-outline-pixel.spec.ts` | Was the flattened-bar defect: every route built its own indicator. Now one system with per-result invariants. |
| glTF loading | GLTFLoader + DRACO/KTX2 setup | `model`, `GLTFLoader` | yes | 50 | parity | `tests/browser/external-parity-gltf-visual-corpus.spec.ts` | Typed asset references with provenance; no loader configuration or URL strings in routes. |
| environment / staging presets | drei Environment + Stage | `environments`, `prefabs` | yes | 24 | parity | `tests/browser/environment-background.spec.ts` |  |
| contact shadows | drei ContactShadows | `contactOcclusion`, `contactShadows` | yes | 31 | parity | `tests/browser/runtime-parity-contact-shadow-parity.spec.ts` | Bounded receiver-contact approximation plus renderer-owned directional shadow map only; not full screen-space, ray-traced, or general drei ContactShadows parity. |
| performance monitor | stats.js | `createDiagnosticsOverlay`, `AuraDiagnostics` | yes | 24 | parity | `tests/browser/rendering-debug-timing.spec.ts` | Diagnostics overlay reports backend, draw calls, renderer features and now placed labels. |
| scene inspector | three-devtools or custom | `createGameInspector`, `collectAuraSceneEvidence` | yes | 0 | parity-unproven | `tests/browser/debug-browser.spec.ts` |  |
| text rendering | troika-three-text or TextGeometry | `TextGeometry` | no | 0 | gap | none | Aura3D does not ship troika-three-text or a general TextGeometry font stack. `text3D` is a bounded extruded bitmap-glyph mesh (A–Z, 0–9, space, dash, period). World labels are DOM UI — accessible, collision-avoiding, occlusion-aware — and are not lit 3D text. See docs/rendering/world-labels-and-text.md. |
| occlusion-aware annotations | drei Html with occlude, or a hand-written depth test | `labels`, `projectWorldLabels` | yes | 13 | parity | `tests/browser/label-occlusion.spec.ts` | WS-2.7. A label whose subject is behind geometry is dimmed (default) or hidden, per occlusionPolicy. The gap this closed was not missing code but a DECLARED option that did nothing: occlusionAware defaulted to true on every labels.billboard/anchor/axisTick, was accepted by AuraLabelOptions and set by FocusSelection, and worldLabelsFromSnapshot never read it — WorldLabel had no field for it. Implemented as a world-space segment-vs-box test from the camera eye rather than a depth-buffer read, because WebGL2 cannot read depth from the default framebuffer and because the real question is whether the annotated subject is hidden, which is a scene property rather than a pixel property. The subject's own box is skipped so a label cannot occlude itself. |

### physics

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| rigid bodies | Rapier integration | `PhysicsWorld`, `RigidBody` | yes | 0 | parity-unproven | `tests/unit/physics/public-physics-runtime.test.ts` |  |
| colliders | Rapier colliders | `Collider`, `createGameBoxCollider` | yes | 4 | parity | `tests/unit/physics/public-physics-runtime.test.ts` |  |
| raycasting | THREE.Raycaster / Rapier ray | `RaycastHit`, `groundHeightRaycaster`, `SphereCastHit` | yes | 0 | parity-unproven | `tests/unit/physics/public-physics-runtime.test.ts` |  |
| physical character controller | Rapier KinematicCharacterController | `RapierCharacterControllerHandle` | yes | 0 | parity-unproven | `tests/unit/physics-rapier/rapier-adapter.test.ts` |  |
| vehicle dynamics | Rapier vehicle controller, hand-tuned | `createVehicleChassis`, `vehicleChassisSpecFromBounds`, `createGameArcadeVehicle` | yes | 0 | parity-unproven | `tests/browser/turbo-vehicle-grounding.spec.ts` | The public racing kit delegates pose integration to the shared arcade vehicle owner and its wheel contacts query the extracted circuit mesh. The unreleased force-motion prototype was removed after ADR 0003 established that its physical-unit contract cannot implement game.racing's arbitrary-unit 0.5-4x arcade pace honestly. This remains parity-unproven because it is explicitly arcade handling, not a claim of physical tyre simulation. |
| vehicle AI driving | no standard solution; hand-written per project | `createVehicleDriverAi` | yes | 0 | parity-unproven | `tests/browser/turbo-opponent-distinction.spec.ts` | The shipped arcade driver path has lineage tests for deterministic seeded steering, route recovery and the certified 60-second race. Mesh-backed wheel contact and the penetration gate also pass. The unreleased force-model-only racing-line/path-follow experiment was removed with that model. This remains parity-unproven because understeer and physical tyre slip are not represented. |
| joints / constraints | Rapier joints | `Constraint` | yes | 1 | parity | `tests/unit/physics/public-joints.test.ts` |  |
| continuous collision detection | Rapier CCD flag | `timeOfImpact`, `TimeOfImpactHit` | yes | 0 | parity-unproven | `tests/unit/physics/ccd-or-fast-body.test.ts` |  |
| deterministic stepping | fixed-step loop by hand | `PhysicsStepper`, `createFrameLoop` | yes | 0 | parity-unproven | `tests/unit/physics/public-physics-runtime.test.ts` |  |
| physics debug rendering | Rapier debug render lines | `PhysicsDebugDraw`, `createGameColliderDebugGeometry` | yes | 1 | parity | `tests/browser/physics-browser.spec.ts` |  |

### game systems

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| input mapping | hand-written keydown handling | `createGameInput` | yes | 1 | parity | `tests/browser/input-browser.spec.ts` | Action and axis bindings with buffering and replay export. |
| camera rigs | hand-written chase/follow cameras | `createGameRacingCameraRig`, `createGamePlatformerCameraRig`, `createGameCameraDirector` | yes | 1 | parity | `tests/browser/camera-grid-browser.spec.ts` |  |
| platformer motion tuning | hand-tuned gravity and jump velocity | `solvePlatformerMotion`, `validatePlatformerMotion` | yes | 1 | parity | `tests/browser/skyline-platformer-motion.spec.ts` | The old geometry-derived barely-there jump is removed. Skyline now declares responsive intent and character-relative jump height; the engine solver validates six clearance/readability invariants across 111 platforms and derives an estimated 137.4-second traversal for the 151.1-unit course. This proves the bounded authored Skyline motion contract, not generic platformer feel superiority or physics parity. |
| frame-based combat | hand-written state machine and frame data | `solveCombatFrameData`, `validateCombatFrameData`, `createCombatAi` | yes | 0 | parity-unproven | none | Frame data validated as frame data. Aura Clash shipped 12-32 active frames against 4-5 recovery frames, inverted from any real fighting game. |
| session lifecycle / objectives | hand-written per project | `createGameRacingKit`, `createGamePlatformerKit`, `createGameFallingBlocksKit` | yes | 1 | parity-unproven | none |  |
| touch controls | hand-written pointer handlers | `bindGameTouchControls`, `createGameTouchControlLayout` | yes | 2 | parity-unproven | none |  |
| deterministic replay | hand-written input recording | `createGameInputReplay`, `exportGameInputReplay` | yes | 0 | parity-unproven | `tests/unit/game-runtime/native-input-device-replay.test.ts` |  |

### application workflows

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| product configurator | assemble R3F + drei + custom selection | `product`, `focusSemanticRegion` | yes | 9 | parity | `tests/browser/clean-room-projects.spec.ts` | Route is verified interactive but does not yet consume a reusable configurator kit. |
| digital twin | assemble R3F + custom overlays | `checkSpatialInvariants`, `resolveSemanticRegion` | yes | 0 | parity-unproven | `tests/browser/clean-room-projects.spec.ts` | Asset-relative anchoring replaces literal helper coordinates; no reusable twin kit yet. |
| architecture walkthrough | assemble R3F + camera paths | `createGameRacingPresentationCamera`, `timeline` | yes | 3 | parity-unproven | none |  |
| data visualisation | assemble R3F + custom charts | `charts`, `dataBars3D` | yes | 0 | parity-unproven | `tests/browser/agent-api-visual-smoke.spec.ts` |  |
| cinematic sequencing | assemble Theatre.js or custom | `createSceneSequencer`, `createShotTimeline` | yes | 4 | parity | `tests/unit/agent-api/animation-production-pipeline.test.ts` | Bounded workflow parity: the public scene sequencer and camera-path presets are exercised deterministically through the engine barrel (shot sampling, play, step, pause, scrub, jump-to-shot). That evidence is not rendered; the flagship cinematic-architecture route was removed in the 30-game prune. This does not claim Theatre.js authoring breadth, draw-call parity, postprocess parity, or universal visual parity. |
| project scaffolding | vite template + manual wiring | `createA3DProject`, `CREATE_AURA3D_TEMPLATES` | yes | 1 | parity | `tests/browser/clean-room-projects.spec.ts` | The published CLI is the production consumer. A fresh product-viewer scaffold is built, served, and interacted with against the current Three/R3F/Drei baseline; all 19 templates are separately verified from exact installed tarballs. Aura was slower in all seven retained local workflow phases, so an exceed claim is not made. |

### developer tooling

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| asset pipeline / provenance | manual asset management | `assets`, `createAssetProvenance` | yes | 50 | parity | `tests/browser/createAuraApp-asset-probe.spec.ts` | Typed asset map with hashes and license provenance generated by the CLI. |
| interaction testing | hand-written Playwright per project | `createAuraRouteHealthSnapshot` | yes | 16 | **exceed** | `tests/browser/showcase-route-interaction-audit.spec.ts` | Route-health snapshots plus a reusable interaction-audit harness that discovers and operates controls. |
| runtime invariant reporting | no standard solution | `checkSpatialInvariants`, `validatePlatformerMotion`, `validateCombatFrameData` | yes | 1 | parity | `tests/browser/clean-room-projects.spec.ts` | Geometric and gameplay correctness published as machine-checkable reports. |

## Claim boundary

This generated inventory may support a statement about a specifically named row and
its retained historical evidence. It may not support `current`, `head-to-head`, broad
`parity`, `replacement`, or performance wording. Those claims require the r185 current
Aura3D 2.0 comparison program and its current evidence rules.
