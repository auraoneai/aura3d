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
5. WS-1.6/R1: every non-gap row names a productionPathTest that must execute the public production path. tools/claim-lineage/index.ts resolves that reachability and fails the build otherwise. A consumer proves someone imports a symbol and an artifact proves a file exists; neither proves a test observed the claimed behaviour through the public API, which is why this fourth rule exists.

This method proves implementation lineage and retained evidence. It does not, by
itself, prove equivalent pixels, runtime performance, ecosystem breadth, maintenance
risk, or installed-consumer ergonomics.

## Headline result

| Status | Rows |
| --- | ---: |
| exceed | 3 |
| parity | 45 |
| parity-unproven | 8 |
| gap | 1 |
| **total** | **57** |

### By category

| Category | exceed | parity | unproven | gap | total |
| --- | ---: | ---: | ---: | ---: | ---: |
| core rendering | 1 | 16 | 2 | 0 | 19 |
| ecosystem helpers | 1 | 9 | 1 | 1 | 12 |
| physics | 0 | 8 | 2 | 0 | 10 |
| game systems | 0 | 6 | 1 | 0 | 7 |
| application workflows | 0 | 4 | 2 | 0 | 6 |
| developer tooling | 1 | 2 | 0 | 0 | 3 |

## Where Aura3D genuinely exceeds in this historical inventory

3 rows survive the implementation, consumer, evidence, and lineage rules.
These are bounded workflow or integration results, not a universal renderer verdict.

| Capability | Why it exceeds | Evidence |
| --- | --- | --- |
| scene graph | Declarative scene builder with typed nodes; no manual add/remove bookkeeping. | `tests/reports/showcase-interaction-audit` |
| selection outlines / focus feedback | Was the flattened-bar defect: every route built its own indicator. Now one system with per-result invariants. | `tests/reports/showcase-interaction-audit` |
| interaction testing | Route-health snapshots plus a reusable interaction-audit harness that discovers and operates controls. | `tests/reports/showcase-interaction-audit` |

## Remaining gaps and unproven rows

| Capability | Status | Why it is not proven |
| --- | --- | --- |
| tone mapping / colour management | parity-unproven | no production consumer imports this capability Tone mapping is applied by the production renderer; the root API exposes it as renderer configuration rather than as a user-managed pass. |
| morph targets | parity-unproven | no production consumer imports this capability |
| contact shadows | parity-unproven | no production consumer imports this capability |
| text rendering | gap | no resolvable implementation symbol No 3D text primitive, and 1.6 deliberately does not add one: see docs/architecture/text-requirements.md. World labels are DOM — legible, accessible, crisply scaled, collision-avoiding, and now occlusion-aware (WS-2.7) — but they are not lit by the scene and cannot be extruded. Lit 3D geometry text has no consumer in this repository; adopting SDF/MSDF for the label layer would have traded accessibility and UI crispness for occlusion obtainable far more cheaply. Both deferrals carry the conditions that would make them correct. |
| vehicle dynamics | parity-unproven | The public racing kit delegates pose integration to the shared arcade vehicle owner and its wheel contacts query the extracted circuit mesh. The unreleased force-motion prototype was removed after ADR 0003 established that its physical-unit contract cannot implement game.racing's arbitrary-unit 0.5-4x arcade pace honestly. This remains parity-unproven because it is explicitly arcade handling, not a claim of physical tyre simulation. |
| vehicle AI driving | parity-unproven | The shipped arcade driver path has lineage tests for deterministic seeded steering, route recovery and the certified 60-second race. Mesh-backed wheel contact and the penetration gate also pass. The unreleased force-model-only racing-line/path-follow experiment was removed with that model. This remains parity-unproven because understeer and physical tyre slip are not represented. |
| platformer motion tuning | parity-unproven | DOWNGRADED from exceed 2026-08-04. solvePlatformerMotion sets apex = max(minApex, geometry.maxRise * apexHeadroom). maxRise is the step-up between consecutive platforms, so on a near-level course it collapses and the apex falls to minApex - the reported barely-there jump. The solver optimises for 'can technically reach the next platform', not for a usable jump, and has no notion of clearing anything that is not the immediate next platform. Restore an exceed claim only after GameEngine-PRD WS-3.6/3.7 make apex intent-derived and the WS-7.2 motion-feel gate passes. |
| cinematic sequencing | parity-unproven | no production consumer imports this capability |
| project scaffolding | parity-unproven | no production consumer imports this capability create-aura3d scaffolds a running typed project with assets and tests. |

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
| scene graph | THREE.Scene + Object3D | `scene`, `group` | yes | 98 | **exceed** | `tests/browser/agent-api-visual-smoke.spec.ts` | Declarative scene builder with typed nodes; no manual add/remove bookkeeping. |
| cameras | PerspectiveCamera / OrthographicCamera | `camera` | yes | 77 | parity | `tests/browser/createAuraApp-camera-frame-asset.spec.ts` | Orthographic is now genuinely covered: camera.orthographic()/camera.isometric() on the root API, computeOrthographicCameraFrame/computeOrthographicCameraView in rendering, and RenderSource.cameraProjection for auto-framing. Before this the row claimed OrthographicCamera while the root API exposed perspective modes only and auto-framing could build a perspective frustum only. |
| renderer configuration | WebGLRenderer options | `createAuraApp` | yes | 18 | parity | `tests/browser/production-runtime-webgl2-real-renderer.spec.ts` | Renderer selection, pixel ratio and resize handled by the app; no renderer lifecycle code in routes. |
| geometry primitives | BoxGeometry, SphereGeometry, TorusGeometry, ... | `primitives` | yes | 30 | parity | `tests/browser/multipart-primitive-draw.spec.ts` | Local axis conventions now documented via AURA_PRIMITIVE_AXES after the flattened-torus defect. |
| materials | MeshStandardMaterial / MeshPhysicalMaterial | `material` | yes | 99 | parity | `tests/browser/createAuraApp-material-pbr-contract.spec.ts` | Named material presets (clearcoatPaint, brushedMetal, clearGlass) rather than raw parameter sets. |
| custom shaders | ShaderMaterial / RawShaderMaterial | `ShaderLibrary`, `ShaderModule` | no | 2 | parity | `tests/browser/renderer-extension-escape-hatch.spec.ts` | Available through @aura3d/rendering (ShaderLibrary/ShaderModule) and three-compat, not the root safe API. |
| lights | Directional/Point/Spot/RectArea lights | `lights` | yes | 25 | parity | `tests/browser/rect-area-light.spec.ts` |  |
| shadows | shadowMap + per-light shadow config | `createProductionRuntimeShadowOptions` | yes | 10 | parity | `tests/browser/createAuraApp-shadow-contract.spec.ts` |  |
| environment maps / IBL | PMREMGenerator + RGBELoader | `environments` | yes | 4 | parity | `tests/browser/external-parity-ibl-evidence.spec.ts` | Named environment presets; no PMREM setup in user code. |
| postprocessing | EffectComposer + pass chain | `effects` | yes | 19 | parity | `tests/browser/createAuraApp-postprocess-contract.spec.ts` | Effects declared as scene nodes; no composer or pass ordering in user code. |
| tone mapping / colour management | renderer.toneMapping + outputColorSpace | `applyExternalParityToneMappingPreset`, `createExternalParityToneMappingPolicy` | yes | 0 | parity-unproven | `tests/browser/external-parity-hdr-pipeline.spec.ts` | Tone mapping is applied by the production renderer; the root API exposes it as renderer configuration rather than as a user-managed pass. |
| instancing | InstancedMesh | `InstancedMesh` | no | 1 | parity | `tests/browser/rendering-large-scene.spec.ts` | Rendering-internal; not surfaced through the root safe API. |
| skinned animation | SkinnedMesh + AnimationMixer | `AnimationMixer`, `AnimationController` | yes | 13 | parity | `tests/browser/createAuraApp-animation-bridge-contract.spec.ts` |  |
| morph targets | morphTargetInfluences | `MorphTargetMixerThreeCompat`, `applyMorphTargets` | yes | 0 | parity-unproven | `tests/browser/createAuraApp-morph-targets.spec.ts` |  |
| particles | Points + custom shaders, or third-party VFX | `ParticleSystem` | yes | 4 | parity | `tests/browser/particle-browser.spec.ts` |  |
| LOD | THREE.LOD | `LodSelection`, `LodLevel` | no | 1 | parity | `tests/browser/rendering-large-scene.spec.ts` | LOD selection exists in @aura3d/rendering but is not surfaced through the root safe API, so a route cannot declare LOD levels. |
| WebGPU | WebGPURenderer (experimental) | `WebGPUDevice` | yes | 1 | parity | `tests/browser/webgpu-real-device.spec.ts` |  |
| context loss recovery | webglcontextlost handling by hand | `onDeviceLost`, `onDeviceRestored` | yes | 1 | parity | `tests/browser/context-loss-recovery.spec.ts` | Closed by WS-2.6. app.onDeviceLost(), app.onDeviceRestored() and app.deviceLost() surface WebGL context loss through the root API, on both the production bridge and the agent-runtime path — the latter matters because a primitive-only scene is not production-eligible, so wiring only the bridge would have delivered an API that does nothing for the common case. Subscriptions registered before the renderer mounts are held and attached on arrival, so a developer does not have to await ready() first. Unsubscribe is keyed per listener rather than a flat list, which fixed a double-subscription leak: a listener registered pre-mount got two controller subscriptions and kept firing after unsubscribe. Not claimed: automatic resource recreation. Aura3D reports the loss and lets the app decide; a route that must recover recreates its scene. |
| resource disposal | manual geometry/material/texture dispose() | `dispose` | yes | 38 | parity | `tests/browser/rendering-context-lifecycle.spec.ts` | App owns the lifecycle; routes call app.dispose() rather than tracking GPU objects. |

### ecosystem helpers

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| orbit controls | OrbitControls from three/examples | `interactions` | yes | 21 | parity | `tests/browser/threejs-parity-orbit-controls.spec.ts` | interactions.orbit() is a scene node; no control instance to construct, update or dispose. |
| transform controls / gizmos | TransformControls | `TransformControls` | no | 1 | parity | `tests/browser/threejs-parity-transform-controls.spec.ts` | Available in @aura3d/controls, not through the root safe API. |
| bounds fitting / object centering | Box3.setFromObject + manual camera math, or drei Bounds | `placedBoundsFromAsset`, `groundedRenderedAssetPlacement`, `focusCameraIntent` | yes | 3 | parity | `tests/browser/createAuraApp-model-sizing.spec.ts` | Asset-relative anchoring derives placement and framing from typed asset bounds. |
| HTML / world labels | CSS2DRenderer or drei Html | `labels`, `createWorldLabelLayer`, `projectWorldLabels` | yes | 23 | parity | `tests/browser/current-routes-route-health.spec.ts` | Was a gap: labels reached the scene graph but were only drawn in the canvas2d fallback. Now a real world-anchored layer in the production path. |
| selection outlines / focus feedback | OutlinePass, or hand-built indicator geometry | `focusObject`, `focusSemanticRegion` | yes | 2 | **exceed** | `tests/browser/native-outline-pixel.spec.ts` | Was the flattened-bar defect: every route built its own indicator. Now one system with per-result invariants. |
| glTF loading | GLTFLoader + DRACO/KTX2 setup | `model`, `GLTFLoader` | yes | 29 | parity | `tests/browser/external-parity-gltf-visual-corpus.spec.ts` | Typed asset references with provenance; no loader configuration or URL strings in routes. |
| environment / staging presets | drei Environment + Stage | `environments`, `prefabs` | yes | 6 | parity | `tests/browser/environment-background.spec.ts` |  |
| contact shadows | drei ContactShadows | `contactOcclusion`, `contactShadows` | yes | 0 | parity-unproven | `tests/browser/runtime-parity-contact-shadow-parity.spec.ts` |  |
| performance monitor | stats.js | `createDiagnosticsOverlay`, `AuraDiagnostics` | yes | 35 | parity | `tests/browser/rendering-debug-timing.spec.ts` | Diagnostics overlay reports backend, draw calls, renderer features and now placed labels. |
| scene inspector | three-devtools or custom | `createGameInspector`, `collectAuraSceneEvidence` | yes | 9 | parity | `tests/browser/debug-browser.spec.ts` |  |
| text rendering | troika-three-text or TextGeometry | `TextGeometry` | no | 0 | gap | none | No 3D text primitive, and 1.6 deliberately does not add one: see docs/architecture/text-requirements.md. World labels are DOM — legible, accessible, crisply scaled, collision-avoiding, and now occlusion-aware (WS-2.7) — but they are not lit by the scene and cannot be extruded. Lit 3D geometry text has no consumer in this repository; adopting SDF/MSDF for the label layer would have traded accessibility and UI crispness for occlusion obtainable far more cheaply. Both deferrals carry the conditions that would make them correct. |
| occlusion-aware annotations | drei Html with occlude, or a hand-written depth test | `labels`, `projectWorldLabels` | yes | 23 | parity | `tests/browser/label-occlusion.spec.ts` | WS-2.7. A label whose subject is behind geometry is dimmed (default) or hidden, per occlusionPolicy. The gap this closed was not missing code but a DECLARED option that did nothing: occlusionAware defaulted to true on every labels.billboard/anchor/axisTick, was accepted by AuraLabelOptions and set by FocusSelection, and worldLabelsFromSnapshot never read it — WorldLabel had no field for it. Implemented as a world-space segment-vs-box test from the camera eye rather than a depth-buffer read, because WebGL2 cannot read depth from the default framebuffer and because the real question is whether the annotated subject is hidden, which is a scene property rather than a pixel property. The subject's own box is skipped so a label cannot occlude itself. |

### physics

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| rigid bodies | Rapier or Cannon integration | `PhysicsWorld`, `RigidBody` | yes | 4 | parity | `tests/unit/physics/public-physics-runtime.test.ts` |  |
| colliders | Rapier colliders | `Collider`, `createGameBoxCollider` | yes | 2 | parity | `tests/unit/physics/public-physics-runtime.test.ts` |  |
| raycasting | THREE.Raycaster / Rapier ray | `RaycastHit`, `groundHeightRaycaster`, `SphereCastHit` | yes | 1 | parity | `tests/unit/physics/public-physics-runtime.test.ts` |  |
| character controller | Rapier KinematicCharacterController | `CharacterController`, `createGameKinematicBody` | yes | 1 | parity | `tests/browser/runtime-character-controller.spec.ts` |  |
| vehicle dynamics | Rapier vehicle controller, hand-tuned | `createVehicleChassis`, `vehicleChassisSpecFromBounds`, `createGameArcadeVehicle` | yes | 1 | parity-unproven | `tests/browser/turbo-vehicle-grounding.spec.ts` | The public racing kit delegates pose integration to the shared arcade vehicle owner and its wheel contacts query the extracted circuit mesh. The unreleased force-motion prototype was removed after ADR 0003 established that its physical-unit contract cannot implement game.racing's arbitrary-unit 0.5-4x arcade pace honestly. This remains parity-unproven because it is explicitly arcade handling, not a claim of physical tyre simulation. |
| vehicle AI driving | no standard solution; hand-written per project | `createVehicleDriverAi` | yes | 1 | parity-unproven | `tests/browser/turbo-opponent-distinction.spec.ts` | The shipped arcade driver path has lineage tests for deterministic seeded steering, route recovery and the certified 60-second race. Mesh-backed wheel contact and the penetration gate also pass. The unreleased force-model-only racing-line/path-follow experiment was removed with that model. This remains parity-unproven because understeer and physical tyre slip are not represented. |
| joints / constraints | Rapier joints | `Constraint` | yes | 1 | parity | `tests/unit/physics/public-joints.test.ts` |  |
| continuous collision detection | Rapier CCD flag | `timeOfImpact`, `TimeOfImpactHit` | yes | 1 | parity | `tests/unit/physics/ccd-or-fast-body.test.ts` |  |
| deterministic stepping | fixed-step loop by hand | `PhysicsStepper`, `createFrameLoop` | yes | 1 | parity | `tests/unit/physics/public-physics-runtime.test.ts` |  |
| physics debug rendering | Rapier debug render lines | `PhysicsDebugDraw`, `createGameColliderDebugGeometry` | yes | 1 | parity | `tests/browser/physics-browser.spec.ts` |  |

### game systems

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| input mapping | hand-written keydown handling | `createGameInput` | yes | 5 | parity | `tests/browser/input-browser.spec.ts` | Action and axis bindings with buffering and replay export. |
| camera rigs | hand-written chase/follow cameras | `createGameRacingCameraRig`, `createGamePlatformerCameraRig`, `createGameCameraDirector` | yes | 2 | parity | `tests/browser/camera-grid-browser.spec.ts` |  |
| platformer motion tuning | hand-tuned gravity and jump velocity | `solvePlatformerMotion`, `validatePlatformerMotion` | yes | 1 | parity-unproven | `tests/browser/skyline-platformer-motion.spec.ts` | DOWNGRADED from exceed 2026-08-04. solvePlatformerMotion sets apex = max(minApex, geometry.maxRise * apexHeadroom). maxRise is the step-up between consecutive platforms, so on a near-level course it collapses and the apex falls to minApex - the reported barely-there jump. The solver optimises for 'can technically reach the next platform', not for a usable jump, and has no notion of clearing anything that is not the immediate next platform. Restore an exceed claim only after GameEngine-PRD WS-3.6/3.7 make apex intent-derived and the WS-7.2 motion-feel gate passes. |
| frame-based combat | hand-written state machine and frame data | `solveCombatFrameData`, `validateCombatFrameData`, `createCombatAi` | yes | 1 | parity | `tests/browser/fighting-game-runtime.spec.ts` | Frame data validated as frame data. Aura Clash shipped 12-32 active frames against 4-5 recovery frames, inverted from any real fighting game. |
| session lifecycle / objectives | hand-written per project | `createGameRacingKit`, `createGamePlatformerKit`, `createGameFallingBlocksKit` | yes | 3 | parity | `tests/browser/game-runtime-visual.spec.ts` |  |
| touch controls | hand-written pointer handlers | `bindGameTouchControls`, `createGameTouchControlLayout` | yes | 3 | parity | `tests/browser/runtime-external-parity.spec.ts` |  |
| deterministic replay | hand-written input recording | `createGameInputReplay`, `exportGameInputReplay` | yes | 1 | parity | `tests/browser/fighting-game-runtime.spec.ts` |  |

### application workflows

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| product configurator | assemble R3F + drei + custom selection | `product`, `focusSemanticRegion` | yes | 29 | parity | `tests/browser/production-runtime-product-configurator.spec.ts` | Route is verified interactive but does not yet consume a reusable configurator kit. |
| digital twin | assemble R3F + custom overlays | `checkSpatialInvariants`, `resolveSemanticRegion` | yes | 4 | parity | `tests/browser/current-routes-route-health.spec.ts` | Asset-relative anchoring replaces literal helper coordinates; no reusable twin kit yet. |
| architecture walkthrough | assemble R3F + camera paths | `createGameRacingPresentationCamera`, `timeline` | yes | 15 | parity | `tests/browser/production-runtime-architecture-viewer.spec.ts` |  |
| data visualisation | assemble R3F + custom charts | `charts`, `dataBars3D` | yes | 2 | parity | `tests/browser/data-galaxy-reference.spec.ts` |  |
| cinematic sequencing | assemble Theatre.js or custom | `createSceneSequencer`, `createShotTimeline` | yes | 0 | parity-unproven | `tests/browser/production-runtime-cinematic-postprocess.spec.ts` |  |
| project scaffolding | vite template + manual wiring | `createA3DProject`, `CREATE_AURA3D_TEMPLATES` | yes | 0 | parity-unproven | `tests/browser/clean-room-projects.spec.ts` | create-aura3d scaffolds a running typed project with assets and tests. |

### developer tooling

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| asset pipeline / provenance | manual asset management | `assets`, `createAssetProvenance` | yes | 60 | parity | `tests/browser/createAuraApp-asset-probe.spec.ts` | Typed asset map with hashes and license provenance generated by the CLI. |
| interaction testing | hand-written Playwright per project | `createAuraRouteHealthSnapshot` | yes | 2 | **exceed** | `tests/browser/current-routes-route-health.spec.ts` | Route-health snapshots plus a reusable interaction-audit harness that discovers and operates controls. |
| runtime invariant reporting | no standard solution | `checkSpatialInvariants`, `validatePlatformerMotion`, `validateCombatFrameData` | yes | 4 | parity | `tests/browser/runtime-systems.spec.ts` | Geometric and gameplay correctness published as machine-checkable reports. |

## Claim boundary

This generated inventory may support a statement about a specifically named row and
its retained historical evidence. It may not support `current`, `head-to-head`, broad
`parity`, `replacement`, or performance wording. Those claims require the r185 current
comparison program defined in `1.6-FINAL-PRD-Finishes.md`.
