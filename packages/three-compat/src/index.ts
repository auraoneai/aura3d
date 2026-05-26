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
  V5_COMPAT_GEOMETRY_TYPES
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
  V5_COMPAT_MATERIAL_TYPES
} from "./materials";
export type { MaterialCompatParameters } from "./materials";
export {
  TextureCompat,
  TextureLoaderCompat,
  V5_COMPAT_TEXTURE_SETTINGS
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
export type { TransformControlMode, V5ControlState, V5PickResult } from "./controls";
export {
  AnimationActionCompat,
  AnimationClipCompat,
  AnimationMixerCompat,
  MorphTargetMixerCompat,
  SkeletonCompat,
  SkinnedMeshCompat
} from "./animation";
export {
  ColorGradingPassCompat,
  DepthOfFieldPassCompat,
  EffectComposerCompat,
  FXAAPassCompat,
  OutlinePassCompat,
  RenderPassCompat,
  ShaderPassCompat,
  SMAAPassCompat,
  SSAOPassCompat,
  TAAPassCompat,
  UnrealBloomPassCompat,
  VignettePassCompat
} from "./postprocessing";
export {
  NodeMaterialCompat,
  RawShaderMaterialCompat,
  CustomShaderMaterialCompat,
  UniformsCompat,
  SHADER_CHUNKS_V5,
  diagnoseV5Shader
} from "./shaders";
export { V5_THREE_IMPORT_MAP } from "./migration/ImportMap";
export { migrateThreeToA3D } from "./migration/ThreeToA3DAdapter";
export type { V5MigrationResult } from "./migration/ThreeToA3DAdapter";
export { createV5CompatibilityWarnings } from "./migration/CompatibilityWarnings";
export type { V5CompatibilityWarning } from "./migration/CompatibilityWarnings";
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
  V5_COMPATIBILITY_THRESHOLDS,
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
