export {
  REQUIRED_THREE_API_CATEGORIES,
  THREE_EXAMPLES_INVENTORY,
  buildThreeApiInventory,
  categorizeThreeExport
} from "./ThreeApiInventory";
export { GroupCompat, LineSegmentsCompat, MeshCompat, Object3DCompat, PointsCompat, SpriteBatchCompat, SpriteCompat } from "./core/Object3DCompat";
export type { SpriteBatchInstanceCompat } from "./core/Object3DCompat";
export { SceneCompat } from "./core/SceneCompat";
export { RaycasterCompat } from "./core/RaycasterCompat";
export type { RaycasterCompatIntersection } from "./core/RaycasterCompat";
export { ColorCompat, Matrix4Compat, QuaternionCompat, Vector3Compat } from "./math";
export { CameraCompat, OrthographicCameraCompat, PerspectiveCameraCompat } from "./cameras";
export {
  BoxGeometryCompat,
  BufferGeometryCompat,
  CircleGeometryCompat,
  ConeGeometryCompat,
  CylinderGeometryCompat,
  InstancedBufferGeometryCompat,
  PlaneGeometryCompat,
  SphereGeometryCompat,
  TorusGeometryCompat,
  THREE_COMPAT_COMPAT_GEOMETRY_TYPES
} from "./geometries";
export type { BufferAttributeCompat } from "./geometries";
export {
  LineBasicMaterialCompat,
  MaterialCompat,
  MeshBasicMaterialCompat,
  MeshLambertMaterialCompat,
  MeshPhongMaterialCompat,
  MeshPhysicalMaterialCompat,
  MeshStandardMaterialCompat,
  PointsMaterialCompat,
  ShaderMaterialCompat,
  SpriteMaterialCompat,
  THREE_COMPAT_COMPAT_MATERIAL_TYPES
} from "./materials";
export type { MaterialCompatParameters } from "./materials";
export {
  TextureCompat,
  TextureLoaderCompat,
  THREE_COMPAT_COMPAT_TEXTURE_SETTINGS
} from "./textures";
export type { TextureFilterCompat, TextureWrapCompat } from "./textures";
export { WebGLMultipleRenderTargetsCompat, WebGLRenderTargetCompat } from "./render-targets";
export {
  CubeTextureLoaderCompat,
  EXRLoaderCompat,
  GLTFLoaderCompat,
  HDRLoaderCompat,
  KTX2LoaderCompat,
  MTLLoaderCompat,
  OBJLoaderCompat,
  ThreeCompatTextureLoader
} from "./loaders";
export {
  DragControls,
  FirstPersonControls,
  FlyControls,
  MapControls,
  OrbitControls,
  Picking,
  PointerLockControls,
  SelectionManager,
  TrackballControls,
  TransformControls
} from "./controls";
export type { TransformControlMode, ThreeCompatControlState, ThreeCompatPickResult } from "./controls";
export {
  AnimationActionCompat,
  AnimationClipCompat,
  AnimationMixerCompat,
  MorphTargetMixerCompat,
  SkeletonCompat,
  SkinnedMeshCompat
} from "./animation";
/*
 * WS-3.4 — the postprocess and shader compat re-exports are removed with the tree they aliased.
 *
 * `./postprocessing` and `./shaders` re-exported `packages/rendering/src/threejs-compatibility/*` under
 * friendlier names — `UnrealBloomPassCompat`, `CustomShaderMaterialCompat` and so on. That tree touched no
 * GPU: its renderer had no device and no draw call, its `captureScreenshot()` returned a URI string, and
 * its `handleDeviceLost()` set the flag and immediately cleared it so it always reported recovery.
 *
 * So this package — the migration on-ramp, which the PRD correctly says to keep — was **offering a
 * migrating Three.js developer a path onto a fabrication.** A migration target that does not render is
 * worse than no migration target: it turns working Three.js code into non-working Aura3D code and reports
 * success.
 *
 * Everything else here is unaffected and stays: the API inventory, the import map, the animation, controls,
 * loader, material and geometry adapters, the migration warnings, and `migrateThreeToA3D`.
 *
 * Follow-up: the deletion left `./postprocessing` declared in package.json `exports` pointing at a
 * `dist/postprocessing/` that no longer builds, and `THREE_COMPAT_THREE_IMPORT_MAP` still rewrote Three.js
 * `EffectComposer` imports onto it — a published subpath resolving to nothing, reachable from our own
 * codemod. The dangling subpath is removed and those specifiers are now declared unsupported rather than
 * rewritten.
 *
 * They are not re-aliased onto `packages/rendering/src/production-runtime/postprocess/`, which is real but
 * operates on CPU `Uint8Array` pixel buffers rather than GPU render targets. Mapping `EffectComposer` onto a
 * CPU pixel pass would satisfy the import and change the behaviour silently, recreating the WS-3.4 defect
 * under a different path. Per R7 the migration surface reports what it cannot do instead.
 */
export { THREE_COMPAT_THREE_IMPORT_MAP, THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS } from "./migration/ImportMap";
export { migrateThreeToA3D } from "./migration/ThreeToA3DAdapter";
export type { ThreeCompatMigrationResult } from "./migration/ThreeToA3DAdapter";
export { createThreeCompatCompatibilityWarnings } from "./migration/CompatibilityWarnings";
export type { ThreeCompatCompatibilityWarning } from "./migration/CompatibilityWarnings";
export {
  AmbientLightCompat,
  DirectionalLightCompat,
  HemisphereLightCompat,
  LightCompat,
  PointLightCompat,
  RectAreaLightCompat,
  SpotLightCompat
} from "./lights";
export {
  AxesHelperCompat,
  BoxHelperCompat,
  CameraHelperCompat,
  DirectionalLightHelperCompat,
  GridHelperCompat,
  HelperLineSegmentsCompat,
  SkeletonHelperCompat
} from "./helpers";
export {
  THREE_COMPAT_COMPATIBILITY_THRESHOLDS,
  buildInitialCompatibilityMatrix,
  supportedOrPartial
} from "./ThreeCompatibilityMatrix";
export type {
  ThreeApiCategory,
  ThreeApiInventory,
  ThreeApiInventoryEntry
} from "./ThreeApiInventory";
export type {
  ThreeCompatibilityEntry,
  ThreeCompatibilityMatrix,
  ThreeCompatibilityStatus,
  ThreeCompatibilityThreshold
} from "./ThreeCompatibilityMatrix";
