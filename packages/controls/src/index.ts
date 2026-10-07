export { OrbitControls } from "./OrbitControls";
export type { OrbitCameraLike, OrbitControlsOptions } from "./OrbitControls";
export { ArcballControls } from "./ArcballControls";
export type { ArcballCameraLike, ArcballControlsOptions } from "./ArcballControls";
export { TrackballControls } from "./TrackballControls";
export { FlyControls } from "./FlyControls";
export type { FlyCameraLike, FlyControlsOptions } from "./FlyControls";
export { FirstPersonControls } from "./FirstPersonControls";
export type { FirstPersonControlsOptions } from "./FirstPersonControls";
export { MapControls } from "./MapControls";
export { PointerLockControls } from "./PointerLockControls";
export { DRAG_CONTROLS_DEPRECATION, DragControls } from "./DragControls";
export type { DragControlsDeprecation, DragControlsOptions } from "./DragControls";
export { TransformControls } from "./TransformControls";
export type {
  TransformControlDragUpdate,
  TransformControlHandle,
  TransformControlHandleGeometry,
  TransformControlMode,
  TransformControlPick,
  TransformControlRay,
  TransformControlSnapSettings,
  TransformControlSpace,
  TransformControlsOptions
} from "./TransformControls";
export { SelectionManager } from "./SelectionManager";
export type { SelectionManagerChange, SelectionManagerListener } from "./SelectionManager";
export { HoverOutline } from "./HoverOutline";
export type { HoverOutlineEntry, HoverOutlineOptions, HoverOutlineStyle, HoverOutlineTone } from "./HoverOutline";
export { frameSelection, frameTarget } from "./FocusFrame";
export type { FocusFrameOptions, FocusFrameResult, FocusFrameTarget } from "./FocusFrame";
export { InteractionControls } from "./InteractionControls";
export type {
  HotspotHandler,
  InteractionControlMode,
  InteractionControlsEvent,
  InteractionControlsEventType,
  InteractionControlsListener,
  InteractionControlsOptions,
  InteractionControlsUpdate,
  InteractionRay,
  InteractionRayProvider,
  InteractionRootProvider
} from "./InteractionControls";
export { Picking } from "./Picking";
export type { PickingDiagnostics, PickingOptions, PickingReport, ThreeCompatPickResult } from "./Picking";
export {
  annotationFromPickHit,
  createDistrictPickingAnnotations,
  createEntityPickingAnnotations,
  createImportedGlbHotspotAnnotations,
  createPickingAnnotationObject,
  createPickingAnnotationRoot,
  createRobotPickingAnnotations,
  pickAnnotation,
  pickScreenSpaceAnnotation
} from "./PickingAnnotations";
export type {
  BuildingPickingDescriptor,
  DistrictPickingDescriptor,
  EntityPickingDescriptor,
  ImportedGlbHotspotDescriptor,
  PickingAnnotation,
  PickingAnnotationHitPolicy,
  PickingAnnotationKind,
  PickingAnnotationObject,
  PickingAnnotationOptions,
  PickingAnnotationReport,
  PickingAnnotationRoot,
  PickingAnnotationSource,
  ScreenPickingAnnotation,
  ScreenPickingHit,
  ScreenPickingOptions,
  ScreenPickingReport
} from "./PickingAnnotations";
export { ControlVector3 } from "./NativeControlTypes";
export type { ControlObject3DLike, ControlPickMetadata, Vector3Like } from "./NativeControlTypes";
export { createDefaultControlState } from "./ControlState";
export type { ThreeCompatControlEvent, ThreeCompatControlState } from "./ControlState";

// PRD-15 T6.9: the engine control implementations moved here from
// packages/input/src/controls. Exported by name so @aura3d/input's deprecated
// controls shim can re-export them identically for one minor.
export { CameraRig } from "./engine/CameraRig";
export type { CameraRigState } from "./engine/CameraRig";
export { clamp } from "./engine/ControlTypes";
export type { CameraTransformLike, EulerLike, Vec3Like } from "./engine/ControlTypes";
export { EditorFlyControls } from "./engine/EditorFlyControls";
export type { EditorFlyControlsOptions } from "./engine/EditorFlyControls";
export { createSceneCameraControlAdapter } from "./engine/SceneCameraAdapter";
export type { SceneCameraControlAdapter } from "./engine/SceneCameraAdapter";
export { ThirdPersonFollowControls } from "./engine/ThirdPersonFollowControls";
export type { ThirdPersonFollowControlsOptions } from "./engine/ThirdPersonFollowControls";
export { DEFAULT_ORBIT_MAX_POLAR } from "./engine/OrbitControls";
export { OrbitControls as OrbitControlsEngine } from "./engine/OrbitControls";
export type { OrbitCameraTransformLike } from "./engine/OrbitControls";
export { FirstPersonControls as FirstPersonControlsEngine } from "./engine/FirstPersonControls";
export { PointerLockControls as PointerLockControlsEngine } from "./engine/PointerLockControls";
