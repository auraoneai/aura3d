# Aura3D vs the practical Three.js ecosystem

**Generated report:** `tests/reports/aura3d-threejs-ecosystem-parity.json`
**Regenerate:** `node tools/product-remediation/build-threejs-parity.mjs`
**Baseline:** 1.5.0 under remediation

## Method, and why it is adversarial

The comparison is against the stack a developer actually assembles: Three.js plus React
Three Fiber, Drei-style helpers, Rapier or Cannon, glTF tooling, camera controls,
postprocessing, animation mixers, stats.js, and hand-written game-loop and AI code.

Every row's status is **derived, not asserted**. The generator enforces three rules:

1. The implementation must resolve to a real exported symbol or source declaration.
   A row naming an API that does not exist becomes `gap`.
2. Parity requires at least one app or example that actually consumes the capability.
   An unused API is a claim, not a capability, so it becomes `parity-unproven`.
3. An `exceed` claim additionally requires retained runtime evidence that exists on
   disk. Without it the row is downgraded to `parity` and the reason is recorded in
   `downgradeReasons`.

That last rule is the point. Writing this table by hand would produce a marketing
document; making the generator refuse claims it cannot back produces a measurement. The
first run downgraded 22 of 56 rows.

Two honest caveats about the method itself:

- Consumer detection matches namespaced calls (`game.input(...)`) as well as bare symbol
  names, because routes reach most capabilities through a namespace. The first version
  matched only bare names and wrongly reported `input mapping` as unconsumed while Turbo
  calls `game.input` twice. Detector bugs of that kind inflate the gap count rather than
  the parity count, but they are still wrong, and any remaining `parity-unproven` row
  should be read as "not proven by this generator" rather than "definitely unused".
- The comparison is capability-by-capability. It does not measure rendering *quality*
  against Three.js, which needs the visual-parity suites, nor ecosystem breadth, where
  Three.js is far ahead by any measure.

## Headline result

| Status | Rows |
| --- | --- |
| exceed | 6 |
| parity | 37 |
| parity-unproven | 10 |
| gap | 3 |
| **total** | **56** |

### By category

| Category | exceed | parity | unproven | gap | total |
| --- | --- | --- | --- | --- | --- |
| core rendering | 1 | 14 | 2 | 2 | 19 |
| ecosystem helpers | 1 | 8 | 1 | 1 | 11 |
| physics | 2 | 3 | 5 | 0 | 10 |
| game systems | 1 | 6 | 0 | 0 | 7 |
| application workflows | 0 | 4 | 2 | 0 | 6 |
| developer tooling | 1 | 2 | 0 | 0 | 3 |

## Where Aura3D genuinely exceeds

Six rows survive all three rules. Each has an integrated API, a production consumer, and
retained runtime evidence:

| Capability | Why it exceeds | Evidence |
| --- | --- | --- |
| scene graph | Declarative typed scene builder; no manual `add`/`remove` bookkeeping or renderer lifecycle in user code. 77 consumers. | `tests/reports/showcase-interaction-audit` |
| selection outlines / focus feedback | `focusObject` / `focusSemanticRegion` with per-result geometric invariants. In the Three.js stack this is `OutlinePass` plus hand-built indicator geometry, which is exactly what produced the flattened-bar defect here. | `tests/reports/showcase-interaction-audit` |
| vehicle dynamics | `createVehicleChassis` derives wheelbase, track, wheel radius and ride height from the asset's rendered bounds and resolves contact, suspension and attitude, with grounding asserted per frame. Rapier gives you a vehicle controller; it does not give you asset-derived geometry or a grounding invariant. | `tests/reports/turbo-vehicle-grounding` |
| vehicle AI driving | `createVehicleDriverAi` with look-ahead racing line, curvature-based corner speeds, stuck and off-track recovery, deterministic per seed. The Three.js ecosystem has no standard solution; every project writes this. | `tests/reports/turbo-vehicle-grounding` |
| platformer motion tuning | `solvePlatformerMotion` derives gravity, jump velocity and move speed from level geometry; `validatePlatformerMotion` refuses tuning inconsistent with it. Nothing in any ecosystem does this. | `tests/reports/skyline-platformer-motion` |
| interaction testing | Route-health snapshots plus a harness that discovers controls at runtime, operates them, and retains an interaction trace. | `tests/reports/showcase-interaction-audit` |

Note the shape of that list: the strongest results are in **simulation and correctness
tooling**, not in rendering. That matches where the remediation work went, and it is the
honest reading of the product's advantage.

## Remaining gaps

| Capability | Gap |
| --- | --- |
| context loss recovery | No documented public policy. A WebGL context loss is neither surfaced nor recovered through the root API. Three.js leaves this to the developer too, but a framework claiming integration should own it. |
| text rendering | No 3D text primitive. World labels are DOM: legible, accessible and responsive, but they cannot be occluded by geometry or lit by the scene. `troika-three-text` has no equivalent here. |
| custom shaders (integration) | `ShaderLibrary` / `ShaderModule` exist in `@aura3d/rendering`, but a route using the root safe API cannot author a shader. In R3F a custom `ShaderMaterial` is a one-liner. |

## Categories where Three.js is ahead

Stated plainly, because the parity table is capability-shaped and does not capture these:

- **Ecosystem breadth.** Three.js has hundreds of community examples, loaders for
  formats Aura3D does not read, and a decade of accumulated addons.
- **Rendering feature depth.** Instancing, LOD and custom shader authoring are present in
  Aura3D's internals but not surfaced through the safe public API, so a developer hits a
  wall the Three.js stack does not have.
- **Escape hatches.** In R3F, dropping to raw Three.js is trivial. Aura3D's lower-level
  packages exist, but the boundary between "safe API" and "renderer internals" is a
  policy documented in `docs/agents/claims-and-boundaries.md` rather than an ergonomic
  path.
- **Community and hiring.** Not measurable here, and not close.

## Full row detail

### core rendering

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| scene graph | THREE.Scene + Object3D | `scene`, `group` | yes | 77 | **exceed** | Declarative scene builder with typed nodes; no manual add/remove bookkeeping. |
| cameras | PerspectiveCamera / OrthographicCamera | `camera` | yes | 58 | parity |  |
| renderer configuration | WebGLRenderer options | `createAuraApp` | yes | 19 | parity | Renderer selection, pixel ratio and resize handled by the app; no renderer lifecycle code in routes. |
| geometry primitives | BoxGeometry, SphereGeometry, TorusGeometry, ... | `primitives` | yes | 26 | parity | Local axis conventions now documented via AURA_PRIMITIVE_AXES after the flattened-torus defect. |
| materials | MeshStandardMaterial / MeshPhysicalMaterial | `material` | yes | 73 | parity | Named material presets (clearcoatPaint, brushedMetal, clearGlass) rather than raw parameter sets. |
| custom shaders | ShaderMaterial / RawShaderMaterial | `ShaderLibrary`, `ShaderModule` | no | 2 | parity | Available through @aura3d/rendering (ShaderLibrary/ShaderModule) and three-compat, not the root safe API. |
| lights | Directional/Point/Spot/RectArea lights | `lights` | yes | 22 | parity |  |
| shadows | shadowMap + per-light shadow config | `createProductionRuntimeShadowOptions` | yes | 10 | parity |  |
| environment maps / IBL | PMREMGenerator + RGBELoader | `environments` | yes | 3 | parity | Named environment presets; no PMREM setup in user code. |
| postprocessing | EffectComposer + pass chain | `effects` | yes | 16 | parity | Effects declared as scene nodes; no composer or pass ordering in user code. |
| tone mapping / colour management | renderer.toneMapping + outputColorSpace | `applyExternalParityToneMappingPreset`, `createExternalParityToneMappingPolicy` | yes | 0 | parity-unproven | Tone mapping is applied by the production renderer; the root API exposes it as renderer configuration rather than as a user-managed pass. |
| instancing | InstancedMesh | `InstancedMesh` | no | 1 | parity | Rendering-internal; not surfaced through the root safe API. |
| skinned animation | SkinnedMesh + AnimationMixer | `AnimationMixer`, `AnimationController` | yes | 11 | parity |  |
| morph targets | morphTargetInfluences | `MorphTargetMixer`, `MorphTargetWeight` | yes | 12 | gap |  |
| particles | Points + custom shaders, or third-party VFX | `ParticleSystem` | yes | 2 | parity |  |
| LOD | THREE.LOD | `LodSelection`, `LodLevel` | no | 0 | parity-unproven | LOD selection exists in @aura3d/rendering but is not surfaced through the root safe API, so a route cannot declare LOD levels. |
| WebGPU | WebGPURenderer (experimental) | `WebGPUDevice` | yes | 1 | parity |  |
| context loss recovery | webglcontextlost handling by hand | `contextLoss` | no | 0 | gap | No documented public context-loss policy; a WebGL context loss is not surfaced or recovered through the root API. |
| resource disposal | manual geometry/material/texture dispose() | `dispose` | yes | 17 | parity | App owns the lifecycle; routes call app.dispose() rather than tracking GPU objects. |

### ecosystem helpers

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| orbit controls | OrbitControls from three/examples | `interactions` | yes | 14 | parity | interactions.orbit() is a scene node; no control instance to construct, update or dispose. |
| transform controls / gizmos | TransformControls | `TransformControls` | no | 1 | parity | Available in @aura3d/controls, not through the root safe API. |
| bounds fitting / object centering | Box3.setFromObject + manual camera math, or drei Bounds | `placedBoundsFromAsset`, `groundedRenderedAssetPlacement`, `focusCameraIntent` | yes | 2 | parity | Asset-relative anchoring derives placement and framing from typed asset bounds. |
| HTML / world labels | CSS2DRenderer or drei Html | `labels`, `createWorldLabelLayer`, `projectWorldLabels` | yes | 22 | parity | Was a gap: labels reached the scene graph but were only drawn in the canvas2d fallback. Now a real world-anchored layer in the production path. |
| selection outlines / focus feedback | OutlinePass, or hand-built indicator geometry | `focusObject`, `focusSemanticRegion` | yes | 2 | **exceed** | Was the flattened-bar defect: every route built its own indicator. Now one system with per-result invariants. |
| glTF loading | GLTFLoader + DRACO/KTX2 setup | `model`, `GLTFLoader` | yes | 24 | parity | Typed asset references with provenance; no loader configuration or URL strings in routes. |
| environment / staging presets | drei Environment + Stage | `environments`, `prefabs` | yes | 5 | parity |  |
| contact shadows | drei ContactShadows | `contactOcclusion`, `contactShadows` | yes | 0 | parity-unproven |  |
| performance monitor | stats.js | `createDiagnosticsOverlay`, `AuraDiagnostics` | yes | 26 | parity | Diagnostics overlay reports backend, draw calls, renderer features and now placed labels. |
| scene inspector | three-devtools or custom | `createGameInspector`, `collectAuraSceneEvidence` | yes | 9 | parity |  |
| text rendering | troika-three-text or TextGeometry | `TextGeometry` | no | 0 | gap | No 3D text primitive. World labels are DOM, which is legible and accessible but cannot be occluded by geometry or lit by the scene. |

### physics

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| rigid bodies | Rapier or Cannon integration | `PhysicsWorld`, `RigidBody` | yes | 1 | parity |  |
| colliders | Rapier colliders | `Collider`, `createGameBoxCollider` | yes | 2 | parity |  |
| raycasting | THREE.Raycaster / Rapier ray | `RaycastHit`, `groundHeightRaycaster`, `SphereCastHit` | yes | 0 | parity-unproven |  |
| character controller | Rapier KinematicCharacterController | `CharacterController`, `createGameKinematicBody` | yes | 0 | parity-unproven |  |
| vehicle dynamics | Rapier vehicle controller, hand-tuned | `createVehicleChassis`, `vehicleChassisSpecFromBounds` | yes | 1 | **exceed** | Chassis derives geometry from the asset's rendered bounds and resolves contact, suspension and attitude; grounding is asserted per frame rather than inferred. |
| vehicle AI driving | no standard solution; hand-written per project | `createVehicleDriverAi` | yes | 1 | **exceed** | Look-ahead racing line, curvature-based corner speeds, stuck and off-track recovery, deterministic per seed. |
| joints / constraints | Rapier joints | `Constraint` | yes | 0 | parity-unproven |  |
| continuous collision detection | Rapier CCD flag | `timeOfImpact`, `TimeOfImpactHit` | yes | 0 | parity-unproven |  |
| deterministic stepping | fixed-step loop by hand | `PhysicsStepper`, `createFrameLoop` | yes | 1 | parity |  |
| physics debug rendering | Rapier debug render lines | `PhysicsDebugDraw`, `createGameColliderDebugGeometry` | yes | 0 | parity-unproven |  |

### game systems

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| input mapping | hand-written keydown handling | `createGameInput` | yes | 7 | parity | Action and axis bindings with buffering and replay export. |
| camera rigs | hand-written chase/follow cameras | `createGameRacingCameraRig`, `createGamePlatformerCameraRig`, `createGameCameraDirector` | yes | 2 | parity |  |
| platformer motion tuning | hand-tuned gravity and jump velocity | `solvePlatformerMotion`, `validatePlatformerMotion` | yes | 1 | **exceed** | Derives motion from level geometry and rejects tuning inconsistent with it. Skyline shipped a 5.76x apex overshoot that every prior gate passed. |
| frame-based combat | hand-written state machine and frame data | `solveCombatFrameData`, `validateCombatFrameData`, `createCombatAi` | yes | 1 | parity | Frame data validated as frame data. Aura Clash shipped 12-32 active frames against 4-5 recovery frames, inverted from any real fighting game. |
| session lifecycle / objectives | hand-written per project | `createGameRacingKit`, `createGamePlatformerKit`, `createGameFallingBlocksKit` | yes | 5 | parity |  |
| touch controls | hand-written pointer handlers | `bindGameTouchControls`, `createGameTouchControlLayout` | yes | 3 | parity |  |
| deterministic replay | hand-written input recording | `createGameInputReplay`, `exportGameInputReplay` | yes | 1 | parity |  |

### application workflows

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| product configurator | assemble R3F + drei + custom selection | `product`, `focusSemanticRegion` | yes | 20 | parity | Route is verified interactive but does not yet consume a reusable configurator kit. |
| digital twin | assemble R3F + custom overlays | `checkSpatialInvariants`, `resolveSemanticRegion` | yes | 2 | parity | Asset-relative anchoring replaces literal helper coordinates; no reusable twin kit yet. |
| architecture walkthrough | assemble R3F + camera paths | `createGameRacingPresentationCamera`, `timeline` | yes | 13 | parity |  |
| data visualisation | assemble R3F + custom charts | `charts`, `dataBars3D` | yes | 2 | parity |  |
| cinematic sequencing | assemble Theatre.js or custom | `createSceneSequencer`, `createShotTimeline` | yes | 0 | parity-unproven |  |
| project scaffolding | vite template + manual wiring | `createA3DProject`, `CREATE_AURA3D_TEMPLATES` | yes | 0 | parity-unproven | create-aura3d scaffolds a running typed project with assets and tests. |

### developer tooling

| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| asset pipeline / provenance | manual asset management | `assets`, `createAssetProvenance` | yes | 48 | parity | Typed asset map with hashes and license provenance generated by the CLI. |
| interaction testing | hand-written Playwright per project | `createAuraRouteHealthSnapshot` | yes | 2 | **exceed** | Route-health snapshots plus a reusable interaction-audit harness that discovers and operates controls. |
| runtime invariant reporting | no standard solution | `checkSpatialInvariants`, `validatePlatformerMotion`, `validateCombatFrameData` | yes | 3 | parity | Geometric and gameplay correctness published as machine-checkable reports. |

## Conclusion

Aura3D is **not** at global parity with the practical Three.js ecosystem, and does not
claim to be. Category by category:

- **Beyond Three.js:** simulation correctness tooling (vehicle chassis and AI, platformer
  motion solving, combat frame-data validation), asset-relative layout, interaction
  testing, and the declarative scene/asset/effect authoring model.
- **At parity:** most core rendering, camera and interaction capability, physics
  primitives, and the application-workflow surface.
- **Behind:** ecosystem breadth, shader authoring ergonomics, 3D text, LOD and instancing
  through the public API, context-loss handling, and escape-hatch ergonomics.

The defensible claim is narrower than "better than Three.js": Aura3D removes integration
decisions and provides correctness systems that the Three.js stack expects every project
to write itself. Where it is behind, it is behind on breadth and on low-level access.
