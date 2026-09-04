/**
 * muse3jsparity-PRD P1 — three-compat approximation ledger.
 *
 * Every migration shim that does not reproduce three.js r185 behavior
 * exactly gets a row here: unified behavior, visual delta vs r185, and the
 * upgrade path to the native Aura3D API. Zero silent approximation: a shim
 * with no row is a ledger bug, enforced by
 * `tests/unit/three-compat/approximation-ledger-p1.test.ts`, which scans
 * every exported `*Compat` class plus the `Picking`/`SelectionManager`
 * interaction utilities so a new shim without a row fails closed.
 *
 * Loader posture (unchanged): diagnostic-first. `decoderNeeds`,
 * `unsupportedExtensions`, and `memoryEstimateBytes` are populated on every
 * `ThreeCompatLoaderDiagnostic` (arrays default to `[]`, never undefined) and
 * surfaced in migration reports, never silently dropped.
 *
 * Geometry errata (P1 open item, closed here): compat geometry classes carry
 * constructor params and manually-set attributes only — no generated
 * positions/normals/uvs, no UV2 set, no morph attributes.
 */

export type ApproximationLedgerFidelity = "faithful" | "approximation" | "diagnostic-only";

export interface ApproximationLedgerRow {
  readonly shim: string;
  readonly area: "materials" | "controls" | "loaders" | "lights" | "geometries" | "core" | "cameras" | "textures" | "helpers" | "math" | "animation" | "render-targets";
  readonly fidelity: ApproximationLedgerFidelity;
  /** What the shim actually does (unified behavior). */
  readonly behavior: string;
  /** Visual/behavioral delta vs three.js r185. "none known" only when faithful. */
  readonly deltaVsR185: string;
  /** Native Aura3D API to reach for instead. */
  readonly upgradePath: string;
}

export const APPROXIMATION_LEDGER: readonly ApproximationLedgerRow[] = [
  {
    shim: "MeshLambertMaterialCompat",
    area: "materials",
    fidelity: "approximation",
    behavior: "Carries color/map/transparent/opacity/side plus the literal `approximation` marker; resolves to Aura3D diffuse lighting, not three.js Lambert.",
    deltaVsR185: "three.js r185 Lambert is per-fragment half-Lambert-ish diffuse; the compat path renders Aura3D diffuse (Burley) instead — broader highlight rolloff, no exact match.",
    upgradePath: "material.pbr({ color, roughness: 0.85 }) or material.matteClay() for honest diffuse."
  },
  {
    shim: "MeshPhongMaterialCompat",
    area: "materials",
    fidelity: "approximation",
    behavior: "Carries `shininess` (default 30) plus the literal `approximation` marker; resolves to Aura3D specular response, not three.js Blinn-Phong.",
    deltaVsR185: "three.js r185 Phong is Blinn-Phong with shininess falloff; the compat path renders GGX specular instead — tighter highlights at equal shininess, no exact match.",
    upgradePath: "material.pbr({ roughness }) mapped from shininess, or material.physical for clearcoat/sheen work."
  },
  {
    shim: "MeshBasicMaterialCompat",
    area: "materials",
    fidelity: "faithful",
    behavior: "Unlit color-only material; behavior matches three.js MeshBasicMaterial within the compat contract.",
    deltaVsR185: "none known — unlit passthrough carries no lighting model to diverge.",
    upgradePath: "Unlit primitives via root material builders with emissive-only intent."
  },
  {
    shim: "MeshStandardMaterialCompat",
    area: "materials",
    fidelity: "faithful",
    behavior: "PBR roughness/metalness material; maps onto the C1-promoted textured-PBR path.",
    deltaVsR185: "none known at the compat-contract level; pixel identity is owned by the C1 root proof, not this shim.",
    upgradePath: "material.pbr() directly."
  },
  {
    shim: "MeshPhysicalMaterialCompat",
    area: "materials",
    fidelity: "approximation",
    behavior: "Carries clearcoat/transmission/ior intent; bounded extensions resolve per the MaterialExtensions matrix, not full physical simulation.",
    deltaVsR185: "three.js r185 physical renders clearcoat/sheen/iridescence/transmission lobes; unproven params emit bounded diagnostics instead of rendering.",
    upgradePath: "material.physical() with capabilityDiagnostics; production-runtime for real refraction."
  },
  {
    shim: "ShaderMaterialCompat",
    area: "materials",
    fidelity: "diagnostic-only",
    behavior: "Carries uniforms + shader sources as metadata; no custom-shader execution claim.",
    deltaVsR185: "three.js executes raw GLSL; the shim only transports the intent for manual porting.",
    upgradePath: "PortableShaderMaterial for custom-material workloads."
  },
  {
    shim: "PointsMaterialCompat",
    area: "materials",
    fidelity: "faithful",
    behavior: "Point size + size attenuation with finite non-negative validation.",
    deltaVsR185: "none known at the compat-contract level.",
    upgradePath: "Native particle/effects builders for production point work."
  },
  {
    shim: "LineBasicMaterialCompat",
    area: "materials",
    fidelity: "faithful",
    behavior: "Line color contract; width stays 1 per the WebGL linewidth constraint three.js shares.",
    deltaVsR185: "none known — same platform linewidth limit as three.js.",
    upgradePath: "Thick-line systems (D4) for width-critical lines."
  },
  {
    shim: "SpriteMaterialCompat",
    area: "materials",
    fidelity: "faithful",
    behavior: "Sprite rotation + size attenuation with finite validation.",
    deltaVsR185: "none known at the compat-contract level.",
    upgradePath: "Billboard/impostor systems (D2) for production sprites."
  },
  {
    shim: "ArcballControls",
    area: "controls",
    fidelity: "approximation",
    behavior: "N2 implementation re-exported as the compat alias: free rotation, pan, clamped dolly, damping, roll. cursorZoom, two-finger gestures, and adjustNearPlane are listed gaps, not claims.",
    deltaVsR185: "three.js r185 ArcballControls supports cursorZoom, touch gestures, and near-plane adjustment; the compat alias documents those three as GAPs in its header table.",
    upgradePath: "Import ArcballControls from @aura3d/controls directly; forward input snapshots from the route."
  },
  {
    shim: "OrbitControls|MapControls|TrackballControls|FlyControls|FirstPersonControls|DragControls|PointerLockControls|TransformControls",
    area: "controls",
    fidelity: "faithful",
    behavior: "Direct re-exports of the @aura3d/controls implementations with F1 disposal/listener hygiene.",
    deltaVsR185: "none known at the compat-contract level; per-control parity table (N2) owns residual gaps.",
    upgradePath: "Same classes from @aura3d/controls; no migration needed."
  },
  {
    shim: "GLTFLoaderCompat|OBJLoaderCompat|MTLLoaderCompat|HDRLoaderCompat|KTX2LoaderCompat|TextureLoaderCompat|CubeTextureLoaderCompat|EXRLoaderCompat",
    area: "loaders",
    fidelity: "diagnostic-only",
    behavior: "Every load returns a diagnostic with status, bytes, warnings, unsupportedExtensions, decoderNeeds, and memoryEstimateBytes. EXR is explicitly diagnostic-only.",
    deltaVsR185: "three.js loaders decode; compat loaders report — decoding stays in @aura3d/assets (GLTFLoader, HDRLoader RGBE decode, KTX2 transcoder).",
    upgradePath: "@aura3d/assets loaders + assets.ensureCompressedTextureSupport-style one-call setup (M2)."
  },
  {
    shim: "SpotLightCompat|RectAreaLightCompat",
    area: "lights",
    fidelity: "approximation",
    behavior: "Carries spot cone (angle/penumbra) and rect (width/height) intent as metadata; root spot shadows and LTC are separate proofs (B1/B5).",
    deltaVsR185: "three.js renders spot shadows and LTC rect lighting; the shim transports intent until lights.spot + B1/B5 land with pixels.",
    upgradePath: "lights.spot root builder (N1) when green; RectArea stays quadrature-bounded per Q1.6."
  },
  {
    shim: "AmbientLightCompat|HemisphereLightCompat|DirectionalLightCompat|PointLightCompat",
    area: "lights",
    fidelity: "faithful",
    behavior: "Direct light-intent carriers matching the root lights const surface.",
    deltaVsR185: "none known at the compat-contract level.",
    upgradePath: "lights.* root builders directly."
  },
  {
    shim: "BoxGeometryCompat|SphereGeometryCompat|PlaneGeometryCompat|CylinderGeometryCompat|TorusGeometryCompat|ConeGeometryCompat|CircleGeometryCompat|BufferGeometryCompat|InstancedBufferGeometryCompat",
    area: "geometries",
    fidelity: "approximation",
    behavior: "Param-faithful constructors only: the shims store dimensions and carry manually-set attributes, but generate NO vertex attributes themselves — no positions/normals/uvs, no UV2 set, no morph attributes. three.js r185 constructors generate all of these.",
    deltaVsR185: "three.js r185 BoxGeometry et al. generate positions + normals + uv (+uv1 in some paths) and morph-ready attributes; the compat classes generate zero attributes until setAttribute is called. Code reading UV2 or morph attributes off a compat geometry gets undefined.",
    upgradePath: "primitives.* / geometry.* root builders (production meshes carry positions/normals/uvs; uv1 is a documented 2x-tiling unwrap of uv0)."
  },
  {
    shim: "Object3DCompat|SceneCompat|MeshCompat|GroupCompat|LineSegmentsCompat|PointsCompat|SpriteCompat|SpriteBatchCompat|RaycasterCompat",
    area: "core",
    fidelity: "faithful",
    behavior: "Scene-graph structure + raycast intent carriers; no rendering claim.",
    deltaVsR185: "none known at the compat-contract level.",
    upgradePath: "group()/scene() root builders + F4 picking."
  },
  {
    shim: "CameraCompat|PerspectiveCameraCompat|OrthographicCameraCompat",
    area: "cameras",
    fidelity: "faithful",
    behavior: "Camera-intent carriers (fov/aspect/near/far).",
    deltaVsR185: "none known at the compat-contract level.",
    upgradePath: "camera.* root builders."
  },
  {
    shim: "TextureCompat|TextureLoaderCompat|ThreeCompatTextureLoader|CubeTextureLoaderCompat",
    area: "textures",
    fidelity: "diagnostic-only",
    behavior: "Texture refs resolve through the @aura3d/assets pipeline; the shim reports format support, never pixels. (CubeTextureLoaderCompat lives in loaders/ but routes here: six-face diagnostics only.)",
    deltaVsR185: "three.js uploads and samples; the shim only routes.",
    upgradePath: "Typed assets.* refs + C1 textured-PBR path."
  },
  {
    shim: "MaterialCompat",
    area: "materials",
    fidelity: "faithful",
    behavior: "Base carrier for transparent/opacity/side shared by every *MaterialCompat subclass; no rendering claim of its own.",
    deltaVsR185: "none known at the compat-contract level — mirrors THREE.Material's shared fields.",
    upgradePath: "Use the concrete material rows above; material.* root builders for native work."
  },
  {
    shim: "LightCompat",
    area: "lights",
    fidelity: "faithful",
    behavior: "Base carrier for color/intensity shared by every *LightCompat subclass; no rendering claim of its own.",
    deltaVsR185: "none known at the compat-contract level — mirrors THREE.Light's shared fields.",
    upgradePath: "Use the concrete light rows above; lights.* root builders for native work."
  },
  {
    shim: "HelperLineSegmentsCompat",
    area: "helpers",
    fidelity: "faithful",
    behavior: "Base line-geometry + line-material assembly shared by every *HelperCompat subclass; debug guides only.",
    deltaVsR185: "none known at the compat-contract level.",
    upgradePath: "H2 debug-draw policy when green."
  },
  {
    shim: "AnimationActionCompat|AnimationClipCompat|AnimationMixerCompat|MorphTargetMixerCompat|SkeletonCompat|SkinnedMeshCompat",
    area: "animation",
    fidelity: "faithful",
    behavior: "Direct re-export aliases of the @aura3d/animation implementations (AnimationActionThreeCompat et al.); the compat surface adds no behavior.",
    deltaVsR185: "none known at the compat-contract level — same classes, same behavior; E-clause parity bounds (E1/E2) apply to the underlying implementations, not the alias.",
    upgradePath: "Import from @aura3d/animation directly; no migration needed."
  },
  {
    shim: "WebGLRenderTargetCompat|WebGLMultipleRenderTargetsCompat",
    area: "render-targets",
    fidelity: "approximation",
    behavior: "Structural descriptor only: carries width/height/samples + TextureCompat refs with fail-closed setSize; allocates NO GPU resource and runs no post chain.",
    deltaVsR185: "three.js WebGLRenderTarget describes a real GPU target consumed by EffectComposer passes; the compat class holds dimensions and texture slots with nothing behind them.",
    upgradePath: "Production-runtime compositor targets (A1/A3) for real post work; U1 lifecycle registry owns their bytes."
  },
  {
    shim: "Picking|SelectionManager",
    area: "controls",
    fidelity: "faithful",
    behavior: "Direct re-exports of the @aura3d/controls interaction utilities (raycast picking + selection state); same classes as the native import.",
    deltaVsR185: "none known at the compat-contract level.",
    upgradePath: "Import Picking/SelectionManager from @aura3d/controls directly; F4 picking owns root pointer behavior."
  },
  {
    shim: "AxesHelperCompat|GridHelperCompat|BoxHelperCompat|CameraHelperCompat|DirectionalLightHelperCompat|SkeletonHelperCompat",
    area: "helpers",
    fidelity: "faithful",
    behavior: "Debug-guide line segments; explicitly set dressing, never primary subjects.",
    deltaVsR185: "none known at the compat-contract level.",
    upgradePath: "H2 debug-draw policy when green."
  },
  {
    shim: "Vector3Compat|QuaternionCompat|Matrix4Compat|ColorCompat",
    area: "math",
    fidelity: "faithful",
    behavior: "Pure math value types; covered by @aura3d/math semantics.",
    deltaVsR185: "none known.",
    upgradePath: "@aura3d/math directly."
  }
];

export function getApproximationLedgerRow(shim: string): ApproximationLedgerRow | undefined {
  return APPROXIMATION_LEDGER.find((row) => row.shim === shim || row.shim.split("|").includes(shim));
}

export function listApproximationShims(): readonly string[] {
  return APPROXIMATION_LEDGER.flatMap((row) => row.shim.split("|"));
}

export function assertLedgerCovers(shimNames: readonly string[]): readonly string[] {
  return shimNames.filter((shim) => getApproximationLedgerRow(shim) === undefined);
}
