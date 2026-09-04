# Approximation Ledger — three-compat migration shims vs three.js r185

muse3jsparity-PRD **PART P1**. Every `*Compat` shim that does not reproduce
three.js r185 behavior exactly gets a row: unified behavior, visual delta vs
r185, upgrade path to the native Aura3D API. Machine source:
`src/ApproximationLedger.ts` (`APPROXIMATION_LEDGER`, 26 rows) — this file is
the human-readable mirror with proof pointers. If they disagree, the `.ts`
wins and this file is stale; the scan test
(`tests/unit/three-compat/approximation-ledger-p1.test.ts`) enforces that
every exported shim resolves to a row, so a new shim without a row fails
closed.

## Materials

| Shim | Fidelity | Behavior | Delta vs r185 | Upgrade path | Proof |
| --- | --- | --- | --- | --- | --- |
| MeshLambertMaterialCompat | approximation | Color/map/transparent/opacity/side + literal `approximation` marker; resolves to Aura3D diffuse (Burley), not Lambert | r185 Lambert is per-fragment diffuse; compat renders Burley — broader highlight rolloff, no exact match | `material.pbr({ color, roughness: 0.85 })`, `material.matteClay()` | `src/materials/index.ts:26`, ledger test Lambert/Phong case |
| MeshPhongMaterialCompat | approximation | `shininess` (default 30) + literal `approximation` marker; resolves to GGX specular, not Blinn-Phong | r185 Phong is Blinn-Phong falloff; compat renders tighter GGX highlights at equal shininess | `material.pbr({ roughness })` mapped from shininess, `material.physical` | `src/materials/index.ts:27`, ledger test |
| MeshBasicMaterialCompat | faithful | Unlit color-only passthrough | none known | Unlit root material builders | `src/materials/index.ts:25` |
| MeshStandardMaterialCompat | faithful | PBR roughness/metalness onto the C1 textured-PBR path | none known at compat-contract level (pixel identity owned by C1 root proof) | `material.pbr()` | `src/materials/index.ts:28` |
| MeshPhysicalMaterialCompat | approximation | Carries clearcoat/transmission/ior intent; bounded extensions per the MaterialExtensions matrix | r185 renders full lobes; unproven params emit bounded diagnostics | `material.physical()` + `capabilityDiagnostics`; production-runtime for refraction | `src/materials/index.ts:29`, P3 tests |
| ShaderMaterialCompat | diagnostic-only | Uniforms + shader sources as metadata; no execution claim | r185 executes raw GLSL; shim only transports intent | PortableShaderMaterial | `src/materials/index.ts:30` |
| PointsMaterialCompat | faithful | Point size + size attenuation, finite non-negative validation | none known at compat-contract level | Native particle/effects builders | `src/materials/index.ts:31` |
| LineBasicMaterialCompat | faithful | Line color; width stays 1 (shared WebGL limit) | none known — same platform limit as three.js | Thick-line systems (D4) | `src/materials/index.ts` |
| SpriteMaterialCompat | faithful | Sprite rotation + size attenuation, finite validation | none known at compat-contract level | Billboard/impostor systems (D2) | `src/materials/index.ts` |
| MaterialCompat | faithful | Base carrier (transparent/opacity/side); no rendering claim | none known — mirrors THREE.Material shared fields | Concrete rows above; `material.*` | `src/materials/index.ts:12` |

## Controls (N2 implementation, compat aliases)

| Shim | Fidelity | Behavior | Delta vs r185 | Upgrade path | Proof |
| --- | --- | --- | --- | --- | --- |
| ArcballControls | approximation | Free rotation, pan, clamped dolly, damping, roll; cursorZoom, two-finger gestures, adjustNearPlane are listed GAPs | r185 supports cursorZoom, touch gestures, near-plane adjustment; alias documents all three as gaps | Import from `@aura3d/controls` | `src/controls/index.ts`, ledger Arcball case |
| OrbitControls, MapControls, TrackballControls, FlyControls, FirstPersonControls, DragControls, PointerLockControls, TransformControls | faithful | Direct re-exports with F1 disposal/listener hygiene | none known at compat-contract level (N2 per-control table owns residuals) | Same classes from `@aura3d/controls` | `src/controls/index.ts` |
| Picking, SelectionManager | faithful | Interaction utilities re-exported unchanged | none known at compat-contract level | `@aura3d/controls`; F4 picking for root pointer behavior | `src/controls/index.ts` |

## Loaders (diagnostic-first posture stays)

Every `load()` returns a diagnostic carrying `status`, `bytes`, `warnings`,
`unsupportedExtensions`, `decoderNeeds`, `memoryEstimateBytes` — arrays default
to `[]`, estimates are derived from the URI extension, never undefined, never
silently dropped (pinned by the ledger loader-truth test).

| Shim | Fidelity | Delta vs r185 | Upgrade path | Proof |
| --- | --- | --- | --- | --- |
| GLTFLoaderCompat, OBJLoaderCompat, MTLLoaderCompat, HDRLoaderCompat, KTX2LoaderCompat, TextureLoaderCompat, CubeTextureLoaderCompat, EXRLoaderCompat | diagnostic-only | three.js decodes; compat reports — decoding stays in `@aura3d/assets` | `@aura3d/assets` loaders + one-call compressed-texture setup (M2) | `src/loaders/index.ts`, loader-truth test |

EXR is explicitly `diagnostic-only` with a warning; KTX2 stamps
`basis-universal-transcoder`; GLTF stamps draco/meshopt/ktx2 decoder needs.

## Lights

| Shim | Fidelity | Behavior | Delta vs r185 | Upgrade path | Proof |
| --- | --- | --- | --- | --- | --- |
| SpotLightCompat, RectAreaLightCompat | approximation | Spot cone (angle/penumbra) + rect (width/height) intent as metadata | r185 renders spot shadows + LTC rect lighting; shim transports intent | `lights.spot` (N1); rect stays quadrature-bounded (Q1.6) | `src/lights/index.ts:16-17` |
| AmbientLightCompat, HemisphereLightCompat, DirectionalLightCompat, PointLightCompat | faithful | Direct light-intent carriers matching root `lights` | none known at compat-contract level | `lights.*` root builders | `src/lights/index.ts:12-15` |
| LightCompat | faithful | Base carrier (color/intensity); no rendering claim | none known — mirrors THREE.Light shared fields | Concrete rows above | `src/lights/index.ts:4` |

## Geometries (UV2/morph errata)

Compat geometry classes are **param-faithful constructors only**: they store
dimensions and carry manually-`setAttribute`’d attributes but **generate zero
vertex attributes** — no positions/normals/uvs, **no UV2 set, no morph
attributes**. three.js r185 constructors generate all of these. Code reading
UV2 or morph attributes off a compat geometry gets `undefined`.

| Shim | Fidelity | Upgrade path | Proof |
| --- | --- | --- | --- |
| Box/Sphere/Plane/Cylinder/Torus/Cone/Circle/Buffer/InstancedBuffer-GeometryCompat | approximation | `primitives.*` / `geometry.*` root builders (production meshes carry positions/normals/uvs; uv1 is a documented 2x-tiling unwrap of uv0) | `src/geometries/index.ts`, ledger errata test |

## Core / cameras / textures / helpers / math

| Shim | Fidelity | Notes | Proof |
| --- | --- | --- | --- |
| Object3DCompat, SceneCompat, MeshCompat, GroupCompat, LineSegmentsCompat, PointsCompat, SpriteCompat, SpriteBatchCompat, RaycasterCompat | faithful | Structure + raycast intent carriers; no rendering claim | `src/core/` |
| CameraCompat, PerspectiveCameraCompat, OrthographicCameraCompat | faithful | fov/aspect/near/far intent carriers | `src/cameras/` |
| TextureCompat, TextureLoaderCompat, ThreeCompatTextureLoader, CubeTextureLoaderCompat | diagnostic-only | Route through `@aura3d/assets`; report format support, never pixels | `src/textures/`, `src/loaders/` |
| Axes/Grid/Box/Camera/DirectionalLight/Skeleton-HelperCompat | faithful | Debug-guide line segments; set dressing, never primary subjects | `src/helpers/` |
| HelperLineSegmentsCompat | faithful | Shared base assembly for the helper shims | `src/helpers/index.ts:22` |
| Vector3Compat, QuaternionCompat, Matrix4Compat, ColorCompat | faithful | Pure math value types; `@aura3d/math` semantics | `src/math/` |

## Animation

| Shim | Fidelity | Notes | Proof |
| --- | --- | --- | --- |
| AnimationActionCompat, AnimationClipCompat, AnimationMixerCompat, MorphTargetMixerCompat, SkeletonCompat, SkinnedMeshCompat | faithful | Re-export aliases of `@aura3d/animation` (same classes, no added behavior); E-clause bounds apply to the implementations | `src/animation/index.ts` |

## Render targets

| Shim | Fidelity | Notes | Proof |
| --- | --- | --- | --- |
| WebGLRenderTargetCompat, WebGLMultipleRenderTargetsCompat | approximation | Structural descriptor (size/samples/TextureCompat slots, fail-closed setSize); NO GPU allocation, no post chain — unlike r185 targets consumed by EffectComposer | `src/render-targets/index.ts`, material-geometry compat test |

## Naming audit (loader diagnostics cleanup, closed)

`ThreeCompatLoaderStatus = loaded|missing|diagnostic-only`;
`ThreeCompatLoaderDiagnostic` fields `decoderNeeds` / `unsupportedExtensions` /
`memoryEstimateBytes` are spelled identically in the interface, in
`createBrowserDiagnostic`, and in every loader `load()` path — verified by the
loader-truth test, which fails if any loader returns a diagnostic missing any
of the three.
