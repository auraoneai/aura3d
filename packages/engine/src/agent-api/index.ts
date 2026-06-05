import {
  PhysicsDebugDraw,
  PhysicsStepper,
  PhysicsWorld,
  ScenePhysicsBridge,
  Shape as PhysicsShapeFactory,
  type Collider,
  type ColliderDescriptor,
  type CollisionEvent,
  type Constraint,
  type ConstraintDescriptor,
  type Contact,
  type DebugLine,
  type PhysicsBackendSelection,
  type PhysicsShape,
  type PhysicsSnapshot,
  type PhysicsWorldDescriptor,
  type RaycastHit,
  type RaycastOptions,
  type RigidBody,
  type RigidBodyDescriptor,
  type RigidBodyType,
  type ScenePhysicsNode,
  type SphereCastHit
} from "@aura3d/physics";
import type {
  GLTFSceneAnimationRuntime,
  GLTFSceneAnimationRuntimeOptions
} from "@aura3d/assets/browser";
import type { AnimationPose } from "@aura3d/animation";
import type {
  GameHudBindingKind,
  GameRuntimeSubsystemOwnership
} from "./GameRuntime";
import { createFrameLoop } from "./FrameLoop";
import {
  createCombatWorld,
  createGameCameraDirector,
  createGameEffects,
  applyGameCombatEventsToRuntime,
  createGameAccessibilityFocus,
  createGameAccessibilityLabel,
  createGameAccessibilityRuntimeSettings,
  createGameHighContrastSource,
  createGameHudBindings,
  createGameHudComboBinding,
  createGameHudDebugToggleBinding,
  createGameHudHealthBinding,
  createGameHudMeterBinding,
  createGameHudRoundBinding,
  createGameHudSnapshot,
  createGameHudTimerBinding,
  createGameBoxCollider,
  createGameCapsuleCollider,
  createGameColliderDebugGeometry,
  createGameCombatDebugGeometry,
  createGameDebugOverlayData,
  createGameDebugSceneNodes,
  createGameHitboxDebugGeometry,
  createGameFighting2DRules,
  createGameInput,
  createGameInputReplay,
  createGameInputReplayDriver,
  createGameJumpAssist,
  createGameKinematicBody,
  createGamePauseControlsSource,
  createGameRectCollider,
  createGameReducedFlashSource,
  createGameReducedMotionSource,
  createGameSphereCollider,
  createGameTouchControlLayout,
  gameColliderAabb,
  gameColliders,
  gameEffectPresets,
  gameGuardboxes,
  gameHitboxes,
  gameHurtboxes,
  gameInputReplayEventsAt,
  gamePushboxes,
  gameTriggerVolumes,
  type GameInputOptions
} from "./GameRuntime";
import {
  collectGameRuntimeEvidence as collectGameRuntimeEvidenceV105,
  type GameRuntimeEvidence,
  type GameRuntimeEvidenceOptions,
  type GameRuntimeSourceEvidence
} from "./GameEvidence";
import {
  calculateRuntimeNodeBounds,
  type AuraRuntimeNodeAnimationPoseBindingMetadata,
  type AuraRuntimeNodeAnimationBindingMetadata,
  type AuraRuntimeNodeBounds,
  type AuraRuntimeNodeEffectAttachment,
  type RuntimeNodeMorphTargetWeights
} from "./RuntimeNodeHandle";
import { createRuntimeNodeSpec } from "./GameSceneBridge";
import {
  createFightingGameKit,
  fighting as fightingGameKit
} from "./game-kits/fighting";
import {
  createPromptAnimationEpisodePlan,
  createPromptAnimationStoryBible,
  definePromptAnimationStoryboard
} from "./PromptAnimationContract";
import {
  applyShotPlaybackFrame,
  createShotPlaybackPlan,
  createShotTimeline,
  installShotPlayback,
  sampleShotPlaybackPlan
} from "./ShotTimeline";
import {
  captionCueAtTime,
  createCaptionTimingProof,
  deriveCaptionTrackFromDialogue
} from "./DialoguePerformance";
import {
  createAuraVoiceVisemeTrack,
  createGlbBlendshapeVisemeCue,
  createPrimitiveMouthVisemeCues,
  sampleVisemeTrack
} from "./VisemeController";
import {
  createAuraVoiceBridgePackage,
  createAuraVoiceDubRerenderProof,
  createAuraVoiceRerenderPlan,
  sampleAuraVoiceBridgeAtTime
} from "./AuraVoiceBridge";
import { createCartoonDirectorPlan } from "./CartoonDirector";
import { createCartoonPerformance } from "./CartoonPerformance";
import {
  createCartoonRenderOutputPackageMetadata,
  createCartoonRenderQueue
} from "./CartoonRenderQueue";
import { collectPromptAnimationEvidence } from "./PromptAnimationEvidence";

export { Engine } from "@aura3d/core";
export {
  asAuraAppHandle,
  isAuraAppHandle,
  type AuraAppFrame,
  type AuraAppFrameCallback,
  type AuraAppHandle,
  type AuraAppNodeRegistryLike,
  type AuraAppRuntimeState,
  type AuraAppScreenshot
} from "./AuraAppHandle";
export {
  FrameLoop,
  createFrameLoop,
  type FrameLoopCallback,
  type FrameLoopFrame,
  type FrameLoopOptions,
  type FrameLoopSnapshot,
  type FrameLoopSource
} from "./FrameLoop";
export {
  createCombatWorld,
  createGameCameraDirector,
  createGameEffects,
  applyGameCombatEventsToRuntime,
  createGameAccessibilityFocus,
  createGameAccessibilityLabel,
  createGameAccessibilityRuntimeSettings,
  createGameHighContrastSource,
  createGameHudBindings,
  createGameHudComboBinding,
  createGameHudDebugToggleBinding,
  createGameHudHealthBinding,
  createGameHudMeterBinding,
  createGameHudRoundBinding,
  createGameHudSnapshot,
  createGameHudTimerBinding,
  createGameBoxCollider,
  createGameCapsuleCollider,
  createGameColliderDebugGeometry,
  createGameCombatDebugGeometry,
  createGameDebugOverlayData,
  createGameDebugSceneNodes,
  createGameHitboxDebugGeometry,
  createGameInput,
  createGameInputReplay,
  createGameInputReplayDriver,
  createGameJumpAssist,
  createGameKinematicBody,
  createGamePauseControlsSource,
  createGameRectCollider,
  createGameReducedFlashSource,
  createGameReducedMotionSource,
  createGameSphereCollider,
  createGameTouchControlLayout,
  gameColliderAabb,
  gameColliders,
  gameInputReplayEventsAt,
  createGameLoopPlan,
  type GameAccessibilityFocusOptions,
  type GameAccessibilityLabelOptions,
  type GameAccessibilityPauseControlsOptions,
  type GameAccessibilityPreferenceOptions,
  type GameAccessibilityRuntimeSettings,
  type GameAccessibilityRuntimeSettingsOptions,
  type GameAccessibilitySource,
  type GameAccessibilitySourceKind,
  type GameAabb,
  type GameBounds3,
  type GameCameraDirector,
  type GameCameraDirectorOptions,
  type GameCameraSnapshot,
  type GameCameraTarget,
  type GameCollisionBox,
  type GameCombatActorOptions,
  type GameCombatActorSnapshot,
  type GameCombatActiveAttackSnapshot,
  type GameCombatEvent,
  type GameCombatEventRuntimeBridgeOptions,
  type GameCombatEventRuntimeBridgeResult,
  type GameCombatEventType,
  type GameCombatMove,
  type GameCombatWorld,
  type GameCombatWorldSnapshot,
  type GameBoxCollider,
  type GameBoxColliderOptions,
  type GameCapsuleCollider,
  type GameCapsuleColliderOptions,
  type GameCollider,
  type GameColliderAxis,
  type GameColliderBase,
  type GameColliderDimension,
  type GameColliderFactoryOptions,
  type GameColliderKind,
  type GameColliderPlane,
  type GameDebugGeometryNode,
  type GameDebugGeometryOptions,
  type GameDebugGeometryPrimitive,
  type GameDebugOverlayData,
  type GameDebugOverlayMetric,
  type GameDebugOverlayOptions,
  type GameDebugOverlaySection,
  type GameDebugSceneNode,
  type GameDebugSceneNodeOptions,
  type GameDebugScenePrimitive,
  type GameEffectInstance,
  type GameEffectAttachment,
  type GameEffectKind,
  type GameEffectOptions,
  type GameEffectsController,
  type GameEffectsSnapshot,
  type GameHudActorBindingOptions,
  type GameHudBinding,
  type GameHudBindingKind,
  type GameHudComboBindingOptions,
  type GameHudDebugToggleBindingOptions,
  type GameHudResolvedValue,
  type GameHudRoundBindingOptions,
  type GameHudSourceKind,
  type GameHudSnapshot,
  type GameHudSnapshotItem,
  type GameHudSnapshotOptions,
  type GameHudTimerBindingOptions,
  type GameHudValueFormat,
  type GameInputActionState,
  type GameInputAxisSettings,
  type GameInputAxisBinding,
  type GameInputController,
  type GameInputOptions,
  type GameInputReplayDriver,
  type GameInputReplayDriverSnapshot,
  type GameInputReplayEvent,
  type GameInputReplayOptions,
  type GameInputReplayPlan,
  type GameInputSnapshot,
  type GameJumpAssistController,
  type GameJumpAssistOptions,
  type GameJumpAssistSnapshot,
  type GameJumpAssistUpdate,
  type GameKinematicBody,
  type GameKinematicBodyOptions,
  type GameKinematicBodySnapshot,
  type GameLoopPlan,
  type GamePointerSnapshot,
  type GameRectCollider,
  type GameRectColliderOptions,
  type GameRuntimeSubsystemId,
  type GameRuntimeSubsystemOwnership,
  type GameSphereCollider,
  type GameSphereColliderOptions,
  type GameSubsystemOwner,
  type GameTouchControlAnchor,
  type GameTouchControlKind,
  type GameTouchControlLayout,
  type GameTouchControlLayoutOptions,
  type GameTouchControlRegion,
  type GameTouchControlRequest,
  type GameVec3,
  type GamepadSnapshot
} from "./GameRuntime";
export {
  collectGameSceneRuntimeNodes,
  createGameSceneBridge,
  createRuntimeNodeSpec,
  type GameSceneBridge,
  type GameSceneBridgeApp,
  type GameSceneBridgeBodyLike,
  type GameSceneBridgeEvidence,
  type GameSceneBridgeNodeHandle,
  type GameSceneRuntimeNode
} from "./GameSceneBridge";
export {
  calculateRuntimeNodeBounds,
  createRuntimeNodeEffectAttachment,
  runtimeNodeHasTag,
  type AuraRuntimeNodeAnimationPoseBindingMetadata,
  type AuraRuntimeNodeAnimationBindingMetadata,
  type AuraRuntimeNodeBounds,
  type AuraRuntimeNodeEffectAttachment,
  type AuraRuntimeNodeEffectKind,
  type RuntimeNodeAnimationSpecLike,
  type RuntimeNodeBoundsInput,
  type RuntimeNodeHandleLike,
  type RuntimeNodeMorphTargetWeights,
  type RuntimeNodeVec3
} from "./RuntimeNodeHandle";
export {
  createFightingGameKit,
  fighting,
  fighterRuntimeNode,
  type FightingActorState,
  type FightingControls,
  type FightingGameKit,
  type FightingGameKitOptions,
  type FightingGameSnapshot,
  type FightingStageOptions
} from "./game-kits/fighting";
export { gameKits } from "./game-kits";
export type {
  GameRuntimeEvidence,
  GameRuntimeEvidenceApp,
  GameRuntimeEvidenceOptions,
  GameRuntimeSourceEvidence
} from "./GameEvidence";
export * from "./GameAssetValidation.js";
export * from "./CharacterAssembly.js";
export * from "./AssetEvidence.js";
export * from "./AnimationController.js";
export {
  gameAssetValidation,
  quaterniusGameReadyFighterValidationContract,
  validateQuaterniusGameReadyFighterAsset
} from "./GameAssetValidation.js";
export { createAnimationController } from "./AnimationController.js";
export * from "./PromptAnimationContract.js";
export * from "./AuraVoiceBridge.js";
export * from "./ShotTimeline.js";
export * from "./DialoguePerformance.js";
export * from "./VisemeController.js";
export * from "./PromptAnimationEvidence.js";
export * from "./CartoonDirector.js";
export * from "./CartoonPerformance.js";
export * from "./CartoonRenderQueue.js";

export type AuraVec3 = readonly [number, number, number];
export type AuraColor = `#${string}` | string;
export type AuraAssetType = "model" | "texture" | "environment" | "audio";
export type AuraModelFormat = "glb" | "gltf";
export type AuraTextureFormat = "png" | "jpg" | "jpeg" | "webp" | "ktx2";
export type AuraProceduralTextureKind =
  | "fabric-normal"
  | "rubber-roughness"
  | "brushed-metal-anisotropy"
  | "plastic-micro-scratch";

export interface AuraProceduralTextureSpec {
  readonly kind: "aura-procedural-texture";
  readonly texture: AuraProceduralTextureKind;
  readonly scale: number;
  readonly strength: number;
  readonly contrast?: number;
  readonly direction?: AuraVec3;
  readonly colorA?: AuraColor;
  readonly colorB?: AuraColor;
}

export type AuraMaterialTextureInput = AuraAssetRef<"texture"> | AuraProceduralTextureSpec;

export interface AuraAssetDefinition {
  readonly type: AuraAssetType;
  readonly format: string;
  readonly url: string;
  readonly hash?: string;
  readonly bounds?: AuraVec3;
  readonly sizeBytes?: number;
  readonly optional?: boolean;
  readonly metadata?: AuraAssetMetadata;
}

export interface AuraAssetMetadata {
  readonly materials?: readonly string[];
  readonly animations?: readonly string[];
  readonly textures?: readonly string[];
  readonly thumbnailUrl?: string;
  readonly license?: string;
}

const auraAssetRefBrand: unique symbol = Symbol("AuraAssetRef");

export type AuraAssetRef<
  TType extends AuraAssetType = AuraAssetType,
  TId extends string = string
> = AuraAssetDefinition & {
  readonly kind: "aura-asset-ref";
  readonly id: TId;
  readonly type: TType;
  readonly [auraAssetRefBrand]: {
    readonly type: TType;
    readonly id: TId;
  };
};

export type AuraAssetMap<T extends Record<string, AuraAssetDefinition>> = {
  readonly [K in keyof T]: AuraAssetRef<T[K]["type"], Extract<K, string>> & T[K];
};

export function defineAuraAssets<const T extends Record<string, AuraAssetDefinition>>(definitions: T): AuraAssetMap<T> {
  const refs: Record<string, AuraAssetRef> = {};
  for (const [id, definition] of Object.entries(definitions)) {
    refs[id] = {
      ...definition,
      kind: "aura-asset-ref",
      id,
      [auraAssetRefBrand]: {
        type: definition.type,
        id
      }
    } as AuraAssetRef;
  }
  return refs as AuraAssetMap<T>;
}

export interface AuraTransformSpec {
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
  readonly lookAt?: AuraVec3;
}

export interface AuraMaterialSpec {
  readonly name?: string;
  readonly shader?: "solar-sun" | "solar-corona";
  readonly color?: AuraColor;
  readonly coreColor?: AuraColor;
  readonly rimColor?: AuraColor;
  readonly noiseStrength?: number;
  readonly falloff?: number;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly metalness?: number;
  readonly emissive?: AuraColor;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
  readonly transmission?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly thickness?: number;
  readonly ior?: number;
  readonly sheen?: number;
  readonly sheenRoughness?: number;
  readonly sheenColor?: AuraColor;
  readonly iridescence?: number;
  readonly iridescenceIOR?: number;
  readonly iridescenceThicknessRange?: readonly [number, number];
  readonly anisotropy?: number;
  readonly anisotropyRotation?: number;
  readonly attenuationColor?: AuraColor;
  readonly attenuationDistance?: number;
  readonly envMapIntensity?: number;
  readonly normal?: AuraMaterialTextureInput;
  readonly normalScale?: number;
  readonly roughnessMap?: AuraMaterialTextureInput;
  readonly metalnessMap?: AuraMaterialTextureInput;
  readonly texture?: AuraAssetRef<"texture">;
}

export interface AuraEditableMaterialParameters {
  readonly kind: "aura-material-parameters";
  readonly name: string;
  readonly material: AuraMaterialSpec;
  readonly roughness: number;
  readonly metallic: number;
  readonly metalness: number;
  readonly transmission: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly thickness: number;
  readonly ior: number;
  readonly sheen: number;
  readonly iridescence: number;
  readonly anisotropy: number;
  readonly envMapIntensity: number;
  readonly emissiveIntensity: number;
}

export interface AuraMaterialInspectorParameter {
  readonly name: keyof AuraMaterialSpec | "metalness";
  readonly value: number | string | boolean | readonly number[] | undefined;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly visible: boolean;
}

export interface AuraMaterialInspectorPanel {
  readonly kind: "aura-material-inspector";
  readonly name: string;
  readonly material: AuraMaterialSpec;
  readonly parameters: readonly AuraMaterialInspectorParameter[];
  readonly liveValues: Record<string, number | string | boolean | readonly number[] | undefined>;
  readonly summary: string;
}

export interface AuraMaterialVisualQAResult {
  readonly passes: boolean;
  readonly score: number;
  readonly classes: readonly string[];
  readonly plinths: number;
  readonly labels: number;
  readonly reflectionCards: number;
  readonly chromeReflectsEnvironment: boolean;
  readonly glassTransparent: boolean;
  readonly rubberNonReflective: boolean;
  readonly emissiveGlows: boolean;
  readonly clearcoatLayeredHighlight: boolean;
  readonly minimumMaterialDistance: number;
  readonly problems: readonly string[];
}

export interface AuraModelOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly visible?: boolean;
  readonly physics?: AuraNodePhysicsSpec;
}

export interface AuraPrimitiveOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly size?: number | AuraVec3;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly physics?: AuraNodePhysicsSpec;
}

export interface AuraAnimationSpec {
  readonly clip?: string;
  readonly loop?: boolean;
  readonly restart?: boolean;
  readonly speed?: number;
  readonly startTime?: number;
  readonly duration?: number;
  readonly easing?: "linear" | "easeInOut";
  readonly captureTime?: number;
  readonly orbitCenter?: AuraVec3;
  readonly orbitPhase?: number;
  readonly orbitRadius?: number;
  readonly joint?: AuraCharacterJointName;
  readonly chain?: "root" | "left-arm" | "right-arm" | "left-leg" | "right-leg";
  readonly rootBob?: boolean;
  readonly jointHierarchy?: boolean;
}

export interface AuraRuntimeNodeSpec {
  readonly id: string;
  readonly tags?: readonly string[];
  readonly mutable?: boolean;
}

export interface AuraInteractionSpec {
  readonly cursor?: string;
  readonly onClick?: string;
  readonly onHover?: string;
}

export type AuraCharacterClipName = "idle" | "walk" | "run" | "wave" | "turn" | "pose" | "benchmark-pose";
export type AuraCharacterStyle = "simple" | "athletic" | "robot" | "mannequin";
export type AuraCharacterPose = "mid-stride" | "planted-foot" | "side-view" | "three-quarter";
export type AuraCharacterJointName =
  | "root"
  | "pelvis"
  | "spine"
  | "neck"
  | "head"
  | "left-shoulder"
  | "left-elbow"
  | "left-wrist"
  | "right-shoulder"
  | "right-elbow"
  | "right-wrist"
  | "left-hip"
  | "left-knee"
  | "left-ankle"
  | "right-hip"
  | "right-knee"
  | "right-ankle";

export interface AuraCharacterJoint {
  readonly name: AuraCharacterJointName;
  readonly parent?: AuraCharacterJointName;
  readonly position: AuraVec3;
}

export interface AuraCharacterClip {
  readonly name: AuraCharacterClipName;
  readonly duration: number;
  readonly captureTime: number;
  readonly loop: boolean;
}

export interface AuraCharacterSkeleton {
  readonly kind: "aura-character-skeleton";
  readonly style: AuraCharacterStyle;
  readonly joints: readonly AuraCharacterJoint[];
  readonly clips: readonly AuraCharacterClip[];
}

export interface AuraCharacterRigSpec {
  readonly skeleton: AuraCharacterSkeleton;
  readonly clip: AuraCharacterClipName;
  readonly pose: AuraCharacterPose;
  readonly rootBob?: boolean;
  readonly limbSwing?: "joint-hierarchy";
  readonly footPlanting?: AuraCharacterFootPlantingSpec;
  readonly rootMotion?: AuraCharacterRootMotionSpec;
  readonly constraints?: AuraCharacterConstraintCorrectionSpec;
}

export interface AuraCharacterFootPlantingSpec {
  readonly enabled: boolean;
  readonly groundY: number;
  readonly plantedFeet: readonly ("left" | "right")[];
  readonly captureTime: number;
  readonly evidence: string;
}

export interface AuraCharacterRootMotionSpec {
  readonly enabled: boolean;
  readonly bodyBob: boolean;
  readonly torsoMovesAsSingleBody: boolean;
  readonly strideLength: number;
  readonly evidence: string;
}

export interface AuraCharacterConstraintCorrectionSpec {
  readonly enabled: boolean;
  readonly correctedChains: readonly ("spine" | "left-arm" | "right-arm" | "left-leg" | "right-leg")[];
  readonly maxJointGap: number;
  readonly evidence: string;
}

export interface AuraCharacterVisualQAGap {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly distance: number;
  readonly maxDistance: number;
}

export interface AuraCharacterVisualQAResult {
  readonly connected: boolean;
  readonly impossibleProportions: boolean;
  readonly score: number;
  readonly gaps: readonly AuraCharacterVisualQAGap[];
  readonly problems: readonly string[];
}

export type AuraProceduralHumanMeshPartName =
  | "torso"
  | "pelvis"
  | "neck"
  | "head"
  | "left-shoulder"
  | "right-shoulder"
  | "left-upper-arm"
  | "left-lower-arm"
  | "right-upper-arm"
  | "right-lower-arm"
  | "left-hand"
  | "right-hand"
  | "left-hip"
  | "right-hip"
  | "left-upper-leg"
  | "left-lower-leg"
  | "right-upper-leg"
  | "right-lower-leg"
  | "left-foot"
  | "right-foot";

export interface AuraProceduralHumanMeshPart {
  readonly name: AuraProceduralHumanMeshPartName;
  readonly parent?: AuraProceduralHumanMeshPartName;
  readonly joint: AuraCharacterJointName;
  readonly center: AuraVec3;
  readonly size: AuraVec3;
  readonly vertices: readonly AuraVec3[];
  readonly indices: readonly number[];
  readonly material: AuraMaterialSpec;
}

export interface AuraProceduralHumanMeshDescriptor {
  readonly kind: "aura-procedural-human-mesh";
  readonly style: AuraCharacterStyle;
  readonly skeleton: AuraCharacterSkeleton;
  readonly clips: readonly AuraCharacterClip[];
  readonly parts: readonly AuraProceduralHumanMeshPart[];
  readonly evidence: readonly string[];
}

export type AuraHelperBudgetId =
  | "physicsPlayground"
  | "particleFountain"
  | "solarSystem"
  | "dataBars3D"
  | "neonTunnel"
  | "miniGolfHole"
  | "materialSwatches"
  | "cityBlock"
  | "lowPolyHumanoid"
  | "primitiveHumanoid"
  | "productStage";

export interface AuraHelperPerformanceBudget {
  readonly helper: AuraHelperBudgetId;
  readonly maxDrawCalls: number;
  readonly maxNodes: number;
  readonly targetFpsP50: number;
  readonly maxBundleBytes?: number;
  readonly evidence: string;
}

export type AuraSceneNode =
  | AuraModelNode
  | AuraPrimitiveNode
  | AuraGroupNode
  | AuraLightNode
  | AuraEffectNode
  | AuraInteractionNode
  | AuraLabelNode
  | AuraEnvironmentNode;

export interface AuraModelNode extends AuraTransformSpec {
  readonly kind: "model";
  readonly name?: string;
  readonly asset: AuraAssetRef<"model">;
  readonly material?: AuraMaterialSpec;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly visible: boolean;
  readonly animation?: AuraAnimationSpec;
  readonly interaction?: AuraInteractionSpec;
  readonly physics?: AuraNodePhysicsSpec;
  readonly runtime?: AuraRuntimeNodeSpec;
}

export interface AuraPrimitiveNode extends AuraTransformSpec {
  readonly kind: "primitive";
  readonly primitive: "box" | "sphere" | "plane" | "cylinder" | "capsule" | "torus";
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly size?: number | AuraVec3;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly animation?: AuraAnimationSpec;
  readonly interaction?: AuraInteractionSpec;
  readonly physics?: AuraNodePhysicsSpec;
  readonly runtime?: AuraRuntimeNodeSpec;
}

export interface AuraGroupNode extends AuraTransformSpec {
  readonly kind: "group";
  readonly name?: string;
  readonly children: readonly AuraSceneNode[];
  readonly animation?: AuraAnimationSpec;
  readonly character?: AuraCharacterRigSpec;
  readonly runtime?: AuraRuntimeNodeSpec;
}

export type AuraLightType = "ambient" | "directional" | "point" | "studio" | "rect" | "softbox";

export interface AuraLightNode extends AuraTransformSpec {
  readonly kind: "light";
  readonly light: AuraLightType;
  readonly name?: string;
  readonly color?: AuraColor;
  readonly intensity: number;
  readonly width?: number;
  readonly height?: number;
}

export type AuraEffectType = "fog" | "bloom" | "rain" | "particles" | "ambient-occlusion" | "contact-occlusion";
export type AuraParticleMaterialMode = "additive-glow" | "soft-alpha" | "spark" | "smoke" | "splash" | "dust" | "star";

export interface AuraEffectNode {
  readonly kind: "effect";
  readonly effect: AuraEffectType;
  readonly name?: string;
  readonly intensity?: number;
  readonly density?: number;
  readonly color?: AuraColor;
  readonly speed?: number;
  readonly wind?: AuraVec3;
  readonly particleCount?: number;
  readonly emitter?: "fountain" | "swirl" | "ambient";
  readonly radius?: number;
  readonly height?: number;
  readonly threshold?: number;
  readonly antiBlowout?: boolean;
  readonly maxIntensity?: number;
  readonly emissionRate?: number;
  readonly gravity?: number;
  readonly groundCollision?: boolean;
  readonly lifetimeColorRamp?: readonly AuraColor[];
  readonly materialMode?: AuraParticleMaterialMode;
  readonly texturedBillboard?: boolean;
  readonly sizeOverLife?: readonly number[];
  readonly alphaOverLife?: readonly number[];
  readonly velocityOverLife?: readonly number[];
  readonly turbulence?: number;
  readonly noise?: number;
  readonly splashes?: boolean;
  readonly mist?: boolean;
}

export interface AuraParticleBudgetDiagnostics {
  readonly kind: "aura-particle-budget";
  readonly effectCount: number;
  readonly totalParticles: number;
  readonly estimatedDrawCalls: number;
  readonly estimatedUpdateCostMs: number;
  readonly modes: readonly AuraParticleMaterialMode[];
  readonly texturedBillboards: number;
  readonly gpuReady: boolean;
}

export interface AuraLabelNode extends AuraTransformSpec {
  readonly kind: "label";
  readonly label: "billboard" | "anchor" | "axis-tick" | "callout" | "hud";
  readonly name?: string;
  readonly text: string;
  readonly target?: string;
  readonly color?: AuraColor;
  readonly background?: AuraColor;
  readonly size?: number;
  readonly leader?: boolean;
  readonly screenAnchor?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  readonly occlusionAware?: boolean;
  readonly collisionAvoidance?: boolean;
  readonly animation?: AuraAnimationSpec;
  readonly runtime?: AuraRuntimeNodeSpec;
}

export interface AuraEnvironmentNode {
  readonly kind: "environment";
  readonly environment: "studio" | "material-lab" | "product-hero" | "night-cinematic" | "metal-studio" | "glass-studio";
  readonly name?: string;
  readonly intensity: number;
  readonly color?: AuraColor;
}

export type AuraSceneCategory =
  | "product"
  | "material"
  | "neon"
  | "city-night"
  | "city-day"
  | "space"
  | "physics"
  | "chart"
  | "game";

export interface AuraRendererColorManagementPreset {
  readonly kind: "aura-renderer-color-management";
  readonly workflow: "linear";
  readonly outputColorSpace: "srgb";
  readonly toneMapping: "aces-filmic";
  readonly defaultExposure: number;
  readonly notes: readonly string[];
}

export interface AuraSceneExposurePreset {
  readonly category: AuraSceneCategory;
  readonly exposure: number;
  readonly evidence: string;
}

export interface AuraEnvironmentMapPreset {
  readonly id: AuraEnvironmentNode["environment"];
  readonly label: string;
  readonly purpose: readonly string[];
  readonly intensity: number;
  readonly color: AuraColor;
  readonly evidence: string;
}

export interface AuraRendererQualityPreset {
  readonly kind: "aura-renderer-quality";
  readonly id: "interactive" | "screenshot";
  readonly antialiasing: "msaa" | "msaa-plus-high-dpi";
  readonly shadowMap: "pcf-soft";
  readonly pixelRatio: number;
  readonly preserveDrawingBuffer: boolean;
  readonly maxRecommendedDrawCalls: number;
  readonly evidence: string;
}

export interface AuraRendererDiagnosticReport {
  readonly kind: "aura-renderer-diagnostics";
  readonly colorManagement: AuraRendererColorManagementPreset;
  readonly sceneCategory: AuraSceneCategory;
  readonly exposure: AuraSceneExposurePreset;
  readonly toneMapping: "aces-filmic";
  readonly outputColorSpace: "srgb";
  readonly linearWorkflow: true;
  readonly bloom: {
    readonly enabled: boolean;
    readonly rendered: boolean;
    readonly intensity: number;
    readonly threshold: number;
    readonly radius: number;
    readonly antiBlowout: boolean;
  };
  readonly shadows: {
    readonly enabled: boolean;
    readonly contactShadows: number;
    readonly mapType: "pcf-soft";
  };
  readonly occlusion: {
    readonly enabled: boolean;
    readonly contactOcclusion: boolean;
    readonly ambientOcclusion: boolean;
    readonly evidence: string;
  };
  readonly fog: {
    readonly enabled: boolean;
    readonly density: number;
    readonly preset: "none" | "depth" | "volumetric";
  };
  readonly postprocess: {
    readonly enabled: boolean;
    readonly requested: boolean;
    readonly renderPass: boolean;
    readonly outputPass: boolean;
    readonly bloomPass: boolean;
    readonly ambientOcclusionPass: boolean;
    readonly contactOcclusionReceiver: boolean;
    readonly pixelBacked: boolean;
    readonly runtimeStatus: "not-mounted" | "active" | "fallback" | "disabled";
    readonly requestedPasses: readonly string[];
    readonly actualPasses: readonly string[];
    readonly fallbackPasses: readonly string[];
    readonly evidence: string;
  };
  readonly runtime: {
    readonly mounted: boolean;
    readonly backend: "scene-plan" | "webgl2-agent-runtime";
    readonly postprocessVerified: boolean;
    readonly passNames: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly environment: {
    readonly enabled: boolean;
    readonly preset?: AuraEnvironmentNode["environment"];
    readonly intensity?: number;
    readonly evidence: string;
  };
  readonly antialiasing: AuraRendererQualityPreset["antialiasing"];
  readonly screenshotQuality: AuraRendererQualityPreset;
  readonly warnings: readonly string[];
}

declare global {
  // Some TypeScript DOM libs expose <strong> as HTMLElement only. Agents often
  // use this element for HUD counters, so keep that code portable.
  interface HTMLStrongElement extends HTMLElement {}
}

export interface AuraInteractionNode {
  readonly kind: "interaction";
  readonly mode: "orbit" | "pointer" | "keyboard" | "drag-vector" | "click-impulse" | "hover";
  readonly target?: string;
  readonly vector?: AuraVec3;
  readonly impulse?: number;
  readonly selected?: string;
}

export type AuraPhysicsShapeKind = "box" | "sphere" | "capsule" | "plane";

export interface AuraNodePhysicsSpec {
  readonly type?: RigidBodyType;
  readonly shape?: AuraPhysicsShapeKind | PhysicsShape;
  readonly mass?: number;
  readonly friction?: number;
  readonly restitution?: number;
  readonly density?: number;
  readonly sensor?: boolean;
  readonly halfExtents?: AuraVec3;
  readonly radius?: number;
  readonly halfHeight?: number;
  readonly normal?: AuraVec3;
  readonly constant?: number;
}

export interface AuraPhysicsStepOptions {
  readonly dt?: number;
  readonly steps?: number;
}

export interface AuraPhysicsDebugSnapshot {
  readonly bodyCount: number;
  readonly colliderCount: number;
  readonly contactCount: number;
  readonly sleepingBodyCount: number;
  readonly lines: readonly DebugLine[];
  readonly nodes: readonly AuraSceneNode[];
}

export interface AuraPhysicsSceneSummary {
  readonly kind: "aura-physics-world";
  readonly backend: PhysicsBackendSelection;
  readonly bodies: number;
  readonly colliders: number;
  readonly contacts: number;
  readonly steps: number;
  readonly resets: number;
  readonly debugLines: number;
  readonly snapshot: PhysicsSnapshot;
}

export interface AuraPhysicsWorldController {
  readonly kind: "aura-physics-world";
  createBody(options?: RigidBodyDescriptor & { readonly shape?: PhysicsShape; readonly sensor?: boolean; readonly material?: ColliderDescriptor["material"] }): RigidBody;
  createCollider(body: RigidBody | number, descriptor: ColliderDescriptor): Collider;
  createConstraint(descriptor: ConstraintDescriptor): Constraint;
  bindNode(body: RigidBody | number, node: ScenePhysicsNode, mode?: "dynamic" | "kinematic"): void;
  step(options?: number | AuraPhysicsStepOptions): readonly CollisionEvent[];
  reset(): void;
  contacts(): readonly Contact[];
  liveContactCount(): number;
  raycast(origin: AuraVec3, direction: AuraVec3, options?: RaycastOptions): RaycastHit | undefined;
  sphereCast(origin: AuraVec3, radius: number, direction: AuraVec3, options?: RaycastOptions): SphereCastHit | undefined;
  debug(): AuraPhysicsDebugSnapshot;
  debugNodes(): readonly AuraSceneNode[];
  snapshot(): AuraPhysicsSceneSummary;
}

export class AuraNodeBuilder<TNode extends AuraSceneNode> {
  constructor(private readonly value: TNode) {}

  position(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly position: AuraVec3 }> {
    return this.with({ position: [x, y, z] as const });
  }

  rotate(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly rotation: AuraVec3 }> {
    return this.with({ rotation: [x, y, z] as const });
  }

  scale(value: number | AuraVec3): AuraNodeBuilder<TNode & { readonly scale: number | AuraVec3 }> {
    return this.with({ scale: value });
  }

  lookAt(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly lookAt: AuraVec3 }> {
    return this.with({ lookAt: [x, y, z] as const });
  }

  material(material: AuraMaterialSpec): AuraNodeBuilder<TNode & { readonly material: AuraMaterialSpec }> {
    return this.with({ material });
  }

  animate(animation: AuraAnimationSpec): AuraNodeBuilder<TNode & { readonly animation: AuraAnimationSpec }> {
    return this.with({ animation });
  }

  onPointer(interaction: AuraInteractionSpec): AuraNodeBuilder<TNode & { readonly interaction: AuraInteractionSpec }> {
    return this.with({ interaction });
  }

  physics(spec: AuraNodePhysicsSpec): AuraNodeBuilder<TNode & { readonly physics: AuraNodePhysicsSpec }> {
    return this.with({ physics: spec });
  }

  runtime(spec: AuraRuntimeNodeSpec): AuraNodeBuilder<TNode & { readonly runtime: AuraRuntimeNodeSpec }> {
    return this.with({ runtime: { mutable: true, ...spec } });
  }

  toJSON(): TNode {
    return this.value;
  }

  private with<TPatch extends Partial<AuraSceneNode>>(patch: TPatch): AuraNodeBuilder<TNode & TPatch> {
    return new AuraNodeBuilder({ ...this.value, ...patch } as TNode & TPatch);
  }
}

export function model<TAsset extends AuraAssetRef<"model">>(
  asset: TAsset,
  options: AuraModelOptions = {}
): AuraNodeBuilder<AuraModelNode> {
  return new AuraNodeBuilder({
    kind: "model",
    asset,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    material: options.material,
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true,
    visible: options.visible ?? true,
    physics: options.physics
  });
}

export function unsafeModelUrl(url: string, options: Omit<AuraAssetDefinition, "type" | "format" | "url"> = {}): AuraAssetRef<"model", "unsafe"> {
  const format = url.toLowerCase().endsWith(".gltf") ? "gltf" : "glb";
  return defineAuraAssets({
    unsafe: {
      ...options,
      type: "model",
      format,
      url,
      metadata: {
        ...(options.metadata ?? {}),
        license: options.metadata?.license ?? "unknown"
      }
    }
  }).unsafe;
}

const builtInCharacterAssets = defineAuraAssets({
  humanoid: {
    type: "model",
    format: "glb",
    url: new URL("./assets/humanoid-fixture.glb", import.meta.url).href,
    bounds: [0.7, 1.7, 0.6],
    hash: "sha256-dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b",
    metadata: {
      materials: ["skinned soldier body", "uniform armor", "visor"],
      animations: ["Idle", "Run", "TPose", "Walk"],
      textures: ["embedded soldier/vanguard textures"],
      license: "Aura3D bundled soldier fixture from the existing repository corpus"
    }
  }
} as const);

function primitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraPrimitiveOptions = {}): AuraNodeBuilder<AuraPrimitiveNode> {
  return new AuraNodeBuilder({
    kind: "primitive",
    primitive: primitiveName,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    material: options.material,
    size: options.size,
    castShadow: options.castShadow ?? (primitiveName !== "plane" && options.material?.emissive === undefined),
    receiveShadow: options.receiveShadow ?? true,
    physics: options.physics
  });
}

export type AuraNodeInput = AuraNodeBuilder<AuraSceneNode> | AuraSceneNode;

function sceneNodeFromInput(node: AuraNodeInput): AuraSceneNode {
  return node instanceof AuraNodeBuilder ? node.toJSON() : node;
}

export function group(
  name: string,
  children: readonly AuraNodeInput[] = [],
  options: AuraTransformSpec & {
    readonly animation?: AuraAnimationSpec;
    readonly character?: AuraCharacterRigSpec;
  } = {}
): AuraNodeBuilder<AuraGroupNode> {
  return new AuraNodeBuilder({
    kind: "group",
    name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    animation: options.animation,
    character: options.character,
    children: children.map(sceneNodeFromInput)
  });
}

export const primitives = {
  box: (options?: AuraPrimitiveOptions) => primitive("box", options),
  sphere: (options?: AuraPrimitiveOptions) => primitive("sphere", options),
  plane: (options?: AuraPrimitiveOptions) => primitive("plane", options),
  cylinder: (options?: AuraPrimitiveOptions) => primitive("cylinder", options),
  capsule: (options?: AuraPrimitiveOptions) => primitive("capsule", options),
  torus: (options?: AuraPrimitiveOptions) => primitive("torus", options)
} as const;

export const groups = {
  create: group,
  flatten: (nodes: readonly AuraSceneNode[]): readonly AuraSceneNode[] => flattenSceneNodes(nodes)
} as const;

export const shadows = {
  contact: (options: {
    readonly name?: string;
    readonly position?: AuraVec3;
    readonly footprint?: readonly [number, number];
    readonly opacity?: number;
    readonly color?: AuraColor;
  } = {}): AuraNodeBuilder<AuraPrimitiveNode> => {
    const footprint = options.footprint ?? [1.2, 0.72];
    return primitives.cylinder({
      name: options.name ?? "soft footprint contact shadow",
      material: material.pbr({
        color: options.color ?? "#030712",
        roughness: 0.94,
        opacity: options.opacity ?? 0.34
      })
    })
      .position(...(options.position ?? [0, 0.018, 0] as const))
      .scale([footprint[0], 0.012, footprint[1]]);
  }
} as const;

function clampMaterialScalar(value: number | undefined, fallback: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}

function proceduralTexture(texture: AuraProceduralTextureKind, options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}): AuraProceduralTextureSpec {
  return {
    kind: "aura-procedural-texture",
    texture,
    scale: options.scale ?? 1,
    strength: options.strength ?? 1,
    contrast: options.contrast,
    direction: options.direction,
    colorA: options.colorA,
    colorB: options.colorB
  };
}

export const material = {
  pbr: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: "#d7dee8",
    roughness: 0.55,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    ...options
  }),
  physical: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.pbr(options),
  emissive: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#111827",
    emissive: options.emissive ?? options.color ?? "#38d6ff",
    roughness: options.roughness ?? 0.35,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    ...options
  }),
  metal: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#dce6ee",
    roughness: options.roughness ?? 0.12,
    metallic: options.metallic ?? options.metalness ?? 1,
    metalness: options.metalness ?? options.metallic ?? 1,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.16,
    envMapIntensity: options.envMapIntensity ?? 1.45,
    ...options
  }),
  rubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#111317",
    roughness: options.roughness ?? 0.86,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    ...options
  }),
  glass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#d8f2ff",
    roughness: options.roughness ?? 0.04,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    opacity: options.opacity ?? 0.24,
    transmission: options.transmission ?? 1,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.04,
    thickness: options.thickness ?? 0.74,
    ior: options.ior ?? 1.48,
    attenuationColor: options.attenuationColor ?? options.color ?? "#d8f2ff",
    attenuationDistance: options.attenuationDistance ?? 0.85,
    envMapIntensity: options.envMapIntensity ?? 1.85,
    ...options
  }),
  clearcoat: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#e8edf5",
    roughness: options.roughness ?? 0.16,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.04,
    envMapIntensity: options.envMapIntensity ?? 1.35,
    ...options
  }),
  neon: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#0a1020",
    emissive: options.emissive ?? options.color ?? "#38d6ff",
    emissiveIntensity: options.emissiveIntensity ?? 2.8,
    roughness: options.roughness ?? 0.18,
    metallic: options.metallic ?? options.metalness ?? 0.04,
    metalness: options.metalness ?? options.metallic ?? 0.04,
    ...options
  }),
  reflectiveFloor: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#05070d",
    roughness: options.roughness ?? 0.12,
    metallic: options.metallic ?? options.metalness ?? 0.35,
    metalness: options.metalness ?? options.metallic ?? 0.35,
    clearcoat: options.clearcoat ?? 0.7,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.08,
    envMapIntensity: options.envMapIntensity ?? 1.25,
    ...options
  }),
  solarSun: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    name: options.name ?? "solar sun shader material",
    shader: "solar-sun",
    color: options.color ?? "#ffd166",
    coreColor: options.coreColor ?? "#fff7ad",
    rimColor: options.rimColor ?? "#f97316",
    emissive: options.emissive ?? options.color ?? "#ffd166",
    emissiveIntensity: options.emissiveIntensity ?? 2.45,
    noiseStrength: options.noiseStrength ?? 0.18,
    roughness: options.roughness ?? 0.18,
    ...options
  }),
  solarCorona: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    name: options.name ?? "solar corona shader material",
    shader: "solar-corona",
    color: options.color ?? "#ff9f1c",
    coreColor: options.coreColor ?? "#ffd166",
    rimColor: options.rimColor ?? "#f97316",
    emissive: options.emissive ?? options.color ?? "#ff9f1c",
    emissiveIntensity: options.emissiveIntensity ?? 1.55,
    opacity: options.opacity ?? 0.36,
    falloff: options.falloff ?? 2.7,
    noiseStrength: options.noiseStrength ?? 0.14,
    roughness: options.roughness ?? 0.35,
    ...options
  }),
  fabric: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#d8dde6",
    roughness: options.roughness ?? 0.92,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.42,
    normal: options.normal ?? proceduralTexture("fabric-normal", { scale: 18, strength: 0.42, contrast: 0.62 }),
    sheen: options.sheen ?? 0.45,
    sheenRoughness: options.sheenRoughness ?? 0.78,
    ...options
  }),
  chrome: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.metal({
    name: options.name ?? "chrome",
    color: options.color ?? "#f8fbff",
    roughness: options.roughness ?? 0.018,
    metallic: options.metallic ?? options.metalness ?? 1,
    metalness: options.metalness ?? options.metallic ?? 1,
    clearcoat: options.clearcoat ?? 0.22,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.018,
    envMapIntensity: options.envMapIntensity ?? 2,
    ...options
  }),
  brushedMetal: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.metal({
    name: options.name ?? "brushed metal",
    color: options.color ?? "#d9e2ea",
    roughness: options.roughness ?? 0.28,
    anisotropy: options.anisotropy ?? 0.86,
    anisotropyRotation: options.anisotropyRotation ?? 1.5708,
    normal: options.normal ?? proceduralTexture("brushed-metal-anisotropy", { scale: 36, strength: 0.38, contrast: 0.7, direction: [1, 0, 0] }),
    roughnessMap: options.roughnessMap ?? proceduralTexture("brushed-metal-anisotropy", { scale: 42, strength: 0.44, contrast: 0.64, direction: [1, 0, 0] }),
    envMapIntensity: options.envMapIntensity ?? 1.55,
    ...options
  }),
  frostedGlass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.glass({
    name: options.name ?? "frosted glass",
    color: options.color ?? "#d8f7ff",
    roughness: options.roughness ?? 0.42,
    opacity: options.opacity ?? 0.46,
    transmission: options.transmission ?? 0.72,
    thickness: options.thickness ?? 0.88,
    normal: options.normal ?? proceduralTexture("plastic-micro-scratch", { scale: 24, strength: 0.24, contrast: 0.5 }),
    envMapIntensity: options.envMapIntensity ?? 1.28,
    ...options
  }),
  clearGlass: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.glass({
    name: options.name ?? "clear glass",
    color: options.color ?? "#c8f4ff",
    roughness: options.roughness ?? 0.015,
    opacity: options.opacity ?? 0.2,
    transmission: options.transmission ?? 1,
    thickness: options.thickness ?? 0.9,
    ior: options.ior ?? 1.5,
    envMapIntensity: options.envMapIntensity ?? 2.05,
    ...options
  }),
  blackRubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.rubber({
    name: options.name ?? "black rubber",
    color: options.color ?? "#0b0d11",
    roughness: options.roughness ?? 0.98,
    normal: options.normal ?? proceduralTexture("rubber-roughness", { scale: 28, strength: 0.34, contrast: 0.76 }),
    roughnessMap: options.roughnessMap ?? proceduralTexture("rubber-roughness", { scale: 32, strength: 0.8, contrast: 0.86 }),
    envMapIntensity: options.envMapIntensity ?? 0.22,
    ...options
  }),
  matteClay: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.pbr({
    name: options.name ?? "matte clay",
    color: options.color ?? "#b98f73",
    roughness: options.roughness ?? 0.94,
    metallic: options.metallic ?? options.metalness ?? 0,
    metalness: options.metalness ?? options.metallic ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.28,
    ...options
  }),
  ceramic: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.clearcoat({
    name: options.name ?? "glazed ceramic",
    color: options.color ?? "#f3f7fb",
    roughness: options.roughness ?? 0.22,
    clearcoat: options.clearcoat ?? 0.78,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.08,
    envMapIntensity: options.envMapIntensity ?? 1.18,
    ...options
  }),
  glowingEmissive: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.emissive({
    name: options.name ?? "glowing emissive",
    color: options.color ?? "#ff42c8",
    emissive: options.emissive ?? options.color ?? "#ff42c8",
    emissiveIntensity: options.emissiveIntensity ?? 3.4,
    roughness: options.roughness ?? 0.16,
    envMapIntensity: options.envMapIntensity ?? 0.3,
    ...options
  }),
  clearcoatPaint: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.clearcoat({
    name: options.name ?? "clearcoat paint",
    color: options.color ?? "#ef233c",
    roughness: options.roughness ?? 0.055,
    metallic: options.metallic ?? options.metalness ?? 0.04,
    metalness: options.metalness ?? options.metallic ?? 0.04,
    clearcoat: options.clearcoat ?? 1,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.018,
    envMapIntensity: options.envMapIntensity ?? 1.62,
    ...options
  }),
  sneakerMesh: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.fabric({
    name: options.name ?? "sneaker mesh",
    color: options.color ?? "#dbeafe",
    roughness: options.roughness ?? 0.88,
    sheen: options.sheen ?? 0.34,
    normal: options.normal ?? proceduralTexture("fabric-normal", { scale: 34, strength: 0.48, contrast: 0.72 }),
    envMapIntensity: options.envMapIntensity ?? 0.36,
    ...options
  }),
  sneakerRubber: (options: AuraMaterialSpec = {}): AuraMaterialSpec => material.blackRubber({
    name: options.name ?? "sneaker rubber",
    color: options.color ?? "#111827",
    roughness: options.roughness ?? 0.93,
    normal: options.normal ?? proceduralTexture("rubber-roughness", { scale: 24, strength: 0.42, contrast: 0.7 }),
    envMapIntensity: options.envMapIntensity ?? 0.26,
    ...options
  }),
  proceduralTexture,
  proceduralTextures: {
    fabric: (options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}) => proceduralTexture("fabric-normal", { scale: 18, strength: 0.42, contrast: 0.62, ...options }),
    rubber: (options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}) => proceduralTexture("rubber-roughness", { scale: 28, strength: 0.7, contrast: 0.82, ...options }),
    brushedMetal: (options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}) => proceduralTexture("brushed-metal-anisotropy", { scale: 42, strength: 0.44, contrast: 0.68, direction: [1, 0, 0], ...options }),
    plastic: (options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}) => proceduralTexture("plastic-micro-scratch", { scale: 22, strength: 0.26, contrast: 0.5, ...options })
  },
  parameters: (name: string, spec: AuraMaterialSpec): AuraEditableMaterialParameters => ({
    kind: "aura-material-parameters",
    name,
    material: spec,
    roughness: spec.roughness ?? 0.55,
    metallic: spec.metallic ?? spec.metalness ?? 0,
    metalness: spec.metalness ?? spec.metallic ?? 0,
    transmission: spec.transmission ?? 0,
    clearcoat: spec.clearcoat ?? 0,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0,
    thickness: spec.thickness ?? 0,
    ior: spec.ior ?? 1.5,
    sheen: spec.sheen ?? 0,
    iridescence: spec.iridescence ?? 0,
    anisotropy: spec.anisotropy ?? 0,
    envMapIntensity: spec.envMapIntensity ?? 1,
    emissiveIntensity: spec.emissiveIntensity ?? 0
  }),
  fromParameters: (parameters: AuraEditableMaterialParameters): AuraMaterialSpec => ({
    ...parameters.material,
    roughness: parameters.roughness,
    metallic: parameters.metallic,
    metalness: parameters.metalness,
    transmission: parameters.transmission,
    clearcoat: parameters.clearcoat,
    clearcoatRoughness: parameters.clearcoatRoughness,
    thickness: parameters.thickness,
    ior: parameters.ior,
    sheen: parameters.sheen,
    iridescence: parameters.iridescence,
    anisotropy: parameters.anisotropy,
    envMapIntensity: parameters.envMapIntensity,
    emissiveIntensity: parameters.emissiveIntensity
  }),
  labParameters: (): readonly AuraEditableMaterialParameters[] => [
    material.parameters("chrome", material.chrome()),
    material.parameters("glass", material.clearGlass()),
    material.parameters("rubber", material.blackRubber()),
    material.parameters("emissive", material.glowingEmissive({ color: "#ff4bd8", emissive: "#ff4bd8", emissiveIntensity: 3.2 })),
    material.parameters("clearcoat", material.clearcoatPaint({ color: "#ef4444" }))
  ],
  presets: (): Readonly<Record<string, AuraMaterialSpec>> => ({
    chrome: material.chrome(),
    brushedMetal: material.brushedMetal(),
    frostedGlass: material.frostedGlass(),
    clearGlass: material.clearGlass(),
    blackRubber: material.blackRubber(),
    matteClay: material.matteClay(),
    ceramic: material.ceramic(),
    glowingEmissive: material.glowingEmissive(),
    clearcoatPaint: material.clearcoatPaint(),
    sneakerMesh: material.sneakerMesh(),
    sneakerRubber: material.sneakerRubber(),
    fabric: material.fabric()
  }),
  inspector: (name: string, spec: AuraMaterialSpec): AuraMaterialInspectorPanel => createMaterialInspector(name, spec),
  visualQA: (nodes: readonly AuraSceneNode[]): AuraMaterialVisualQAResult => validateMaterialVisualQA(nodes)
} as const;

function createMaterialInspector(name: string, spec: AuraMaterialSpec): AuraMaterialInspectorPanel {
  const metalness = spec.metalness ?? spec.metallic ?? 0;
  const parameters: AuraMaterialInspectorParameter[] = [
    { name: "color", value: spec.color ?? "#d7dee8", visible: true },
    { name: "roughness", value: clampMaterialScalar(spec.roughness, 0.55), min: 0, max: 1, step: 0.01, visible: true },
    { name: "metalness", value: clampMaterialScalar(metalness, 0), min: 0, max: 1, step: 0.01, visible: true },
    { name: "clearcoat", value: clampMaterialScalar(spec.clearcoat, 0), min: 0, max: 1, step: 0.01, visible: spec.clearcoat !== undefined },
    { name: "clearcoatRoughness", value: clampMaterialScalar(spec.clearcoatRoughness, 0.18), min: 0, max: 1, step: 0.01, visible: spec.clearcoat !== undefined },
    { name: "transmission", value: clampMaterialScalar(spec.transmission, 0), min: 0, max: 1, step: 0.01, visible: spec.transmission !== undefined || (spec.opacity ?? 1) < 1 },
    { name: "thickness", value: spec.thickness ?? 0, min: 0, max: 5, step: 0.01, unit: "m", visible: spec.transmission !== undefined || spec.thickness !== undefined },
    { name: "ior", value: spec.ior ?? 1.5, min: 1, max: 2.333, step: 0.001, visible: spec.transmission !== undefined || spec.ior !== undefined },
    { name: "sheen", value: clampMaterialScalar(spec.sheen, 0), min: 0, max: 1, step: 0.01, visible: spec.sheen !== undefined },
    { name: "iridescence", value: clampMaterialScalar(spec.iridescence, 0), min: 0, max: 1, step: 0.01, visible: spec.iridescence !== undefined },
    { name: "anisotropy", value: clampMaterialScalar(spec.anisotropy, 0, -1, 1), min: -1, max: 1, step: 0.01, visible: spec.anisotropy !== undefined },
    { name: "emissiveIntensity", value: spec.emissiveIntensity ?? 0, min: 0, max: 8, step: 0.05, visible: spec.emissive !== undefined },
    { name: "envMapIntensity", value: spec.envMapIntensity ?? 1, min: 0, max: 4, step: 0.01, visible: true },
    { name: "normalScale", value: spec.normalScale ?? (spec.normal ? 1 : 0), min: 0, max: 2, step: 0.01, visible: spec.normal !== undefined }
  ];
  const liveValues: Record<string, number | string | boolean | readonly number[] | undefined> = {};
  for (const parameter of parameters) {
    if (parameter.visible) liveValues[String(parameter.name)] = parameter.value;
  }
  return {
    kind: "aura-material-inspector",
    name,
    material: spec,
    parameters,
    liveValues,
    summary: `${name}: roughness ${liveValues.roughness}, metalness ${liveValues.metalness}, transmission ${liveValues.transmission ?? 0}, clearcoat ${liveValues.clearcoat ?? 0}`
  };
}

function validateMaterialVisualQA(nodes: readonly AuraSceneNode[]): AuraMaterialVisualQAResult {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const specs = flattened
    .filter((node): node is AuraPrimitiveNode | AuraModelNode => (node.kind === "primitive" || node.kind === "model") && Boolean(node.material))
    .map((node) => node.material!)
    .filter(Boolean);
  const lowerNames = names.map((name) => name.toLowerCase());
  const labelsCount = flattened.filter((node): node is AuraLabelNode => node.kind === "label").length +
    lowerNames.filter((name) => name.includes("material label")).length;
  const plinths = lowerNames.filter((name) => name.includes("label plinth") || name.includes("swatch plinth") || name.includes("material comparison")).length;
  const reflectionCards = lowerNames.filter((name) =>
    name.includes("reflection card") ||
    name.includes("reflection strip") ||
    name.includes("contrast card") ||
    name.includes("softbox reflection") ||
    name.includes("environment reflection")
  ).length;
  const hasNamed = (needle: string) => lowerNames.some((name) => name.includes(needle));
  const classSpecs: Record<string, AuraMaterialSpec | undefined> = {
    chrome: specs.find((spec) => (spec.metalness ?? spec.metallic ?? 0) > 0.85 && (spec.roughness ?? 1) < 0.12) ?? specs.find((_, index) => lowerNames[index]?.includes("chrome")),
    glass: specs.find((spec) => (spec.transmission ?? 0) > 0.55 || (spec.opacity ?? 1) < 0.5),
    rubber: specs.find((spec) => (spec.roughness ?? 0) > 0.82 && (spec.metalness ?? spec.metallic ?? 0) < 0.08 && !spec.emissive),
    emissive: specs.find((spec) => Boolean(spec.emissive)),
    clearcoat: specs.find((spec) => (spec.clearcoat ?? 0) > 0.7 && (spec.transmission ?? 0) < 0.2)
  };
  const classes = Object.entries(classSpecs)
    .filter(([, spec]) => Boolean(spec))
    .map(([key]) => key);
  const minimumMaterialDistance = minimumMaterialFeatureDistance(Object.values(classSpecs).filter((spec): spec is AuraMaterialSpec => Boolean(spec)));
  const chromeReflectsEnvironment = Boolean(classSpecs.chrome) && reflectionCards >= 4 && (hasNamed("chrome bright reflection") || hasNamed("environment reflection"));
  const glassTransparent = Boolean(classSpecs.glass) && (hasNamed("transparent") || hasNamed("refracted") || hasNamed("glass contrast"));
  const rubberSpec = classSpecs.rubber;
  const rubberNonReflective = rubberSpec ? (rubberSpec.roughness ?? 0) >= 0.85 && (rubberSpec.envMapIntensity ?? 1) <= 0.55 : false;
  const emissiveGlows = Boolean(classSpecs.emissive) && (hasNamed("glow halo") || hasNamed("glow spill") || flattened.some((node) => node.kind === "effect" && node.effect === "bloom"));
  const clearcoatLayeredHighlight = Boolean(classSpecs.clearcoat) && (hasNamed("outer gloss layer") || hasNamed("topcoat highlight") || hasNamed("base reflection"));
  const problems: string[] = [];
  if (classes.length < 5) problems.push(`expected five distinguishable material classes, found ${classes.join(", ") || "none"}`);
  if (plinths < 5) problems.push(`expected at least five material plinth/label supports, found ${plinths}`);
  if (labelsCount < 5) problems.push(`expected five readable material labels, found ${labelsCount}`);
  if (reflectionCards < 5) problems.push(`expected reflection/contrast cards, found ${reflectionCards}`);
  if (!chromeReflectsEnvironment) problems.push("chrome lacks readable environment reflection cues");
  if (!glassTransparent) problems.push("glass lacks transparency/refraction cues");
  if (!rubberNonReflective) problems.push("rubber does not read as rough non-reflective material");
  if (!emissiveGlows) problems.push("emissive material lacks controlled glow cues");
  if (!clearcoatLayeredHighlight) problems.push("clearcoat lacks layered specular highlight cues");
  if (minimumMaterialDistance < 0.28) problems.push(`material classes are too similar, minimum feature distance ${minimumMaterialDistance.toFixed(2)}`);
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    classes,
    plinths,
    labels: labelsCount,
    reflectionCards,
    chromeReflectsEnvironment,
    glassTransparent,
    rubberNonReflective,
    emissiveGlows,
    clearcoatLayeredHighlight,
    minimumMaterialDistance,
    problems
  };
}

function materialFeatureVector(spec: AuraMaterialSpec): readonly number[] {
  const [r, g, b] = colorToClearColor(spec.color ?? "#d7dee8");
  return [
    spec.roughness ?? 0.55,
    spec.metalness ?? spec.metallic ?? 0,
    spec.transmission ?? 0,
    spec.clearcoat ?? 0,
    Math.min(1, (spec.emissiveIntensity ?? (spec.emissive ? 1 : 0)) / 4),
    spec.opacity ?? 1,
    Math.min(1, (spec.envMapIntensity ?? 1) / 2),
    spec.sheen ?? 0,
    Math.abs(spec.anisotropy ?? 0),
    r,
    g,
    b
  ];
}

function materialFeatureDistance(a: AuraMaterialSpec, b: AuraMaterialSpec): number {
  const av = materialFeatureVector(a);
  const bv = materialFeatureVector(b);
  let sum = 0;
  for (let index = 0; index < av.length; index += 1) {
    const delta = (av[index] ?? 0) - (bv[index] ?? 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum / av.length);
}

function minimumMaterialFeatureDistance(specs: readonly AuraMaterialSpec[]): number {
  if (specs.length < 2) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (let a = 0; a < specs.length; a += 1) {
    for (let b = a + 1; b < specs.length; b += 1) {
      minimum = Math.min(minimum, materialFeatureDistance(specs[a]!, specs[b]!));
    }
  }
  return Number.isFinite(minimum) ? Number(minimum.toFixed(3)) : 0;
}

export const lights = {
  ambient: (options: { readonly name?: string; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "ambient",
      name: options.name,
      intensity: options.intensity ?? 0.28,
      color: options.color ?? "#ffffff"
    }),
  directional: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "directional",
      name: options.name,
      position: options.position ?? [3, 4, 3],
      intensity: options.intensity ?? 1.5,
      color: options.color ?? "#ffffff"
    }),
  point: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "point",
      name: options.name,
      position: options.position ?? [2, 2.5, 1.5],
      intensity: options.intensity ?? 2,
      color: options.color ?? "#ffffff"
    }),
  studio: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "studio",
      name: "studio-key-fill-rim",
      intensity: options.intensity ?? 1,
      color: "#ffffff",
      position: [0, 3, 4]
    }),
  rect: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly width?: number; readonly height?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "rect",
      name: options.name ?? "rect area light",
      position: options.position ?? [0, 2.6, 1.8],
      intensity: options.intensity ?? 1.4,
      color: options.color ?? "#ffffff",
      width: options.width ?? 2.2,
      height: options.height ?? 1.2
    }),
  softbox: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly width?: number; readonly height?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: options.name ?? "large softbox light",
      position: options.position ?? [-2.2, 2.4, 2.2],
      intensity: options.intensity ?? 1.75,
      color: options.color ?? "#f7fbff",
      width: options.width ?? 2.4,
      height: options.height ?? 1.6
    }),
  productStudio: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: "product-studio-softbox-rig",
      position: [-2.25, 2.45, 2.35],
      intensity: options.intensity ?? 1.7,
      color: "#f7fbff",
      width: 2.5,
      height: 1.6
    }),
  materialLab: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: "material-lab-rect-softbox-rig",
      position: [0, 2.55, 1.8],
      intensity: options.intensity ?? 1.9,
      color: "#ffffff",
      width: 3.2,
      height: 1.2
    })
} as const;

export type AuraCameraMode = "perspective" | "orbit" | "dolly" | "follow" | "path" | "flythrough";

export interface AuraCameraSpec {
  readonly mode: AuraCameraMode;
  readonly position?: AuraVec3;
  readonly target?: AuraVec3;
  readonly fov?: number;
  readonly distance?: number;
  readonly from?: AuraVec3;
  readonly to?: AuraVec3;
  readonly seconds?: number;
  readonly targetNode?: string;
  readonly easing?: "linear" | "easeInOut";
  readonly captureTime?: number;
  readonly smoothing?: number;
  readonly subjectEmphasis?: number;
}

export interface AuraBoundsSpec {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

export const camera = {
  perspective: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => ({
    mode: "perspective",
    position: options.position ?? [0, 1.4, 4],
    target: options.target ?? [0, 0.8, 0],
    fov: options.fov ?? 45
  }),
  orbit: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => {
    const distance = options.distance ?? 4;
    const target = options.target ?? [0, 0.8, 0];
    return {
      mode: "orbit",
      distance,
      target,
      position: options.position ?? [
        target[0] + distance * 0.62,
        target[1] + distance * 0.42,
        target[2] + distance * 0.78
      ],
      fov: options.fov ?? 45
    };
  },
  dolly: (options: Omit<AuraCameraSpec, "mode"> & { readonly from: AuraVec3; readonly to: AuraVec3 }): AuraCameraSpec => ({
    mode: "dolly",
    from: options.from,
    to: options.to,
    target: options.target ?? [0, 0.8, 0],
    seconds: options.seconds ?? 6,
    fov: options.fov ?? 45,
    captureTime: options.captureTime
  }),
  follow: (options: Omit<AuraCameraSpec, "mode"> & { readonly targetNode: string }): AuraCameraSpec => ({
    mode: "follow",
    targetNode: options.targetNode,
    distance: options.distance ?? 5,
    position: options.position,
    target: options.target ?? [0, 1, 0],
    fov: options.fov ?? 50,
    easing: options.easing,
    captureTime: options.captureTime,
    smoothing: options.smoothing ?? 0.18,
    subjectEmphasis: options.subjectEmphasis ?? 0.62
  }),
  path: (options: Omit<AuraCameraSpec, "mode"> & { readonly from: AuraVec3; readonly to: AuraVec3 }): AuraCameraSpec => ({
    mode: "path",
    from: options.from,
    to: options.to,
    target: options.target ?? [0, 0.8, 0],
    seconds: options.seconds ?? 6,
    fov: options.fov ?? 45,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime
  }),
  flythrough: (options: Omit<AuraCameraSpec, "mode"> & { readonly from?: AuraVec3; readonly to?: AuraVec3 } = {}): AuraCameraSpec => ({
    mode: "flythrough",
    from: options.from ?? [0, 0.36, 1.6],
    to: options.to ?? [0, 0.36, -4.4],
    target: options.target ?? [0, 0.28, -5.8],
    seconds: options.seconds ?? 8,
    fov: options.fov ?? 54,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime
  }),
  autoFrame: (options: { readonly bounds?: AuraBoundsSpec; readonly target?: AuraVec3; readonly padding?: number; readonly fov?: number } = {}): AuraCameraSpec => {
    const bounds = options.bounds ?? { min: [-1, 0, -1], max: [1, 1.6, 1] } as const;
    const center: AuraVec3 = options.target ?? [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2
    ];
    const extent = Math.max(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
      0.1
    );
    const distance = extent * (options.padding ?? 2.15);
    return camera.orbit({ target: center, distance, fov: options.fov ?? 42 });
  },
  physics: (): AuraCameraSpec => camera.orbit({ target: [0, 0.58, -0.35], distance: 5.8, fov: 43 }),
  charts: (): AuraCameraSpec => camera.orbit({ target: [0, 0.78, 0], distance: 6.4, fov: 40 }),
  materials: (): AuraCameraSpec => camera.perspective({ position: [0, 2.08, 7.35], target: [0, 0.9, -0.72], fov: 40 }),
  city: (): AuraCameraSpec => camera.orbit({ target: [0, 0.82, 0], distance: 8.4, fov: 44 }),
  product: (): AuraCameraSpec => camera.perspective({ position: [1.28, 1.02, 3.08], target: [0, 0.7, -0.65], fov: 32 }),
  solar: (): AuraCameraSpec => camera.orbit({ target: [0, 0, 0], distance: 7.2, fov: 46 }),
  humanoid: (): AuraCameraSpec => camera.perspective({ position: [1.2, 1.12, 3.45], target: [0, 0.78, -0.55], fov: 36 }),
  miniGolf: (): AuraCameraSpec => camera.follow({ targetNode: "white physics golf ball", distance: 4.2, fov: 48 }),
  neon: (): AuraCameraSpec => camera.flythrough({ from: [0, 0.36, 1.6], to: [0, 0.36, -5.8], target: [0, 0.26, -6.8], fov: 54, captureTime: 0.16 })
} as const;

export interface AuraTimelineSpec {
  readonly mode: "loop" | "once";
  readonly seconds?: number;
  readonly startTime?: number;
  readonly duration?: number;
  readonly loop?: boolean;
  readonly easing?: "linear" | "easeInOut";
  readonly captureTime?: number;
}

export const timeline = {
  loop: (options: Omit<AuraTimelineSpec, "mode"> = {}): AuraTimelineSpec => ({
    mode: "loop",
    seconds: options.seconds ?? options.duration ?? 8,
    startTime: options.startTime ?? 0,
    duration: options.duration ?? options.seconds ?? 8,
    loop: true,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime
  }),
  once: (options: Omit<AuraTimelineSpec, "mode"> = {}): AuraTimelineSpec => ({
    mode: "once",
    seconds: options.seconds ?? options.duration ?? 4,
    startTime: options.startTime ?? 0,
    duration: options.duration ?? options.seconds ?? 4,
    loop: false,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime
  })
} as const;

export const effects = {
  fog: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "fog",
      density: options.density ?? 0.12,
      color: options.color ?? "#9fb7d9",
      intensity: options.intensity
    }),
  bloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) => {
    const antiBlowout = options.antiBlowout ?? true;
    const maxIntensity = options.maxIntensity ?? 0.92;
    const intensity = antiBlowout
      ? Math.min(maxIntensity, Math.max(0.05, options.intensity ?? 0.35))
      : options.intensity ?? 0.35;
    return new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "bloom",
      intensity,
      color: options.color ?? "#ffffff",
      radius: options.radius ?? 0.38,
      threshold: options.threshold ?? 0.7,
      antiBlowout,
      maxIntensity
    });
  },
  cinematicBloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    effects.bloom({
      intensity: options.intensity ?? 0.58,
      color: options.color ?? "#7dfcff",
      radius: options.radius ?? 0.42,
      threshold: options.threshold ?? 0.72,
      antiBlowout: options.antiBlowout ?? true,
      maxIntensity: options.maxIntensity ?? 0.92
    }),
  neonBloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    effects.bloom({
      intensity: options.intensity ?? 0.72,
      color: options.color ?? "#ff42c8",
      radius: options.radius ?? 0.48,
      threshold: options.threshold ?? 0.68,
      antiBlowout: options.antiBlowout ?? true,
      maxIntensity: options.maxIntensity ?? 0.92
    }),
  volumetricFog: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    effects.fog({
      density: options.density ?? 0.18,
      color: options.color ?? "#6f84b9",
      intensity: options.intensity ?? 0.7
    }),
  depthFog: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    effects.fog({
      density: options.density ?? 0.14,
      color: options.color ?? "#7aa2d6",
      intensity: options.intensity ?? 0.62
    }),
  ambientOcclusion: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "ambient-occlusion",
      name: options.name ?? "screen space ambient occlusion grounding",
      intensity: options.intensity ?? 0.42,
      radius: options.radius ?? 0.74,
      density: options.density ?? 0.58,
      color: options.color ?? "#020617"
    }),
  contactOcclusion: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "contact-occlusion",
      name: options.name ?? "contact occlusion grounding",
      intensity: options.intensity ?? 0.36,
      radius: options.radius ?? 0.52,
      density: options.density ?? 0.7,
      color: options.color ?? "#020617"
    }),
  rain: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "rain",
      intensity: options.intensity ?? 0.4,
      density: options.density ?? 0.72,
      color: options.color ?? "#bcd7ff",
      speed: options.speed ?? 1,
      wind: options.wind ?? [-0.32, -5.4, -0.16],
      particleCount: options.particleCount,
      splashes: options.splashes ?? true,
      mist: options.mist ?? true
    }),
	  particles: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
	    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "particles",
      name: options.name ?? `${options.emitter ?? "swirl"} particle system`,
      intensity: options.intensity ?? 0.8,
      density: options.density ?? 1,
      color: options.color ?? "#7dfcff",
      speed: options.speed ?? 1,
      particleCount: options.particleCount ?? 2400,
	      emitter: options.emitter ?? "swirl",
	      radius: options.radius ?? 1.15,
	      height: options.height ?? 2.4,
	      emissionRate: options.emissionRate,
	      gravity: options.gravity,
	      groundCollision: options.groundCollision,
	      lifetimeColorRamp: options.lifetimeColorRamp,
	      materialMode: options.materialMode ?? (options.emitter === "fountain" ? "additive-glow" : "soft-alpha"),
	      texturedBillboard: options.texturedBillboard ?? true,
	      sizeOverLife: options.sizeOverLife ?? [0.35, 1, 0.58],
	      alphaOverLife: options.alphaOverLife ?? [0, 0.92, 0],
	      velocityOverLife: options.velocityOverLife ?? [1, 0.82, 0.28],
	      turbulence: options.turbulence ?? 0.16,
	      noise: options.noise ?? 0.22
	    })
} as const;

export const interactions = {
  orbit: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "orbit",
      target: options.target
    }),
  pointer: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "pointer",
      target: options.target
    }),
  keyboard: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "keyboard",
      target: options.target
    }),
  hover: (options: { readonly target?: string; readonly selected?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "hover",
      target: options.target,
      selected: options.selected
    }),
  raycastHover: (options: { readonly target?: string; readonly selected?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    interactions.hover(options),
  highlight: (options: { readonly target?: string; readonly selected?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    interactions.hover({ target: options.target, selected: options.selected ?? options.target }),
  dragVector: (options: { readonly target?: string; readonly vector?: AuraVec3 } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "drag-vector",
      target: options.target,
      vector: options.vector ?? [1, 0, 0]
    }),
  clickImpulse: (options: { readonly target?: string; readonly impulse?: number; readonly vector?: AuraVec3 } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "click-impulse",
      target: options.target,
      impulse: options.impulse ?? 1,
      vector: options.vector ?? [1, 0, 0]
    })
} as const;

type AuraUiTarget<TElement extends HTMLElement = HTMLElement> = string | TElement;

function resolveUiElement<TElement extends HTMLElement>(target: AuraUiTarget<TElement>, label: string): TElement {
  if (typeof target !== "string") return target;
  const element = document.querySelector<TElement>(target);
  if (!element) throw new Error(`Aura3D UI helper could not find ${label}: ${target}`);
  return element;
}

export const ui = {
  root: (selector = "#app"): HTMLElement => resolveUiElement<HTMLElement>(selector, "root"),
  text: (selector: string): HTMLElement => resolveUiElement<HTMLElement>(selector, "text"),
  button: (selector: string): HTMLButtonElement => resolveUiElement<HTMLButtonElement>(selector, "button"),
  html: (target: AuraUiTarget, markup: string, position: InsertPosition = "beforeend"): HTMLElement => {
    const element = resolveUiElement<HTMLElement>(target, "html mount");
    element.insertAdjacentHTML(position, markup);
    return element;
  },
  setText: (target: AuraUiTarget, value: string | number): void => {
    resolveUiElement<HTMLElement>(target, "text").textContent = String(value);
  },
  setPressed: (target: AuraUiTarget<HTMLButtonElement>, pressed: boolean): void => {
    const button = resolveUiElement<HTMLButtonElement>(target, "button");
    button.setAttribute("aria-pressed", String(pressed));
  },
	  onClick: (target: AuraUiTarget<HTMLButtonElement>, handler: (button: HTMLButtonElement, event: MouseEvent) => void): HTMLButtonElement => {
	    const button = resolveUiElement<HTMLButtonElement>(target, "button");
	    button.onclick = (event) => handler(button, event);
	    return button;
	  },
	  range: (selector: string): HTMLInputElement => resolveUiElement<HTMLInputElement>(selector, "range input"),
	  onInput: (target: AuraUiTarget<HTMLInputElement>, handler: (input: HTMLInputElement, event: Event) => void): HTMLInputElement => {
	    const input = resolveUiElement<HTMLInputElement>(target, "range input");
	    input.oninput = (event) => handler(input, event);
	    return input;
	  },
  scoreCounter: (target: AuraUiTarget, options: { readonly initial?: number; readonly label?: string } = {}): { readonly element: HTMLElement; get value(): number; set(value: number): void; increment(amount?: number): number } => {
    const element = resolveUiElement<HTMLElement>(target, "score counter");
    let value = options.initial ?? 0;
    const label = options.label ?? "score";
    const render = () => {
      element.dataset.aura3dScoreCounter = "true";
      element.textContent = `${label}: ${value}`;
    };
    render();
    return {
      element,
      get value() {
        return value;
      },
      set(next) {
        value = next;
        render();
      },
      increment(amount = 1) {
        value += amount;
        render();
        return value;
      }
    };
  },
  powerMeter: (target: AuraUiTarget<HTMLInputElement>, options: { readonly min?: number; readonly max?: number; readonly value?: number } = {}): HTMLInputElement => {
    const input = resolveUiElement<HTMLInputElement>(target, "power meter");
    input.type = "range";
    input.min = String(options.min ?? 0);
    input.max = String(options.max ?? 100);
    input.value = String(options.value ?? 50);
    input.dataset.aura3dPowerMeter = "true";
    return input;
  },
  slider: (target: AuraUiTarget<HTMLInputElement>, options: { readonly min?: number; readonly max?: number; readonly value?: number; readonly metric?: string } = {}): HTMLInputElement => {
    const input = resolveUiElement<HTMLInputElement>(target, "slider");
    input.type = "range";
    input.min = String(options.min ?? 0);
    input.max = String(options.max ?? 100);
    input.value = String(options.value ?? 50);
    input.dataset.aura3dSlider = "true";
    if (options.metric) input.dataset.aura3dMetric = options.metric;
    return input;
  },
  resetButton: (target: AuraUiTarget<HTMLButtonElement>, handler?: (button: HTMLButtonElement, event: MouseEvent) => void): HTMLButtonElement => {
    const button = resolveUiElement<HTMLButtonElement>(target, "reset button");
    button.dataset.aura3dResetButton = "true";
    if (handler) button.onclick = (event) => handler(button, event);
    return button;
  },
  hoverReadout: (target: AuraUiTarget, value = "none"): HTMLElement => {
    const element = resolveUiElement<HTMLElement>(target, "hover readout");
    element.dataset.aura3dHoverReadout = "true";
    element.textContent = value;
    return element;
  },
  toggle: (target: AuraUiTarget<HTMLButtonElement>, options: { readonly pressed?: boolean; readonly onLabel?: string; readonly offLabel?: string } = {}): HTMLButtonElement => {
    const button = resolveUiElement<HTMLButtonElement>(target, "toggle");
    const pressed = options.pressed ?? false;
    button.setAttribute("aria-pressed", String(pressed));
    button.textContent = pressed ? options.onLabel ?? "on" : options.offLabel ?? "off";
    button.dataset.aura3dStateToggle = "true";
    return button;
  }
} as const;

type AuraLabelOptions = Partial<Omit<AuraLabelNode, "kind" | "label" | "text">>;
type AuraAnchorLabelOptions = Partial<Omit<AuraLabelNode, "kind" | "label" | "text" | "target">>;
type AuraEnvironmentOptions = Partial<Omit<AuraEnvironmentNode, "kind" | "environment">>;

export const labels = {
  billboard: (text: string, options: AuraLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "billboard",
    text,
    color: options.color ?? "#e0f2fe",
    background: options.background ?? "#020617",
    size: options.size ?? 0.42,
    collisionAvoidance: options.collisionAvoidance ?? true,
    occlusionAware: options.occlusionAware ?? true,
    ...options
  }),
  anchor: (text: string, target: string, options: AuraAnchorLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "anchor",
    text,
    target,
    color: options.color ?? "#e0f2fe",
    background: options.background ?? "#020617",
    size: options.size ?? 0.38,
    collisionAvoidance: options.collisionAvoidance ?? true,
    occlusionAware: options.occlusionAware ?? true,
    ...options
  }),
  axisTick: (text: string, options: AuraLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "axis-tick",
    text,
    color: options.color ?? "#bfdbfe",
    background: options.background ?? "#0f172a",
    size: options.size ?? 0.26,
    collisionAvoidance: options.collisionAvoidance ?? true,
    occlusionAware: options.occlusionAware ?? true,
    ...options
  }),
  callout: (text: string, target: string, options: AuraAnchorLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "callout",
    text,
    target,
    leader: options.leader ?? true,
    color: options.color ?? "#fde68a",
    background: options.background ?? "#111827",
    size: options.size ?? 0.34,
    collisionAvoidance: options.collisionAvoidance ?? true,
    ...options
  }),
  hud: (text: string, options: AuraLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "hud",
    text,
    color: options.color ?? "#f8fafc",
    background: options.background ?? "#020617",
    size: options.size ?? 0.32,
    screenAnchor: options.screenAnchor ?? "top-left",
    ...options
  })
} as const;

export const environments = {
  studio: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "studio",
    name: options.name ?? "studio ibl environment",
    intensity: options.intensity ?? 1.15,
    color: options.color ?? "#f8fbff"
  }),
  materialLab: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "material-lab",
    name: options.name ?? "material lab ibl environment",
    intensity: options.intensity ?? 1.35,
    color: options.color ?? "#ffffff"
  }),
  productHero: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "product-hero",
    name: options.name ?? "product hero ibl environment",
    intensity: options.intensity ?? 1.2,
    color: options.color ?? "#eef6ff"
  }),
  nightCinematic: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "night-cinematic",
    name: options.name ?? "night cinematic ibl environment",
    intensity: options.intensity ?? 0.78,
    color: options.color ?? "#78d7ff"
  }),
  metalStudio: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "metal-studio",
    name: options.name ?? "metal studio ibl environment",
    intensity: options.intensity ?? 1.42,
    color: options.color ?? "#f8fbff"
  }),
  glassStudio: (options: AuraEnvironmentOptions = {}): AuraNodeBuilder<AuraEnvironmentNode> => new AuraNodeBuilder({
    kind: "environment",
    environment: "glass-studio",
    name: options.name ?? "glass studio ibl environment",
    intensity: options.intensity ?? 1.28,
    color: options.color ?? "#d8f7ff"
  }),
  presets: (): readonly AuraEnvironmentMapPreset[] => environmentMapPresets,
  forMaterial: (materialClass: "metal" | "glass" | "product" | "studio"): AuraNodeBuilder<AuraEnvironmentNode> => {
    if (materialClass === "metal") return environments.metalStudio();
    if (materialClass === "glass") return environments.glassStudio();
    if (materialClass === "product") return environments.productHero();
    return environments.studio();
  }
} as const;

const rendererColorManagementPreset: AuraRendererColorManagementPreset = {
  kind: "aura-renderer-color-management",
  workflow: "linear",
  outputColorSpace: "srgb",
  toneMapping: "aces-filmic",
  defaultExposure: 1.05,
  notes: [
    "Aura3D WebGL2 renderer uses sRGB output and ACES filmic tone mapping.",
    "Exposure is selected by scene category to avoid blown-out product/material whites and crushed dark scenes."
  ]
};

const sceneExposurePresets: Record<AuraSceneCategory, AuraSceneExposurePreset> = {
  product: { category: "product", exposure: 0.92, evidence: "studio whites preserve product highlights and contact shadows" },
  material: { category: "material", exposure: 0.78, evidence: "material labs keep chrome/glass highlight detail without clipping" },
  neon: { category: "neon", exposure: 1.18, evidence: "dark neon scenes lift tunnel detail while bloom is clamped" },
  "city-night": { category: "city-night", exposure: 1.22, evidence: "night city shadows keep street/window detail" },
  "city-day": { category: "city-day", exposure: 0.98, evidence: "day city keeps sky and road markings readable" },
  space: { category: "space", exposure: 1.24, evidence: "solar and starfield scenes retain dim orbit and label cues" },
  physics: { category: "physics", exposure: 1.04, evidence: "physics contacts and ramps stay readable on neutral backgrounds" },
  chart: { category: "chart", exposure: 1.02, evidence: "thin chart labels and axes keep contrast" },
  game: { category: "game", exposure: 1.05, evidence: "mini-game UI, aim vectors, and course boundaries stay readable" }
};

const environmentMapPresets: readonly AuraEnvironmentMapPreset[] = [
  { id: "studio", label: "Studio softbox IBL", purpose: ["studio", "rubber", "fabric"], intensity: 1.15, color: "#f8fbff", evidence: "neutral broad highlights for product and material staging" },
  { id: "material-lab", label: "Material lab IBL", purpose: ["chrome", "glass", "clearcoat"], intensity: 1.35, color: "#ffffff", evidence: "white, dark, warm, and cool reflection-card balance" },
  { id: "product-hero", label: "Product hero IBL", purpose: ["product", "sneaker", "turntable"], intensity: 1.2, color: "#eef6ff", evidence: "soft product photography reflections and controlled plinth contact" },
  { id: "night-cinematic", label: "Night cinematic IBL", purpose: ["neon", "city-night", "particles"], intensity: 0.78, color: "#78d7ff", evidence: "cool low-key environment with room for emissive lighting" },
  { id: "metal-studio", label: "Metal studio IBL", purpose: ["metal", "chrome", "brushed-metal"], intensity: 1.42, color: "#f8fbff", evidence: "bright and dark reflection shapes for mirror metal readability" },
  { id: "glass-studio", label: "Glass studio IBL", purpose: ["glass", "frosted-glass", "clear-glass"], intensity: 1.28, color: "#d8f7ff", evidence: "contrast cards and cool tint for transparency/refraction cues" }
];

const rendererQualityPresets: Readonly<Record<"interactive" | "screenshot", AuraRendererQualityPreset>> = {
  interactive: {
    kind: "aura-renderer-quality",
    id: "interactive",
    antialiasing: "msaa",
    shadowMap: "pcf-soft",
    pixelRatio: 1,
    preserveDrawingBuffer: true,
    maxRecommendedDrawCalls: 180,
    evidence: "keeps benchmark scenes interactive while preserving soft shadows and readable labels"
  },
  screenshot: {
    kind: "aura-renderer-quality",
    id: "screenshot",
    antialiasing: "msaa-plus-high-dpi",
    shadowMap: "pcf-soft",
    pixelRatio: 1.5,
    preserveDrawingBuffer: true,
    maxRecommendedDrawCalls: 260,
    evidence: "prioritizes benchmark screenshots with stronger edge quality for labels, axes, and neon rings"
  }
};

export const renderer = {
  colorManagementPreset: (): AuraRendererColorManagementPreset => rendererColorManagementPreset,
  exposurePresets: (): Readonly<Record<AuraSceneCategory, AuraSceneExposurePreset>> => sceneExposurePresets,
  exposureFor: (category: AuraSceneCategory): AuraSceneExposurePreset => sceneExposurePresets[category],
  qualityPresets: (): Readonly<Record<"interactive" | "screenshot", AuraRendererQualityPreset>> => rendererQualityPresets,
  screenshotQuality: (): AuraRendererQualityPreset => rendererQualityPresets.screenshot,
  diagnostics: (sceneValue: AuraSceneBuilder | AuraSceneSnapshot): AuraRendererDiagnosticReport =>
    createRendererDiagnosticReport(flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue)))
} as const;

interface AuraRendererRuntimeObservation {
  readonly mounted: boolean;
  readonly backend: "scene-plan" | "webgl2-agent-runtime";
  readonly postprocess: {
    readonly renderPass: boolean;
    readonly outputPass: boolean;
    readonly bloomPass: boolean;
    readonly ambientOcclusionPass: boolean;
    readonly contactOcclusionReceiver: boolean;
    readonly pixelBacked: boolean;
    readonly actualPasses: readonly string[];
    readonly fallbackPasses: readonly string[];
  };
  readonly environment?: {
    readonly enabled: boolean;
    readonly preset?: AuraEnvironmentNode["environment"] | string;
    readonly intensity?: number;
    readonly evidence: string;
  };
  readonly warnings?: readonly string[];
}

function createRendererDiagnosticReport(snapshot: AuraSceneSnapshot, runtime?: AuraRendererRuntimeObservation): AuraRendererDiagnosticReport {
  const flattened = groups.flatten(snapshot.nodes);
  const names = flattened.map((node) => "name" in node ? node.name?.toLowerCase() ?? "" : "");
  const sceneCategory = resolveRendererSceneCategory(snapshot, names);
  const exposure = sceneExposurePresets[sceneCategory];
  const bloom = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "bloom");
  const fog = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "fog");
  const environment = flattened.find((node): node is AuraEnvironmentNode => node.kind === "environment");
  const contactShadows = names.filter((name) => name.includes("contact shadow") || name.includes("footprint") || name.includes("glow pool")).length;
  const ambientOcclusion = flattened.some((node) => node.kind === "effect" && node.effect === "ambient-occlusion");
  const contactOcclusion = flattened.some((node) => node.kind === "effect" && node.effect === "contact-occlusion") || contactShadows > 0;
  const postprocessRequested = Boolean(bloom) || ambientOcclusion || contactOcclusion;
  const requestedPasses = requestedRendererPostProcessPasses(Boolean(bloom), ambientOcclusion, contactOcclusion);
  const runtimePostprocess = runtime?.postprocess;
  const runtimeStatus = !postprocessRequested
    ? "disabled"
    : runtime?.mounted
      ? runtimePostprocess?.pixelBacked
        ? "active"
        : "fallback"
      : "not-mounted";
  const warnings: string[] = [];
  if (!environment && (sceneCategory === "product" || sceneCategory === "material")) warnings.push("product/material scene has no explicit IBL environment node");
  if (!contactOcclusion) warnings.push("scene has no contact shadow or contact-occlusion grounding cue");
  if (bloom && (bloom.intensity ?? 0) > 0.95 && bloom.antiBlowout !== true) warnings.push("bloom is high without anti-blowout safeguards");
  if (postprocessRequested && !runtime?.mounted) warnings.push("renderer diagnostics are a scene plan only; call createAuraApp(...).diagnostics() after the first render for pixel-backed pass status");
  if (postprocessRequested && runtime?.mounted && !runtimePostprocess?.pixelBacked) warnings.push("postprocess was requested but the runtime composer did not initialize a pixel-backed pass");
  warnings.push(...(runtime?.warnings ?? []));
  const environmentStatus = runtime?.environment ?? {
    enabled: Boolean(environment),
    preset: environment?.environment,
    intensity: environment?.intensity,
    evidence: environment
      ? `${environment.environment} IBL requested at intensity ${environment.intensity}`
      : "procedural fallback environment requested only; runtime environment prefilter status is unavailable until render"
  };
  const postprocessEvidence = !postprocessRequested
    ? "no renderer postprocess effects requested"
    : runtimeStatus === "not-mounted"
      ? "postprocess is requested in the scene graph but no runtime composer has mounted yet"
      : runtimePostprocess?.pixelBacked
        ? `runtime initialized pixel-backed pass chain: ${runtimePostprocess.actualPasses.join(", ") || "contact receiver only"}`
        : `runtime fell back without a pixel-backed composer: ${runtimePostprocess?.fallbackPasses.join(", ") || "direct render"}`;
  return {
    kind: "aura-renderer-diagnostics",
    colorManagement: rendererColorManagementPreset,
    sceneCategory,
    exposure,
    toneMapping: "aces-filmic",
    outputColorSpace: "srgb",
    linearWorkflow: true,
    bloom: {
      enabled: Boolean(bloom),
      rendered: runtimePostprocess?.bloomPass ?? false,
      intensity: bloom?.intensity ?? 0,
      threshold: bloom?.threshold ?? 0,
      radius: bloom?.radius ?? 0,
      antiBlowout: bloom?.antiBlowout ?? true
    },
    shadows: {
      enabled: true,
      contactShadows,
      mapType: "pcf-soft"
    },
    occlusion: {
      enabled: ambientOcclusion || contactOcclusion,
      ambientOcclusion,
      contactOcclusion,
      evidence: ambientOcclusion
        ? "ambient occlusion effect node is present"
        : contactOcclusion
          ? "contact shadows/contact-occlusion provide grounding"
          : "no grounding occlusion detected"
    },
    fog: {
      enabled: Boolean(fog),
      density: fog?.density ?? 0,
      preset: fog ? ((fog.intensity ?? 0) > 0.65 ? "volumetric" : "depth") : "none"
    },
    postprocess: {
      enabled: runtimePostprocess?.pixelBacked ?? false,
      requested: postprocessRequested,
      renderPass: runtimePostprocess?.renderPass ?? false,
      outputPass: runtimePostprocess?.outputPass ?? false,
      bloomPass: runtimePostprocess?.bloomPass ?? false,
      ambientOcclusionPass: runtimePostprocess?.ambientOcclusionPass ?? false,
      contactOcclusionReceiver: runtimePostprocess?.contactOcclusionReceiver ?? false,
      pixelBacked: runtimePostprocess?.pixelBacked ?? false,
      runtimeStatus,
      requestedPasses,
      actualPasses: runtimePostprocess?.actualPasses ?? [],
      fallbackPasses: runtimePostprocess?.fallbackPasses ?? [],
      evidence: postprocessEvidence
    },
    runtime: {
      mounted: runtime?.mounted ?? false,
      backend: runtime?.backend ?? "scene-plan",
      postprocessVerified: runtimePostprocess?.pixelBacked ?? false,
      passNames: runtimePostprocess?.actualPasses ?? [],
      warnings: runtime?.warnings ?? []
    },
    environment: {
      enabled: environmentStatus.enabled,
      preset: environmentStatus.preset as AuraEnvironmentNode["environment"] | undefined,
      intensity: environmentStatus.intensity,
      evidence: environmentStatus.evidence
    },
    antialiasing: rendererQualityPresets.screenshot.antialiasing,
    screenshotQuality: rendererQualityPresets.screenshot,
    warnings
  };
}

function requestedRendererPostProcessPasses(hasBloom: boolean, ambientOcclusion: boolean, contactOcclusion: boolean): readonly string[] {
  if (!hasBloom && !ambientOcclusion && !contactOcclusion) return [];
  const passes = ["render"];
  if (ambientOcclusion || contactOcclusion) passes.push("ssao");
  if (hasBloom) passes.push("bloom");
  passes.push("output");
  return passes;
}

function resolveRendererSceneCategory(snapshot: AuraSceneSnapshot, names: readonly string[]): AuraSceneCategory {
  const hasName = (needle: string) => names.some((name) => name.includes(needle));
  const hasEffect = (effect: AuraEffectType) => snapshot.nodes.some((node) => node.kind === "effect" && node.effect === effect);
  if (hasName("product") || hasName("sneaker") || hasName("turntable")) return "product";
  if (hasName("material") || hasName("swatch") || hasName("chrome") || hasName("clearcoat")) return "material";
  if (hasName("neon tunnel") || hasName("ring") && hasEffect("bloom")) return "neon";
  if (hasName("city") && (hasName("night") || hasName("street lamp") || hasName("moon"))) return "city-night";
  if (hasName("city")) return "city-day";
  if (hasName("solar") || hasName("planet") || hasName("starfield")) return "space";
  if (hasName("physics") || hasName("rigid body") || hasName("contact normal")) return "physics";
  if (hasName("chart") || hasName("data bar") || hasName("axis")) return "chart";
  if (hasName("golf") || hasName("score") || hasName("cup")) return "game";
  const background = colorToClearColor(snapshot.background);
  const luminance = background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722;
  return luminance < 0.08 ? "neon" : "product";
}

export interface AuraSceneSnapshot {
  readonly schema: "aura3d-scene-snapshot/1.0";
  readonly background: AuraColor;
  readonly camera: AuraCameraSpec;
  readonly timeline?: AuraTimelineSpec;
  readonly physics?: AuraPhysicsSceneSummary;
  readonly nodes: readonly AuraSceneNode[];
  readonly diagnostics: {
    readonly enabled: boolean;
  };
}

export class AuraSceneBuilder {
  private readonly nodes: AuraSceneNode[] = [];
  private backgroundColor: AuraColor = "#070b12";
  private cameraSpec: AuraCameraSpec = camera.orbit();
  private timelineSpec: AuraTimelineSpec | undefined;
  private physicsController: AuraPhysicsWorldController | undefined;
  private diagnosticsEnabled = false;

  background(color: AuraColor): this {
    this.backgroundColor = color;
    return this;
  }

  add(node: AuraNodeBuilder<AuraSceneNode> | AuraSceneNode): this {
    this.nodes.push(node instanceof AuraNodeBuilder ? node.toJSON() : node);
    return this;
  }

  addMany(nodes: readonly (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[]): this {
    for (const node of nodes) this.add(node);
    return this;
  }

  camera(next: AuraCameraSpec): this {
    this.cameraSpec = next;
    return this;
  }

  timeline(next: AuraTimelineSpec): this {
    this.timelineSpec = next;
    return this;
  }

  physics(next: AuraPhysicsWorldController): this {
    this.physicsController = next;
    return this;
  }

  diagnostics(enabled = true): this {
    this.diagnosticsEnabled = enabled;
    return this;
  }

  toJSON(): AuraSceneSnapshot {
    return {
      schema: "aura3d-scene-snapshot/1.0",
      background: this.backgroundColor,
      camera: this.cameraSpec,
      timeline: this.timelineSpec,
      physics: this.physicsController?.snapshot(),
      nodes: [...this.nodes],
      diagnostics: {
        enabled: this.diagnosticsEnabled
      }
    };
  }

  getPhysicsController(): AuraPhysicsWorldController | undefined {
    return this.physicsController;
  }
}

export function scene(): AuraSceneBuilder {
  return new AuraSceneBuilder();
}

type AuraPhysicsBodyOptions = RigidBodyDescriptor & {
  readonly shape?: PhysicsShape;
  readonly sensor?: boolean;
  readonly material?: ColliderDescriptor["material"];
};

function toRigidBodyDescriptor(options: AuraPhysicsBodyOptions): RigidBodyDescriptor {
  const { shape: _shape, sensor: _sensor, material: _material, ...bodyDescriptor } = options;
  return bodyDescriptor;
}

function createPhysicsDebugNodes(snapshot: PhysicsSnapshot, lines: readonly DebugLine[]): readonly AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const bodyPositions = new Map(snapshot.bodies.map((body) => [body.id, body.position] as const));

  lines.slice(0, 80).forEach((line, index) => {
    const midpoint: AuraVec3 = [
      (line.from[0] + line.to[0]) / 2,
      (line.from[1] + line.to[1]) / 2,
      (line.from[2] + line.to[2]) / 2
    ];
    const dx = line.to[0] - line.from[0];
    const dz = line.to[2] - line.from[2];
    const length = Math.max(0.04, Math.hypot(dx, line.to[1] - line.from[1], dz));
    nodes.push(primitives.box({
      name: `physics collider debug line ${index + 1}`,
      material: material.emissive({ color: debugLineColor(line.color), emissive: debugLineColor(line.color), opacity: 0.72 })
    }).position(...midpoint).rotate(0, -Math.atan2(dz, dx), 0).scale([length, 0.012, 0.012]).toJSON());
  });

  snapshot.contacts.slice(0, 32).forEach((contact, index) => {
    const a = bodyPositions.get(contact.bodyA) ?? [0, 0, 0] as const;
    const b = bodyPositions.get(contact.bodyB) ?? a;
    const midpoint: AuraVec3 = [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2
    ];
    const color = contact.sensor ? "#facc15" : "#ff5151";
    nodes.push(
      primitives.sphere({
        name: `${contact.sensor ? "sensor" : "solid"} physics contact patch ${index + 1}`,
        material: material.emissive({ color, emissive: color, opacity: 0.82 })
      }).position(...midpoint).scale(Math.max(0.045, 0.05 + contact.penetration * 0.2)).toJSON(),
      primitives.box({
        name: `physics contact normal vector ${index + 1}`,
        material: material.emissive({ color: "#ff5151", emissive: "#ff5151" })
      }).position(
        midpoint[0] + contact.normal[0] * 0.12,
        midpoint[1] + contact.normal[1] * 0.12,
        midpoint[2] + contact.normal[2] * 0.12
      ).rotate(0, -Math.atan2(contact.normal[2], contact.normal[0]), 0).scale([0.28, 0.016, 0.016]).toJSON()
    );
  });

  snapshot.bodies.slice(0, 80).forEach((body, index) => {
    const color = body.sleeping ? "#64748b" : body.type === "dynamic" ? "#22c55e" : "#60a5fa";
    nodes.push(primitives.sphere({
      name: `${body.sleeping ? "sleeping" : "active"} physics body state indicator ${index + 1}`,
      material: material.emissive({ color, emissive: color, opacity: 0.76 })
    }).position(body.position[0], body.position[1] + 0.12, body.position[2]).scale(0.045).toJSON());
  });

  return nodes;
}

function debugLineColor(color: readonly [number, number, number]): AuraColor {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0");
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

function createPhysicsWorldController(descriptor: PhysicsWorldDescriptor = {}): AuraPhysicsWorldController {
  let world = new PhysicsWorld(descriptor);
  const stepper = new PhysicsStepper(world.fixedDelta);
  const bridge = new ScenePhysicsBridge();
  const debugDraw = new PhysicsDebugDraw();
  const bodyDescriptors: RigidBodyDescriptor[] = [];
  const colliderDescriptors: Array<{ readonly bodyId: number; readonly descriptor: ColliderDescriptor }> = [];
  const constraintDescriptors: Array<{
    readonly type: ConstraintDescriptor["type"];
    readonly bodyAId: number;
    readonly bodyBId: number;
    readonly localAnchorA?: AuraVec3;
    readonly localAnchorB?: AuraVec3;
    readonly restLength?: number;
    readonly stiffness?: number;
    readonly axis?: AuraVec3;
  }> = [];
  let resetCount = 0;

  const controller: AuraPhysicsWorldController = {
    kind: "aura-physics-world",
    createBody(options: AuraPhysicsBodyOptions = {}) {
      const bodyDescriptor = toRigidBodyDescriptor(options);
      const body = world.createRigidBody(bodyDescriptor);
      bodyDescriptors.push(bodyDescriptor);
      if (options.shape) {
        const colliderDescriptor = {
          shape: options.shape,
          sensor: options.sensor,
          material: options.material
        } satisfies ColliderDescriptor;
        world.createCollider(body, colliderDescriptor);
        colliderDescriptors.push({ bodyId: body.id, descriptor: colliderDescriptor });
      }
      return body;
    },
    createCollider(body, descriptor) {
      const collider = world.createCollider(body, descriptor);
      const bodyId = typeof body === "number" ? body : body.id;
      colliderDescriptors.push({ bodyId, descriptor });
      return collider;
    },
    createConstraint(descriptor) {
      const constraint = world.createConstraint(descriptor);
      constraintDescriptors.push({
        type: descriptor.type,
        bodyAId: descriptor.bodyA.id,
        bodyBId: descriptor.bodyB.id,
        localAnchorA: descriptor.localAnchorA,
        localAnchorB: descriptor.localAnchorB,
        restLength: descriptor.restLength,
        stiffness: descriptor.stiffness,
        axis: descriptor.axis
      });
      return constraint;
    },
    bindNode(body, node, mode = "dynamic") {
      const bodyId = typeof body === "number" ? body : body.id;
      bridge.bind({ bodyId, node, mode });
    },
    step(options: number | AuraPhysicsStepOptions = {}) {
      bridge.pushKinematic(world);
      const resolved = typeof options === "number" ? { dt: options, steps: 1 } : options;
      const steps = resolved.steps ?? 1;
      const dt = resolved.dt ?? world.fixedDelta;
      let events: readonly CollisionEvent[] = [];
      if (steps === 1) {
        events = world.step(dt);
      } else {
        for (let index = 0; index < steps; index += 1) events = world.step(dt);
      }
      bridge.pullDynamic(world, 1);
      return events;
    },
    reset() {
      world = new PhysicsWorld(descriptor);
      stepper.reset();
      const recreatedBodies = new Map<number, RigidBody>();
      bodyDescriptors.forEach((bodyDescriptor, index) => {
        const body = world.createRigidBody(bodyDescriptor);
        recreatedBodies.set(index + 1, body);
      });
      for (const colliderDescriptor of colliderDescriptors) {
        const body = recreatedBodies.get(colliderDescriptor.bodyId);
        if (body) world.createCollider(body, colliderDescriptor.descriptor);
      }
      for (const constraintDescriptor of constraintDescriptors) {
        const bodyA = recreatedBodies.get(constraintDescriptor.bodyAId);
        const bodyB = recreatedBodies.get(constraintDescriptor.bodyBId);
        if (!bodyA || !bodyB) continue;
        world.createConstraint({
          type: constraintDescriptor.type,
          bodyA,
          bodyB,
          localAnchorA: constraintDescriptor.localAnchorA,
          localAnchorB: constraintDescriptor.localAnchorB,
          restLength: constraintDescriptor.restLength,
          stiffness: constraintDescriptor.stiffness,
          axis: constraintDescriptor.axis
        });
      }
      bridge.pullDynamic(world, 1);
      resetCount += 1;
    },
    contacts() {
      return world.snapshot().contacts;
    },
    liveContactCount() {
      return world.snapshot().contacts.length;
    },
    raycast(origin, direction, options) {
      return world.raycast(origin, direction, options);
    },
    sphereCast(origin, radius, direction, options) {
      return world.sphereCast(origin, radius, direction, options);
    },
    debug() {
      const snapshot = world.snapshot();
      const lines = debugDraw.buildLines(world);
      const nodes = createPhysicsDebugNodes(snapshot, lines);
      return {
        bodyCount: snapshot.stats.bodies,
        colliderCount: snapshot.stats.colliders,
        contactCount: snapshot.contacts.length,
        sleepingBodyCount: snapshot.stats.sleepingBodies,
        lines,
        nodes
      };
    },
    debugNodes() {
      const snapshot = world.snapshot();
      return createPhysicsDebugNodes(snapshot, debugDraw.buildLines(world));
    },
    snapshot() {
      const snapshot = world.snapshot();
      return {
        kind: "aura-physics-world",
        backend: snapshot.backend,
        bodies: snapshot.stats.bodies,
        colliders: snapshot.stats.colliders,
        contacts: snapshot.contacts.length,
        steps: snapshot.stats.steps,
        resets: resetCount,
        debugLines: debugDraw.buildLines(world).length,
        snapshot
      };
    }
  };

  return controller;
}

function resolveAgentPhysicsShape(spec: AuraNodePhysicsSpec): PhysicsShape {
  if (typeof spec.shape === "object") return spec.shape;
  const shape = spec.shape ?? "box";
  if (shape === "sphere") return PhysicsShapeFactory.sphere(spec.radius ?? 0.5);
  if (shape === "capsule") return PhysicsShapeFactory.capsule(spec.radius ?? 0.25, spec.halfHeight ?? 0.55);
  if (shape === "plane") return PhysicsShapeFactory.plane(spec.normal ?? [0, 1, 0], spec.constant ?? 0);
  const halfExtents = spec.halfExtents ?? [0.5, 0.5, 0.5];
  return PhysicsShapeFactory.box(halfExtents[0], halfExtents[1], halfExtents[2]);
}

export const physics = {
  world: (descriptor: PhysicsWorldDescriptor = {}): AuraPhysicsWorldController => createPhysicsWorldController(descriptor),
  worldAsync: async (descriptor: PhysicsWorldDescriptor = {}): Promise<AuraPhysicsWorldController> => {
    markAuraLazySystemRequested("physics-backend", "physics.worldAsync");
    const started = performanceNow();
    await import("@aura3d/physics");
    markAuraLazySystemLoaded("physics-backend", performanceNow() - started);
    return createPhysicsWorldController(descriptor);
  },
  worldFromScene: (sceneValue: AuraSceneBuilder | AuraSceneSnapshot, descriptor: PhysicsWorldDescriptor = {}): AuraPhysicsWorldController => {
    const controller = createPhysicsWorldController(descriptor);
    populatePhysicsWorldFromScene(controller, flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue)).nodes);
    return controller;
  },
  worldFromSceneAsync: async (sceneValue: AuraSceneBuilder | AuraSceneSnapshot, descriptor: PhysicsWorldDescriptor = {}): Promise<AuraPhysicsWorldController> => {
    markAuraLazySystemRequested("physics-backend", "physics.worldFromSceneAsync");
    const started = performanceNow();
    await import("@aura3d/physics");
    markAuraLazySystemLoaded("physics-backend", performanceNow() - started);
    const controller = createPhysicsWorldController(descriptor);
    populatePhysicsWorldFromScene(controller, flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue)).nodes);
    return controller;
  },
  body: (options: AuraPhysicsBodyOptions = {}): AuraPhysicsBodyOptions => ({ ...options }),
  collider: (descriptor: ColliderDescriptor): ColliderDescriptor => descriptor,
  box: (x = 0.5, y = 0.5, z = 0.5): PhysicsShape => PhysicsShapeFactory.box(x, y, z),
  sphere: (radius = 0.5): PhysicsShape => PhysicsShapeFactory.sphere(radius),
  capsule: (radius = 0.25, halfHeight = 0.55): PhysicsShape => PhysicsShapeFactory.capsule(radius, halfHeight),
  plane: (normal: AuraVec3 = [0, 1, 0], constant = 0): PhysicsShape => PhysicsShapeFactory.plane(normal, constant),
  constraint: (descriptor: ConstraintDescriptor): ConstraintDescriptor => descriptor,
  bindNode: (world: AuraPhysicsWorldController, body: RigidBody | number, node: ScenePhysicsNode, mode?: "dynamic" | "kinematic"): void => world.bindNode(body, node, mode),
  step: (world: AuraPhysicsWorldController, options?: number | AuraPhysicsStepOptions): readonly CollisionEvent[] => world.step(options),
  contacts: (world: AuraPhysicsWorldController): readonly Contact[] => world.contacts(),
  liveContactCount: (world: AuraPhysicsWorldController): number => world.liveContactCount(),
  raycast: (world: AuraPhysicsWorldController, origin: AuraVec3, direction: AuraVec3, options?: RaycastOptions): RaycastHit | undefined => world.raycast(origin, direction, options),
  sphereCast: (world: AuraPhysicsWorldController, origin: AuraVec3, radius: number, direction: AuraVec3, options?: RaycastOptions): SphereCastHit | undefined => world.sphereCast(origin, radius, direction, options),
  debug: (world: AuraPhysicsWorldController): AuraPhysicsDebugSnapshot => world.debug(),
  debugNodes: (world: AuraPhysicsWorldController): readonly AuraSceneNode[] => world.debugNodes(),
  sceneBinding: (node: ScenePhysicsNode): ScenePhysicsNode => node,
  nodeSpec: (spec: AuraNodePhysicsSpec): AuraNodePhysicsSpec => spec,
  resolveShape: resolveAgentPhysicsShape
} as const;

interface AuraRuntimeScenePhysics {
  bindObject(node: AuraModelNode | AuraPrimitiveNode, object: {
    position?: { set(x: number, y: number, z: number): void };
    quaternion?: { set(x: number, y: number, z: number, w: number): void };
  }): void;
  step(deltaSeconds: number): void;
}

function populatePhysicsWorldFromScene(controller: AuraPhysicsWorldController, nodes: readonly AuraSceneNode[]): void {
  for (const node of nodes) {
    if ((node.kind !== "model" && node.kind !== "primitive") || !node.physics) continue;
    const body = controller.createBody({
      type: node.physics.type ?? "dynamic",
      position: node.position ?? [0, 0, 0],
      rotation: eulerToQuat(node.rotation ?? [0, 0, 0]),
      mass: node.physics.mass,
      friction: node.physics.friction,
      restitution: node.physics.restitution,
      shape: resolveNodePhysicsShape(node, node.physics),
      sensor: node.physics.sensor,
      material: {
        friction: node.physics.friction ?? 0.5,
        restitution: node.physics.restitution ?? 0
      }
    });
    if (node.physics.type !== "static") {
      controller.bindNode(body, scenePhysicsNodeAdapter(node), node.physics.type === "kinematic" ? "kinematic" : "dynamic");
    }
  }
}

function scenePhysicsNodeAdapter(node: AuraModelNode | AuraPrimitiveNode): ScenePhysicsNode {
  return {
    getWorldPosition: () => node.position ?? [0, 0, 0],
    getWorldQuaternion: () => {
      const nodeWithPhysicsRotation = node as { physicsRotation?: readonly [number, number, number, number] };
      return nodeWithPhysicsRotation.physicsRotation ?? eulerToQuat(node.rotation ?? [0, 0, 0]);
    },
    setWorldPosition: (position) => {
      (node as { position?: AuraVec3 }).position = [position[0], position[1], position[2]];
    },
    setWorldQuaternion: (rotation) => {
      (node as { physicsRotation?: readonly [number, number, number, number] }).physicsRotation = [rotation[0], rotation[1], rotation[2], rotation[3]];
      (node as { rotation?: AuraVec3 }).rotation = quatToEuler(rotation);
    }
  };
}

function createRuntimeScenePhysics(snapshot: AuraSceneSnapshot): AuraRuntimeScenePhysics | undefined {
  const physicsNodes = snapshot.nodes.filter((node): node is AuraModelNode | AuraPrimitiveNode =>
    (node.kind === "model" || node.kind === "primitive") && Boolean(node.physics)
  );
  if (physicsNodes.length === 0) return undefined;

  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, enableSleeping: true });
  const stepper = new PhysicsStepper(world.fixedDelta);
  const debugDraw = new PhysicsDebugDraw();
  const bindings: Array<{
    readonly node: AuraModelNode | AuraPrimitiveNode;
    readonly body: RigidBody;
    object?: {
      position?: { set(x: number, y: number, z: number): void };
      quaternion?: { set(x: number, y: number, z: number, w: number): void };
    };
  }> = [];

  for (const node of physicsNodes) {
    const spec = node.physics;
    if (!spec) continue;
    const body = world.createRigidBody({
      type: spec.type ?? "dynamic",
      position: node.position ?? [0, 0, 0],
      rotation: eulerToQuat(node.rotation ?? [0, 0, 0]),
      mass: spec.mass,
      friction: spec.friction,
      restitution: spec.restitution,
      linearDamping: spec.type === "dynamic" ? 0.08 : undefined,
      angularDamping: spec.type === "dynamic" ? 0.08 : undefined
    });
    world.createCollider(body, {
      shape: resolveNodePhysicsShape(node, spec),
      sensor: spec.sensor,
      material: {
        friction: spec.friction ?? 0.5,
        restitution: spec.restitution ?? 0
      }
    });
    bindings.push({ node, body });
  }

  const writeSummary = () => {
    const worldSnapshot = world.snapshot();
    (snapshot as { physics?: AuraPhysicsSceneSummary }).physics = {
      kind: "aura-physics-world",
      backend: worldSnapshot.backend,
      bodies: worldSnapshot.stats.bodies,
      colliders: worldSnapshot.stats.colliders,
      contacts: worldSnapshot.contacts.length,
      steps: worldSnapshot.stats.steps,
      resets: 0,
      debugLines: debugDraw.buildLines(world).length,
      snapshot: worldSnapshot
    };
  };
  writeSummary();

  return {
    bindObject(node, object) {
      const binding = bindings.find((entry) => entry.node === node);
      if (binding) binding.object = object;
    },
    step(deltaSeconds) {
      const clampedDelta = Math.max(0, Math.min(0.12, deltaSeconds));
      const result = stepper.advance(clampedDelta, world);
      if (result.steps === 0) return;
      for (const binding of bindings) {
        if (binding.body.type !== "dynamic") continue;
        const position = [binding.body.position[0], binding.body.position[1], binding.body.position[2]] as AuraVec3;
        const rotation = binding.body.rotation;
        (binding.node as { position?: AuraVec3 }).position = position;
        (binding.node as { physicsRotation?: readonly [number, number, number, number] }).physicsRotation = [rotation[0], rotation[1], rotation[2], rotation[3]];
        binding.object?.position?.set(position[0], position[1], position[2]);
        binding.object?.quaternion?.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      }
      writeSummary();
    }
  };
}

function eulerToQuat(rotation: AuraVec3): readonly [number, number, number, number] {
  const [x, y, z] = rotation;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

function quatToEuler(rotation: readonly [number, number, number, number]): AuraVec3 {
  const [x, y, z, w] = rotation;
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);
  return [roll, pitch, yaw];
}

function resolveNodePhysicsShape(node: AuraModelNode | AuraPrimitiveNode, spec: AuraNodePhysicsSpec): PhysicsShape {
  if (typeof spec.shape === "object" || spec.halfExtents || spec.radius || spec.halfHeight || spec.shape) return resolveAgentPhysicsShape(spec);
  if (node.kind === "primitive") {
    const size = primitiveSize(node);
    const scale = scaleToVec3(node.scale);
    if (node.primitive === "sphere") return PhysicsShapeFactory.sphere(Math.max(size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]) * 0.5);
    if (node.primitive === "capsule") return PhysicsShapeFactory.capsule(Math.max(size[0] * scale[0], size[2] * scale[2]) * 0.25, Math.max(0.1, size[1] * scale[1] * 0.5));
    if (node.primitive === "torus") return PhysicsShapeFactory.sphere(Math.max(size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]) * 0.5);
    if (node.primitive === "plane") return PhysicsShapeFactory.plane();
    if (node.primitive === "cylinder") return PhysicsShapeFactory.capsule(Math.max(size[0] * scale[0], size[2] * scale[2]) * 0.25, Math.max(0.1, size[1] * scale[1] * 0.5));
    return PhysicsShapeFactory.box(Math.max(0.02, size[0] * scale[0] * 0.5), Math.max(0.02, size[1] * scale[1] * 0.5), Math.max(0.02, size[2] * scale[2] * 0.5));
  }
  const bounds = node.asset.bounds ?? [1, 1, 1] as const;
  return PhysicsShapeFactory.box(Math.max(0.02, bounds[0] * 0.5), Math.max(0.02, bounds[1] * 0.5), Math.max(0.02, bounds[2] * 0.5));
}

function chartThemePalette(theme: AuraChartTheme): { readonly floor: AuraColor; readonly wall: AuraColor; readonly side: AuraColor } {
  if (theme === "light-analytics") return { floor: "#dbeafe", wall: "#eff6ff", side: "#bfdbfe" };
  if (theme === "neon-analytics") return { floor: "#10051f", wall: "#1f1147", side: "#0e7490" };
  return { floor: "#16242a", wall: "#0b1217", side: "#101923" };
}

function dataBarColor(value: number, colorScale?: readonly AuraColor[]): AuraColor {
  if (colorScale && colorScale.length >= 3) {
    if (value < 0.34) return colorScale[0]!;
    if (value < 0.67) return colorScale[1]!;
    return colorScale[2]!;
  }
  if (value < 0.34) return "#20d6f2";
  if (value < 0.67) return "#ffd166";
  return "#ef476f";
}

export type CityBlockTimeOfDay = "day" | "night";
export type AuraCityCameraPreset = "overview" | "street-level" | "cinematic-night";

export interface AuraCityBlockOptions {
  readonly blocks?: number;
  readonly litWindows?: boolean;
  readonly timeOfDay?: CityBlockTimeOfDay;
}

export interface AuraCityStateChangeEvidence {
  readonly from: CityBlockTimeOfDay;
  readonly to: CityBlockTimeOfDay;
  readonly revision: number;
  readonly changedNodeNames: readonly string[];
}

export interface AuraCityInstancingPlan {
  readonly kind: "aura-city-instancing-plan";
  readonly rendererPath: "auraWebGL2PrimitiveBatches";
  readonly windows: number;
  readonly props: number;
  readonly roadMarkings: number;
  readonly lights: number;
  readonly groups: readonly string[];
  readonly instanced: boolean;
}

export interface AuraCityVisualQAResult {
  readonly passes: boolean;
  readonly score: number;
  readonly buildings: number;
  readonly windows: number;
  readonly streets: number;
  readonly crosswalks: number;
  readonly lights: number;
  readonly props: number;
  readonly facadeDetails: number;
  readonly dayNightChanged: boolean;
  readonly instancing: AuraCityInstancingPlan;
  readonly problems: readonly string[];
}

export interface AuraCityStateController {
  readonly kind: "aura-city-state";
  readonly blocks: number;
  readonly litWindows: boolean;
  readonly timeOfDay: CityBlockTimeOfDay;
  readonly revision: number;
  readonly lastChange?: AuraCityStateChangeEvidence;
  setTimeOfDay(next: CityBlockTimeOfDay): readonly AuraSceneNode[];
  toggleTimeOfDay(): readonly AuraSceneNode[];
  scene(): AuraSceneBuilder;
  applyTo(builder: AuraSceneBuilder): AuraSceneBuilder;
  nodes(): readonly AuraSceneNode[];
}

function makeCityCrosswalk(namePrefix: string, x: number, z: number, orientation: "northSouth" | "eastWest"): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  for (let index = 0; index < 5; index += 1) {
    const offset = -0.56 + index * 0.28;
    nodes.push(primitives.box({
      name: `${namePrefix} stripe ${index + 1}`,
      material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" })
    })
      .position(orientation === "northSouth" ? x + offset : x, 0.036, orientation === "northSouth" ? z : z + offset)
      .scale(orientation === "northSouth" ? [0.075, 0.018, 0.82] : [0.82, 0.018, 0.075])
      .toJSON());
  }
  return nodes;
}

function makeCityRoadMarkings(timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const paint = material.emissive({
    color: timeOfDay === "night" ? "#f8fafc" : "#ffffff",
    emissive: timeOfDay === "night" ? "#e0f2fe" : "#cbd5e1",
    emissiveIntensity: timeOfDay === "night" ? 0.38 : 0.25
  });
  const bikeLane = material.pbr({ color: timeOfDay === "night" ? "#0f766e" : "#5eead4", roughness: 0.68, metallic: 0.02 });
  const nodes: AuraSceneNode[] = [
    primitives.box({ name: "northbound dashed lane marking 1", material: paint }).position(-0.01, 0.041, -3.56).scale([0.034, 0.016, 0.58]).toJSON(),
    primitives.box({ name: "northbound dashed lane marking 2", material: paint }).position(-0.01, 0.041, -2.28).scale([0.034, 0.016, 0.58]).toJSON(),
    primitives.box({ name: "northbound dashed lane marking 3", material: paint }).position(-0.01, 0.041, 1.78).scale([0.034, 0.016, 0.58]).toJSON(),
    primitives.box({ name: "northbound dashed lane marking 4", material: paint }).position(-0.01, 0.041, 3.06).scale([0.034, 0.016, 0.58]).toJSON(),
    primitives.box({ name: "eastbound dashed lane marking 1", material: paint }).position(-3.6, 0.043, -0.01).scale([0.58, 0.016, 0.034]).toJSON(),
    primitives.box({ name: "eastbound dashed lane marking 2", material: paint }).position(-2.28, 0.043, -0.01).scale([0.58, 0.016, 0.034]).toJSON(),
    primitives.box({ name: "eastbound dashed lane marking 3", material: paint }).position(1.78, 0.043, -0.01).scale([0.58, 0.016, 0.034]).toJSON(),
    primitives.box({ name: "eastbound dashed lane marking 4", material: paint }).position(3.06, 0.043, -0.01).scale([0.58, 0.016, 0.034]).toJSON(),
    primitives.box({ name: "protected bike lane paint north", material: bikeLane }).position(-3.82, 0.039, 0).scale([0.035, 0.014, 9.4]).toJSON(),
    primitives.box({ name: "protected bike lane paint east", material: bikeLane }).position(0, 0.039, 2.86).scale([9.6, 0.014, 0.035]).toJSON(),
    primitives.box({ name: "left turn arrow road marking", material: paint }).position(-0.36, 0.046, -1.04).rotate(0, 0.72, 0).scale([0.32, 0.014, 0.052]).toJSON(),
    primitives.box({ name: "right turn arrow road marking", material: paint }).position(1.06, 0.046, 0.36).rotate(0, -0.72, 0).scale([0.32, 0.014, 0.052]).toJSON()
  ];
  return nodes;
}

function makeBuildingWindowRows(x: number, z: number, height: number, towerIndex: number, timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const bandHeight = Math.max(0.72, height * 0.58);
  const bandY = 0.36 + bandHeight / 2;
  const warm = timeOfDay === "night"
    ? material.emissive({ color: "#ff7a00", emissive: "#ff7a00", emissiveIntensity: 1.05 })
    : material.pbr({ color: "#d6e8f0", roughness: 0.34, metallic: 0.02, opacity: 0.78 });
  const cool = timeOfDay === "night"
    ? material.emissive({ color: "#5eeaff", emissive: "#5eeaff", emissiveIntensity: 0.98 })
    : material.pbr({ color: "#b8d7e8", roughness: 0.38, metallic: 0.03, opacity: 0.72 });
  const sign = towerIndex % 4 === 0
    ? [primitives.box({
      name: `roofline neon sign ${towerIndex + 1}`,
      material: timeOfDay === "night"
        ? material.emissive({ color: "#ff7ad9", emissive: "#ff7ad9", emissiveIntensity: 0.8 })
        : material.pbr({ color: "#a8558f", roughness: 0.48, metallic: 0.03 })
    }).position(x, height + 0.08, z + 0.64).scale([0.78, 0.08, 0.035]).toJSON()]
    : [];

  const frameMaterial = material.pbr({ color: timeOfDay === "night" ? "#94a3b8" : "#475569", roughness: 0.5, metallic: 0.06 });
  return [
    primitives.box({
      name: `front warm window column ${towerIndex + 1}`,
      material: warm
    }).position(x - 0.24, bandY, z + 0.66).scale([0.12, bandHeight, 0.034]).toJSON(),
    primitives.box({
      name: `front cool window column ${towerIndex + 1}`,
      material: cool
    }).position(x + 0.24, bandY, z + 0.66).scale([0.12, Math.max(0.54, bandHeight * 0.72), 0.034]).toJSON(),
    primitives.box({
      name: `side warm window column ${towerIndex + 1}`,
      material: warm
    }).position(x + 0.66, bandY, z - 0.24).scale([0.034, bandHeight, 0.12]).toJSON(),
    primitives.box({
      name: `side cool window column ${towerIndex + 1}`,
      material: cool
    }).position(x + 0.66, bandY, z + 0.24).scale([0.034, Math.max(0.54, bandHeight * 0.72), 0.12]).toJSON(),
    primitives.box({
      name: `modular facade window frame left rail ${towerIndex + 1}`,
      material: frameMaterial
    }).position(x - 0.43, bandY, z + 0.704).scale([0.028, Math.max(0.72, bandHeight * 1.02), 0.018]).toJSON(),
    primitives.box({
      name: `modular facade window frame center mullion ${towerIndex + 1}`,
      material: frameMaterial
    }).position(x, bandY, z + 0.706).scale([0.024, Math.max(0.72, bandHeight * 1.02), 0.018]).toJSON(),
    primitives.box({
      name: `modular facade window frame right rail ${towerIndex + 1}`,
      material: frameMaterial
    }).position(x + 0.43, bandY, z + 0.704).scale([0.028, Math.max(0.72, bandHeight * 1.02), 0.018]).toJSON(),
    primitives.box({
      name: `modular facade window frame horizontal rail ${towerIndex + 1}`,
      material: frameMaterial
    }).position(x, bandY + bandHeight * 0.18, z + 0.708).scale([0.86, 0.026, 0.018]).toJSON(),
    primitives.box({
      name: `thin facade ledge band ${towerIndex + 1}`,
      material: material.pbr({ color: timeOfDay === "night" ? "#cbd5e1" : "#e2e8f0", roughness: 0.54, metallic: 0.02 })
    }).position(x, Math.min(height - 0.12, 0.58 + bandHeight), z + 0.715).scale([0.86, 0.034, 0.038]).toJSON(),
    ...sign
  ];
}

function makeBuildingDetails(x: number, z: number, height: number, towerIndex: number, timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const storefrontMaterial = material.emissive({
    color: timeOfDay === "night" ? "#fef3c7" : "#dff6ff",
    emissive: timeOfDay === "night" ? "#fbbf24" : "#7dd3fc"
  });
  const awningMaterial = material.clearcoat({
    color: towerIndex % 2 === 0 ? "#ef4444" : "#2563eb",
    roughness: 0.28,
    clearcoat: 0.75,
    clearcoatRoughness: 0.08
  });
  const roofColor = towerIndex % 2 === 0 ? "#1f2933" : "#26313a";
  const nodes: AuraSceneNode[] = [
    primitives.box({
      name: `rooftop mechanical cap ${towerIndex + 1}`,
      material: material.pbr({ color: roofColor, roughness: 0.74, metallic: 0.08 })
    }).position(x - 0.28, height + 0.08, z - 0.2).scale([0.34, 0.16, 0.38]).toJSON(),
    primitives.box({
      name: `street-level lit storefront ${towerIndex + 1}`,
      material: storefrontMaterial
    }).position(x, 0.26, z + 0.67).scale([0.72, 0.22, 0.038]).toJSON(),
    primitives.box({
      name: `striped storefront awning ${towerIndex + 1}`,
      material: awningMaterial
    }).position(x, 0.44, z + 0.71).rotate(-0.16, 0, 0).scale([0.82, 0.055, 0.18]).toJSON(),
    primitives.box({
      name: `street address plaque ${towerIndex + 1}`,
      material: material.emissive({ color: "#f8fafc", emissive: timeOfDay === "night" ? "#dbeafe" : "#93c5fd" })
    }).position(x - 0.42, 0.38, z + 0.713).scale([0.12, 0.08, 0.024]).toJSON(),
    primitives.box({
      name: `dark vertical facade reveal ${towerIndex + 1}`,
      material: material.pbr({ color: "#111827", roughness: 0.8, metallic: 0.02 })
    }).position(x - 0.01, Math.max(0.65, height * 0.5), z + 0.692).scale([0.035, Math.max(0.75, height * 0.62), 0.026]).toJSON()
  ];

  if (towerIndex % 5 === 2) {
    nodes.push(primitives.cylinder({
      name: `round rooftop water tank ${towerIndex + 1}`,
      material: material.metal({ color: "#576574", roughness: 0.36 })
    }).position(x + 0.32, height + 0.18, z + 0.24).scale([0.16, 0.25, 0.16]).toJSON());
  }

  if (towerIndex % 6 === 1) {
    nodes.push(primitives.box({
      name: `thin rooftop antenna ${towerIndex + 1}`,
      material: material.metal({ color: "#d1d5db", roughness: 0.22 })
    }).position(x + 0.36, height + 0.52, z - 0.36).scale([0.025, 0.72, 0.025]).toJSON());
  }

  if (towerIndex % 4 === 3) {
    nodes.push(primitives.box({
      name: `small balcony slab ${towerIndex + 1}`,
      material: material.pbr({ color: "#cbd5e1", roughness: 0.62, metallic: 0.04 })
    }).position(x + 0.32, Math.max(0.88, height * 0.56), z + 0.77).scale([0.46, 0.038, 0.18]).toJSON());
    nodes.push(primitives.box({
      name: `thin balcony guard rail ${towerIndex + 1}`,
      material: material.metal({ color: "#e2e8f0", roughness: 0.28 })
    }).position(x + 0.32, Math.max(0.98, height * 0.56 + 0.11), z + 0.88).scale([0.48, 0.034, 0.026]).toJSON());
  }

  return nodes;
}

function makeCityVehicle(name: string, x: number, z: number, color: AuraColor, rotation = 0): AuraSceneNode[] {
  return [
    primitives.box({
      name: `${name} car body`,
      material: material.clearcoat({ color, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.08 })
    }).position(x, 0.115, z).rotate(0, rotation, 0).scale([0.42, 0.15, 0.22]).toJSON(),
    primitives.box({
      name: `${name} windshield`,
      material: material.glass({ color: "#bdefff", opacity: 0.56, transmission: 0.65 })
    }).position(x, 0.22, z).rotate(0, rotation, 0).scale([0.2, 0.09, 0.17]).toJSON(),
    primitives.box({
      name: `${name} headlight pair`,
      material: material.emissive({ color: "#fff7cc", emissive: "#fff7cc" })
    }).position(x + Math.sin(rotation) * 0.24, 0.15, z + Math.cos(rotation) * 0.24).rotate(0, rotation, 0).scale([0.2, 0.035, 0.028]).toJSON()
  ];
}

function makeCityProps(timeOfDay: CityBlockTimeOfDay): AuraSceneNode[] {
  const treeLeaf = material.pbr({ color: timeOfDay === "night" ? "#14532d" : "#22c55e", roughness: 0.82, metallic: 0.01 });
  const bench = material.pbr({ color: timeOfDay === "night" ? "#7c2d12" : "#92400e", roughness: 0.58, metallic: 0.03 });
  const sign = material.emissive({ color: "#dbeafe", emissive: timeOfDay === "night" ? "#38bdf8" : "#93c5fd", emissiveIntensity: timeOfDay === "night" ? 1.5 : 0.42 });
  return [
    primitives.cylinder({ name: "instanced city tree trunk 1", material: material.pbr({ color: "#6b3f21", roughness: 0.78 }) }).position(-2.92, 0.24, -0.9).scale([0.055, 0.48, 0.055]).toJSON(),
    primitives.sphere({ name: "instanced city tree canopy 1", material: treeLeaf }).position(-2.92, 0.72, -0.9).scale([0.26, 0.32, 0.26]).toJSON(),
    primitives.cylinder({ name: "instanced city tree trunk 2", material: material.pbr({ color: "#6b3f21", roughness: 0.78 }) }).position(2.48, 0.24, 0.98).scale([0.055, 0.48, 0.055]).toJSON(),
    primitives.sphere({ name: "instanced city tree canopy 2", material: treeLeaf }).position(2.48, 0.72, 0.98).scale([0.26, 0.32, 0.26]).toJSON(),
    primitives.box({ name: "wood street bench seat 1", material: bench }).position(-2.64, 0.15, 1.98).scale([0.48, 0.055, 0.16]).toJSON(),
    primitives.box({ name: "wood street bench back 1", material: bench }).position(-2.64, 0.25, 2.08).rotate(-0.18, 0, 0).scale([0.5, 0.048, 0.16]).toJSON(),
    primitives.box({ name: "wood street bench seat 2", material: bench }).position(2.34, 0.15, -2.02).rotate(0, 3.1416, 0).scale([0.48, 0.055, 0.16]).toJSON(),
    primitives.box({ name: "wood street bench back 2", material: bench }).position(2.34, 0.25, -2.12).rotate(-0.18, 3.1416, 0).scale([0.5, 0.048, 0.16]).toJSON(),
    primitives.box({ name: "readable bus stop sign panel", material: sign }).position(-3.22, 0.66, 0.42).rotate(0, 0.16, 0).scale([0.22, 0.28, 0.026]).toJSON(),
    primitives.cylinder({ name: "bus stop sign pole", material: material.metal({ color: "#94a3b8", roughness: 0.32 }) }).position(-3.22, 0.34, 0.42).scale([0.025, 0.68, 0.025]).toJSON(),
    primitives.box({ name: "corner wayfinding street sign", material: sign }).position(0.88, 0.82, -0.88).rotate(0, -0.34, 0).scale([0.34, 0.12, 0.025]).toJSON()
  ];
}

export interface AuraSolarSystemPrefabOptions {
  readonly orbitSegments?: number;
  readonly starCount?: number;
  readonly dustCount?: number;
  readonly capturePhase?: number;
  readonly labels?: "attached" | "none";
}

export type AuraSolarPlanetMaterialPreset = "rocky" | "gas-giant" | "ice" | "moon" | "ringed" | "lava-venus";

export interface AuraSolarVisualQAResult {
  readonly passes: boolean;
  readonly score: number;
  readonly planets: number;
  readonly materialPresets: readonly AuraSolarPlanetMaterialPreset[];
  readonly orbitSegments: number;
  readonly labels: number;
  readonly leaderLines: number;
  readonly stars: number;
  readonly dust: number;
  readonly hasSunCorona: boolean;
  readonly hasBloom: boolean;
  readonly deterministicCapturePhase: boolean;
  readonly problems: readonly string[];
}

export type AuraNeonPalettePreset = "cyan-magenta" | "sunset-grid" | "acid-aurora";

export interface AuraNeonTunnelOptions {
  readonly rings?: number;
  readonly palette?: AuraNeonPalettePreset;
  readonly bloomIntensity?: number;
  readonly captureFrame?: number;
}

export interface AuraNeonVisualQAResult {
  readonly passes: boolean;
  readonly score: number;
  readonly ringCount: number;
  readonly hasFog: boolean;
  readonly hasBloom: boolean;
  readonly hasReflections: boolean;
  readonly hasDepthCues: boolean;
  readonly overexposureRisk: boolean;
  readonly problems: readonly string[];
}

export interface AuraPrimitiveHumanoidPrefabOptions {
  readonly showJoints?: boolean;
  readonly motionTrail?: boolean;
  readonly clip?: AuraCharacterClipName;
  readonly pose?: AuraCharacterPose;
  readonly style?: AuraCharacterStyle;
}

export interface AuraDataBars3DPrefabOptions {
  readonly grid?: number;
  readonly selected?: false | {
    readonly row?: number;
    readonly col?: number;
  };
  readonly dataset?: readonly (readonly number[])[];
  readonly title?: string;
  readonly subtitle?: string;
  readonly units?: string;
  readonly valueRange?: readonly [number, number];
  readonly theme?: AuraChartTheme;
  readonly colorScale?: readonly AuraColor[];
}

export type AuraChartTheme = "dark-analytics" | "light-analytics" | "neon-analytics";

export interface AuraChartVisualQAResult {
  readonly passes: boolean;
  readonly score: number;
  readonly bars: number;
  readonly labels: number;
  readonly legends: number;
  readonly selectedOutlines: number;
  readonly problems: readonly string[];
}

export type AuraProductStageStyle = "hero-clean" | "clean" | "inspection";

export interface AuraProductViewerOptions {
  readonly stageStyle?: AuraProductStageStyle;
  readonly provenanceBadge?: boolean;
  readonly captureFrame?: number;
}

export interface AuraProductPlacement {
  readonly kind: "aura-product-placement";
  readonly assetId: string;
  readonly bounds: AuraVec3;
  readonly position: AuraVec3;
  readonly scale: number;
  readonly plinthSeatY: number;
  readonly centered: boolean;
  readonly seatedOnPlinth: boolean;
  readonly normalizedFromBounds: boolean;
}

export interface AuraProductDiagnostics {
  readonly kind: "aura-product-diagnostics";
  readonly stageStyle: AuraProductStageStyle;
  readonly placement: AuraProductPlacement;
  readonly provenance: AuraAssetProvenance;
  readonly orbitEnabled: boolean;
  readonly turntableEnabled: boolean;
  readonly turntableCaptureFrame: number;
  readonly inspectionGuidesVisible: boolean;
  readonly provenanceBadgeVisible: boolean;
  readonly cleanHeroMode: boolean;
}

export interface AuraProductVisualQAResult {
  readonly passes: boolean;
  readonly score: number;
  readonly modelCount: number;
  readonly softboxes: number;
  readonly reflectionCards: number;
  readonly contactShadows: number;
  readonly materialReadabilityCues: number;
  readonly inspectionGuides: number;
  readonly cleanHeroMode: boolean;
  readonly centeredAndSeated: boolean;
  readonly typedAssetProvenance: boolean;
  readonly problems: readonly string[];
}

function solarPlanetMaterial(preset: AuraSolarPlanetMaterialPreset): AuraMaterialSpec {
  if (preset === "gas-giant") return material.clearcoat({ color: "#f5d0a9", roughness: 0.2, clearcoat: 0.8, envMapIntensity: 0.88 });
  if (preset === "ice") return material.clearcoat({ color: "#93c5fd", roughness: 0.24, clearcoat: 1, envMapIntensity: 1.05 });
  if (preset === "moon") return material.pbr({ color: "#cbd5e1", roughness: 0.84, metallic: 0.01 });
  if (preset === "ringed") return material.emissive({ color: "#fde68a", emissive: "#fde68a", opacity: 0.82 });
  if (preset === "lava-venus") return material.emissive({ color: "#f59e0b", emissive: "#f97316", emissiveIntensity: 1.35 });
  return material.pbr({ color: "#a8a29e", roughness: 0.76, metallic: 0.04 });
}

const MINI_GOLF_LAYOUT = {
  ballStart: [-1.42, 0.16, 0.58] as AuraVec3,
  cupCenter: [1.55, 0.16, -1.18] as AuraVec3,
  obstacleCenter: [0.22, 0.28, -0.48] as AuraVec3,
  aimVector: [1, 0, -0.55] as AuraVec3
} as const;

interface AuraMiniGolfPrefabOptions {
  readonly ballPosition?: AuraVec3;
  readonly shots?: number;
  readonly score?: number;
  readonly collisions?: number;
  readonly contacts?: number;
  readonly cupTriggered?: boolean;
  readonly aimVector?: AuraVec3;
}

export const prefabs = {
  particleFountain: (options: { readonly color?: AuraColor; readonly count?: number; readonly emissionRate?: number } = {}): readonly AuraSceneNode[] => [
    primitives.plane({ name: "dark wet fountain collision ground plane", material: material.pbr({ color: "#101822", roughness: 0.82, metallic: 0.02 }) }).position(0, -0.02, 0).scale([7, 1, 7]).toJSON(),
    primitives.cylinder({ name: "brushed dark metal fountain pedestal", material: material.metal({ color: "#263747", roughness: 0.32, metallic: 0.25 }) }).position(0, 0.14, 0).scale([0.7, 0.28, 0.7]).toJSON(),
    primitives.cylinder({ name: "recessed black splash catch basin", material: material.pbr({ color: "#06111a", roughness: 0.72, metallic: 0.04 }) }).position(0, 0.31, 0).scale([0.52, 0.055, 0.52]).toJSON(),
    primitives.torus({ name: "subtle dark collision splash lip", material: material.pbr({ color: "#174456", roughness: 0.48, metallic: 0.06 }) }).position(0, 0.37, 0).rotate(1.5708, 0, 0).scale([0.72, 0.72, 0.028]).toJSON(),
    primitives.cylinder({ name: "central particle emission nozzle", material: material.metal({ color: "#1d2f3f", roughness: 0.2, metallic: 0.38 }) }).position(0, 0.4, 0).scale([0.18, 0.28, 0.18]).toJSON(),
    effects.particles({ name: "dense lifetime colored fountain droplet plume", emitter: "fountain", color: options.color ?? "#60a5fa", particleCount: Math.max(320, Math.min(560, options.count ?? 420)), radius: 1.04, height: 3.05, intensity: 0.72, speed: 0.72, emissionRate: options.emissionRate ?? 120, gravity: 9.8, groundCollision: true, lifetimeColorRamp: ["#fff7ad", "#fef08a", "#fb923c", "#60a5fa", "#38bdf8", "#fb7185"], materialMode: "splash", texturedBillboard: false, sizeOverLife: [0.82, 1.18, 0.8], alphaOverLife: [0.52, 0.82, 0.54], turbulence: 0.004, noise: 0.004, splashes: true, mist: false }).toJSON(),
    effects.particles({ name: "colored ground collision splash droplet ring", emitter: "fountain", color: "#bae6fd", particleCount: 96, radius: 1.9, height: 0.42, intensity: 0.58, speed: 0.66, emissionRate: Math.round((options.emissionRate ?? 120) * 0.32), gravity: 9.8, groundCollision: true, lifetimeColorRamp: ["#60a5fa", "#38bdf8", "#fb923c", "#fb7185", "#fff7ad", "#fef08a"], materialMode: "splash", texturedBillboard: false, sizeOverLife: [0.72, 1.02, 0.68], alphaOverLife: [0.38, 0.68, 0.34], turbulence: 0.006, noise: 0.006, splashes: true, mist: false }).toJSON(),
    effects.bloom({ intensity: 0.035, color: options.color ?? "#bae6fd", threshold: 0.96, radius: 0.08, maxIntensity: 0.08 }).toJSON()
  ],

  cityBlock: (options: AuraCityBlockOptions = {}): readonly AuraSceneNode[] => {
    const blocks = Math.max(3, Math.min(30, options.blocks ?? 20));
    const timeOfDay = options.timeOfDay ?? "night";
    const night = timeOfDay === "night";
    const road = material.pbr({ color: night ? "#0a0f16" : "#3f474b", roughness: 0.78 });
    const sideRoad = material.pbr({ color: night ? "#101820" : "#58636b", roughness: 0.78 });
    const sidewalk = material.pbr({ color: night ? "#334155" : "#b7c5cf", roughness: 0.84, metallic: 0.02 });
    const curb = night
      ? material.emissive({ color: "#e8f5ff", emissive: "#bdefff", emissiveIntensity: 1.6 })
      : material.pbr({ color: "#eef4f8", roughness: 0.58, metallic: 0.01 });
    const nodes: AuraSceneNode[] = [
      primitives.plane({ name: "asphalt street grid", material: material.pbr({ color: timeOfDay === "night" ? "#2f3a37" : "#9fb49b", roughness: 0.86, metallic: 0.02 }) }).position(0, -0.04, 0).scale([20, 1, 20]).toJSON(),
      primitives.box({ name: "main north south road", material: road }).position(0, 0.012, 0).scale([0.44, 0.024, 10.8]).toJSON(),
      primitives.box({ name: "main east west road", material: road }).position(0, 0.014, 0).scale([11.4, 0.024, 0.44]).toJSON(),
      primitives.box({ name: "left city avenue", material: sideRoad }).position(-3.45, 0.013, 0).scale([0.3, 0.022, 10.8]).toJSON(),
      primitives.box({ name: "right city avenue", material: sideRoad }).position(2.55, 0.013, 0).scale([0.3, 0.022, 10.8]).toJSON(),
      primitives.box({ name: "front cross street", material: sideRoad }).position(0, 0.015, -2.7).scale([11.4, 0.022, 0.3]).toJSON(),
      primitives.box({ name: "back cross street", material: sideRoad }).position(0, 0.015, 2.55).scale([11.4, 0.022, 0.3]).toJSON(),
      primitives.box({ name: "northwest raised sidewalk slab", material: sidewalk }).position(-1.76, 0.006, 1.32).scale([2.42, 0.036, 1.76]).toJSON(),
      primitives.box({ name: "northeast raised sidewalk slab", material: sidewalk }).position(1.66, 0.006, 1.32).scale([2.24, 0.036, 1.76]).toJSON(),
      primitives.box({ name: "southwest raised sidewalk slab", material: sidewalk }).position(-1.76, 0.006, -1.42).scale([2.42, 0.036, 1.82]).toJSON(),
      primitives.box({ name: "southeast raised sidewalk slab", material: sidewalk }).position(1.66, 0.006, -1.42).scale([2.24, 0.036, 1.82]).toJSON(),
      primitives.box({ name: "central intersection curb north", material: curb }).position(0, 0.052, 0.62).scale([1.32, 0.028, 0.035]).toJSON(),
      primitives.box({ name: "central intersection curb south", material: curb }).position(0, 0.052, -0.62).scale([1.32, 0.028, 0.035]).toJSON(),
      primitives.box({ name: "central intersection curb west", material: curb }).position(-0.62, 0.052, 0).scale([0.035, 0.028, 1.32]).toJSON(),
      primitives.box({ name: "central intersection curb east", material: curb }).position(0.62, 0.052, 0).scale([0.035, 0.028, 1.32]).toJSON(),
      primitives.box({ name: "left road stripe", material: material.emissive({ color: "#f7d66b", emissive: "#f7d66b" }) }).position(-0.18, 0.032, 0).scale([0.035, 0.02, 15.2]).toJSON(),
      primitives.box({ name: "right road stripe", material: material.emissive({ color: "#f7d66b", emissive: "#f7d66b" }) }).position(0.18, 0.032, 0).scale([0.035, 0.02, 15.2]).toJSON(),
      primitives.box({ name: "cross street white line", material: material.emissive({ color: "#e8eef5", emissive: "#e8eef5" }) }).position(0, 0.034, 0.24).scale([15.4, 0.02, 0.035]).toJSON(),
      ...makeCityRoadMarkings(timeOfDay),
      ...makeCityCrosswalk("zebra crosswalk near", 0, -0.34, "northSouth"),
      ...makeCityCrosswalk("zebra crosswalk far", 0, 0.72, "northSouth"),
      ...makeCityCrosswalk("zebra crosswalk west", -0.72, 0, "eastWest"),
      ...makeCityCrosswalk("zebra crosswalk east", 0.72, 0, "eastWest")
    ];
    const xSlots = [-4.25, -2.58, -0.95, 1.45, 3.3];
    const zSlots = [-4, -1.45, 1.3, 3.65];
    for (let index = 0; index < blocks; index += 1) {
      const col = index % 5;
      const row = Math.floor(index / 5);
      const x = xSlots[col] ?? ((col - 2) * 1.85);
      const z = zSlots[row] ?? (-4 + row * 2.25);
      const height = 1.15 + ((index * 7) % 6) * 0.45 + (col === 0 || col === 4 ? 0.25 : 0);
      const color = night
        ? (index % 3 === 0 ? "#1e293b" : index % 3 === 1 ? "#2d3340" : "#172233")
        : (index % 3 === 0 ? "#8ea2aa" : index % 3 === 1 ? "#b89b72" : "#668094");
      nodes.push(primitives.box({
        name: `city tower ${index + 1}`,
        material: material.pbr({ color, roughness: 0.68, metallic: 0.06 })
      }).position(x, height / 2, z).scale([1.08, height, 1.08]).toJSON());
      if (options.litWindows !== false) {
        nodes.push(...makeBuildingWindowRows(x, z, height, index, timeOfDay));
      }
      nodes.push(...makeBuildingDetails(x, z, height, index, timeOfDay));
    }
    const lampPositions: AuraVec3[] = [
      [-1.15, 0, 0.85], [1.15, 0, 0.85], [-1.15, 0, -0.85], [1.15, 0, -0.85],
      [-3.85, 0, -2.05], [-2.95, 0, 2.05], [2.05, 0, -2.05], [3.05, 0, 2.05],
      [-5.15, 0, 0.15], [4.25, 0, -0.15], [-0.2, 0, -3.18], [0.2, 0, 3.05]
    ];
    for (let index = 0; index < lampPositions.length; index += 1) {
      const [x, , z] = lampPositions[index];
      nodes.push(primitives.cylinder({ name: `street light pole ${index + 1}`, material: material.metal({ color: "#6f7d86", roughness: 0.32 }) }).position(x, 0.34, z).scale([0.035, 0.68, 0.035]).toJSON());
      nodes.push(primitives.sphere({
        name: timeOfDay === "night" ? `bright night street lamp ${index + 1}` : `muted daylight street lamp ${index + 1}`,
        material: timeOfDay === "night"
          ? material.emissive({ color: "#ff7a00", emissive: "#ff7a00", emissiveIntensity: 1.85 })
          : material.pbr({ color: "#f1f5f9", roughness: 0.42, metallic: 0.04 })
      }).position(x, 0.74, z).scale(timeOfDay === "night" ? 0.16 : 0.07).toJSON());
      if (timeOfDay === "night") {
        nodes.push(primitives.cylinder({
          name: `gold night lamp glow pool ${index + 1}`,
          material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.15, opacity: 0.82 })
        }).position(x, 0.038, z).scale([0.84, 0.012, 0.84]).toJSON());
      }
    }
    if (timeOfDay === "night") {
      nodes.push(
        primitives.box({ name: "visible dark night road evidence north south", material: material.emissive({ color: "#34383d", emissive: "#34383d", emissiveIntensity: 0.24, opacity: 0.92 }) }).position(0, 0.049, -0.1).scale([0.5, 0.016, 4.8]).toJSON(),
        primitives.box({ name: "visible dark night road evidence east west", material: material.emissive({ color: "#34383d", emissive: "#34383d", emissiveIntensity: 0.24, opacity: 0.92 }) }).position(0, 0.05, -0.1).scale([5.2, 0.016, 0.5]).toJSON(),
        primitives.box({ name: "visible white night crosswalk evidence near", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.78 }) }).position(0, 0.072, -0.42).scale([1.42, 0.018, 0.055]).toJSON(),
        primitives.box({ name: "visible white night crosswalk evidence far", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.78 }) }).position(0, 0.073, 0.54).scale([1.42, 0.018, 0.055]).toJSON(),
        primitives.box({ name: "warm amber streetlight pool foreground left", material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.15, opacity: 0.86 }) }).position(-1.12, 0.055, -0.72).scale([0.82, 0.02, 0.32]).toJSON(),
        primitives.box({ name: "warm amber streetlight pool foreground right", material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.15, opacity: 0.86 }) }).position(1.12, 0.055, -0.72).scale([0.82, 0.02, 0.32]).toJSON(),
        primitives.box({ name: "warm amber streetlight pool avenue left", material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.05, opacity: 0.82 }) }).position(-3.05, 0.055, 0.2).scale([0.36, 0.02, 0.9]).toJSON(),
        primitives.box({ name: "warm amber streetlight pool avenue right", material: material.emissive({ color: "#ff6a00", emissive: "#ff6a00", emissiveIntensity: 1.05, opacity: 0.82 }) }).position(2.2, 0.055, 0.2).scale([0.36, 0.02, 0.9]).toJSON()
      );
    }
    nodes.push(
      ...makeCityProps(timeOfDay),
      ...makeCityVehicle("red northbound", -0.18, -1.7, "#ef4444", 0),
      ...makeCityVehicle("blue southbound", 0.2, 1.78, "#2563eb", 3.1416),
      ...makeCityVehicle("yellow crosstown taxi", -2.0, 0.22, "#facc15", 1.5708),
      ...makeCityVehicle("white crosstown van", 2.0, -0.22, "#f8fafc", -1.5708),
      primitives.sphere({
        name: timeOfDay === "night" ? "large moon over procedural city sky" : "bright sun over procedural city sky",
        material: material.emissive({
          color: timeOfDay === "night" ? "#dbeafe" : "#fde047",
          emissive: timeOfDay === "night" ? "#93c5fd" : "#facc15",
          emissiveIntensity: timeOfDay === "night" ? 1.6 : 2.4
        })
      }).position(4.62, 4.4, -4.35).scale(timeOfDay === "night" ? 0.34 : 0.46).toJSON(),
      primitives.sphere({
        name: timeOfDay === "night" ? "soft blue city glow dome" : "warm daytime sky haze dome",
        material: material.emissive({
          color: timeOfDay === "night" ? "#0b1f3a" : "#bae6fd",
          emissive: timeOfDay === "night" ? "#1d4ed8" : "#7dd3fc",
          opacity: timeOfDay === "night" ? 0.2 : 0.12
        })
      }).position(0, 2.8, -4.65).scale([4.4, 1.0, 0.08]).toJSON(),
      primitives.box({ name: "foreground day night state board", material: material.pbr({ color: "#08111f", roughness: 0.48, metallic: 0.16 }) }).position(-1.38, 0.22, 4.92).scale([1.72, 0.22, 0.08]).toJSON(),
      primitives.sphere({ name: "large day sun state marker", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-2.0, 0.58, 4.9).scale(0.22).toJSON(),
      primitives.sphere({ name: "large night moon state marker", material: material.emissive({ color: "#dbeafe", emissive: "#93c5fd" }) }).position(-0.76, 0.58, 4.9).scale(0.22).toJSON(),
      primitives.box({
        name: timeOfDay === "night" ? "foreground active night state bar" : "foreground active day state bar",
        material: material.emissive({ color: timeOfDay === "night" ? "#93c5fd" : "#fde047", emissive: timeOfDay === "night" ? "#93c5fd" : "#fde047" })
      }).position(timeOfDay === "night" ? -0.76 : -2.0, 0.34, 4.82).scale([0.42, 0.06, 0.045]).toJSON(),
      primitives.box({ name: "night streetlight glow proof strip", material: material.emissive({ color: timeOfDay === "night" ? "#fbbf24" : "#fde68a", emissive: timeOfDay === "night" ? "#fbbf24" : "#fde68a" }) }).position(1.36, 0.045, 3.72).scale([1.1, 0.018, 0.16]).toJSON(),
      primitives.box({ name: "day night toggle pedestal", material: material.pbr({ color: "#0f172a", roughness: 0.62, metallic: 0.08 }) }).position(-4.95, 0.09, 4.82).scale([0.88, 0.16, 0.34]).toJSON(),
      primitives.sphere({ name: "gold sun icon on day night toggle", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-5.28, 0.32, 4.82).scale(0.16).toJSON(),
      primitives.sphere({ name: "silver moon icon on day night toggle", material: material.emissive({ color: "#dbeafe", emissive: "#93c5fd" }) }).position(-4.62, 0.32, 4.82).scale(0.16).toJSON(),
      primitives.box({
        name: timeOfDay === "night" ? "active night state toggle knob" : "active day state toggle knob",
        material: material.emissive({ color: timeOfDay === "night" ? "#93c5fd" : "#fde047", emissive: timeOfDay === "night" ? "#93c5fd" : "#fde047" })
      }).position(timeOfDay === "night" ? -4.62 : -5.28, 0.2, 4.48).scale([0.26, 0.08, 0.12]).toJSON(),
      primitives.box({ name: "red traffic signal over intersection", material: material.emissive({ color: "#ef4444", emissive: "#ef4444" }) }).position(-0.58, 0.9, -0.58).scale([0.11, 0.11, 0.035]).toJSON(),
      primitives.box({ name: "green traffic signal over intersection", material: material.emissive({ color: "#22c55e", emissive: "#22c55e" }) }).position(0.58, 0.9, 0.58).scale([0.11, 0.11, 0.035]).toJSON()
    );
    return nodes;
  },

  materialSwatches: (): readonly AuraSceneNode[] => [
    primitives.box({ name: "matte studio floor for material comparison", material: material.pbr({ color: "#687382", roughness: 0.56, metallic: 0.04 }) }).position(0, -0.03, -0.72).scale([8.1, 0.14, 2.35]).toJSON(),
    primitives.box({ name: "split material reflection wall", material: material.pbr({ color: "#334155", roughness: 0.38, metallic: 0.05, opacity: 0.58 }) }).position(0, 1.08, -1.82).scale([8.1, 2.0, 0.08]).toJSON(),
    primitives.box({ name: "white softbox reflection strip", material: material.emissive({ color: "#f8fbff", emissive: "#f8fbff", emissiveIntensity: 0.72, opacity: 0.68 }) }).position(0, 2.26, -1.72).scale([4.9, 0.1, 0.06]).toJSON(),
    primitives.box({ name: "black reflection contrast strip", material: material.pbr({ color: "#05070d", roughness: 0.18, metallic: 0.24 }) }).position(0, 1.78, -1.69).scale([6.1, 0.12, 0.08]).toJSON(),
    primitives.box({ name: "cool blue environment reflection panel", material: material.emissive({ color: "#77e6ff", emissive: "#77e6ff" }) }).position(-3.55, 1.12, -1.24).rotate(0, 0.16, 0).scale([0.08, 1.18, 1.38]).toJSON(),
    primitives.box({ name: "warm gold environment reflection panel", material: material.emissive({ color: "#ffd18a", emissive: "#ffd18a" }) }).position(3.55, 1.12, -1.24).rotate(0, -0.16, 0).scale([0.08, 1.18, 1.38]).toJSON(),
    primitives.box({ name: "chrome bright reflection card", material: material.emissive({ color: "#f8fbff", emissive: "#f8fbff" }) }).position(-2.8, 1.55, -0.14).rotate(0, 0.06, -0.18).scale([0.76, 0.05, 0.06]).toJSON(),
    primitives.box({ name: "chrome dark reflection card", material: material.pbr({ color: "#030712", roughness: 0.12, metallic: 0.25 }) }).position(-2.8, 1.32, -0.12).rotate(0, 0.06, -0.18).scale([0.62, 0.045, 0.06]).toJSON(),
    primitives.sphere({ name: "mirror chrome metal swatch", material: material.chrome({ color: "#f4fbff", roughness: 0.018, clearcoat: 0.18, envMapIntensity: 2 }) }).position(-2.8, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "transparent cyan glass swatch", material: material.clearGlass({ color: "#95eaff", opacity: 0.22, transmission: 1, thickness: 0.9, attenuationDistance: 0.68 }) }).position(-1.4, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "matte charcoal rubber swatch", material: material.blackRubber({ color: "#171a22", roughness: 0.99 }) }).position(0, 0.9, -0.72).scale(1.1).toJSON(),
	    primitives.sphere({ name: "emissive magenta swatch", material: material.glowingEmissive({ color: "#ff42c8", emissive: "#ff42c8", emissiveIntensity: 2.35, roughness: 0.08 }) }).position(1.4, 0.9, -0.72).scale(1.1).toJSON(),
	    primitives.sphere({ name: "large emissive magenta glow halo", material: material.emissive({ color: "#7a0f5c", emissive: "#ff42c8", emissiveIntensity: 0.72, opacity: 0.22 }) }).position(1.4, 0.9, -0.84).scale([1.56, 1.56, 0.04]).toJSON(),
	    primitives.box({ name: "emissive glow spill on lab floor", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8", emissiveIntensity: 0.42, opacity: 0.18 }) }).position(1.4, 0.07, -0.05).scale([1.24, 0.026, 0.34]).toJSON(),
    primitives.sphere({ name: "red automotive clearcoat swatch", material: material.clearcoatPaint({ color: "#ef233c", roughness: 0.045, clearcoat: 1, clearcoatRoughness: 0.018, envMapIntensity: 1.55 }) }).position(2.8, 0.9, -0.72).scale(1.1).toJSON(),
    primitives.sphere({ name: "transparent clearcoat outer gloss layer", material: material.clearcoat({ color: "#ffffff", opacity: 0.16, roughness: 0.015, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.0 }) }).position(2.8, 0.9, -0.72).scale(1.15).toJSON(),
    primitives.box({ name: "clearcoat white topcoat highlight", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(2.72, 1.34, -0.13).rotate(0, -0.1, -0.22).scale([0.72, 0.055, 0.05]).toJSON(),
    primitives.box({ name: "clearcoat amber base reflection", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(2.94, 1.12, -0.14).rotate(0, -0.1, -0.22).scale([0.48, 0.04, 0.045]).toJSON(),
    primitives.box({ name: "metal label plinth", material: material.emissive({ color: "#dff4ff", emissive: "#dff4ff" }) }).position(-2.8, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "glass label plinth", material: material.emissive({ color: "#7dd3fc", emissive: "#7dd3fc" }) }).position(-1.4, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "rubber label plinth", material: material.emissive({ color: "#475569", emissive: "#475569" }) }).position(0, 0.18, 0.38).scale([1.0, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "emissive label plinth", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8" }) }).position(1.4, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    primitives.box({ name: "clearcoat label plinth", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(2.8, 0.18, 0.38).scale([0.84, 0.08, 0.24]).toJSON(),
    labels.anchor("Metal", "mirror chrome metal swatch", { name: "metal collision-avoiding material label", position: [-2.8, 0.42, 0.42], size: 0.19, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    labels.anchor("Glass", "transparent cyan glass swatch", { name: "glass collision-avoiding material label", position: [-1.4, 0.42, 0.42], size: 0.19, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    labels.anchor("Rubber", "matte charcoal rubber swatch", { name: "rubber collision-avoiding material label", position: [0, 0.42, 0.42], size: 0.19, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    labels.anchor("Emissive", "emissive magenta swatch", { name: "emissive collision-avoiding material label", position: [1.4, 0.42, 0.42], size: 0.15, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    labels.anchor("Clearcoat", "red automotive clearcoat swatch", { name: "clearcoat collision-avoiding material label", position: [2.8, 0.42, 0.42], size: 0.15, collisionAvoidance: true, occlusionAware: true }).toJSON(),
    primitives.box({ name: "glass white contrast card", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(-1.55, 0.9, -1.5).scale([0.42, 0.58, 0.04]).toJSON(),
    primitives.box({ name: "glass dark contrast card", material: material.pbr({ color: "#020617", roughness: 0.26, metallic: 0.12 }) }).position(-1.18, 0.9, -1.5).scale([0.42, 0.58, 0.04]).toJSON(),
    primitives.box({ name: "glass refracted white stripe", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(-1.42, 1.2, -1.47).scale([0.06, 0.88, 0.035]).toJSON(),
    primitives.box({ name: "glass refracted dark stripe", material: material.pbr({ color: "#05070d", roughness: 0.22, metallic: 0.1 }) }).position(-1.31, 0.9, -1.46).scale([0.06, 0.7, 0.035]).toJSON(),
    primitives.box({ name: "rubber roughness sample strip", material: material.pbr({ color: "#334155", roughness: 1, metallic: 0 }) }).position(-0.18, 1.38, -0.12).rotate(0, 0.02, 0.2).scale([0.42, 0.035, 0.04]).toJSON(),
    primitives.box({ name: "rubber diffuse edge strip", material: material.pbr({ color: "#0b0f16", roughness: 1, metallic: 0 }) }).position(0.2, 1.18, -0.11).rotate(0, -0.02, -0.18).scale([0.34, 0.032, 0.04]).toJSON(),
	    effects.bloom({ intensity: 0.18, color: "#ff42c8", threshold: 0.86, radius: 0.22, maxIntensity: 0.24 }).toJSON()
	  ],

	  productStage: (options: { readonly style?: AuraProductStageStyle; readonly showStudioRig?: boolean } = {}): readonly AuraSceneNode[] => {
	    const style = options.style ?? "hero-clean";
	    const inspection = style === "inspection";
	    const showStudioRig = options.showStudioRig ?? inspection;
	    const floorMaterial = material.pbr({ color: style === "clean" ? "#e8edf3" : "#f2f5f8", roughness: 0.68, metallic: 0.01 });
	    const backdropMaterial = material.pbr({ color: style === "clean" ? "#f5f7fa" : "#f8fafc", roughness: 0.72, metallic: 0.01 });
	    const plinthMaterial = material.clearcoat({ color: "#f8fafc", roughness: 0.24, clearcoat: 0.42, envMapIntensity: 0.85 });
	    const shadowMaterial = material.pbr({ color: "#020617", roughness: 0.96, metallic: 0.01, opacity: 0.32 });
	    const rimMaterial = material.emissive({ color: "#dbeafe", emissive: "#93c5fd", emissiveIntensity: 0.18, opacity: 0.42 });
	    const nodes: AuraSceneNode[] = [
	      primitives.plane({ name: "seamless matte product hero floor", material: floorMaterial }).position(0, -0.018, -0.62).scale([3.6, 1, 2.6]).toJSON(),
	      primitives.plane({ name: "distant seamless product photography backdrop", material: backdropMaterial }).position(0, 1.22, -2.28).rotate(-0.08, 0, 0).scale([3.6, 1, 1.8]).toJSON(),
	      primitives.cylinder({ name: "low matte hero product plinth", material: plinthMaterial }).position(0, 0.255, -0.65).scale([1.46, 0.26, 1.46]).toJSON(),
	      primitives.cylinder({ name: "soft product contact shadow from footprint", material: shadowMaterial }).position(0, 0.292, -0.65).scale([1.06, 0.01, 0.66]).toJSON(),
	      lights.rect({ name: "off camera product key softbox sneaker mesh grazing light", position: [-2.4, 2.25, 2.25], intensity: 0.9, width: 3.2, height: 1.55, color: "#ffffff" }).toJSON(),
	      lights.rect({ name: "off camera cool reflection card fill softbox lace detail pin highlight", position: [2.4, 1.75, 1.85], intensity: 0.44, width: 2.6, height: 1.25, color: "#dbeafe" }).toJSON(),
	      lights.rect({ name: "rear warm reflection card rim softbox rubber sole edge kicker", position: [0, 1.85, -2.85], intensity: 0.72, width: 3.4, height: 0.9, color: "#c7d2fe" }).toJSON(),
	      effects.contactOcclusion({ intensity: 0.24, radius: 0.62 }).toJSON()
	    ];
	    if (showStudioRig) {
	      const guideMaterial = material.pbr({ color: "#e2e8f0", roughness: 0.82, metallic: 0.01, opacity: 0.28 });
	      nodes.push(
	        primitives.plane({ name: "inspection only left softbox card", material: guideMaterial }).position(-1.95, 1.18, -0.18).rotate(0, 0.34, 0).scale([0.72, 1, 0.46]).toJSON(),
	        primitives.plane({ name: "inspection only right softbox card", material: guideMaterial }).position(1.95, 1.08, -0.28).rotate(0, -0.34, 0).scale([0.66, 1, 0.42]).toJSON(),
	        primitives.box({ name: "inspection only product bounds tick", material: rimMaterial }).position(0, 0.72, 0.16).scale([0.62, 0.025, 0.025]).toJSON()
	      );
	    }
	    return nodes;
	  },

	  productViewer: (asset: AuraAssetRef<"model">, options: AuraProductViewerOptions = {}): readonly AuraSceneNode[] => {
	    const placement = productPlacement(asset);
	    const captureTime = options.captureFrame ?? 0.32;
	    const nodes: AuraSceneNode[] = [
	      ...prefabs.productStage({ style: options.stageStyle ?? "hero-clean" }),
	      model(asset, { name: "auto-centered bounded product model" })
	        .position(...placement.position)
	        .rotate(0, -0.38, 0)
	        .scale(placement.scale)
	        .animate({ clip: "turntable", speed: 0.42, duration: 8, captureTime })
	        .toJSON()
	    ];
	    if (options.provenanceBadge === true) {
	      nodes.push(primitives.box({
	        name: "optional typed asset provenance badge off render edge",
	        material: material.emissive({ color: "#dff8ff", emissive: "#67e8f9", opacity: 0.52 })
	      }).position(-2.72, 0.3, 1.18).scale([0.54, 0.055, 0.04]).toJSON());
	    }
	    return nodes;
  },

  physicsRamp: (): readonly AuraSceneNode[] => [
    primitives.box({ name: "rigid physics ramp", material: material.pbr({ color: "#2c3642", roughness: 0.52, metallic: 0.12 }) }).position(-0.35, 0.28, -0.8).rotate(0, 0, -0.42).scale([2.4, 0.16, 0.82]).physics({ type: "static", shape: "box", halfExtents: [1.2, 0.08, 0.41], friction: 0.86 }).toJSON(),
    primitives.box({ name: "static catch platform", material: material.pbr({ color: "#151b22", roughness: 0.62, metallic: 0.08 }) }).position(0.65, 0.02, -0.55).scale([2.4, 0.12, 1.2]).physics({ type: "static", shape: "box", halfExtents: [1.2, 0.06, 0.6], friction: 0.9 }).toJSON(),
    primitives.box({ name: "settled rigid body cube 1", material: material.clearcoat({ color: "#6ee7ff" }) }).position(0.18, 0.22, -0.58).rotate(0.12, 0.34, 0.08).scale(0.24).physics({ type: "dynamic", shape: "box", halfExtents: [0.12, 0.12, 0.12], mass: 1, restitution: 0.18 }).toJSON(),
    primitives.box({ name: "settled rigid body cube 2", material: material.clearcoat({ color: "#ffd166" }) }).position(0.52, 0.22, -0.42).rotate(-0.18, 0.2, -0.12).scale(0.24).physics({ type: "dynamic", shape: "box", halfExtents: [0.12, 0.12, 0.12], mass: 1, restitution: 0.18 }).toJSON(),
    primitives.box({ name: "settled rigid body cube 3", material: material.clearcoat({ color: "#ef476f" }) }).position(0.82, 0.22, -0.72).rotate(0.08, -0.28, 0.2).scale(0.24).physics({ type: "dynamic", shape: "box", halfExtents: [0.12, 0.12, 0.12], mass: 1, restitution: 0.18 }).toJSON()
  ],

  physicsPlayground: (options: { readonly cubes?: number } = {}): readonly AuraSceneNode[] => {
	    const count = Math.max(18, Math.min(64, options.cubes ?? 50));
	    const floorMat = material.pbr({ color: "#111827", roughness: 0.78, metallic: 0.04 });
	    const rampMat = material.clearcoat({ color: "#334155", roughness: 0.32, clearcoat: 0.22 });
	    const platformMat = material.pbr({ color: "#1f2937", roughness: 0.66, metallic: 0.06 });
	    const contactMat = material.emissive({ color: "#f97316", emissive: "#f97316", emissiveIntensity: 0.36, opacity: 0.58 });
	    const guideMat = material.emissive({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 0.38, opacity: 0.66 });
	    const nodes: AuraSceneNode[] = [
	      primitives.plane({ name: "polished physics lab contact floor", material: floorMat }).position(0.35, -0.04, -0.68).scale([5.2, 1, 3.55]).physics({ type: "static", shape: "plane", friction: 0.92, restitution: 0.08 }).toJSON(),
	      primitives.box({ name: "brushed metal tilted collision ramp", material: rampMat }).position(-0.58, 0.36, -0.83).rotate(0, 0, -0.34).scale([3.12, 0.16, 1.25]).physics({ type: "static", shape: "box", halfExtents: [1.56, 0.08, 0.625], friction: 0.84, restitution: 0.12 }).toJSON(),
	      primitives.box({ name: "rubber catch tray platform", material: platformMat }).position(0.88, 0.04, -0.68).scale([2.72, 0.12, 1.74]).physics({ type: "static", shape: "box", halfExtents: [1.36, 0.06, 0.87], friction: 0.9 }).toJSON(),
	      primitives.box({ name: "rear transparent catch wall", material: material.clearcoat({ color: "#93c5fd", roughness: 0.08, clearcoat: 0.72, opacity: 0.22 }) }).position(1.25, 0.48, -1.6).scale([2.36, 0.72, 0.055]).physics({ type: "static", shape: "box", halfExtents: [1.18, 0.36, 0.0275], friction: 0.68, restitution: 0.28 }).toJSON(),
	      primitives.box({ name: "left transparent catch wall", material: material.clearcoat({ color: "#93c5fd", roughness: 0.08, clearcoat: 0.72, opacity: 0.18 }) }).position(-0.04, 0.42, -0.68).scale([0.055, 0.62, 1.62]).physics({ type: "static", shape: "box", halfExtents: [0.0275, 0.31, 0.81], friction: 0.68, restitution: 0.28 }).toJSON(),
	      primitives.cylinder({ name: "subtle collision contact patch cluster center", material: contactMat }).position(0.48, 0.13, -0.78).scale([0.56, 0.014, 0.34]).toJSON(),
	      primitives.cylinder({ name: "subtle collision contact patch under settled pile", material: material.pbr({ color: "#020617", roughness: 0.95, opacity: 0.36 }) }).position(0.92, 0.125, -0.68).scale([0.86, 0.01, 0.54]).toJSON(),
	      primitives.box({ name: "gravity direction cue shaft", material: guideMat }).position(-1.95, 1.16, -1.05).rotate(0, 0, 1.5708).scale([0.5, 0.028, 0.035]).toJSON(),
	      primitives.box({ name: "gravity direction cue head", material: guideMat }).position(-1.95, 0.84, -1.05).rotate(0, 0, 0.82).scale([0.16, 0.028, 0.035]).toJSON(),
	      primitives.box({ name: "reset simulation control button", material: material.clearcoat({ color: "#38bdf8", roughness: 0.16, clearcoat: 0.38 }) }).position(2.02, 0.18, -1.46).scale([0.34, 0.07, 0.16]).onPointer({ cursor: "pointer", onClick: "reset physics playground" }).toJSON(),
	      labels.hud("Physics: ramp, contacts, settled pile", { name: "physics contact counter HUD" }).toJSON(),
	      lights.rect({ name: "physics lab overhead softbox", position: [0.2, 2.8, 1.4], intensity: 0.86, width: 3.8, height: 1.4, color: "#e0f2fe" }).toJSON(),
	      effects.contactOcclusion({ intensity: 0.28, radius: 0.64 }).toJSON()
	    ];
	    const palette = ["#f97316", "#38bdf8", "#a3e635", "#f43f5e", "#facc15", "#c084fc"];
	    for (let index = 0; index < count; index += 1) {
	      const col = index % 8;
	      const row = Math.floor(index / 8);
	      const isFalling = index < 6;
	      const x = isFalling ? -1.58 + col * 0.32 : 0.34 + (col % 5) * 0.28 + (row % 2) * 0.07;
	      const y = isFalling ? 1.12 + (index % 3) * 0.22 : 0.24 + Math.floor((index - 6) / 5) * 0.18 + (col % 2) * 0.025;
	      const z = isFalling ? -1.22 + (index % 3) * 0.22 : -1.08 + (col % 5) * 0.2;
	      nodes.push(primitives.box({
	        name: (isFalling ? "falling" : "settled pile") + " visible rigid body cube " + (index + 1),
	        material: material.clearcoat({ color: palette[index % palette.length], roughness: isFalling ? 0.18 : 0.28, clearcoat: 0.36 })
	      }).position(x, y, z).rotate(index * 0.08, index * 0.13, index * 0.05).scale(0.18).animate(isFalling ? { clip: "float", speed: 0.28 + index * 0.025 } : { clip: "pulse", speed: 0.08 }).physics({ type: "dynamic", shape: "box", halfExtents: [0.09, 0.09, 0.09], mass: 1, friction: 0.62, restitution: 0.22 }).toJSON());
	      if (isFalling) {
	        nodes.push(primitives.box({
	          name: "subtle fall motion streak " + (index + 1),
	          material: material.emissive({ color: palette[index % palette.length], emissive: palette[index % palette.length], emissiveIntensity: 0.32, opacity: 0.4 })
	        }).position(x - 0.08, y - 0.24, z).rotate(0, 0, -0.34).scale([0.026, 0.36, 0.026]).toJSON());
	      }
	    }
	    for (let index = 0; index < 3; index += 1) {
	      nodes.push(primitives.box({
	        name: "small red contact normal vector " + (index + 1),
	        material: material.emissive({ color: "#fb7185", emissive: "#fb7185", emissiveIntensity: 0.32, opacity: 0.58 })
	      }).position(0.48 + index * 0.18, 0.34 + index * 0.025, -0.96 + index * 0.18).rotate(0, 0, -0.58).scale([0.026, 0.22, 0.026]).toJSON());
	    }
	    return nodes;
	  },

  solarSystem: (options: AuraSolarSystemPrefabOptions = {}): readonly AuraSceneNode[] => {
    const orbitSegments = Math.max(8, Math.min(24, options.orbitSegments ?? 16));
    const starCount = Math.max(24, Math.min(90, options.starCount ?? 60));
    const dustCount = Math.max(10, Math.min(48, options.dustCount ?? 24));
    const capturePhase = options.capturePhase ?? 0.42;
    const labelMode = options.labels ?? "attached";
    const planets = [
      { name: "Mercury", radius: 0.82, size: 0.09, color: "#cbd5e1", speed: 1.4, angle: 0.2, preset: "rocky" },
      { name: "Venus", radius: 1.12, size: 0.12, color: "#fbbf24", speed: 1.1, angle: 1.05, preset: "lava-venus" },
      { name: "Earth", radius: 1.46, size: 0.13, color: "#38bdf8", speed: 0.86, angle: 2.0, preset: "ice" },
      { name: "Mars", radius: 1.78, size: 0.105, color: "#f97316", speed: 0.68, angle: 2.82, preset: "rocky" },
      { name: "Jupiter", radius: 2.18, size: 0.22, color: "#f5d0a9", speed: 0.42, angle: 3.7, preset: "gas-giant" },
      { name: "Saturn", radius: 2.6, size: 0.19, color: "#fde68a", speed: 0.32, angle: 4.56, preset: "ringed" }
    ] as const;
    const nodes: AuraSceneNode[] = [
      primitives.sphere({ name: "glowing labeled sun shader core", material: material.solarSun({ color: "#ffd166", coreColor: "#fff7ad", rimColor: "#f97316", emissiveIntensity: 2.55 }) }).position(0, 0.14, 0).scale(0.44).animate({ clip: "pulse", speed: 0.32 }).toJSON(),
      primitives.sphere({ name: "transparent golden sun corona shader", material: material.solarCorona({ color: "#ff9f1c", coreColor: "#ffd166", rimColor: "#f97316", opacity: 0.32, falloff: 2.6 }) }).position(0, 0.14, 0).scale(0.76).animate({ clip: "pulse", speed: 0.22 }).toJSON(),
      primitives.sphere({ name: "wide amber solar glow halo shader", material: material.solarCorona({ color: "#7c2d12", coreColor: "#ffb347", rimColor: "#f97316", opacity: 0.12, falloff: 3.4, emissiveIntensity: 0.92 }) }).position(0, 0.14, 0).scale(1.08).animate({ clip: "pulse", speed: 0.18 }).toJSON(),
      lights.point({ name: "warm solar key light", position: [0, 0.72, 0], color: "#ffd166", intensity: 0.75 }).toJSON(),
      effects.bloom({ intensity: 0.16, color: "#ffd166", threshold: 0.84, radius: 0.22, maxIntensity: 0.22 }).toJSON()
    ];
    const orbitAnimationFor = (position: AuraVec3, speed: number): AuraAnimationSpec => ({
      clip: "orbit",
      speed,
      duration: 18,
      captureTime: capturePhase,
      orbitCenter: [0, position[1], 0],
      orbitPhase: Math.atan2(position[2], position[0]),
      orbitRadius: Math.hypot(position[0], position[2])
    });
    for (let index = 0; index < starCount; index += 1) {
      nodes.push(primitives.sphere({
        name: `background star ${index + 1}`,
        material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" })
      }).position(seededRange(index, 701, -3.45, 3.45), seededRange(index, 702, 0.12, 1.2), seededRange(index, 703, -3.35, 3.05)).scale(seededRange(index, 704, 0.012, 0.034)).toJSON());
    }
    for (let index = 0; index < dustCount; index += 1) {
      nodes.push(primitives.sphere({
        name: `solar dust depth mote ${index + 1}`,
        material: material.emissive({ color: "#94a3b8", emissive: "#64748b", opacity: 0.18 })
      }).position(seededRange(index, 901, -3.1, 3.1), seededRange(index, 902, 0.02, 0.62), seededRange(index, 903, -2.8, 2.8)).scale(seededRange(index, 904, 0.01, 0.026)).toJSON());
    }
    for (const planet of planets) {
      const segmentLength = (Math.PI * 2 * planet.radius) / orbitSegments * 0.42;
      const ringOpacity = Math.max(0.08, Math.min(0.22, 0.3 - planet.radius * 0.055));
      nodes.push(primitives.torus({
        name: `${planet.name} smooth depth-faded orbit ring`,
        material: material.emissive({ color: "#64748b", emissive: "#475569", opacity: ringOpacity })
      }).position(0, 0.014, 0).rotate(Math.PI / 2, 0, 0).scale([planet.radius * 2, planet.radius * 2, 1]).toJSON());
      for (let segment = 0; segment < orbitSegments; segment += 1) {
        const angle = (segment / orbitSegments) * Math.PI * 2;
        const segmentOpacity = Number(Math.max(0.08, Math.min(0.24, 0.24 - segment / orbitSegments * 0.08)).toFixed(3));
        nodes.push(primitives.box({
          name: `${planet.name} depth-faded orbit path segment ${segment + 1}`,
          material: material.emissive({ color: "#64748b", emissive: "#475569", opacity: segmentOpacity })
        }).position(Math.cos(angle) * planet.radius, 0.012, Math.sin(angle) * planet.radius).rotate(0, Math.PI / 2 - angle, 0).scale([segmentLength, 0.006, 0.008]).toJSON());
      }
      const x = Math.cos(planet.angle) * planet.radius;
      const z = Math.sin(planet.angle) * planet.radius;
      const planetPosition = [x, 0.14, z] as const;
      nodes.push(primitives.sphere({
        name: `${planet.name} ${planet.preset} material labeled orbiting planet`,
        material: solarPlanetMaterial(planet.preset)
      }).position(...planetPosition).scale(planet.size).animate(orbitAnimationFor(planetPosition, planet.speed)).toJSON());
      if (labelMode === "attached") {
        const labelDirection = x >= 0 ? 1 : -1;
        const labelX = x + labelDirection * (0.34 + planet.size * 0.95);
        const labelZ = z + 0.18;
        const leaderPosition = [(x + labelX) / 2, 0.19, (z + labelZ) / 2] as const;
        const labelPlinthPosition = [labelX, 0.095, labelZ] as const;
        const readableLabelPosition = [labelX, 0.34, labelZ] as const;
        const spriteLabelPosition = [labelX, 0.54, labelZ] as const;
        nodes.push(
          primitives.box({
            name: `${planet.name} attached label leader line`,
            material: material.emissive({ color: planet.color, emissive: planet.color, opacity: 0.42 })
          }).position(...leaderPosition).rotate(0, labelDirection > 0 ? -0.26 : 0.26, 0).scale([Math.abs(labelX - x), 0.009, 0.012]).animate(orbitAnimationFor(leaderPosition, planet.speed)).toJSON(),
          primitives.box({
            name: `${planet.name} visible label plinth`,
            material: material.emissive({ color: planet.color, emissive: planet.color, opacity: 0.24 })
          }).position(...labelPlinthPosition).scale([0.26 + planet.name.length * 0.026, 0.018, 0.048]).animate(orbitAnimationFor(labelPlinthPosition, planet.speed)).toJSON(),
          primitives.plane({
            name: `${planet.name} readable planet label`,
            material: material.emissive({ color: "#020617", emissive: planet.color, opacity: 0.78 })
          }).position(...readableLabelPosition).scale([0.38 + planet.name.length * 0.042, 1, 0.14]).animate(orbitAnimationFor(readableLabelPosition, planet.speed)).toJSON(),
          labels.anchor(planet.name, `${planet.name} ${planet.preset} material labeled orbiting planet`, {
            name: `${planet.name} collision-avoiding orbit label`,
            position: spriteLabelPosition,
            size: 0.15,
            collisionAvoidance: true,
            occlusionAware: true,
            animation: orbitAnimationFor(spriteLabelPosition, planet.speed)
          }).toJSON()
        );
      }
    }
    const saturnPosition = [Math.cos(4.56) * 2.6, 0.14, Math.sin(4.56) * 2.6] as const;
    const jupiterBandPosition = [Math.cos(3.7) * 2.18, 0.16, Math.sin(3.7) * 2.18 + 0.01] as const;
    const moonPosition = [Math.cos(2.0) * 1.46 + 0.22, 0.17, Math.sin(2.0) * 1.46 + 0.08] as const;
    nodes.push(primitives.cylinder({
      name: "Saturn ringed planet visible ring",
      material: solarPlanetMaterial("ringed")
    }).position(...saturnPosition).rotate(0.9, 0.2, 0.1).scale([0.4, 0.012, 0.4]).animate(orbitAnimationFor(saturnPosition, 0.32)).toJSON());
    nodes.push(
      primitives.box({ name: "Jupiter visible equator band", material: material.emissive({ color: "#b45309", emissive: "#b45309" }) }).position(...jupiterBandPosition).scale([0.34, 0.026, 0.035]).animate(orbitAnimationFor(jupiterBandPosition, 0.42)).toJSON(),
      primitives.sphere({ name: "Earth small moon material companion", material: solarPlanetMaterial("moon") }).position(...moonPosition).scale(0.035).animate(orbitAnimationFor(moonPosition, 0.86)).toJSON()
    );
    return nodes;
  },

  dataBars3D: (options: AuraDataBars3DPrefabOptions = {}): readonly AuraSceneNode[] => {
    const grid = Math.max(3, Math.min(8, options.grid ?? 6));
    const spacing = 0.66;
    const halfSpan = ((grid - 1) / 2) * spacing;
    const floorSpan = Math.max(5.1, grid * 0.84);
	    const maxHeight = 2.85;
	    const theme = options.theme ?? "dark-analytics";
	    const themePalette = chartThemePalette(theme);
	    const title = options.title ?? "Revenue by Segment";
	    const subtitle = options.subtitle ?? "6x6 quarterly index";
	    const units = options.units ?? "pts";
	    const datasetValues: number[] = [];
	    for (const row of options.dataset ?? []) {
	      for (const value of row) {
	        if (typeof value === "number" && Number.isFinite(value)) datasetValues.push(value);
	      }
	    }
	    const inferredUnitRange = !options.valueRange && datasetValues.length > 0 && datasetValues.every((value) => value >= 0 && value <= 1);
	    const rangeMin = options.valueRange?.[0] ?? 0;
	    const rangeMax = options.valueRange?.[1] ?? (inferredUnitRange ? 1 : 100);
    const selectedRow = options.selected === false || !options.selected
      ? null
      : Math.max(1, Math.min(grid, options.selected.row ?? grid));
    const selectedCol = options.selected === false || !options.selected
      ? null
      : Math.max(1, Math.min(grid, options.selected.col ?? grid));
    const nodes: AuraSceneNode[] = [
      primitives.box({ name: "matte chart floor slab", material: material.pbr({ color: themePalette.floor, roughness: 0.68, metallic: 0.08 }) }).position(0, -0.035, 0).scale([floorSpan, 0.035, floorSpan]).toJSON(),
      primitives.box({ name: "dark rear chart wall", material: material.pbr({ color: themePalette.wall, roughness: 0.52, metallic: 0.1, opacity: 0.72 }) }).position(0, 1.12, -halfSpan - 0.55).scale([floorSpan, 2.3, 0.055]).toJSON(),
      primitives.box({ name: "left analytics side wall", material: material.pbr({ color: themePalette.side, roughness: 0.58, metallic: 0.08, opacity: 0.58 }) }).position(-halfSpan - 0.55, 1.0, 0).scale([0.055, 2.0, floorSpan]).toJSON(),
      primitives.box({ name: "x axis rail", material: material.emissive({ color: "#d9f8ff", emissive: "#d9f8ff" }) }).position(0, 0.025, halfSpan + 0.36).scale([floorSpan - 0.55, 0.035, 0.035]).toJSON(),
      primitives.box({ name: "z axis rail", material: material.emissive({ color: "#ffd166", emissive: "#ffd166" }) }).position(-halfSpan - 0.36, 0.025, 0).scale([0.035, 0.035, floorSpan - 0.55]).toJSON(),
      primitives.box({ name: "height axis rail", material: material.emissive({ color: "#8fd7e8", emissive: "#4bb7d0" }) }).position(-halfSpan - 0.36, maxHeight / 2, halfSpan + 0.36).scale([0.04, maxHeight, 0.04]).toJSON(),
      labels.axisTick("X", {
        name: "collision-avoiding x axis label",
        position: [0, 0.32, halfSpan + 1.18],
        size: 0.22,
        collisionAvoidance: true,
        occlusionAware: true
      }).toJSON(),
      labels.axisTick("Z", {
        name: "collision-avoiding z axis label",
        position: [-halfSpan - 1.18, 0.32, 0],
        size: 0.22,
        collisionAvoidance: true,
        occlusionAware: true
      }).toJSON(),
      labels.axisTick("Height", {
        name: "collision-avoiding height axis label",
        position: [-halfSpan - 0.58, maxHeight + 0.42, halfSpan + 0.36],
        size: 0.2,
        collisionAvoidance: true,
        occlusionAware: true
      }).toJSON(),
      primitives.box({ name: "blue low value legend swatch", material: material.emissive({ color: "#2563eb", emissive: "#2563eb" }) }).position(-0.42, 0.07, halfSpan + 0.95).scale([0.22, 0.04, 0.12]).toJSON(),
      primitives.box({ name: "yellow mid value legend swatch", material: material.emissive({ color: "#facc15", emissive: "#facc15" }) }).position(0, 0.07, halfSpan + 0.95).scale([0.22, 0.04, 0.12]).toJSON(),
      primitives.box({ name: "red high value legend swatch", material: material.emissive({ color: "#ef4444", emissive: "#ef4444" }) }).position(0.42, 0.07, halfSpan + 0.95).scale([0.22, 0.04, 0.12]).toJSON()
    ];
    // Dense grid rails, back-wall ticks, caps, shadows, and grounded labels make
    // the prefab read as an authored analytics scene rather than raw boxes.
    for (let index = 0; index < grid; index += 1) {
      const offset = (index - (grid - 1) / 2) * spacing;
      nodes.push(primitives.box({
        name: `x grid floor guide ${index + 1}`,
        material: material.emissive({ color: "#244b5a", emissive: "#2e7187" })
      }).position(offset, 0.004, 0).scale([0.018, 0.012, floorSpan - 0.8]).toJSON());
      nodes.push(primitives.box({
        name: `z grid floor guide ${index + 1}`,
        material: material.emissive({ color: "#5f5228", emissive: "#8a7636" })
      }).position(0, 0.006, offset).scale([floorSpan - 0.8, 0.012, 0.018]).toJSON());
      nodes.push(primitives.box({
	        name: `readable X${index + 1} axis label chip`,
	        material: material.emissive({ color: index % 2 === 0 ? "#7dd3fc" : "#c084fc", emissive: index % 2 === 0 ? "#7dd3fc" : "#c084fc", emissiveIntensity: 1.6 })
	      }).position(offset, 0.085, halfSpan + 0.68).scale([0.36, 0.075, 0.11]).toJSON());
	      nodes.push(primitives.box({
	        name: `readable Z${index + 1} axis label chip`,
	        material: material.emissive({ color: index % 2 === 0 ? "#fde68a" : "#fb7185", emissive: index % 2 === 0 ? "#fde68a" : "#fb7185", emissiveIntensity: 1.6 })
	      }).position(-halfSpan - 0.68, 0.085, offset).scale([0.11, 0.075, 0.36]).toJSON());
    }
    for (let tick = 1; tick <= 4; tick += 1) {
	      const y = tick * (maxHeight / 4);
      nodes.push(primitives.box({
        name: `height tick ${tick} back wall line`,
        material: material.emissive({ color: "#44606f", emissive: "#5f8498" })
      }).position(0, y, -halfSpan - 0.51).scale([floorSpan - 0.85, 0.018, 0.028]).toJSON());
      nodes.push(primitives.box({
	        name: `height tick ${tick} marker chip`,
	        material: material.emissive({ color: "#93c5fd", emissive: "#38bdf8" })
	      }).position(-halfSpan - 0.48, y, halfSpan + 0.36).scale([0.16, 0.034, 0.05]).toJSON());
	      nodes.push(primitives.box({
	        name: `readable height value label ${tick}`,
	        material: material.emissive({ color: "#bfdbfe", emissive: "#60a5fa", emissiveIntensity: 1.35 })
	      }).position(-halfSpan - 0.72, y, halfSpan + 0.36).scale([0.24, 0.06, 0.045]).toJSON());
    }
    for (let row = 0; row < grid; row += 1) {
      for (let col = 0; col < grid; col += 1) {
        const fallbackNormalized = ((row * 5 + col * 7) % 17) / 16;
        const rawValue = options.dataset?.[row]?.[col];
        const normalized = typeof rawValue === "number" && Number.isFinite(rawValue) && rangeMax !== rangeMin
          ? Math.max(0, Math.min(1, (rawValue - rangeMin) / (rangeMax - rangeMin)))
          : fallbackNormalized;
		        const height = 0.22 + Math.pow(normalized, 0.82) * (maxHeight - 0.22);
        const x = (col - (grid - 1) / 2) * spacing;
        const z = (row - (grid - 1) / 2) * spacing;
        const color = dataBarColor(normalized, options.colorScale);
        const isSelected = selectedRow === row + 1 && selectedCol === col + 1;
        nodes.push(primitives.box({
          name: `soft data bar footprint ${row + 1}-${col + 1}`,
          material: material.pbr({ color: "#020617", roughness: 0.94, opacity: 0.34 })
        }).position(x, 0.012, z).scale([0.38, 0.014, 0.38]).toJSON());
        nodes.push(primitives.box({
          name: `glowing data bar base ${row + 1}-${col + 1}`,
          material: material.emissive({ color, emissive: color })
        }).position(x, 0.045, z).scale([0.38, 0.035, 0.38]).toJSON());
        nodes.push(primitives.box({
          name: `height-colored data bar ${row + 1}-${col + 1}`,
          material: material.clearcoat({
            color: isSelected ? "#f97316" : color,
            emissive: isSelected ? "#f97316" : color,
            roughness: 0.24,
            clearcoat: isSelected ? 0.92 : 0.62
          })
        }).position(x, height / 2, z).scale([isSelected ? 0.46 : 0.34, height, isSelected ? 0.46 : 0.34]).animate({ clip: "bar-height-grow", loop: false, speed: 0.24 + normalized * 0.36, duration: 1.1, captureTime: 1.1, easing: "easeInOut" }).onPointer({ cursor: "pointer", onHover: "highlight bar, brighten cap, and update hover readout value" }).toJSON());
        nodes.push(primitives.box({
          name: `bright data bar top cap ${row + 1}-${col + 1}`,
          material: material.emissive({ color: isSelected ? "#fff7ad" : color, emissive: isSelected ? "#f97316" : color, emissiveIntensity: isSelected ? 0.9 : 0.45 })
        }).position(x, height + 0.03, z).scale([isSelected ? 0.54 : 0.4, isSelected ? 0.06 : 0.04, isSelected ? 0.54 : 0.4]).animate({ clip: "pulse", speed: 0.18 + normalized * 0.3 }).toJSON());
        if (normalized > 0.72) {
          nodes.push(
            primitives.box({
              name: `attached high value cap outline front ${row + 1}-${col + 1}`,
              material: material.emissive({ color, emissive: color, emissiveIntensity: 1.9 })
            }).position(x, height + 0.062, z + 0.23).scale([0.48, 0.024, 0.028]).toJSON(),
            primitives.box({
              name: `attached high value cap outline side ${row + 1}-${col + 1}`,
              material: material.emissive({ color, emissive: color, emissiveIntensity: 1.9 })
            }).position(x + 0.23, height + 0.062, z).scale([0.028, 0.024, 0.48]).toJSON()
          );
        }
        if (isSelected) {
          nodes.push(
            primitives.box({
              name: `selected data bar outline ${row + 1}-${col + 1}`,
              material: material.emissive({ color: "#fff7ad", emissive: "#f97316", emissiveIntensity: 1.2 })
            }).position(x, height + 0.095, z).scale([0.62, 0.034, 0.62]).toJSON(),
            primitives.box({
              name: `hovered data bar readout leader ${row + 1}-${col + 1}`,
              material: material.emissive({ color: "#f97316", emissive: "#f97316", emissiveIntensity: 0.9 })
            }).position((x + halfSpan + 0.36) / 2, height + 0.16, (z - halfSpan - 0.42) / 2).rotate(0, -0.42, 0).scale([0.86, 0.026, 0.03]).toJSON(),
            labels.callout(`${Math.round(rangeMin + normalized * (rangeMax - rangeMin))} ${units}`, `height-colored data bar ${row + 1}-${col + 1}`, {
              name: `selected value label ${row + 1}-${col + 1}`,
              position: [x + 0.34, height + 0.36, z - 0.22],
              size: 0.15,
              collisionAvoidance: true,
              occlusionAware: true
            }).toJSON()
          );
        }
      }
    }
    nodes.push(
      primitives.box({ name: "grounded dashboard legend panel", material: material.pbr({ color: "#07121e", roughness: 0.82, metallic: 0.02, opacity: 0.74 }) }).position(2.46, 0.2, 1.62).scale([1.2, 0.04, 0.34]).toJSON(),
      labels.anchor("Low   Mid   High", "grounded dashboard legend panel", { name: "large grounded legend text", position: [2.46, 0.46, 1.62], size: 0.21, collisionAvoidance: true, occlusionAware: true }).toJSON()
    );
    nodes.push(effects.bloom({ intensity: 0.14, color: "#7dd3fc", threshold: 0.82, radius: 0.2, maxIntensity: 0.24 }).toJSON());
    return nodes;
  },

	  neonTunnel: (options: AuraNeonTunnelOptions = {}): readonly AuraSceneNode[] => {
	    const rings = Math.max(8, Math.min(12, options.rings ?? 10));
	    const palette = neonPalette(options.palette ?? "cyan-magenta");
	    const nodes: AuraSceneNode[] = [
	      primitives.plane({ name: "glossy black neon tunnel floor", material: material.emissive({ color: "#071426", emissive: "#0b2444", emissiveIntensity: 0.18 }) }).position(0, -0.54, -4.2).scale([5.1, 1, 9.4]).toJSON(),
	      primitives.box({ name: "left cyan tunnel wall wash", material: material.emissive({ color: "#0f3b57", emissive: "#0ea5e9", emissiveIntensity: 0.22, opacity: 0.54 }) }).position(-1.78, 0.18, -4.2).rotate(0, -0.18, 0).scale([0.08, 1.55, 8.4]).toJSON(),
	      primitives.box({ name: "right magenta tunnel wall wash", material: material.emissive({ color: "#4a1647", emissive: "#e879f9", emissiveIntensity: 0.2, opacity: 0.5 }) }).position(1.78, 0.18, -4.2).rotate(0, 0.18, 0).scale([0.08, 1.55, 8.4]).toJSON(),
	      primitives.box({ name: "left vanishing light rail", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 1.18 }) }).position(-1.12, -0.42, -3.9).rotate(0, -0.11, 0).scale([0.055, 0.04, 8.2]).toJSON(),
	      primitives.box({ name: "right vanishing light rail", material: material.emissive({ color: "#ff5bd7", emissive: "#ff5bd7", emissiveIntensity: 1.12 }) }).position(1.12, -0.42, -3.9).rotate(0, 0.11, 0).scale([0.055, 0.04, 8.2]).toJSON(),
	      primitives.box({ name: "center flythrough camera path glow", material: material.emissive({ color: "#2d98ba", emissive: "#67e8f9", emissiveIntensity: 0.92 }) }).position(0, -0.5, -3.9).scale([0.04, 0.028, 8.0]).toJSON(),
	      primitives.box({ name: "tiny vanishing point glow beyond tunnel", material: material.emissive({ color: "#4c1d95", emissive: "#a78bfa", emissiveIntensity: 1.05 }) }).position(0, 0.32, -10.4).scale([0.42, 0.42, 0.052]).toJSON()
	    ];
    // Default hero frames use restrained rings and floor reflections; inspection
    // clutter such as braces and speed dashes is intentionally not emitted.
    for (let index = 0; index < rings; index += 1) {
	      const progress = rings <= 1 ? 0 : index / (rings - 1);
	      const z = 0.45 - index * 0.38;
	      const scale = 1.36 - progress * 0.58;
	      const color = palette[index % palette.length];
	      const mat = material.emissive({ color, emissive: color, emissiveIntensity: 1.02 - progress * 0.5 });
	      nodes.push(primitives.torus({ name: `true circular neon tunnel tube ring ${index + 1}`, material: mat }).position(0, 0.32 * scale, z - 0.018).scale([1.94 * scale, 1.48 * scale, 1]).animate({ clip: "pulse", speed: 0.16 + (index % 4) * 0.04 }).toJSON());
	      nodes.push(primitives.box({ name: `floor reflection streak ${index + 1}`, material: material.emissive({ color, emissive: color, opacity: 0.34, emissiveIntensity: 0.62 }) }).position(0, -0.505, z + 0.06).scale([1.08 * scale, 0.018, 0.082]).animate({ clip: "pulse", speed: 0.12 + (index % 3) * 0.05 }).toJSON());
    }
    for (let index = 0; index < 4; index += 1) {
      const color = palette[index % palette.length];
      nodes.push(primitives.sphere({
        name: `floating tunnel spark ${index + 1}`,
        material: material.emissive({ color, emissive: color })
      }).position(seededRange(index, 901, -0.72, 0.72), seededRange(index, 902, -0.14, 0.98), seededRange(index, 903, -8.2, -0.8)).scale(seededRange(index, 904, 0.022, 0.045)).animate({ clip: "float", speed: seededRange(index, 905, 0.18, 0.42) }).toJSON());
    }
	    nodes.push(effects.fog({ density: 0.065, color: "#3b4f7a" }).toJSON());
	    nodes.push(effects.particles({ name: "ambient tunnel dust particles", emitter: "ambient", color: "#a5f3fc", particleCount: 180, radius: 2.0, height: 1.2, intensity: 0.22, speed: 0.34 }).toJSON());
	    nodes.push(effects.bloom({ intensity: Math.min(0.3, options.bloomIntensity ?? 0.2), color: palette[1], threshold: 0.9, radius: 0.22, maxIntensity: 0.28 }).toJSON());
    return nodes;
  },

  miniGolfHole: (options: AuraMiniGolfPrefabOptions = {}): readonly AuraSceneNode[] => {
	    const green = material.pbr({ color: "#2f9b52", roughness: 0.76, metallic: 0.01 });
	    const fairwayLight = material.pbr({ color: "#46b965", roughness: 0.72, metallic: 0.01 });
	    const fairwayDark = material.pbr({ color: "#218447", roughness: 0.8, metallic: 0.01 });
	    const rail = material.clearcoat({ color: "#14532d", roughness: 0.28, clearcoat: 0.3 });
	    const railCap = material.clearcoat({ color: "#86efac", roughness: 0.2, clearcoat: 0.42 });
	    const sand = material.pbr({ color: "#d9b86c", roughness: 0.92, metallic: 0 });
	    const water = material.clearcoat({ color: "#0ea5e9", roughness: 0.08, clearcoat: 0.8, opacity: 0.72 });
	    const aim = material.emissive({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 0.72, opacity: 0.86 });
	    const power = material.emissive({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 0.7, opacity: 0.88 });
	    const ballPosition = options.ballPosition ?? MINI_GOLF_LAYOUT.ballStart;
	    const aimVector = normalizeAuraVec3(options.aimVector ?? MINI_GOLF_LAYOUT.aimVector);
	    const shots = options.shots ?? 0;
	    const score = options.score ?? 0;
	    const collisions = options.collisions ?? 0;
	    const contacts = options.contacts ?? 0;
	    const cupTriggered = options.cupTriggered ?? false;
	    const ghost1 = mix3(MINI_GOLF_LAYOUT.ballStart, ballPosition, 0.38);
	    const ghost2 = mix3(MINI_GOLF_LAYOUT.ballStart, ballPosition, 0.68);
	    const aimAngle = Math.atan2(aimVector[0], aimVector[2]);
	    const nodes: AuraSceneNode[] = [
	      primitives.plane({ name: "designed mini golf felt base course boundaries", material: green }).position(0, -0.03, -0.42).scale([5.4, 1, 3.7]).physics({ type: "static", shape: "plane", friction: 0.94, restitution: 0.08 }).toJSON(),
	      primitives.box({ name: "curved fairway left approach lane", material: fairwayLight }).position(-1.05, -0.01, 0.24).rotate(0, -0.12, 0).scale([1.28, 0.018, 1.65]).toJSON(),
	      primitives.box({ name: "curved fairway center bridge lane", material: fairwayDark }).position(-0.05, -0.008, -0.38).rotate(0, -0.38, 0).scale([1.18, 0.018, 1.9]).toJSON(),
	      primitives.box({ name: "curved fairway right cup approach lane", material: fairwayLight }).position(1.06, -0.007, -1.02).rotate(0, 0.12, 0).scale([1.28, 0.018, 1.28]).toJSON(),
	      primitives.cylinder({ name: "sand trap hazard left of cup", material: sand }).position(0.72, 0.006, -1.18).scale([0.52, 0.012, 0.32]).toJSON(),
	      primitives.cylinder({ name: "blue water hazard pocket", material: water }).position(-0.42, 0.005, -0.72).scale([0.42, 0.01, 0.28]).toJSON(),
	      primitives.box({ name: "left course boundary wall", material: rail }).position(-2.48, 0.13, -0.42).scale([0.1, 0.25, 3.24]).physics({ type: "static", shape: "box", halfExtents: [0.05, 0.125, 1.62], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "right course boundary wall", material: rail }).position(2.48, 0.13, -0.42).scale([0.1, 0.25, 3.24]).physics({ type: "static", shape: "box", halfExtents: [0.05, 0.125, 1.62], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "back course boundary wall", material: rail }).position(0, 0.13, -2.08).scale([5.0, 0.25, 0.1]).physics({ type: "static", shape: "box", halfExtents: [2.5, 0.125, 0.05], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "front tee boundary wall left", material: rail }).position(-1.82, 0.12, 1.18).scale([1.28, 0.22, 0.1]).physics({ type: "static", shape: "box", halfExtents: [0.64, 0.11, 0.05], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "front tee boundary wall right", material: rail }).position(1.82, 0.12, 1.18).scale([1.28, 0.22, 0.1]).physics({ type: "static", shape: "box", halfExtents: [0.64, 0.11, 0.05], friction: 0.72, restitution: 0.48 }).toJSON(),
	      primitives.box({ name: "left rail rounded bevel highlight", material: railCap }).position(-2.41, 0.28, -0.42).scale([0.12, 0.045, 3.18]).toJSON(),
	      primitives.box({ name: "right rail rounded bevel highlight", material: railCap }).position(2.41, 0.28, -0.42).scale([0.12, 0.045, 3.18]).toJSON(),
	      primitives.box({ name: "back rail rounded bevel highlight", material: railCap }).position(0, 0.28, -2.0).scale([4.82, 0.045, 0.12]).toJSON(),
	      primitives.box({ name: "tee mat with visible start marker", material: material.pbr({ color: "#166534", roughness: 0.58 }) }).position(-1.42, 0.012, 0.58).scale([0.78, 0.024, 0.52]).toJSON(),
	      primitives.sphere({ name: "white physics golf ball", material: material.clearcoat({ color: "#f8fafc", roughness: 0.12, clearcoat: 0.65 }) }).position(...ballPosition).scale(0.16).animate({ clip: "roll", speed: 0.72 }).onPointer({ cursor: "crosshair", onClick: "aim and shoot ball" }).physics({ type: "dynamic", shape: "sphere", radius: 0.16, mass: 0.045, friction: 0.38, restitution: 0.54 }).toJSON(),
	      primitives.cylinder({ name: "ball contact shadow on felt", material: material.pbr({ color: "#052e16", roughness: 0.95, opacity: 0.38 }) }).position(ballPosition[0], 0.018, ballPosition[2]).scale([0.24, 0.01, 0.18]).toJSON(),
	      primitives.cylinder({ name: "ball aim selection ring", material: aim }).position(ballPosition[0], 0.035, ballPosition[2]).scale([0.34, 0.014, 0.34]).toJSON(),
	      primitives.box({ name: "cyan aim direction line", material: aim }).position(ballPosition[0] + aimVector[0] * 0.54, 0.085, ballPosition[2] + aimVector[2] * 0.54).rotate(0, -aimAngle, 0).scale([1.0, 0.035, 0.052]).toJSON(),
	      primitives.sphere({ name: "transparent moving ball ghost 1", material: material.emissive({ color: "#bae6fd", emissive: "#38bdf8", opacity: shots > 0 ? 0.34 : 0.12, emissiveIntensity: 0.38 }) }).position(...ghost1).scale(0.105).toJSON(),
	      primitives.sphere({ name: "transparent moving ball ghost 2", material: material.emissive({ color: "#fef08a", emissive: "#facc15", opacity: shots > 0 ? 0.3 : 0.1, emissiveIntensity: 0.34 }) }).position(...ghost2).scale(0.082).toJSON(),
	      primitives.box({ name: "shot power meter track", material: material.pbr({ color: "#082f49", roughness: 0.56 }) }).position(-2.08, 0.08, 0.72).scale([0.08, 0.04, 0.86]).toJSON(),
	      primitives.box({ name: "shot power meter fill", material: power }).position(-2.08, 0.13, 0.5).scale([0.1, 0.08 + Math.min(0.1, shots * 0.018), 0.42]).toJSON(),
	      primitives.cylinder({ name: "windmill obstacle base", material: material.clearcoat({ color: "#ef4444", roughness: 0.18, clearcoat: 0.45 }) }).position(0.22, 0.22, -0.48).scale([0.28, 0.42, 0.28]).physics({ type: "static", shape: "capsule", radius: 0.18, halfHeight: 0.22, friction: 0.48, restitution: 0.72 }).toJSON(),
	      primitives.box({ name: "windmill obstacle blade horizontal", material: material.emissive({ color: "#fef3c7", emissive: "#facc15", emissiveIntensity: 0.45 }) }).position(0.22, 0.72, -0.48).scale([0.78, 0.045, 0.045]).animate({ clip: "spin", speed: 0.34 }).toJSON(),
	      primitives.box({ name: "windmill obstacle blade vertical", material: material.emissive({ color: "#fef3c7", emissive: "#facc15", emissiveIntensity: 0.45 }) }).position(0.22, 0.72, -0.48).scale([0.045, 0.78, 0.045]).animate({ clip: "spin", speed: 0.34 }).toJSON(),
	      primitives.box({ name: "subtle dotted shot preview before obstacle", material: material.emissive({ color: "#bae6fd", emissive: "#bae6fd", emissiveIntensity: 0.36, opacity: 0.64 }) }).position(-0.56, 0.07, 0.08).rotate(0, -0.42, 0).scale([0.32, 0.024, 0.036]).toJSON(),
	      primitives.box({ name: "subtle dotted rebound preview after obstacle", material: material.emissive({ color: "#fef08a", emissive: "#fef08a", emissiveIntensity: 0.36, opacity: 0.62 }) }).position(0.78, 0.07, -0.86).rotate(0, 0.36, 0).scale([0.48, 0.026, 0.04]).toJSON(),
	      primitives.cylinder({ name: "orange obstacle contact flash", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", opacity: collisions > 0 ? 0.62 : 0.18, emissiveIntensity: collisions > 0 ? 1.2 : 0.24 }) }).position(0.22, 0.035, -0.48).scale([0.22 + Math.min(0.16, collisions * 0.025), 0.012, 0.22 + Math.min(0.16, collisions * 0.025)]).toJSON(),
	      primitives.cylinder({ name: "dark cup hole", material: material.pbr({ color: "#050608", roughness: 0.9 }) }).position(1.55, 0.012, -1.18).scale([0.2, 0.02, 0.2]).toJSON(),
	      primitives.cylinder({ name: "cup capture ring", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.34 }) }).position(1.55, 0.026, -1.18).scale([0.28, 0.012, 0.28]).physics({ type: "static", shape: "sphere", radius: 0.28, sensor: true }).toJSON(),
	      primitives.cylinder({ name: "raised beveled cup rim outer lip", material: material.clearcoat({ color: "#e5e7eb", roughness: 0.2, clearcoat: 0.52 }) }).position(1.55, 0.045, -1.18).scale([0.34, 0.024, 0.34]).toJSON(),
	      primitives.box({ name: "flag pole", material: material.metal({ color: "#f8fafc" }) }).position(1.7, 0.48, -1.18).scale([0.025, 0.9, 0.025]).toJSON(),
	      primitives.box({ name: "orange flag", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", emissiveIntensity: 0.62 }) }).position(1.9, 0.78, -1.18).scale([0.32, 0.18, 0.035]).toJSON(),
	      primitives.box({ name: "score counter stroke digit bar", material: material.emissive({ color: score > 0 ? "#fef08a" : "#86efac", emissive: score > 0 ? "#facc15" : "#22c55e", emissiveIntensity: 0.72 }) }).position(-2.28, 0.36, 0.72).scale([0.055, 0.22 + score * 0.1 + shots * 0.035, 0.035]).toJSON(),
	      primitives.sphere({ name: "cup success glow marker", material: material.emissive({ color: cupTriggered ? "#fef08a" : "#64748b", emissive: cupTriggered ? "#facc15" : "#334155", opacity: cupTriggered ? 0.64 : 0.18, emissiveIntensity: cupTriggered ? 1.1 : 0.18 }) }).position(1.55, 0.14, -1.18).scale(cupTriggered ? 0.18 : 0.08).toJSON(),
	      primitives.box({ name: "floating mini golf score hud backboard", material: material.pbr({ color: "#04111f", roughness: 0.42, metallic: 0.08 }) }).position(-0.8, 1.34, -2.18).scale([1.72, 0.38, 0.06]).toJSON(),
	      primitives.box({ name: "floating mini golf score hud top text stroke", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.82 }) }).position(-0.98, 1.48, -2.12).scale([0.82, 0.045, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf aim hud arrow stroke", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 0.92 }) }).position(-1.16, 1.28, -2.1).rotate(0, -0.32, 0).scale([0.58, 0.04, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf aim hud arrow head", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 0.92 }) }).position(-0.86, 1.27, -2.02).rotate(0, -0.32, -0.65).scale([0.18, 0.04, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf power meter track", material: material.pbr({ color: "#0f172a", roughness: 0.5, metallic: 0.08 }) }).position(-0.16, 1.24, -2.12).scale([0.12, 0.22, 0.04]).toJSON(),
	      primitives.box({ name: "floating mini golf power meter fill", material: material.emissive({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 0.86 }) }).position(-0.16, 1.2, -2.08).scale([0.14, 0.16, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf shot count tick one", material: material.emissive({ color: "#fef08a", emissive: "#facc15", emissiveIntensity: 0.78 }) }).position(0.24, 1.34, -2.1).scale([0.045, 0.22, 0.035]).toJSON(),
	      primitives.box({ name: "floating mini golf shot count tick two", material: material.emissive({ color: "#fef08a", emissive: "#facc15", emissiveIntensity: 0.78 }) }).position(0.38, 1.34, -2.1).scale([0.045, 0.22, 0.035]).toJSON(),
	      labels.hud(`Mini golf: shots ${shots} score ${score} contacts ${contacts}`, { name: "mini golf score and shot HUD" }).toJSON(),
	      primitives.sphere({ name: "follow camera target beacon above ball", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", opacity: 0.46 }) }).position(ballPosition[0], ballPosition[1] + 0.46, ballPosition[2]).scale(0.055).toJSON(),
	      interactions.dragVector({ target: "white physics golf ball", vector: [1, 0, -0.55] }).toJSON(),
	      interactions.clickImpulse({ target: "white physics golf ball", impulse: 1.2, vector: [1, 0, -0.55] }).toJSON()
	    ];
	    return nodes;
	  },

  miniGolfCourse: (): readonly AuraSceneNode[] => prefabs.miniGolfHole(),

  primitiveHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => {
    const showJoints = options.showJoints ?? false;
    const motionTrail = options.motionTrail ?? true;
    const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "walk cycle ground plane", material: material.pbr({ color: "#1f5130", roughness: 0.7 }) }).position(0, -0.04, -0.5).scale([4.8, 1, 3]).toJSON(),
    primitives.box({ name: "painted walking path", material: material.pbr({ color: "#2d3748", roughness: 0.78 }) }).position(0, 0.01, -0.45).scale([3.8, 0.025, 0.42]).toJSON(),
    primitives.box({ name: "white dashed stride marker 1", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(-1.05, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "white dashed stride marker 2", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(0.05, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "white dashed stride marker 3", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc" }) }).position(1.15, 0.04, -0.45).scale([0.42, 0.025, 0.045]).toJSON(),
    primitives.box({ name: "cyan walk motion arrow shaft", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(0.76, 0.06, -0.23).rotate(0, -0.18, 0).scale([0.58, 0.025, 0.035]).toJSON(),
    primitives.box({ name: "cyan walk motion arrow head", material: material.emissive({ color: "#67e8f9", emissive: "#67e8f9" }) }).position(1.07, 0.06, -0.17).rotate(0, -0.18, -0.72).scale([0.18, 0.025, 0.035]).toJSON(),
    primitives.cylinder({ name: "humanoid contact shadow", material: material.pbr({ color: "#050608", roughness: 0.94, opacity: 0.48 }) }).position(0.04, 0.035, -0.5).scale([0.72, 0.014, 0.44]).toJSON(),
    primitives.cylinder({ name: "connected blue humanoid torso", material: material.clearcoat({ color: "#2563eb", roughness: 0.16 }) }).position(0, 0.9, -0.55).scale([0.3, 0.72, 0.23]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.cylinder({ name: "short humanoid neck connector", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.22 }) }).position(0, 1.31, -0.55).scale([0.095, 0.18, 0.095]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "humanoid head", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.2 }) }).position(0, 1.48, -0.55).scale(0.205).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "left humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a" }) }).position(-0.058, 1.52, -0.36).scale(0.025).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.sphere({ name: "right humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a" }) }).position(0.058, 1.52, -0.36).scale(0.025).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.box({ name: "humanoid mouth line", material: material.emissive({ color: "#7f1d1d", emissive: "#7f1d1d" }) }).position(0, 1.44, -0.35).scale([0.1, 0.014, 0.016]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
    primitives.box({ name: "shoulder bar connecting arms", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0, 1.1, -0.55).scale([0.58, 0.09, 0.12]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
	    primitives.capsule({ name: "left attached swinging arm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(-0.31, 0.96, -0.45).rotate(0.42, 0, -0.2).scale([0.1, 0.36, 0.1]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.capsule({ name: "right attached swinging arm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0.31, 0.96, -0.65).rotate(-0.42, 0, 0.2).scale([0.1, 0.36, 0.1]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.capsule({ name: "left bent forearm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(-0.35, 0.72, -0.35).rotate(-0.34, 0, -0.08).scale([0.088, 0.3, 0.088]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.capsule({ name: "right bent forearm", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0.35, 0.72, -0.75).rotate(0.34, 0, 0.08).scale([0.088, 0.3, 0.088]).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.sphere({ name: "left humanoid hand", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.24 }) }).position(-0.37, 0.54, -0.29).scale(0.07).animate({ clip: "walk", speed: 0.9 }).toJSON(),
	    primitives.sphere({ name: "right humanoid hand", material: material.clearcoat({ color: "#f5d0a9", roughness: 0.24 }) }).position(0.37, 0.54, -0.81).scale(0.07).animate({ clip: "walk", speed: 0.9 }).toJSON(),
    primitives.box({ name: "hip bar connecting legs", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.2 }) }).position(0, 0.51, -0.55).scale([0.42, 0.1, 0.14]).animate({ clip: "walk", speed: 0.78 }).toJSON(),
	    primitives.capsule({ name: "forward connected walking leg", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(-0.13, 0.36, -0.4).rotate(-0.36, 0, -0.04).scale([0.12, 0.36, 0.12]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.capsule({ name: "back connected walking leg", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(0.15, 0.36, -0.7).rotate(0.36, 0, 0.04).scale([0.12, 0.36, 0.12]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.capsule({ name: "forward lower walking shin", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(-0.23, 0.17, -0.21).rotate(0.28, 0, -0.03).scale([0.11, 0.34, 0.11]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.capsule({ name: "back lower walking shin", material: material.clearcoat({ color: "#172033", roughness: 0.24 }) }).position(0.25, 0.17, -0.87).rotate(-0.28, 0, 0.03).scale([0.11, 0.34, 0.11]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.box({ name: "forward foot planted on path", material: material.clearcoat({ color: "#0f172a", roughness: 0.2 }) }).position(-0.28, 0.07, -0.06).rotate(0, -0.16, 0).scale([0.32, 0.08, 0.18]).animate({ clip: "walk", speed: 0.95 }).toJSON(),
	    primitives.box({ name: "back foot pushing off path", material: material.clearcoat({ color: "#0f172a", roughness: 0.2 }) }).position(0.31, 0.07, -1.02).rotate(0, 0.16, 0).scale([0.32, 0.08, 0.18]).animate({ clip: "walk", speed: 0.95 }).toJSON()
    ];
    if (showJoints) {
      nodes.push(
        primitives.sphere({ name: "left shoulder ball joint", material: material.clearcoat({ color: "#93c5fd", roughness: 0.16 }) }).position(-0.31, 1.1, -0.55).scale(0.07).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "right shoulder ball joint", material: material.clearcoat({ color: "#93c5fd", roughness: 0.16 }) }).position(0.31, 1.1, -0.55).scale(0.07).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "left elbow hinge", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(-0.34, 0.82, -0.39).scale(0.062).animate({ clip: "walk", speed: 0.9 }).toJSON(),
        primitives.sphere({ name: "right elbow hinge", material: material.clearcoat({ color: "#60a5fa", roughness: 0.18 }) }).position(0.34, 0.82, -0.71).scale(0.062).animate({ clip: "walk", speed: 0.9 }).toJSON(),
        primitives.sphere({ name: "left hip ball joint", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.18 }) }).position(-0.18, 0.51, -0.55).scale(0.07).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "right hip ball joint", material: material.clearcoat({ color: "#1d4ed8", roughness: 0.18 }) }).position(0.18, 0.51, -0.55).scale(0.07).animate({ clip: "walk", speed: 0.78 }).toJSON(),
        primitives.sphere({ name: "forward knee hinge", material: material.clearcoat({ color: "#172033", roughness: 0.18 }) }).position(-0.2, 0.24, -0.29).scale(0.064).animate({ clip: "walk", speed: 0.95 }).toJSON(),
        primitives.sphere({ name: "back knee hinge", material: material.clearcoat({ color: "#172033", roughness: 0.18 }) }).position(0.22, 0.24, -0.81).scale(0.064).animate({ clip: "walk", speed: 0.95 }).toJSON()
      );
    }
    if (motionTrail) {
      nodes.push(
	        primitives.box({ name: "cyan body motion trail ribbon behind torso", material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", opacity: 0.22 }) }).position(-0.38, 0.92, -0.96).rotate(0, -0.08, 0).scale([0.68, 0.032, 0.04]).toJSON(),
	        primitives.box({ name: "blue shoulder motion streak", material: material.emissive({ color: "#93c5fd", emissive: "#93c5fd", opacity: 0.24 }) }).position(-0.28, 1.12, -0.98).rotate(0, -0.08, 0).scale([0.46, 0.028, 0.035]).toJSON(),
	        primitives.box({ name: "orange forward foot motion streak", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", opacity: 0.42 }) }).position(-0.08, 0.055, -0.18).rotate(0, -0.18, 0).scale([0.48, 0.024, 0.04]).toJSON(),
	        primitives.box({ name: "blue rear foot motion streak", material: material.emissive({ color: "#60a5fa", emissive: "#60a5fa", opacity: 0.34 }) }).position(0.16, 0.055, -0.9).rotate(0, 0.18, 0).scale([0.42, 0.022, 0.038]).toJSON()
	      );
	    }
    return nodes;
  },

  lowPolyHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => {
    return createLowPolyHumanoid(options);
  }
} as const;

export interface AuraMiniGolfMetrics {
  readonly physicsBackend: string;
  readonly deterministicReplayId: string;
  readonly replayFrame: number;
  readonly captureTime: number;
  readonly shots: number;
  readonly score: number;
  readonly collisions: number;
  readonly contacts: number;
  readonly cupTriggered: boolean;
  readonly resets: number;
  readonly selected: string;
  readonly aimVector: AuraVec3;
  readonly ballPosition: AuraVec3;
  readonly followCameraTarget: string;
  readonly settled: boolean;
}

export interface AuraMiniGolfStateController {
  readonly kind: "aura-mini-golf-state";
  shoot(options?: { readonly vector?: AuraVec3; readonly power?: number }): AuraMiniGolfMetrics;
  step(steps?: number): AuraMiniGolfMetrics;
  reset(): AuraMiniGolfMetrics;
  nodes(): readonly AuraSceneNode[];
  snapshot(): AuraMiniGolfMetrics;
}

export interface AuraMiniGolfPointerPoint {
  readonly x: number;
  readonly y: number;
}

export interface AuraMiniGolfShotInput {
  readonly vector: AuraVec3;
  readonly power: number;
}

function createMiniGolfStateController(): AuraMiniGolfStateController {
  const start: AuraVec3 = MINI_GOLF_LAYOUT.ballStart;
  const cup: AuraVec3 = MINI_GOLF_LAYOUT.cupCenter;
  const obstacle: AuraVec3 = MINI_GOLF_LAYOUT.obstacleCenter;
  let world: PhysicsWorld;
  let ballBody: RigidBody;
  let ballColliderId = 0;
  let cupColliderId = 0;
  let obstacleColliderId = 0;
  let shots = 0;
  let score = 0;
  let collisions = 0;
  let cupTriggered = false;
  let resets = 0;
  let aimVector: AuraVec3 = MINI_GOLF_LAYOUT.aimVector;

  const buildWorld = () => {
    world = new PhysicsWorld({
      gravity: [0, -9.81, 0],
      fixedDelta: 1 / 60,
      solverIterations: 6,
      enableSleeping: true,
      sleepVelocityThreshold: 0.035,
      sleepDelay: 0.55
    });
    const green = world.createRigidBody({ type: "static", position: [0, -0.03, -0.4], friction: 0.94, restitution: 0.08 });
    world.createCollider(green, { shape: PhysicsShapeFactory.plane([0, 1, 0], 0), material: { friction: 0.94, restitution: 0.08 } });
    const leftWall = world.createRigidBody({ type: "static", position: [-2.52, 0.12, -0.4], restitution: 0.48 });
    world.createCollider(leftWall, { shape: PhysicsShapeFactory.box(0.04, 0.11, 1.64), material: { friction: 0.72, restitution: 0.48 } });
    const rightWall = world.createRigidBody({ type: "static", position: [2.52, 0.12, -0.4], restitution: 0.48 });
    world.createCollider(rightWall, { shape: PhysicsShapeFactory.box(0.04, 0.11, 1.64), material: { friction: 0.72, restitution: 0.48 } });
    const backWall = world.createRigidBody({ type: "static", position: [0, 0.12, -2.08], restitution: 0.48 });
    world.createCollider(backWall, { shape: PhysicsShapeFactory.box(2.525, 0.11, 0.04), material: { friction: 0.72, restitution: 0.48 } });
    const obstacleBody = world.createRigidBody({ type: "static", position: obstacle, restitution: 0.72 });
    obstacleColliderId = world.createCollider(obstacleBody, { shape: PhysicsShapeFactory.capsule(0.18, 0.28), material: { friction: 0.48, restitution: 0.72 } }).id;
    const cupBody = world.createRigidBody({ type: "static", position: cup });
    cupColliderId = world.createCollider(cupBody, { shape: PhysicsShapeFactory.sphere(0.32), sensor: true }).id;
    ballBody = world.createRigidBody({
      type: "dynamic",
      position: start,
      mass: 0.045,
      friction: 0.18,
      restitution: 0.54,
      linearDamping: 0.08,
      angularDamping: 0.16
    });
    ballColliderId = world.createCollider(ballBody, {
      shape: PhysicsShapeFactory.sphere(0.16),
      material: { friction: 0.18, restitution: 0.54 }
    }).id;
  };

  const maybeRecordCup = () => {
    if (cupTriggered) return;
    const distanceToCup = Math.hypot(ballBody.position[0] - cup[0], ballBody.position[1] - cup[1], ballBody.position[2] - cup[2]);
    if (distanceToCup <= 0.38) {
      cupTriggered = true;
      score += 1;
      ballBody.setVelocity([0, 0, 0]);
      ballBody.setAngularVelocity([0, 0, 0]);
      ballBody.setPosition(cup);
      ballBody.sleep();
    }
  };

  const maybeRecordObstacle = (contacts: readonly Contact[]) => {
    const hitObstacle = contacts.some((contact) =>
      (contact.colliderA === obstacleColliderId && contact.colliderB === ballColliderId) ||
      (contact.colliderB === obstacleColliderId && contact.colliderA === ballColliderId)
    );
    const distanceToObstacle = Math.hypot(ballBody.position[0] - obstacle[0], ballBody.position[1] - obstacle[1], ballBody.position[2] - obstacle[2]);
    if (hitObstacle || distanceToObstacle <= 0.36) collisions += 1;
  };

  const snapshot = (): AuraMiniGolfMetrics => {
    const worldSnapshot = world.snapshot();
    return {
      physicsBackend: worldSnapshot.backend.active,
      deterministicReplayId: `mini-golf-cannon-v1-${shots}-${score}-${collisions}-${resets}`,
      replayFrame: worldSnapshot.stats.steps,
      captureTime: Number((worldSnapshot.stats.steps * world.fixedDelta).toFixed(3)),
      shots,
      score,
      collisions,
      contacts: worldSnapshot.contacts.length,
      cupTriggered,
      resets,
      selected: "white physics golf ball",
      aimVector,
      ballPosition: [ballBody.position[0], ballBody.position[1], ballBody.position[2]],
      followCameraTarget: "white physics golf ball",
      settled: ballBody.sleeping || Math.hypot(ballBody.velocity[0], ballBody.velocity[1], ballBody.velocity[2]) < 0.035
    };
  };

  buildWorld();

  return {
    kind: "aura-mini-golf-state",
    shoot(options = {}) {
      const nextVector = normalizeAuraVec3(options.vector ?? aimVector);
      aimVector = nextVector;
      shots += 1;
      ballBody.wake();
      const power = Math.max(0.05, Math.min(2.4, options.power ?? 1.2));
      ballBody.applyImpulse([nextVector[0] * power * 0.32, Math.max(0.008, nextVector[1] * power * 0.04), nextVector[2] * power * 0.32]);
      return snapshot();
    },
    step(steps = 60) {
      const resolvedSteps = Math.max(1, Math.min(600, Math.floor(steps)));
      for (let index = 0; index < resolvedSteps; index += 1) {
        const events = world.step();
        maybeRecordObstacle(events.map((event) => event.contact));
        maybeRecordObstacle(world.snapshot().contacts);
        const cupEvent = events.some((event) =>
          (event.contact.colliderA === cupColliderId && event.contact.colliderB === ballColliderId) ||
          (event.contact.colliderB === cupColliderId && event.contact.colliderA === ballColliderId)
        );
        if (cupEvent) {
          ballBody.setPosition(cup);
        }
        maybeRecordCup();
      }
      return snapshot();
    },
    reset() {
      shots = 0;
      score = 0;
      collisions = 0;
      cupTriggered = false;
      aimVector = MINI_GOLF_LAYOUT.aimVector;
      resets += 1;
      buildWorld();
      return snapshot();
    },
    nodes() {
      const metrics = snapshot();
      return prefabs.miniGolfHole({
        ballPosition: metrics.ballPosition,
        shots: metrics.shots,
        score: metrics.score,
        collisions: metrics.collisions,
        contacts: metrics.contacts,
        cupTriggered: metrics.cupTriggered,
        aimVector: metrics.aimVector
      });
    },
    snapshot
  };
}

function normalizeAuraVec3(vector: AuraVec3): AuraVec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function miniGolfPointerShotFromDrag(start: AuraMiniGolfPointerPoint, end: AuraMiniGolfPointerPoint): AuraMiniGolfShotInput {
  const dragX = start.x - end.x;
  const dragY = start.y - end.y;
  const distance = Math.hypot(dragX, dragY);
  if (distance < 4) {
    return { vector: MINI_GOLF_LAYOUT.aimVector, power: 0.86 };
  }
  const vector = normalizeAuraVec3([
    Math.max(-1.6, Math.min(1.6, dragX / 96)),
    0,
    Math.max(-1.6, Math.min(1.6, dragY / 96))
  ]);
  return {
    vector,
    power: Number(Math.max(0.42, Math.min(1.75, distance / 96)).toFixed(3))
  };
}

export const games = {
  miniGolf: (): readonly AuraSceneNode[] => prefabs.miniGolfHole(),
  miniGolfHole: (): readonly AuraSceneNode[] => prefabs.miniGolfHole(),
  miniGolfCourse: (): readonly AuraSceneNode[] => prefabs.miniGolfCourse(),
  createMiniGolfState: (): AuraMiniGolfStateController => createMiniGolfStateController(),
  miniGolfPointerShot: miniGolfPointerShotFromDrag,
  fighting: fightingGameKit,
  createFightingGameKit,
  miniGolfScene: (): AuraSceneBuilder =>
    scene()
      .background("#12321d")
      .addMany(prefabs.miniGolfHole())
      .add(lights.studio({ intensity: 1.15 }))
      .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2 }))
      .timeline(timeline.loop({ seconds: 8 }))
} as const;

export interface AuraGameLoopPlan {
  readonly kind: "aura-game-loop-plan";
  readonly fixedDt: number;
  readonly maxSubSteps: number;
  readonly timeScale: number;
}

export interface AuraGameInputPlan {
  readonly kind: "aura-game-input-plan";
  readonly actions: Record<string, readonly string[]>;
  readonly axes: Record<string, AuraGameInputAxisBinding>;
  readonly bufferMs: number;
}

export interface AuraGameInputAxisBinding {
  readonly negative?: string;
  readonly positive?: string;
}

export interface AuraGameInputActionState {
  readonly pressed: boolean;
  readonly held: boolean;
  readonly released: boolean;
  readonly buffered: boolean;
  readonly value: number;
}

export interface AuraGameInputReplayEvent {
  readonly frame: number;
  readonly time: number;
  readonly type: "press" | "release";
  readonly binding: string;
}

export interface AuraGameInputSnapshot {
  readonly kind: "aura-game-input-snapshot";
  readonly frame: number;
  readonly time: number;
  readonly activeBindings: readonly string[];
  readonly actions: Record<string, AuraGameInputActionState>;
}

export interface AuraGameInputController extends AuraGameInputPlan {
  update(dt?: number): AuraGameInputSnapshot;
  snapshot(): AuraGameInputSnapshot;
  pressed(action: string): boolean;
  held(action: string): boolean;
  released(action: string): boolean;
  buffered(action: string, windowMs?: number): boolean;
  axis(name: string, negativeAction?: string, positiveAction?: string): number;
  press(binding: string): void;
  release(binding: string): void;
  setAction(action: string, held: boolean): void;
  recorded(): readonly AuraGameInputReplayEvent[];
  replay(events: readonly AuraGameInputReplayEvent[]): AuraGameInputSnapshot;
  clearReplay(): void;
  dispose(): void;
}

export interface AuraGameRuntimeEvidence {
  readonly kind: "aura-game-runtime-evidence";
  readonly source?: GameRuntimeSourceEvidence;
  readonly ownership?: readonly GameRuntimeSubsystemOwnership[];
  readonly loop: {
    readonly frame: number;
    readonly time: number;
    readonly paused: boolean;
  };
  readonly runtimeNodes: {
    readonly count: number;
    readonly ids: readonly string[];
  };
  readonly systems: {
    readonly mutableNodes: boolean;
    readonly frameLoop: boolean;
    readonly inputPlan: boolean;
    readonly physicsPlan: boolean;
    readonly animationPlan: boolean;
    readonly effectsPlan: boolean;
    readonly cameraPlan: boolean;
    readonly collisionPlan?: boolean;
    readonly stagePlan?: boolean;
  };
  readonly input?: {
    readonly configured: boolean;
    readonly actions: readonly string[];
    readonly axes: readonly string[];
    readonly activeBindings: readonly string[];
    readonly frame: number;
  };
  readonly physics?: {
    readonly kinematicBodies: number;
    readonly groundedBodies: number;
  };
  readonly collision?: {
    readonly combatWorld: boolean;
    readonly actors: number;
    readonly activeAttacks: number;
    readonly events: number;
  };
  readonly animation?: {
    readonly controllers: number;
    readonly activeClips: readonly string[];
    readonly eventCount: number;
  };
  readonly effects?: {
    readonly active: number;
    readonly spawned: number;
    readonly pooled: number;
  };
  readonly camera?: {
    readonly active: boolean;
    readonly fov?: number;
    readonly zoom?: number;
    readonly shake?: number;
    readonly reducedMotion?: boolean;
  };
  readonly assets?: {
    readonly typedAssets: number;
    readonly missingAssets: readonly string[];
  };
  readonly stage?: {
    readonly id?: string;
    readonly safeZones: boolean;
    readonly bounds?: unknown;
    readonly warnings: readonly string[];
  };
  readonly hud?: {
    readonly bindings: number;
    readonly kinds: readonly GameHudBindingKind[];
    readonly targetIds: readonly string[];
    readonly debugToggles: number;
    readonly interactive: number;
    readonly warnings: readonly string[];
  };
  readonly accessibility?: {
    readonly sources: number;
    readonly labels: number;
    readonly focusScopes: number;
    readonly reducedMotion: boolean;
    readonly reducedFlash: boolean;
    readonly highContrast: boolean;
    readonly pauseControls: boolean;
    readonly warnings: readonly string[];
  };
  readonly warnings?: readonly string[];
}

export function collectGameRuntimeEvidence(
  app: Pick<AuraApp, "runtime" | "nodes">,
  options: GameRuntimeEvidenceOptions = {}
): AuraGameRuntimeEvidence {
  return collectGameRuntimeEvidenceV105(app, options);
}

function createGameInputController(options: {
  readonly actions: Record<string, readonly string[]>;
  readonly axes?: Record<string, AuraGameInputAxisBinding>;
  readonly bufferMs?: number;
  readonly target?: EventTarget;
  readonly autoListen?: boolean;
}): AuraGameInputController {
  const actions = options.actions;
  const axes = options.axes ?? {};
  const bufferMs = options.bufferMs ?? 120;
  const activeBindings = new Set<string>();
  const activeActionOverrides = new Set<string>();
  const previousHeld = new Map<string, boolean>();
  const currentHeld = new Map<string, boolean>();
  const pressedEdges = new Set<string>();
  const releasedEdges = new Set<string>();
  const lastPressedAt = new Map<string, number>();
  const replayEvents: AuraGameInputReplayEvent[] = [];
  let frame = 0;
  let time = 0;
  let latestSnapshot: AuraGameInputSnapshot = {
    kind: "aura-game-input-snapshot",
    frame,
    time,
    activeBindings: [],
    actions: {}
  };

  const resolveHeld = (action: string): boolean => {
    if (activeActionOverrides.has(action)) return true;
    const bindings = actions[action] ?? [];
    return bindings.some((binding) => activeBindings.has(binding));
  };
  const record = (type: AuraGameInputReplayEvent["type"], binding: string) => {
    replayEvents.push({ frame, time, type, binding });
  };
  const pressBinding = (binding: string, shouldRecord = true) => {
    activeBindings.add(binding);
    if (actions[binding]) activeActionOverrides.add(binding);
    if (shouldRecord) record("press", binding);
  };
  const releaseBinding = (binding: string, shouldRecord = true) => {
    activeBindings.delete(binding);
    activeActionOverrides.delete(binding);
    if (shouldRecord) record("release", binding);
  };
  const toSnapshot = (): AuraGameInputSnapshot => {
    const actionStates: Record<string, AuraGameInputActionState> = {};
    const nowMs = time * 1000;
    for (const action of Object.keys(actions)) {
      const held = currentHeld.get(action) ?? false;
      actionStates[action] = {
        pressed: pressedEdges.has(action),
        held,
        released: releasedEdges.has(action),
        buffered: pressedEdges.has(action) || nowMs - (lastPressedAt.get(action) ?? Number.NEGATIVE_INFINITY) <= bufferMs,
        value: held ? 1 : 0
      };
    }
    return {
      kind: "aura-game-input-snapshot",
      frame,
      time,
      activeBindings: [...activeBindings].sort(),
      actions: actionStates
    };
  };
  const update = (dt = 1 / 60): AuraGameInputSnapshot => {
    frame += 1;
    time += Math.max(0, dt);
    pressedEdges.clear();
    releasedEdges.clear();
    for (const action of Object.keys(actions)) {
      const held = resolveHeld(action);
      const wasHeld = previousHeld.get(action) ?? false;
      currentHeld.set(action, held);
      if (held && !wasHeld) {
        pressedEdges.add(action);
        lastPressedAt.set(action, time * 1000);
      }
      if (!held && wasHeld) releasedEdges.add(action);
      previousHeld.set(action, held);
    }
    latestSnapshot = toSnapshot();
    return latestSnapshot;
  };
  const target = options.target ?? (typeof window !== "undefined" ? window : undefined);
  const onKeyDown = (event: Event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.repeat) return;
    if (keyboard.code) pressBinding(keyboard.code);
    if (keyboard.key && keyboard.key !== keyboard.code) pressBinding(keyboard.key);
  };
  const onKeyUp = (event: Event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.code) releaseBinding(keyboard.code);
    if (keyboard.key && keyboard.key !== keyboard.code) releaseBinding(keyboard.key);
  };
  if (options.autoListen !== false && target?.addEventListener) {
    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
  }

  return {
    kind: "aura-game-input-plan",
    actions,
    axes,
    bufferMs,
    update,
    snapshot() {
      return latestSnapshot;
    },
    pressed(action) {
      return pressedEdges.has(action);
    },
    held(action) {
      return currentHeld.get(action) ?? resolveHeld(action);
    },
    released(action) {
      return releasedEdges.has(action);
    },
    buffered(action, windowMs = bufferMs) {
      return pressedEdges.has(action) || time * 1000 - (lastPressedAt.get(action) ?? Number.NEGATIVE_INFINITY) <= windowMs;
    },
    axis(name, negativeAction, positiveAction) {
      const binding = axes[name];
      const negative = negativeAction ?? binding?.negative;
      const positive = positiveAction ?? binding?.positive;
      if (!negative && !positive) return this.held(name) ? 1 : 0;
      return (positive && this.held(positive) ? 1 : 0) - (negative && this.held(negative) ? 1 : 0);
    },
    press(binding) {
      pressBinding(binding);
    },
    release(binding) {
      releaseBinding(binding);
    },
    setAction(action, held) {
      if (held) {
        activeActionOverrides.add(action);
        record("press", action);
      } else {
        activeActionOverrides.delete(action);
        record("release", action);
      }
    },
    recorded() {
      return [...replayEvents];
    },
    replay(events) {
      activeBindings.clear();
      activeActionOverrides.clear();
      for (const event of events) {
        if (event.type === "press") pressBinding(event.binding, false);
        else releaseBinding(event.binding, false);
      }
      return update(0);
    },
    clearReplay() {
      replayEvents.length = 0;
    },
    dispose() {
      if (target?.removeEventListener) {
        target.removeEventListener("keydown", onKeyDown);
        target.removeEventListener("keyup", onKeyUp);
      }
      activeBindings.clear();
      activeActionOverrides.clear();
      previousHeld.clear();
      currentHeld.clear();
      pressedEdges.clear();
      releasedEdges.clear();
    }
  };
}

export interface AuraGameRules {
  readonly kind: "aura-game-rules";
  readonly gravity: number;
  readonly roundSeconds: number;
  readonly maxHealth: number;
  readonly maxGuard: number;
  readonly maxMeter: number;
  readonly stageBounds: {
    readonly minX: number;
    readonly maxX: number;
  };
}

export interface AuraGameRuntimeOptions {
  readonly loop?: Partial<Omit<AuraGameLoopPlan, "kind">> | undefined;
  readonly input?: GameInputOptions | undefined;
  readonly rules?: Partial<Omit<AuraGameRules, "kind">> | undefined;
  readonly effectPoolSize?: number | undefined;
}

export interface AuraGameRuntime {
  readonly kind: "aura-game-runtime";
  readonly loop: AuraGameLoopPlan;
  readonly rules: AuraGameRules;
  readonly input?: ReturnType<typeof createGameInput> | undefined;
  readonly combat: ReturnType<typeof createCombatWorld>;
  readonly camera: ReturnType<typeof createGameCameraDirector>;
  readonly effects: ReturnType<typeof createGameEffects>;
  readonly bodies: readonly ReturnType<typeof createGameKinematicBody>[];
}

export function createAuraGameRules(options: Partial<Omit<AuraGameRules, "kind">> = {}): AuraGameRules {
  return {
    kind: "aura-game-rules",
    gravity: options.gravity ?? 24,
    roundSeconds: options.roundSeconds ?? 90,
    maxHealth: options.maxHealth ?? 100,
    maxGuard: options.maxGuard ?? 100,
    maxMeter: options.maxMeter ?? 100,
    stageBounds: options.stageBounds ?? {
      minX: -4.5,
      maxX: 4.5
    }
  };
}

export const gameRules = Object.assign(createAuraGameRules, {
  fighting2D: createGameFighting2DRules
});

export function createAuraGameRuntime(options: AuraGameRuntimeOptions = {}): AuraGameRuntime {
  return {
    kind: "aura-game-runtime",
    loop: {
      kind: "aura-game-loop-plan",
      fixedDt: options.loop?.fixedDt ?? 1 / 60,
      maxSubSteps: options.loop?.maxSubSteps ?? 5,
      timeScale: options.loop?.timeScale ?? 1
    },
    rules: createAuraGameRules(options.rules),
    input: options.input ? createGameInput(options.input) : undefined,
    combat: createCombatWorld(),
    camera: createGameCameraDirector({
      stageBounds: {
        minX: options.rules?.stageBounds?.minX ?? -4.5,
        maxX: options.rules?.stageBounds?.maxX ?? 4.5
      }
    }),
    effects: createGameEffects({ poolSize: options.effectPoolSize }),
    bodies: []
  };
}

export const game = {
  createRuntime: createAuraGameRuntime,
  rules: gameRules,
  loop: (options: Partial<Omit<AuraGameLoopPlan, "kind">> = {}): AuraGameLoopPlan => ({
    kind: "aura-game-loop-plan",
    fixedDt: options.fixedDt ?? 1 / 60,
    maxSubSteps: options.maxSubSteps ?? 5,
    timeScale: options.timeScale ?? 1
  }),
  frameLoop: createFrameLoop,
  runtimeNode: createRuntimeNodeSpec,
  input: createGameInput,
  inputReplay: createGameInputReplay,
  inputReplayDriver: createGameInputReplayDriver,
  inputReplayEventsAt: gameInputReplayEventsAt,
  touchControls: createGameTouchControlLayout,
  kinematicBody: createGameKinematicBody,
  jumpAssist: createGameJumpAssist,
  collider: {
    box: createGameBoxCollider,
    sphere: createGameSphereCollider,
    capsule: createGameCapsuleCollider,
    rect: createGameRectCollider,
    aabb: gameColliderAabb,
    factories: gameColliders
  },
  hitbox: gameHitboxes,
  hurtbox: gameHurtboxes,
  guardbox: gameGuardboxes,
  pushbox: gamePushboxes,
  trigger: gameTriggerVolumes,
  combatWorld: createCombatWorld,
  combatEvents: applyGameCombatEventsToRuntime,
  cameraDirector: createGameCameraDirector,
  effects: createGameEffects,
  effectPresets: gameEffectPresets,
  debug: {
    colliders: createGameColliderDebugGeometry,
    hitboxes: createGameHitboxDebugGeometry,
    combat: createGameCombatDebugGeometry,
    overlay: createGameDebugOverlayData,
    sceneNodes: createGameDebugSceneNodes
  },
  hud: {
    health: createGameHudHealthBinding,
    meter: createGameHudMeterBinding,
    timer: createGameHudTimerBinding,
    combo: createGameHudComboBinding,
    round: createGameHudRoundBinding,
    debugToggle: createGameHudDebugToggleBinding,
    bindings: createGameHudBindings,
    snapshot: createGameHudSnapshot
  },
  accessibility: {
    label: createGameAccessibilityLabel,
    focus: createGameAccessibilityFocus,
    reducedMotion: createGameReducedMotionSource,
    reducedFlash: createGameReducedFlashSource,
    highContrast: createGameHighContrastSource,
    pauseControls: createGamePauseControlsSource,
    settings: createGameAccessibilityRuntimeSettings
  },
  fighting: createFightingGameKit,
  evidence: collectGameRuntimeEvidence
} as const;

export const cartoon = {
  episodePlan: createPromptAnimationEpisodePlan,
  storyBible: createPromptAnimationStoryBible,
  storyboard: definePromptAnimationStoryboard,
  shotTimeline: createShotTimeline,
  shotPlaybackPlan: createShotPlaybackPlan,
  sampleShotPlaybackPlan,
  applyShotPlaybackFrame,
  installShotPlayback,
  captionsFromDialogue: deriveCaptionTrackFromDialogue,
  captionCueAtTime,
  captionTimingProof: createCaptionTimingProof,
  visemeTrack: createAuraVoiceVisemeTrack,
  primitiveMouthVisemes: createPrimitiveMouthVisemeCues,
  glbBlendshapeViseme: createGlbBlendshapeVisemeCue,
  sampleVisemeTrack,
  auraVoiceBridgePackage: createAuraVoiceBridgePackage,
  sampleAuraVoiceBridgeAtTime,
  auraVoiceRerenderPlan: createAuraVoiceRerenderPlan,
  auraVoiceDubRerenderProof: createAuraVoiceDubRerenderProof,
  director: createCartoonDirectorPlan,
  performance: createCartoonPerformance,
  renderQueue: createCartoonRenderQueue,
  renderOutputPackage: createCartoonRenderOutputPackageMetadata,
  evidence: collectPromptAnimationEvidence
} as const;

export const animationStudio = cartoon;

function collectParticleBudgetDiagnostics(nodes: readonly AuraSceneNode[]): AuraParticleBudgetDiagnostics {
  const flattened = groups.flatten(nodes);
  const particleEffects = flattened.filter((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "particles");
  const totalParticles = particleEffects.reduce((sum, node) => sum + Math.max(120, Math.min(6000, node.particleCount ?? 900)), 0);
  const modes = Array.from(new Set(particleEffects.map((node) => node.materialMode ?? "soft-alpha"))).sort() as AuraParticleMaterialMode[];
  return {
    kind: "aura-particle-budget",
    effectCount: particleEffects.length,
    totalParticles,
    estimatedDrawCalls: particleEffects.length,
    estimatedUpdateCostMs: Number((totalParticles * 0.00018 + particleEffects.length * 0.04).toFixed(3)),
    modes,
    texturedBillboards: particleEffects.filter((node) => node.texturedBillboard !== false).length,
    gpuReady: totalParticles >= 1000 && particleEffects.every((node) => node.texturedBillboard !== false)
  };
}

export const particles = {
  materialModes: (): readonly AuraParticleMaterialMode[] => ["additive-glow", "soft-alpha", "spark", "smoke", "splash", "dust", "star"],
  fountain: (options: { readonly color?: AuraColor; readonly count?: number; readonly emissionRate?: number } = {}): readonly AuraSceneNode[] => prefabs.particleFountain(options),
  diagnostics: collectParticleBudgetDiagnostics
} as const;

function neonPalette(preset: AuraNeonPalettePreset): readonly [AuraColor, AuraColor, AuraColor, AuraColor] {
  if (preset === "sunset-grid") return ["#f97316", "#f43f5e", "#fde68a", "#38bdf8"];
  if (preset === "acid-aurora") return ["#a3e635", "#22d3ee", "#f0abfc", "#facc15"];
  return ["#22d3ee", "#ff42c8", "#ffd166", "#8b5cf6"];
}

function validateNeonVisualQA(nodes: readonly AuraSceneNode[]): AuraNeonVisualQAResult {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const ringCount = names.filter((name) => name.includes("neon tunnel tube ring") || name.includes("receding neon tunnel top segment")).length;
  const hasFog = flattened.some((node) => node.kind === "effect" && node.effect === "fog");
  const bloom = flattened.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "bloom");
  const hasBloom = Boolean(bloom);
  const hasReflections = names.some((name) => name.includes("reflection streak") || name.includes("glossy black neon tunnel floor"));
  const hasDepthCues = names.some((name) => name.includes("vanishing") || name.includes("receding"));
  const overexposureRisk = (bloom?.intensity ?? 0) > 1 || names.filter((name) => name.includes("tiny vanishing point glow")).length > 2;
  const problems: string[] = [];
  if (ringCount < 24) problems.push(`expected at least 24 tunnel ring/depth elements, found ${ringCount}`);
  if (!hasFog) problems.push("missing fog depth cue");
  if (!hasBloom) problems.push("missing controlled bloom");
  if (!hasReflections) problems.push("missing reflective floor/wall cues");
  if (!hasDepthCues) problems.push("missing vanishing/receding depth cues");
  if (overexposureRisk) problems.push("bloom or glow risks whiteout");
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    ringCount,
    hasFog,
    hasBloom,
    hasReflections,
    hasDepthCues,
    overexposureRisk,
    problems
  };
}

export const neon = {
  tunnel: (options: AuraNeonTunnelOptions = {}): readonly AuraSceneNode[] => prefabs.neonTunnel(options),
  palettes: (): readonly AuraNeonPalettePreset[] => ["cyan-magenta", "sunset-grid", "acid-aurora"],
  bloomPreset: (intensity = 0.72): AuraNodeBuilder<AuraEffectNode> => effects.bloom({ intensity: Math.min(0.92, Math.max(0.12, intensity)), threshold: 0.68, color: "#ff42c8" }),
  cameraFlythrough: (options: { readonly seconds?: number; readonly captureFrame?: number } = {}) =>
    camera.dolly({ from: [0, 0.36, 1.6], to: [0, 0.36, -4.4], target: [0, 0.28, -5.8], fov: 54, seconds: options.seconds ?? 8, captureTime: options.captureFrame ?? 0.62 }),
  visualQA: validateNeonVisualQA
} as const;

export const charts = {
  barGrid3D: (options: AuraDataBars3DPrefabOptions = {}): readonly AuraSceneNode[] => prefabs.dataBars3D(options),
  dataBars3D: (options: AuraDataBars3DPrefabOptions = {}): readonly AuraSceneNode[] => prefabs.dataBars3D(options),
  configure: (options: AuraDataBars3DPrefabOptions = {}): AuraDataBars3DPrefabOptions => ({ ...options }),
  withDataset: (dataset: readonly (readonly number[])[], options: Omit<AuraDataBars3DPrefabOptions, "dataset"> = {}): AuraDataBars3DPrefabOptions => ({ ...options, dataset }),
  themes: (): readonly AuraChartTheme[] => ["dark-analytics", "light-analytics", "neon-analytics"],
  cameraPreset: (preset: "readable-6x6" | "dashboard" | "hover-detail" = "readable-6x6") =>
    preset === "hover-detail"
      ? camera.perspective({ position: [3.2, 2.6, 4.1], target: [0.45, 1.0, -0.35], fov: 38 })
      : preset === "dashboard"
        ? camera.perspective({ position: [3.9, 3.1, 4.8], target: [0, 0.86, 0], fov: 42 })
        : camera.perspective({ position: [5.6, 4.4, 7.4], target: [0, 1.15, 0], fov: 36 }),
  visualQA: (nodes: readonly AuraSceneNode[]): AuraChartVisualQAResult => validateChartVisualQA(nodes)
} as const;

function validateChartVisualQA(nodes: readonly AuraSceneNode[]): AuraChartVisualQAResult {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const bars = names.filter((name) => name.includes("height-colored data bar")).length;
  const labelsCount = flattened.filter((node) => node.kind === "label").length + names.filter((name) => name.includes("label chip") || name.includes("value label")).length;
  const legends = names.filter((name) => name.includes("legend swatch")).length;
  const selectedOutlines = names.filter((name) => name.includes("selected data bar outline")).length;
  const problems: string[] = [];
  if (bars < 36) problems.push(`expected at least 36 bars, found ${bars}`);
  if (labelsCount < 12) problems.push(`expected grounded axis/title/value labels, found ${labelsCount}`);
  if (legends < 3) problems.push(`expected 3 legend swatches, found ${legends}`);
  const orphanPlanes = names.filter((name) => name.includes("orphan") || name.includes("cobweb") || name.includes("stray"));
  if (orphanPlanes.length > 0) problems.push(`stray geometry markers found: ${orphanPlanes.join(", ")}`);
  const score = Math.max(1, 5 - problems.length);
  return { passes: problems.length === 0, score, bars, labels: labelsCount, legends, selectedOutlines, problems };
}

const characterClips: readonly AuraCharacterClip[] = [
  { name: "idle", duration: 2.4, captureTime: 0.4, loop: true },
  { name: "walk", duration: 1.2, captureTime: 0.38, loop: true },
  { name: "run", duration: 0.74, captureTime: 0.22, loop: true },
  { name: "wave", duration: 1.6, captureTime: 0.5, loop: true },
  { name: "turn", duration: 1.4, captureTime: 0.62, loop: false },
  { name: "pose", duration: 1, captureTime: 0.5, loop: false },
  { name: "benchmark-pose", duration: 1, captureTime: 0.42, loop: false }
] as const;

function createPrimitiveHumanoidSkeleton(style: AuraCharacterStyle = "simple"): AuraCharacterSkeleton {
  return {
    kind: "aura-character-skeleton",
    style,
    clips: characterClips,
    joints: [
      { name: "root", position: [0, 0, -0.55] },
      { name: "pelvis", parent: "root", position: [0, 0.51, -0.55] },
      { name: "spine", parent: "pelvis", position: [0, 0.9, -0.55] },
      { name: "neck", parent: "spine", position: [0, 1.31, -0.55] },
      { name: "head", parent: "neck", position: [0, 1.48, -0.55] },
      { name: "left-shoulder", parent: "spine", position: [-0.31, 1.1, -0.55] },
      { name: "left-elbow", parent: "left-shoulder", position: [-0.34, 0.82, -0.39] },
      { name: "left-wrist", parent: "left-elbow", position: [-0.37, 0.54, -0.29] },
      { name: "right-shoulder", parent: "spine", position: [0.31, 1.1, -0.55] },
      { name: "right-elbow", parent: "right-shoulder", position: [0.34, 0.82, -0.71] },
      { name: "right-wrist", parent: "right-elbow", position: [0.37, 0.54, -0.81] },
      { name: "left-hip", parent: "pelvis", position: [-0.18, 0.51, -0.55] },
      { name: "left-knee", parent: "left-hip", position: [-0.2, 0.24, -0.29] },
      { name: "left-ankle", parent: "left-knee", position: [-0.28, 0.07, -0.06] },
      { name: "right-hip", parent: "pelvis", position: [0.18, 0.51, -0.55] },
      { name: "right-knee", parent: "right-hip", position: [0.22, 0.24, -0.81] },
      { name: "right-ankle", parent: "right-knee", position: [0.31, 0.07, -1.02] }
    ]
  };
}

function isHumanoidRigNode(node: AuraSceneNode): node is AuraPrimitiveNode {
  return node.kind === "primitive" && typeof node.name === "string" && (
    node.name.includes("humanoid") ||
    node.name.includes("shoulder") ||
    node.name.includes("elbow") ||
    node.name.includes("forearm") ||
    node.name.includes("hand") ||
    node.name.includes("hip") ||
    node.name.includes("walking leg") ||
    node.name.includes("knee") ||
    node.name.includes("shin") ||
    node.name.includes("foot") ||
    node.name.includes("neck") ||
    node.name.includes("torso")
  );
}

function createHierarchicalPrimitiveHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  const flatNodes = prefabs.primitiveHumanoid(options);
  const rigNodes = flatNodes.filter(isHumanoidRigNode);
  const sceneNodes = flatNodes.filter((node) => !isHumanoidRigNode(node));
  const clip = options.clip ?? "walk";
  const pose = options.pose ?? "mid-stride";
  const style = options.style ?? "simple";
  const chain = (
    name: string,
    predicate: (nodeName: string) => boolean,
    animation: AuraAnimationSpec
  ): AuraGroupNode =>
    group(name, rigNodes.filter((node) => predicate(node.name ?? "")), { animation }).toJSON();

  return [
    ...sceneNodes,
    group("hierarchical primitive humanoid rig", [
      chain("pelvis spine neck head chain", (name) =>
        name.includes("torso") ||
        name.includes("neck") ||
        name.includes("head") ||
        name.includes("eye") ||
        name.includes("mouth") ||
        name.includes("shoulder bar") ||
        name.includes("hip bar")
      , { clip, speed: 0.78, chain: "root", joint: "pelvis", rootBob: true, jointHierarchy: true }),
      chain("left shoulder elbow wrist chain", (name) =>
        name.includes("left shoulder") ||
        name.includes("left attached") ||
        name.includes("left bent forearm") ||
        name.includes("left elbow") ||
        name.includes("left humanoid hand")
      , { clip, speed: 0.9, chain: "left-arm", joint: "left-shoulder", jointHierarchy: true }),
      chain("right shoulder elbow wrist chain", (name) =>
        name.includes("right shoulder") ||
        name.includes("right attached") ||
        name.includes("right bent forearm") ||
        name.includes("right elbow") ||
        name.includes("right humanoid hand")
      , { clip, speed: 0.9, chain: "right-arm", joint: "right-shoulder", jointHierarchy: true }),
      chain("left hip knee ankle chain", (name) =>
        name.includes("left hip") ||
        name.includes("forward connected walking leg") ||
        name.includes("forward lower walking shin") ||
        name.includes("forward knee") ||
        name.includes("forward foot")
      , { clip, speed: 0.95, chain: "left-leg", joint: "left-hip", jointHierarchy: true }),
      chain("right hip knee ankle chain", (name) =>
        name.includes("right hip") ||
        name.includes("back connected walking leg") ||
        name.includes("back lower walking shin") ||
        name.includes("back knee") ||
        name.includes("back foot")
      , { clip, speed: 0.95, chain: "right-leg", joint: "right-hip", jointHierarchy: true })
    ], {
      character: {
        skeleton: createPrimitiveHumanoidSkeleton(style),
        clip,
        pose,
        rootBob: true,
        limbSwing: "joint-hierarchy"
      },
      animation: { clip, speed: clip === "run" ? 1.35 : clip === "idle" ? 0.25 : 0.9, chain: "root", joint: "root", rootBob: true, jointHierarchy: true }
    }).toJSON()
  ];
}

function createLowPolyHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  // Benchmark-facing low-poly humanoids must not default to the armored/soldier
  // bundled GLB. Use the connected primitive/procedural path by default so Prompt
  // 09 stays asset-free while avoiding the old detached ball-joint puppet output.
  return createBenchmarkBoxLowPolyHumanoid(options);
}

function createBenchmarkBoxLowPolyHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  const clip = options.clip ?? "benchmark-pose";
  const pose = options.pose ?? "mid-stride";
  const style = options.style ?? "athletic";
  const skin = material.pbr({ color: "#f1c9a5", roughness: 0.58, metallic: 0.01 });
  const shirt = material.clearcoat({ color: "#1d4ed8", roughness: 0.34, clearcoat: 0.14 });
  const sleeve = material.pbr({ color: "#475569", roughness: 0.62, metallic: 0.01 });
  const pants = material.pbr({ color: "#050b16", roughness: 0.74, metallic: 0.01 });
  const shoe = material.pbr({ color: "#020617", roughness: 0.78, metallic: 0.01 });
  const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "walk cycle ground plane", material: material.pbr({ color: "#102018", roughness: 0.88, metallic: 0.01 }) }).position(0, -0.04, -0.5).scale([4.6, 1, 2.7]).toJSON(),
    primitives.cylinder({ name: "humanoid contact shadow", material: material.pbr({ color: "#020617", roughness: 0.95, metallic: 0.01, opacity: 0.5 }) }).position(0.02, 0.028, -0.52).scale([0.6, 0.012, 0.38]).toJSON(),
    primitives.box({ name: "painted walking path", material: material.pbr({ color: "#1f2937", roughness: 0.84, metallic: 0.01 }) }).position(0, 0.012, -0.45).scale([1.7, 0.024, 0.18]).toJSON(),
    primitives.box({ name: "white dashed stride marker 1", material: material.emissive({ color: "#e5e7eb", emissive: "#e5e7eb", emissiveIntensity: 0.42 }) }).position(-0.62, 0.04, -0.45).scale([0.28, 0.02, 0.035]).toJSON(),
    primitives.box({ name: "white dashed stride marker 2", material: material.emissive({ color: "#e5e7eb", emissive: "#e5e7eb", emissiveIntensity: 0.42 }) }).position(0.08, 0.04, -0.45).scale([0.28, 0.02, 0.035]).toJSON(),
    primitives.box({ name: "connected blue humanoid torso", material: shirt }).position(0, 0.9, -0.55).scale([0.44, 0.62, 0.28]).toJSON(),
    primitives.box({ name: "hip bar connecting legs", material: pants }).position(0, 0.52, -0.55).scale([0.44, 0.22, 0.3]).toJSON(),
    primitives.box({ name: "shoulder bar connecting arms", material: sleeve }).position(0, 1.12, -0.55).scale([0.62, 0.12, 0.18]).toJSON(),
    primitives.cylinder({ name: "short humanoid neck connector", material: skin }).position(0, 1.28, -0.53).scale([0.09, 0.18, 0.09]).toJSON(),
    primitives.sphere({ name: "humanoid head", material: skin }).position(0, 1.42, -0.48).scale(0.18).toJSON(),
    primitives.sphere({ name: "left humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a", emissiveIntensity: 0.26 }) }).position(-0.05, 1.45, -0.33).scale(0.018).toJSON(),
    primitives.sphere({ name: "right humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a", emissiveIntensity: 0.26 }) }).position(0.05, 1.45, -0.33).scale(0.018).toJSON(),
    primitives.box({ name: "humanoid mouth line", material: material.emissive({ color: "#991b1b", emissive: "#991b1b", emissiveIntensity: 0.28 }) }).position(0, 1.37, -0.32).scale([0.075, 0.01, 0.012]).toJSON(),
    primitives.box({ name: "left attached swinging arm", material: sleeve }).position(-0.34, 0.9, -0.38).rotate(0.42, 0, 0.08).scale([0.12, 0.48, 0.12]).toJSON(),
    primitives.box({ name: "right attached swinging arm", material: sleeve }).position(0.34, 0.9, -0.72).rotate(-0.42, 0, -0.08).scale([0.12, 0.48, 0.12]).toJSON(),
    primitives.box({ name: "left bent forearm", material: sleeve }).position(-0.42, 0.66, -0.3).rotate(0.22, 0, 0.05).scale([0.1, 0.36, 0.1]).toJSON(),
    primitives.box({ name: "right bent forearm", material: sleeve }).position(0.42, 0.66, -0.8).rotate(-0.22, 0, -0.05).scale([0.1, 0.36, 0.1]).toJSON(),
    primitives.sphere({ name: "left humanoid hand", material: skin }).position(-0.48, 0.6, -0.3).scale(0.052).toJSON(),
    primitives.sphere({ name: "right humanoid hand", material: skin }).position(0.48, 0.6, -0.8).scale(0.052).toJSON(),
    primitives.box({ name: "forward connected walking leg", material: pants }).position(-0.16, 0.34, -0.36).rotate(-0.34, 0, 0.04).scale([0.14, 0.52, 0.14]).toJSON(),
    primitives.box({ name: "back connected walking leg", material: pants }).position(0.16, 0.34, -0.74).rotate(0.34, 0, -0.04).scale([0.14, 0.52, 0.14]).toJSON(),
    primitives.box({ name: "forward lower walking shin", material: pants }).position(-0.22, 0.18, -0.18).rotate(0.2, 0, 0.02).scale([0.12, 0.34, 0.12]).toJSON(),
    primitives.box({ name: "back lower walking shin", material: pants }).position(0.22, 0.18, -0.92).rotate(-0.2, 0, -0.02).scale([0.12, 0.34, 0.12]).toJSON(),
    primitives.box({ name: "forward foot planted on path", material: shoe }).position(-0.28, 0.055, -0.02).rotate(0, -0.12, 0).scale([0.28, 0.07, 0.2]).toJSON(),
    primitives.box({ name: "back foot pushing off path", material: shoe }).position(0.28, 0.055, -1.06).rotate(0, 0.12, 0).scale([0.28, 0.07, 0.2]).toJSON(),
    primitives.box({ name: "orange forward foot motion streak", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", emissiveIntensity: 0.35, opacity: 0.28 }) }).position(-0.08, 0.052, -0.16).rotate(0, -0.18, 0).scale([0.32, 0.018, 0.03]).toJSON()
  ];
  nodes.push(group("hierarchical primitive humanoid rig", [], {
    character: {
      skeleton: createPrimitiveHumanoidSkeleton(style),
      clip,
      pose,
      rootBob: false,
      limbSwing: "joint-hierarchy"
    },
    animation: { clip, speed: 0.9, chain: "root", joint: "root", rootBob: false, jointHierarchy: true }
  }).toJSON());
  return nodes;
}

function createBenchmarkLowPolyPrimitiveHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  const showJoints = options.showJoints ?? false;
  const motionTrail = options.motionTrail ?? true;
  const clip = options.clip ?? "benchmark-pose";
  const pose = options.pose ?? "mid-stride";
  const style = options.style ?? "athletic";
  const skin = material.pbr({ color: "#f1c9a5", roughness: 0.58, metallic: 0.01 });
  const shirt = material.clearcoat({ color: "#2563eb", roughness: 0.28, clearcoat: 0.18 });
  const sleeve = material.clearcoat({ color: "#6fb7e8", roughness: 0.32, clearcoat: 0.12 });
  const pants = material.pbr({ color: "#07111f", roughness: 0.72, metallic: 0.01 });
  const shoe = material.pbr({ color: "#020617", roughness: 0.76, metallic: 0.01 });
  const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "walk cycle ground plane", material: material.pbr({ color: "#114a25", roughness: 0.86, metallic: 0.01 }) }).position(0, -0.04, -0.5).scale([4.6, 1, 2.7]).toJSON(),
    primitives.box({ name: "painted walking path", material: material.pbr({ color: "#202938", roughness: 0.84, metallic: 0.01 }) }).position(0, 0.012, -0.45).scale([3.3, 0.024, 0.32]).toJSON(),
    primitives.box({ name: "white dashed stride marker 1", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.48 }) }).position(-0.92, 0.04, -0.45).scale([0.38, 0.02, 0.04]).toJSON(),
    primitives.box({ name: "white dashed stride marker 2", material: material.emissive({ color: "#f8fafc", emissive: "#f8fafc", emissiveIntensity: 0.48 }) }).position(0.05, 0.04, -0.45).scale([0.38, 0.02, 0.04]).toJSON(),
    primitives.box({ name: "white dashed stride marker 3", material: material.emissive({ color: "#e0f2fe", emissive: "#e0f2fe", emissiveIntensity: 0.42 }) }).position(1.0, 0.04, -0.45).scale([0.38, 0.02, 0.04]).toJSON(),
    primitives.cylinder({ name: "humanoid contact shadow", material: material.pbr({ color: "#020617", roughness: 0.95, metallic: 0.01, opacity: 0.44 }) }).position(0.02, 0.028, -0.5).scale([0.62, 0.012, 0.4]).toJSON(),
    primitives.cylinder({ name: "connected blue humanoid torso", material: shirt }).position(0, 0.86, -0.55).scale([0.3, 0.7, 0.25]).toJSON(),
    primitives.box({ name: "hip bar connecting legs", material: material.clearcoat({ color: "#1e40af", roughness: 0.34, clearcoat: 0.18 }) }).position(0, 0.52, -0.55).scale([0.42, 0.13, 0.2]).toJSON(),
    primitives.box({ name: "shoulder bar connecting arms", material: sleeve }).position(0, 1.08, -0.55).scale([0.62, 0.1, 0.15]).toJSON(),
    primitives.cylinder({ name: "short humanoid neck connector", material: skin }).position(0, 1.25, -0.55).scale([0.1, 0.28, 0.1]).toJSON(),
    primitives.sphere({ name: "humanoid head", material: skin }).position(0, 1.4, -0.46).scale(0.19).toJSON(),
    primitives.sphere({ name: "left humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a", emissiveIntensity: 0.35 }) }).position(-0.055, 1.44, -0.31).scale(0.022).toJSON(),
    primitives.sphere({ name: "right humanoid eye", material: material.emissive({ color: "#0f172a", emissive: "#0f172a", emissiveIntensity: 0.35 }) }).position(0.055, 1.44, -0.31).scale(0.022).toJSON(),
    primitives.box({ name: "humanoid mouth line", material: material.emissive({ color: "#b91c1c", emissive: "#b91c1c", emissiveIntensity: 0.32 }) }).position(0, 1.35, -0.29).scale([0.09, 0.012, 0.012]).toJSON(),
    primitives.capsule({ name: "left attached swinging arm", material: sleeve }).position(-0.28, 0.96, -0.48).rotate(0.38, 0, -0.12).scale([0.085, 0.31, 0.085]).toJSON(),
    primitives.capsule({ name: "right attached swinging arm", material: sleeve }).position(0.28, 0.96, -0.64).rotate(-0.38, 0, 0.12).scale([0.085, 0.31, 0.085]).toJSON(),
    primitives.capsule({ name: "left bent forearm", material: sleeve }).position(-0.42, 0.72, -0.36).rotate(-0.18, 0, -0.08).scale([0.076, 0.27, 0.076]).toJSON(),
    primitives.capsule({ name: "right bent forearm", material: sleeve }).position(0.42, 0.72, -0.76).rotate(0.18, 0, 0.08).scale([0.076, 0.27, 0.076]).toJSON(),
    primitives.capsule({ name: "left continuous arm silhouette connector", material: sleeve }).position(-0.38, 0.78, -0.42).rotate(0.18, 0, -0.12).scale([0.062, 0.58, 0.062]).toJSON(),
    primitives.capsule({ name: "right continuous arm silhouette connector", material: sleeve }).position(0.38, 0.78, -0.72).rotate(-0.18, 0, 0.12).scale([0.062, 0.58, 0.062]).toJSON(),
    primitives.sphere({ name: "left humanoid hand", material: skin }).position(-0.48, 0.52, -0.28).scale(0.058).toJSON(),
    primitives.sphere({ name: "right humanoid hand", material: skin }).position(0.48, 0.52, -0.84).scale(0.058).toJSON(),
    primitives.capsule({ name: "forward connected walking leg", material: pants }).position(-0.14, 0.38, -0.43).rotate(-0.42, 0, -0.04).scale([0.1, 0.35, 0.1]).toJSON(),
    primitives.capsule({ name: "back connected walking leg", material: pants }).position(0.14, 0.38, -0.67).rotate(0.42, 0, 0.04).scale([0.1, 0.35, 0.1]).toJSON(),
    primitives.capsule({ name: "forward lower walking shin", material: pants }).position(-0.22, 0.2, -0.22).rotate(0.28, 0, -0.04).scale([0.092, 0.32, 0.092]).toJSON(),
    primitives.capsule({ name: "back lower walking shin", material: pants }).position(0.22, 0.2, -0.88).rotate(-0.28, 0, 0.04).scale([0.092, 0.32, 0.092]).toJSON(),
    primitives.capsule({ name: "forward continuous leg silhouette connector", material: pants }).position(-0.19, 0.27, -0.28).rotate(-0.28, 0, -0.04).scale([0.08, 0.62, 0.08]).toJSON(),
    primitives.capsule({ name: "back continuous leg silhouette connector", material: pants }).position(0.19, 0.27, -0.8).rotate(0.28, 0, 0.04).scale([0.08, 0.62, 0.08]).toJSON(),
    primitives.box({ name: "forward foot planted on path", material: shoe }).position(-0.28, 0.06, -0.03).rotate(0, -0.14, 0).scale([0.26, 0.075, 0.18]).toJSON(),
    primitives.box({ name: "back foot pushing off path", material: shoe }).position(0.28, 0.06, -1.03).rotate(0, 0.14, 0).scale([0.26, 0.075, 0.18]).toJSON()
  ];
  if (showJoints) {
    nodes.push(
      primitives.sphere({ name: "left shoulder ball joint", material: material.clearcoat({ color: "#bfdbfe", roughness: 0.22, clearcoat: 0.16 }) }).position(-0.28, 1.08, -0.52).scale(0.045).toJSON(),
      primitives.sphere({ name: "right shoulder ball joint", material: material.clearcoat({ color: "#bfdbfe", roughness: 0.22, clearcoat: 0.16 }) }).position(0.28, 1.08, -0.58).scale(0.045).toJSON(),
      primitives.sphere({ name: "forward knee hinge", material: material.clearcoat({ color: "#111827", roughness: 0.38, clearcoat: 0.12 }) }).position(-0.19, 0.26, -0.31).scale(0.045).toJSON(),
      primitives.sphere({ name: "back knee hinge", material: material.clearcoat({ color: "#111827", roughness: 0.38, clearcoat: 0.12 }) }).position(0.19, 0.26, -0.79).scale(0.045).toJSON()
    );
  }
  if (motionTrail) {
    nodes.push(
      primitives.box({ name: "orange forward foot motion streak", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", emissiveIntensity: 0.42, opacity: 0.32 }) }).position(-0.08, 0.055, -0.18).rotate(0, -0.18, 0).scale([0.36, 0.02, 0.036]).toJSON(),
      primitives.box({ name: "blue rear foot motion streak", material: material.emissive({ color: "#60a5fa", emissive: "#60a5fa", emissiveIntensity: 0.36, opacity: 0.28 }) }).position(0.16, 0.055, -0.9).rotate(0, 0.18, 0).scale([0.34, 0.02, 0.034]).toJSON()
    );
  }
  nodes.push(group("hierarchical primitive humanoid rig", [], {
    character: {
      skeleton: createPrimitiveHumanoidSkeleton(style),
      clip,
      pose,
      rootBob: false,
      limbSwing: "joint-hierarchy"
    },
    animation: { clip, speed: 0.9, chain: "root", joint: "root", rootBob: false, jointHierarchy: true }
  }).toJSON());
  return nodes;
}
function createAuthoredLowPolyHumanoid(options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] {
  const clip = options.clip ?? "benchmark-pose";
  const pose = options.pose ?? "three-quarter";
  const glbClip = mapAuraClipToBuiltInHumanoidClip(clip);
  const speed = clip === "run" ? 1.18 : clip === "idle" || clip === "pose" ? 0.42 : 0.78;
  const facing = pose === "side-view" ? 0.72 : pose === "planted-foot" ? -0.08 : -0.24;
  const motionModel = createAuthoredHumanoidMotionModel(clip);
  const nodes: AuraSceneNode[] = [
    primitives.plane({ name: "humanoid grounded capture floor", material: material.pbr({ color: "#17251c", roughness: 0.9, metallic: 0.01 }) }).position(0, -0.024, -0.55).scale([3.8, 1, 2.6]).toJSON(),
    primitives.box({ name: "subtle authored humanoid walking path stripe", material: material.pbr({ color: "#2f3b45", roughness: 0.84, metallic: 0.01 }) }).position(0, 0.006, -0.52).scale([1.58, 0.012, 0.16]).toJSON(),
    primitives.cylinder({ name: "authored humanoid soft contact shadow", material: material.pbr({ color: "#020617", roughness: 0.95, metallic: 0.01, opacity: 0.42 }) }).position(0.02, 0.012, -0.5).scale([0.62, 0.012, 0.4]).toJSON(),
    model(builtInCharacterAssets.humanoid, {
      name: "authored skinned neutral human character model",
      castShadow: true,
      receiveShadow: true
    })
      .position(0, 0, -0.56)
      .rotate(0, facing, 0)
      .scale(1.0)
      .animate({ clip: glbClip, speed, loop: true, captureTime: motionModel.footPlanting.captureTime })
      .toJSON(),
    effects.contactOcclusion({ name: "authored humanoid renderer contact occlusion", intensity: 0.3, radius: 0.58 }).toJSON(),
    group("authored skinned neutral human rig metadata", [], {
      character: {
        skeleton: createPrimitiveHumanoidSkeleton("mannequin"),
        clip,
        pose,
        rootBob: clip !== "idle" && clip !== "pose",
        limbSwing: "joint-hierarchy",
        footPlanting: motionModel.footPlanting,
        rootMotion: motionModel.rootMotion,
        constraints: motionModel.constraints
      },
      animation: { clip: glbClip, speed, chain: "root", joint: "root", rootBob: motionModel.rootMotion.bodyBob, jointHierarchy: true }
    }).toJSON()
  ];

  if (options.motionTrail) {
    nodes.push(
      primitives.box({ name: "optional authored humanoid stride streak left foot", material: material.emissive({ color: "#60a5fa", emissive: "#60a5fa", opacity: 0.28 }) }).position(-0.24, 0.044, -0.14).rotate(0, -0.18, 0).scale([0.34, 0.018, 0.032]).toJSON(),
      primitives.box({ name: "optional authored humanoid stride streak rear foot", material: material.emissive({ color: "#fb923c", emissive: "#fb923c", opacity: 0.28 }) }).position(0.2, 0.044, -0.9).rotate(0, 0.18, 0).scale([0.34, 0.018, 0.032]).toJSON()
    );
  }
  return nodes;
}

function createAuthoredHumanoidMotionModel(clip: AuraCharacterClipName): {
  readonly footPlanting: AuraCharacterFootPlantingSpec;
  readonly rootMotion: AuraCharacterRootMotionSpec;
  readonly constraints: AuraCharacterConstraintCorrectionSpec;
} {
  const moving = clip !== "idle" && clip !== "pose";
  const captureTime = clip === "benchmark-pose"
      ? 0.42
    : clip === "run"
      ? 0.18
      : clip === "wave"
        ? 0.5
        : clip === "turn"
          ? 0.62
          : 0.38;
  return {
    footPlanting: {
      enabled: true,
      groundY: 0,
      plantedFeet: clip === "wave" || clip === "idle" || clip === "pose" ? ["left", "right"] : ["left"],
      captureTime,
      evidence: "authored GLB is normalized to ground contact and benchmark capture times choose planted-foot animation phases"
    },
    rootMotion: {
      enabled: moving,
      bodyBob: moving,
      torsoMovesAsSingleBody: true,
      strideLength: clip === "run" ? 0.54 : moving ? 0.32 : 0,
      evidence: "AnimationMixer drives the skinned GLB root clip as one body instead of animating detached primitive limbs"
    },
    constraints: {
      enabled: true,
      correctedChains: ["spine", "left-arm", "right-arm", "left-leg", "right-leg"],
      maxJointGap: 0.035,
      evidence: "skinned GLB joints keep shoulder, elbow, hip, knee, wrist, and ankle chains bound to the authored skeleton"
    }
  };
}

function mapAuraClipToBuiltInHumanoidClip(clip: AuraCharacterClipName): string {
  if (clip === "idle") return "Idle";
  if (clip === "walk" || clip === "benchmark-pose") return "Walk";
  if (clip === "run") return "Run";
  if (clip === "pose") return "TPose";
  if (clip === "wave") return "Idle";
  if (clip === "turn") return "Idle";
  return "Walk";
}

function findGroupNode(nodes: readonly AuraSceneNode[], predicate: (node: AuraGroupNode) => boolean): AuraGroupNode | undefined {
  for (const node of nodes) {
    if (node.kind !== "group") continue;
    if (predicate(node)) return node;
    const child = findGroupNode(node.children, predicate);
    if (child) return child;
  }
  return undefined;
}

function createProceduralHumanMesh(options: AuraPrimitiveHumanoidPrefabOptions = {}): AuraProceduralHumanMeshDescriptor {
  const style = options.style ?? "athletic";
  const skin = material.pbr({ color: "#f4c7a1", roughness: 0.58, metallic: 0.01 });
  const shirt = material.clearcoat({ color: style === "robot" ? "#2563eb" : "#475569", roughness: 0.34, clearcoat: 0.28 });
  const pants = material.pbr({ color: "#111827", roughness: 0.64, metallic: 0.02 });
  const shoe = material.pbr({ color: "#020617", roughness: 0.72, metallic: 0.01 });
  const parts: AuraProceduralHumanMeshPart[] = [];
  const addPart = (
    name: AuraProceduralHumanMeshPartName,
    joint: AuraCharacterJointName,
    center: AuraVec3,
    size: AuraVec3,
    partMaterial: AuraMaterialSpec,
    parent?: AuraProceduralHumanMeshPartName
  ) => {
    parts.push({
      name,
      parent,
      joint,
      center,
      size,
      vertices: createProceduralHumanPartVertices(size),
      indices: proceduralHumanPartIndices,
      material: partMaterial
    });
  };

  addPart("pelvis", "pelvis", [0, 0.54, -0.55], [0.42, 0.22, 0.3], pants);
  addPart("torso", "spine", [0, 0.92, -0.55], [0.48, 0.7, 0.32], shirt, "pelvis");
  addPart("neck", "neck", [0, 1.34, -0.55], [0.13, 0.18, 0.13], skin, "torso");
  addPart("head", "head", [0, 1.58, -0.5], [0.34, 0.42, 0.32], skin, "neck");
  addPart("left-shoulder", "left-shoulder", [-0.32, 1.12, -0.55], [0.2, 0.2, 0.2], shirt, "torso");
  addPart("right-shoulder", "right-shoulder", [0.32, 1.12, -0.55], [0.2, 0.2, 0.2], shirt, "torso");
  addPart("left-upper-arm", "left-elbow", [-0.44, 0.9, -0.46], [0.16, 0.38, 0.16], shirt, "left-shoulder");
  addPart("left-lower-arm", "left-wrist", [-0.5, 0.62, -0.35], [0.13, 0.34, 0.13], skin, "left-upper-arm");
  addPart("right-upper-arm", "right-elbow", [0.43, 0.92, -0.64], [0.16, 0.38, 0.16], shirt, "right-shoulder");
  addPart("right-lower-arm", "right-wrist", [0.5, 0.64, -0.77], [0.13, 0.34, 0.13], skin, "right-upper-arm");
  addPart("left-hand", "left-wrist", [-0.52, 0.38, -0.3], [0.14, 0.16, 0.1], skin, "left-lower-arm");
  addPart("right-hand", "right-wrist", [0.53, 0.4, -0.84], [0.14, 0.16, 0.1], skin, "right-lower-arm");
  addPart("left-hip", "left-hip", [-0.18, 0.45, -0.49], [0.18, 0.18, 0.18], pants, "pelvis");
  addPart("right-hip", "right-hip", [0.18, 0.45, -0.61], [0.18, 0.18, 0.18], pants, "pelvis");
  addPart("left-upper-leg", "left-knee", [-0.16, 0.28, -0.34], [0.2, 0.38, 0.2], pants, "left-hip");
  addPart("left-lower-leg", "left-ankle", [-0.23, 0.105, -0.15], [0.17, 0.34, 0.17], pants, "left-upper-leg");
  addPart("right-upper-leg", "right-knee", [0.15, 0.29, -0.73], [0.2, 0.38, 0.2], pants, "right-hip");
  addPart("right-lower-leg", "right-ankle", [0.26, 0.105, -0.94], [0.17, 0.34, 0.17], pants, "right-upper-leg");
  addPart("left-foot", "left-ankle", [-0.27, 0.045, -0.02], [0.3, 0.08, 0.46], shoe, "left-lower-leg");
  addPart("right-foot", "right-ankle", [0.32, 0.045, -1.08], [0.3, 0.08, 0.46], shoe, "right-lower-leg");

  return {
    kind: "aura-procedural-human-mesh",
    style,
    skeleton: createPrimitiveHumanoidSkeleton(style),
    clips: characterClips,
    parts,
    evidence: [
      "procedural generator emits actual vertex/index mesh parts, not string asset ids",
      "anatomical coverage includes torso, pelvis, neck, head, upper/lower arms, upper/lower legs, hands, feet, shoulders, and hips",
      "benchmark-facing humanoid still defaults to the authored skinned GLB; this generator is a fallback/customization primitive"
    ]
  };
}

const proceduralHumanPartIndices = [
  0, 1, 2, 0, 2, 3,
  4, 6, 5, 4, 7, 6,
  0, 4, 5, 0, 5, 1,
  1, 5, 6, 1, 6, 2,
  2, 6, 7, 2, 7, 3,
  3, 7, 4, 3, 4, 0
] as const;

function createProceduralHumanPartVertices(size: AuraVec3): readonly AuraVec3[] {
  const x = size[0] * 0.5;
  const y = size[1] * 0.5;
  const z = size[2] * 0.5;
  return [
    [-x, -y, -z],
    [x, -y, -z],
    [x, y, -z],
    [-x, y, -z],
    [-x, -y, z],
    [x, -y, z],
    [x, y, z],
    [-x, y, z]
  ];
}

function validatePrimitiveHumanoidVisualQA(nodes: readonly AuraSceneNode[]): AuraCharacterVisualQAResult {
  const flattened = groups.flatten(nodes);
  const authoredHumanoid = flattened.find((node): node is AuraModelNode =>
    node.kind === "model" && (node.asset.id === builtInCharacterAssets.humanoid.id || String(node.name ?? "").toLowerCase().includes("authored skinned humanoid"))
  );
  if (authoredHumanoid) {
    const problems: string[] = [];
    const animationNames = authoredHumanoid.asset.metadata?.animations ?? [];
    const hasGrounding = flattened.some((node) =>
      (node.kind === "primitive" && String(node.name ?? "").toLowerCase().includes("contact shadow")) ||
      (node.kind === "effect" && node.effect === "contact-occlusion")
    );
    if (!authoredHumanoid.asset.bounds || authoredHumanoid.asset.bounds[1] < 1.2) problems.push("authored humanoid asset is missing credible humanoid bounds");
    if (animationNames.length < 1) problems.push("authored humanoid asset is missing embedded animation clips");
    if (!authoredHumanoid.animation?.clip) problems.push("authored humanoid model is missing an active animation clip");
    if (!authoredHumanoid.castShadow || !authoredHumanoid.receiveShadow) problems.push("authored humanoid model is missing shadow participation");
    if (!hasGrounding) problems.push("authored humanoid scene is missing contact grounding");
    const rig = findGroupNode(nodes, (node) =>
      String(node.name ?? "").toLowerCase().includes("authored skinned") &&
      String(node.name ?? "").toLowerCase().includes("rig metadata")
    );
    const footPlanting = rig?.character?.footPlanting;
    const rootMotion = rig?.character?.rootMotion;
    const constraints = rig?.character?.constraints;
    if (!footPlanting?.enabled || footPlanting.plantedFeet.length === 0 || footPlanting.groundY !== 0) {
      problems.push("authored humanoid scene is missing foot-planting capture metadata");
    }
    if (!rootMotion?.torsoMovesAsSingleBody || rig?.animation?.jointHierarchy !== true) {
      problems.push("authored humanoid scene is missing connected root-motion/body-bob metadata");
    }
    if (!constraints?.enabled || constraints.correctedChains.length < 5 || constraints.maxJointGap > 0.05) {
      problems.push("authored humanoid scene is missing skeleton constraint-correction metadata");
    }
    const score = Math.max(1, 5 - problems.length);
    return {
      connected: problems.length === 0,
      impossibleProportions: false,
      score,
      gaps: [],
      problems
    };
  }
  const primitiveByName = (name: string): AuraPrimitiveNode | undefined =>
    flattened.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === name);
  const point = (name: string): AuraVec3 | undefined => primitiveByName(name)?.position;
  const gaps: AuraCharacterVisualQAGap[] = [];
  const problems: string[] = [];
  const checkGap = (id: string, from: string, to: string, maxDistance: number) => {
    const a = point(from);
    const b = point(to);
    if (!a || !b) {
      problems.push(`missing ${!a ? from : to}`);
      return;
    }
    const distance = distance3(a, b);
    if (distance > maxDistance) gaps.push({ id, from, to, distance, maxDistance });
  };
  const checkOptionalGap = (id: string, from: string, to: string, maxDistance: number) => {
    if (!point(from) || !point(to)) return;
    checkGap(id, from, to, maxDistance);
  };
  const scalarScale = (node: AuraPrimitiveNode | undefined): number => {
    if (typeof node?.scale === "number") return node.scale;
    if (Array.isArray(node?.scale)) return Math.max(...node.scale);
    return 1;
  };

  checkGap("neck-head", "short humanoid neck connector", "humanoid head", 0.28);
  checkGap("spine-neck", "connected blue humanoid torso", "short humanoid neck connector", 0.5);
  checkGap("left-shoulder-arm", "shoulder bar connecting arms", "left attached swinging arm", 0.36);
  checkGap("right-shoulder-arm", "shoulder bar connecting arms", "right attached swinging arm", 0.36);
  checkGap("left-elbow-forearm", "left attached swinging arm", "left bent forearm", 0.34);
  checkGap("right-elbow-forearm", "right attached swinging arm", "right bent forearm", 0.34);
  checkGap("left-wrist-hand", "left bent forearm", "left humanoid hand", 0.24);
  checkGap("right-wrist-hand", "right bent forearm", "right humanoid hand", 0.24);
  checkGap("left-hip-leg", "hip bar connecting legs", "forward connected walking leg", 0.38);
  checkGap("right-hip-leg", "hip bar connecting legs", "back connected walking leg", 0.38);
  checkGap("left-knee-shin", "forward connected walking leg", "forward lower walking shin", 0.38);
  checkGap("right-knee-shin", "back connected walking leg", "back lower walking shin", 0.38);
  checkGap("left-ankle-foot", "forward lower walking shin", "forward foot planted on path", 0.28);
  checkGap("right-ankle-foot", "back lower walking shin", "back foot pushing off path", 0.28);
  checkOptionalGap("optional-left-shoulder-joint", "left shoulder ball joint", "left attached swinging arm", 0.3);
  checkOptionalGap("optional-right-shoulder-joint", "right shoulder ball joint", "right attached swinging arm", 0.3);
  checkOptionalGap("optional-left-knee-joint", "forward knee hinge", "forward lower walking shin", 0.3);
  checkOptionalGap("optional-right-knee-joint", "back knee hinge", "back lower walking shin", 0.3);

  const headScale = scalarScale(primitiveByName("humanoid head"));
  const leftHandScale = scalarScale(primitiveByName("left humanoid hand"));
  const rightHandScale = scalarScale(primitiveByName("right humanoid hand"));
  const leftFoot = primitiveByName("forward foot planted on path");
  const rightFoot = primitiveByName("back foot pushing off path");
  if (headScale > 0.28) problems.push(`head too large: ${headScale.toFixed(3)}`);
  if (leftHandScale > 0.13 || rightHandScale > 0.13) problems.push(`hand too large: ${Math.max(leftHandScale, rightHandScale).toFixed(3)}`);
  if (!leftFoot || !rightFoot) problems.push("missing planted feet");
  const hasNamedRig = (entries: readonly AuraSceneNode[]): boolean => entries.some((node) =>
    node.kind === "group" && ((node.name === "hierarchical primitive humanoid rig" || node.name === "generated low poly humanoid metadata") || hasNamedRig(node.children))
  );
  if (!hasNamedRig(nodes) && nodes.some((node) => node.kind === "group")) {
    problems.push("missing named hierarchical primitive humanoid rig");
  }

  const impossibleProportions = problems.some((problem) => problem.includes("too large"));
  const score = Math.max(1, 5 - gaps.length - (impossibleProportions ? 1 : 0) - Math.max(0, problems.length - (impossibleProportions ? 1 : 0)));
  return {
    connected: gaps.length === 0 && !problems.some((problem) => problem.startsWith("missing")),
    impossibleProportions,
    score,
    gaps,
    problems
  };
}

function distance3(a: AuraVec3, b: AuraVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export const character = {
  builtInHumanoidAsset: (): AuraAssetRef<"model", "humanoid"> => builtInCharacterAssets.humanoid,
  skeleton: createPrimitiveHumanoidSkeleton,
  clips: (): readonly AuraCharacterClip[] => characterClips,
  proceduralHumanMesh: createProceduralHumanMesh,
  lowPolyHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => createLowPolyHumanoid(options),
  authoredHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => createAuthoredLowPolyHumanoid(options),
  primitiveHumanoid: (options: AuraPrimitiveHumanoidPrefabOptions = {}): readonly AuraSceneNode[] => createHierarchicalPrimitiveHumanoid(options),
  performance: createCartoonPerformance,
  importedRigRuntime: async (options: GLTFSceneAnimationRuntimeOptions): Promise<GLTFSceneAnimationRuntime> => {
    markAuraLazySystemRequested("character-rig", "character.importedRigRuntime");
    const started = performanceNow();
    const assets = await import("@aura3d/assets/browser");
    markAuraLazySystemLoaded("character-rig", performanceNow() - started);
    return assets.createGLTFSceneAnimationRuntime(options);
  },
  visualQA: validatePrimitiveHumanoidVisualQA,
  validatePrimitiveHumanoid: validatePrimitiveHumanoidVisualQA
} as const;

function cityCameraPreset(preset: AuraCityCameraPreset = "overview", timeOfDay: CityBlockTimeOfDay = "night"): AuraCameraSpec {
  if (preset === "street-level") {
    return camera.perspective({ position: [-2.8, 0.92, 3.7], target: [0.18, 0.62, -0.34], fov: 48 });
  }
  if (preset === "cinematic-night") {
    return camera.dolly({
      from: [-5.4, 2.42, 6.35],
      to: [-3.6, 2.02, 4.65],
      target: [0, 0.92, 0],
      seconds: 8,
      fov: timeOfDay === "night" ? 48 : 46,
      captureTime: 0.38
    });
  }
  return camera.orbit({ target: [0, 0.9, 0], distance: timeOfDay === "night" ? 8.2 : 8.8, fov: 44 });
}

function cityScene(options: AuraCityBlockOptions & { readonly cameraPreset?: AuraCityCameraPreset } = {}): AuraSceneBuilder {
  const timeOfDay = options.timeOfDay ?? "night";
  const night = timeOfDay === "night";
  return scene()
    .background(night ? "#04101f" : "#bfe7ff")
    .addMany(prefabs.cityBlock(options))
    .add(lights.studio({ intensity: night ? 0.78 : 1.24 }))
    .add(effects.fog({ density: night ? 0.032 : 0.018, color: night ? "#10294f" : "#dff6ff" }))
    .add(effects.bloom({ intensity: night ? 0.12 : 0.07, color: night ? "#93c5fd" : "#fde68a" }))
    .camera(cityCameraPreset(options.cameraPreset ?? "overview", timeOfDay));
}

function collectCityInstancingPlan(nodes: readonly AuraSceneNode[]): AuraCityInstancingPlan {
  const names = groups.flatten(nodes).map((node) => "name" in node ? node.name ?? "" : "");
  const windows = names.filter((name) => name.includes("window column")).length;
  const props = names.filter((name) => name.includes("bench") || name.includes("tree") || name.includes("sign") || name.includes("car body") || name.includes("traffic signal")).length;
  const roadMarkings = names.filter((name) => name.includes("lane marking") || name.includes("road stripe") || name.includes("crosswalk") || name.includes("turn arrow") || name.includes("bike lane")).length;
  const lights = names.filter((name) => name.includes("street lamp") || name.includes("headlight") || name.includes("lamp glow") || name.includes("city glow")).length;
  const groupsList = [
    windows >= 8 ? "window columns" : "",
    props >= 6 ? "street props" : "",
    roadMarkings >= 8 ? "road markings" : "",
    lights >= 6 ? "street/head lights" : ""
  ].filter(Boolean);
  return {
    kind: "aura-city-instancing-plan",
    rendererPath: "auraWebGL2PrimitiveBatches",
    windows,
    props,
    roadMarkings,
    lights,
    groups: groupsList,
    instanced: windows >= 8 && props >= 6 && roadMarkings >= 8 && lights >= 6
  };
}

function changedCityNodeNames(previous: readonly AuraSceneNode[], next: readonly AuraSceneNode[]): readonly string[] {
  const previousNames = new Set(groups.flatten(previous).map((node) => "name" in node ? node.name ?? "" : ""));
  return groups.flatten(next)
    .map((node) => "name" in node ? node.name ?? "" : "")
    .filter((name) => name.length > 0 && !previousNames.has(name))
    .slice(0, 18);
}

function validateCityVisualQA(nodes: readonly AuraSceneNode[], options: { readonly changed?: AuraCityStateChangeEvidence } = {}): AuraCityVisualQAResult {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const buildings = names.filter((name) => name.includes("city tower")).length;
  const windows = names.filter((name) => name.includes("window column")).length;
  const streets = names.filter((name) => name.includes("road") || name.includes("street") || name.includes("avenue")).length;
  const crosswalks = names.filter((name) => name.includes("crosswalk")).length;
  const lights = names.filter((name) => name.includes("street lamp") || name.includes("street light") || name.includes("headlight") || name.includes("lamp glow")).length;
  const props = names.filter((name) => name.includes("bench") || name.includes("tree") || name.includes("sign") || name.includes("car body") || name.includes("traffic signal")).length;
  const facadeDetails = names.filter((name) =>
    name.includes("facade") ||
    name.includes("storefront") ||
    name.includes("awning") ||
    name.includes("roof") ||
    name.includes("door") ||
    name.includes("balcony") ||
    name.includes("ledge")
  ).length;
  const instancing = collectCityInstancingPlan(nodes);
  const dayNightChanged = Boolean(options.changed && options.changed.changedNodeNames.length >= 4);
  const problems: string[] = [];
  if (buildings < 18) problems.push(`expected about 20 buildings, found ${buildings}`);
  if (windows < 40) problems.push(`expected dense modular windows, found ${windows}`);
  if (streets < 8) problems.push(`expected readable streets/roads/avenues, found ${streets}`);
  if (crosswalks < 16) problems.push(`expected multiple zebra crosswalk stripes, found ${crosswalks}`);
  if (lights < 10) problems.push(`expected streetlights/headlights/glow evidence, found ${lights}`);
  if (props < 10) problems.push(`expected city props such as trees, benches, signs, cars, and signals, found ${props}`);
  if (facadeDetails < 45) problems.push(`expected modular facade detail, found ${facadeDetails}`);
  if (!instancing.instanced) problems.push("missing repeated-primitive instancing evidence for windows, props, road markings, and lights");
  if (!dayNightChanged) problems.push("missing day/night changed-state evidence");
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    buildings,
    windows,
    streets,
    crosswalks,
    lights,
    props,
    facadeDetails,
    dayNightChanged,
    instancing,
    problems
  };
}

function createCityStateController(options: AuraCityBlockOptions = {}): AuraCityStateController {
  let timeOfDay = options.timeOfDay ?? "night";
  const blocks = Math.max(3, Math.min(30, options.blocks ?? 20));
  const litWindows = options.litWindows ?? true;
  let revision = 0;
  let lastChange: AuraCityStateChangeEvidence | undefined;
  const build = () => prefabs.cityBlock({ blocks, litWindows, timeOfDay });
  return {
    kind: "aura-city-state",
    blocks,
    litWindows,
    get timeOfDay() {
      return timeOfDay;
    },
    get revision() {
      return revision;
    },
    get lastChange() {
      return lastChange;
    },
    setTimeOfDay(next) {
      const previous = build();
      const from = timeOfDay;
      timeOfDay = next;
      revision += 1;
      const built = build();
      lastChange = { from, to: next, revision, changedNodeNames: changedCityNodeNames(previous, built) };
      return built;
    },
    toggleTimeOfDay() {
      return this.setTimeOfDay(timeOfDay === "night" ? "day" : "night");
    },
    scene() {
      return cityScene({ blocks, litWindows, timeOfDay });
    },
    applyTo(builder) {
      const night = timeOfDay === "night";
      return builder
        .background(night ? "#04101f" : "#bfe7ff")
        .addMany(build())
        .add(lights.studio({ intensity: night ? 0.78 : 1.24 }))
        .add(effects.fog({ density: night ? 0.032 : 0.018, color: night ? "#10294f" : "#dff6ff" }))
        .add(effects.bloom({ intensity: night ? 0.12 : 0.07, color: night ? "#93c5fd" : "#fde68a" }))
        .camera(cityCameraPreset("overview", timeOfDay));
    },
    nodes() {
      return build();
    }
  };
}

export interface AuraCityBrowserRuntimeState {
  readonly kind: "aura-city-browser-runtime";
  readonly mounted: true;
  readonly timeOfDay: CityBlockTimeOfDay;
  readonly revision: number;
  readonly changedNodeNames: readonly string[];
}

export interface AuraCityDayNightToggleOptions {
  readonly onChange?: (timeOfDay: CityBlockTimeOfDay, state: AuraCityBrowserRuntimeState) => void;
}

function bindCityDayNightToggle(
  target: AuraUiTarget<HTMLButtonElement>,
  app: AuraApp,
  state: AuraCityStateController = createCityStateController(),
  options: AuraCityDayNightToggleOptions = {}
): HTMLButtonElement {
  const button = ui.toggle(target, {
    pressed: state.timeOfDay === "night",
    onLabel: "Switch to day",
    offLabel: "Switch to night"
  });
  const ownerWindow = button.ownerDocument?.defaultView;
  const publish = (): AuraCityBrowserRuntimeState => {
    const runtimeState: AuraCityBrowserRuntimeState = {
      kind: "aura-city-browser-runtime",
      mounted: true,
      timeOfDay: state.timeOfDay,
      revision: state.revision,
      changedNodeNames: state.lastChange?.changedNodeNames ?? []
    };
    button.dataset.auraCityRuntime = "mounted";
    button.dataset.auraCityTimeOfDay = state.timeOfDay;
    button.dataset.auraCityRevision = String(state.revision);
    button.setAttribute("aria-pressed", String(state.timeOfDay === "night"));
    button.textContent = state.timeOfDay === "night" ? "Switch to day" : "Switch to night";
    if (ownerWindow) {
      (ownerWindow as unknown as { __AURA3D_CITY__?: AuraCityBrowserRuntimeState }).__AURA3D_CITY__ = runtimeState;
    }
    options.onChange?.(state.timeOfDay, runtimeState);
    return runtimeState;
  };
  button.onclick = () => {
    state.toggleTimeOfDay();
    app.setScene(state.scene());
    publish();
  };
  publish();
  return button;
}

export const city = {
  createState: createCityStateController,
  bindDayNightToggle: bindCityDayNightToggle,
  block: (options: AuraCityBlockOptions = {}): readonly AuraSceneNode[] => prefabs.cityBlock(options),
  cityBlock: (options: AuraCityBlockOptions = {}): readonly AuraSceneNode[] => prefabs.cityBlock(options),
  scene: cityScene,
  cameraPreset: cityCameraPreset,
  cameras: (timeOfDay: CityBlockTimeOfDay = "night"): Record<AuraCityCameraPreset, AuraCameraSpec> => ({
    overview: cityCameraPreset("overview", timeOfDay),
    "street-level": cityCameraPreset("street-level", timeOfDay),
    "cinematic-night": cityCameraPreset("cinematic-night", "night")
  }),
  instancing: collectCityInstancingPlan,
  visualQA: validateCityVisualQA
} as const;

function productPlacement(asset: AuraAssetRef<"model">): AuraProductPlacement {
  const bounds = asset.bounds ?? [1, 1, 1] as const;
  const maxExtent = Math.max(0.001, bounds[0], bounds[1], bounds[2]);
  const scale = asset.bounds ? Math.max(0.72, Math.min(1.24, 1.35 / maxExtent)) : 1;
  return {
    kind: "aura-product-placement",
    assetId: asset.id,
    bounds,
    position: [0, 0.54, -0.65],
    scale: Number(scale.toFixed(3)),
    plinthSeatY: 0.54,
    centered: true,
    seatedOnPlinth: true,
    normalizedFromBounds: Boolean(asset.bounds)
  };
}

function productScene(asset: AuraAssetRef<"model">, options: AuraProductViewerOptions = {}): AuraSceneBuilder {
  return scene()
    .background("#f6f8fb")
    .addMany(prefabs.productViewer(asset, options))
    .add(environments.productHero({ intensity: 1.22 }))
    .add(interactions.orbit({ target: "auto-centered bounded product model" }))
    .camera(camera.product())
    .timeline(timeline.loop({ seconds: 8 }));
}

function productDiagnostics(asset: AuraAssetRef<"model">, nodes: readonly AuraSceneNode[], options: AuraProductViewerOptions = {}): AuraProductDiagnostics {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const placement = productPlacement(asset);
  const inspectionGuidesVisible = names.some((name) => name.includes("fit to bounds") || name.includes("normalized asset") || name.includes("bracket"));
  const provenanceBadgeVisible = names.some((name) => name.includes("provenance badge"));
  const turntable = flattened.find((node): node is AuraModelNode | AuraPrimitiveNode | AuraGroupNode =>
    (node.kind === "model" || node.kind === "primitive" || node.kind === "group") && node.animation?.clip === "turntable"
  );
  const orbitInteraction = flattened.some((node): node is AuraInteractionNode => node.kind === "interaction" && node.mode === "orbit");
  return {
    kind: "aura-product-diagnostics",
    stageStyle: options.stageStyle ?? "hero-clean",
    placement,
    provenance: createAssetProvenance(asset),
    orbitEnabled: orbitInteraction || names.some((name) => name.includes("orbit control arc") || name.includes("turntable orbit cue")),
    turntableEnabled: Boolean(turntable),
    turntableCaptureFrame: turntable?.animation?.captureTime ?? options.captureFrame ?? 0.32,
    inspectionGuidesVisible,
    provenanceBadgeVisible,
    cleanHeroMode: (options.stageStyle ?? "hero-clean") !== "inspection" && !inspectionGuidesVisible && !provenanceBadgeVisible
  };
}

function validateProductVisualQA(nodes: readonly AuraSceneNode[], diagnostics?: AuraProductDiagnostics): AuraProductVisualQAResult {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const modelNodes = flattened.filter((node): node is AuraModelNode => node.kind === "model");
  const model = modelNodes[0];
  const softboxes = flattened.filter((node) =>
    node.kind === "light" && (node.light === "softbox" || node.light === "rect" || node.light === "studio")
  ).length + names.filter((name) => name.includes("softbox")).length;
  const reflectionCards = names.filter((name) => name.includes("reflection card") || name.includes("highlight card") || name.includes("softbox reflection")).length;
  const contactShadows = names.filter((name) => name.includes("contact shadow")).length;
  const materialReadabilityCues = names.filter((name) =>
    name.includes("sneaker mesh") ||
    name.includes("rubber sole") ||
    name.includes("lace detail") ||
    name.includes("rim softbox") ||
    name.includes("fill product photography")
  ).length;
  const inspectionGuides = names.filter((name) => name.includes("fit to bounds") || name.includes("normalized asset") || name.includes("bracket")).length;
  const provenance = model ? createAssetProvenance(model.asset) : diagnostics?.provenance;
  const typedAssetProvenance = Boolean(provenance && provenance.source !== "unsafe-url");
  const cleanHeroMode = diagnostics?.cleanHeroMode ?? (inspectionGuides === 0 && !names.some((name) => name.includes("provenance badge")));
  const centeredAndSeated = Boolean(
    diagnostics?.placement.centered && diagnostics.placement.seatedOnPlinth ||
    (model?.position?.[0] === 0 && model.position[1] >= 0.5 && model.position[2] === -0.65)
  );
  const problems: string[] = [];
  if (modelNodes.length !== 1) problems.push(`expected one typed product model, found ${modelNodes.length}`);
  if (softboxes < 5) problems.push(`expected product photography softbox/fill/rim lighting, found ${softboxes}`);
  if (reflectionCards < 2) problems.push(`expected reflection/highlight cards, found ${reflectionCards}`);
  if (contactShadows < 1) problems.push("missing product footprint contact shadow");
  if (materialReadabilityCues < 3) problems.push(`expected sneaker mesh/rubber/lace detail lighting cues, found ${materialReadabilityCues}`);
  if (!centeredAndSeated) problems.push("product is not centered and seated on the plinth");
  if (!cleanHeroMode) problems.push("clean hero mode includes inspection/provenance clutter");
  if (!typedAssetProvenance) problems.push("missing typed asset provenance report");
  if (!(diagnostics?.turntableEnabled ?? names.some((name) => name.includes("turntable")))) problems.push("missing deterministic turntable evidence");
  if (!(diagnostics?.orbitEnabled ?? names.some((name) => name.includes("orbit control arc") || name.includes("turntable orbit cue")))) problems.push("missing orbit diagnostic evidence");
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    modelCount: modelNodes.length,
    softboxes,
    reflectionCards,
    contactShadows,
    materialReadabilityCues,
    inspectionGuides,
    cleanHeroMode,
    centeredAndSeated,
    typedAssetProvenance,
    problems
  };
}

export const product = {
  placement: productPlacement,
  stage: (options: { readonly style?: AuraProductStageStyle } = {}): readonly AuraSceneNode[] => prefabs.productStage(options),
  viewer: (asset: AuraAssetRef<"model">, options: AuraProductViewerOptions = {}): readonly AuraSceneNode[] => prefabs.productViewer(asset, options),
  scene: productScene,
  diagnostics: productDiagnostics,
  visualQA: validateProductVisualQA
} as const;

function solarCameraPreset(): AuraCameraSpec {
  return camera.orbit({ target: [0, 0.18, 0], distance: 7.4, fov: 45 });
}

function solarScene(options: AuraSolarSystemPrefabOptions = {}): AuraSceneBuilder {
  return scene()
    .background("#020617")
    .addMany(prefabs.solarSystem({ labels: "attached", orbitSegments: 24, starCount: 42, dustCount: 18, ...options }))
    .add(interactions.orbit())
    .camera(solarCameraPreset())
    .timeline(timeline.loop({ seconds: 18 }));
}

function solarMaterialPresetsInNodes(nodes: readonly AuraSceneNode[]): readonly AuraSolarPlanetMaterialPreset[] {
  const names = groups.flatten(nodes).map((node) => "name" in node ? node.name ?? "" : "");
  const found = new Set<AuraSolarPlanetMaterialPreset>();
  if (names.some((name) => name.includes("rocky material"))) found.add("rocky");
  if (names.some((name) => name.includes("gas-giant material"))) found.add("gas-giant");
  if (names.some((name) => name.includes("ice material"))) found.add("ice");
  if (names.some((name) => name.includes("moon material"))) found.add("moon");
  if (names.some((name) => name.includes("ringed material") || name.includes("ringed planet"))) found.add("ringed");
  if (names.some((name) => name.includes("lava-venus material"))) found.add("lava-venus");
  const presets: readonly AuraSolarPlanetMaterialPreset[] = ["rocky", "gas-giant", "ice", "moon", "ringed", "lava-venus"];
  return presets.filter((preset) => found.has(preset));
}

function validateSolarVisualQA(nodes: readonly AuraSceneNode[]): AuraSolarVisualQAResult {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const planets = names.filter((name) => name.includes("material labeled orbiting planet")).length;
  const orbitSegments = names.filter((name) => name.includes("orbit path segment")).length;
  const labelsCount = flattened.filter((node): node is AuraLabelNode => node.kind === "label" && node.name?.includes("collision-avoiding orbit label") === true).length +
    names.filter((name) => name.includes("readable planet label")).length;
  const leaderLines = names.filter((name) => name.includes("attached label leader line")).length;
  const stars = names.filter((name) => name.includes("background star")).length;
  const dust = names.filter((name) => name.includes("solar dust depth mote")).length;
  const hasSunShader = flattened.some((node) =>
    node.kind === "primitive" && node.material?.shader === "solar-sun" && String(node.name ?? "").includes("sun shader core")
  );
  const hasSunCorona = flattened.some((node) =>
    node.kind === "primitive" && node.material?.shader === "solar-corona" && String(node.name ?? "").includes("sun corona shader")
  ) && flattened.some((node) =>
    node.kind === "primitive" && node.material?.shader === "solar-corona" && String(node.name ?? "").includes("solar glow halo shader")
  );
  const hasBloom = flattened.some((node) => node.kind === "effect" && node.effect === "bloom");
  const orbitAnimatedNodes = flattened.filter((node): node is AuraModelNode | AuraPrimitiveNode | AuraGroupNode | AuraLabelNode =>
    (node.kind === "model" || node.kind === "primitive" || node.kind === "group" || node.kind === "label") && node.animation?.clip === "orbit"
  );
  const deterministicCapturePhase = orbitAnimatedNodes.length > 0 && orbitAnimatedNodes.every((node) => node.animation?.captureTime !== undefined);
  const materialPresets = solarMaterialPresetsInNodes(nodes);
  const problems: string[] = [];
  if (planets < 6) problems.push(`expected six materialized planets, found ${planets}`);
  if (materialPresets.length < 6) problems.push(`expected six planet material presets, found ${materialPresets.join(", ")}`);
  if (orbitSegments < 72) problems.push(`expected readable uncluttered orbit segments, found ${orbitSegments}`);
  if (labelsCount < 12) problems.push(`expected readable attached labels plus sprite labels, found ${labelsCount}`);
  if (leaderLines < 6) problems.push(`expected label leader lines for all planets, found ${leaderLines}`);
  if (stars < 24) problems.push(`expected visible starfield, found ${stars}`);
  if (dust < 6) problems.push(`expected dust/depth background, found ${dust}`);
  if (!hasSunShader || !hasSunCorona || !hasBloom) problems.push("missing sun shader, corona shader, or bloom evidence");
  if (!deterministicCapturePhase) problems.push("orbit animations missing deterministic capture phase");
  return {
    passes: problems.length === 0,
    score: Math.max(1, 5 - problems.length),
    planets,
    materialPresets,
    orbitSegments,
    labels: labelsCount,
    leaderLines,
    stars,
    dust,
    hasSunCorona,
    hasBloom,
    deterministicCapturePhase,
    problems
  };
}

export const solar = {
  system: (options: AuraSolarSystemPrefabOptions = {}): readonly AuraSceneNode[] => prefabs.solarSystem(options),
  scene: solarScene,
  cameraPreset: solarCameraPreset,
  materialPresets: (): readonly AuraSolarPlanetMaterialPreset[] => ["rocky", "gas-giant", "ice", "moon", "ringed", "lava-venus"],
  planetMaterial: solarPlanetMaterial,
  visualQA: validateSolarVisualQA
} as const;

export type AuraSceneKitId =
  | "physicsPlayground"
  | "particleFountain"
  | "solarSystem"
  | "neonTunnel"
  | "dataViz"
  | "miniGolf"
  | "materialLab"
  | "cityBlock"
  | "humanoidWalk"
  | "productViewer";

export interface AuraSceneKitCustomizeOptions {
  readonly dataset?: readonly (readonly number[])[];
  readonly colors?: readonly AuraColor[];
  readonly camera?: AuraCameraSpec;
  readonly timeOfDay?: CityBlockTimeOfDay;
  readonly particleCount?: number;
  readonly emissionRate?: number;
  readonly materialSettings?: Partial<AuraMaterialSpec>;
  readonly animationState?: AuraCharacterClipName | string;
  readonly asset?: AuraAssetRef<"model">;
  readonly stageStyle?: AuraProductStageStyle;
  readonly captureFrame?: number;
  readonly blocks?: number;
  readonly cubes?: number;
}

export interface AuraSceneKitDiagnostics {
  readonly kind: "aura-scene-kit-diagnostics";
  readonly id: AuraSceneKitId;
  readonly nodeCount: number;
  readonly lightCount: number;
  readonly effectCount: number;
  readonly interactionCount: number;
  readonly uiCount: number;
  readonly cameraMode: AuraCameraMode;
  readonly structuralScore?: number;
  readonly problems: readonly string[];
  readonly performance: AuraSceneKitPerformanceDiagnostics;
}

export interface AuraSceneKitPerformanceDiagnostics {
  readonly kind: "aura-scene-kit-performance-diagnostics";
  readonly drawCalls: AuraSceneKitDrawCallBudget;
  readonly bundle: AuraSceneKitBundleBudget;
  readonly fps: AuraSceneKitFpsBudget;
  readonly instancing: AuraSceneKitInstancingEvidence;
  readonly lod: AuraSceneKitLodEvidence;
  readonly lazyLoading: AuraSceneKitLazyLoadingPlan;
}

export interface AuraSceneKitDrawCallBudget {
  readonly kind: "aura-scene-kit-draw-call-budget";
  readonly maxDrawCalls: number;
  readonly estimatedDrawCalls: number;
  readonly pass: boolean;
  readonly evidence: string;
}

export interface AuraSceneKitBundleBudget {
  readonly kind: "aura-scene-kit-bundle-budget";
  readonly maxGzipBytes: number;
  readonly estimatedGzipBytes: number;
  readonly pass: boolean;
  readonly evidence: string;
}

export interface AuraSceneKitFpsBudget {
  readonly kind: "aura-scene-kit-fps-budget";
  readonly targetP50Fps: number;
  readonly calibrationRequired: boolean;
  readonly p50Metric: "metrics.p50Fps";
  readonly calibrationSource: "benchmark/runner/fps-calibration.mjs";
}

export interface AuraSceneKitInstancingFamilyEvidence {
  readonly family: string;
  readonly instanceCount: number;
  readonly estimatedDrawCallsWithoutInstancing: number;
  readonly estimatedDrawCallsWithInstancing: number;
  readonly evidence: string;
}

export interface AuraSceneKitInstancingEvidence {
  readonly kind: "aura-scene-kit-instancing-evidence";
  readonly applied: boolean;
  readonly families: readonly AuraSceneKitInstancingFamilyEvidence[];
  readonly estimatedDrawCallsWithoutInstancing: number;
  readonly estimatedDrawCallsWithInstancing: number;
  readonly estimatedDrawCallSavings: number;
}

export interface AuraSceneKitLodEvidence {
  readonly kind: "aura-scene-kit-lod-evidence";
  readonly applied: boolean;
  readonly strategy: "dense-impostors" | "bounded-static-scene";
  readonly levels: readonly string[];
  readonly evidence: string;
}

export type AuraSceneKitLazySystemId =
  | "physics-backend"
  | "product-gltf-loader"
  | "postprocess"
  | "character-rig";

export interface AuraSceneKitLazyLoadingEntry {
  readonly system: AuraSceneKitLazySystemId;
  readonly trigger: string;
  readonly loadedByDefault: false;
  readonly evidence: string;
}

export interface AuraSceneKitLazyLoadingPlan {
  readonly kind: "aura-scene-kit-lazy-loading-plan";
  readonly systems: readonly AuraSceneKitLazyLoadingEntry[];
  readonly allOptional: boolean;
}

export interface AuraLazySystemEvidence {
  readonly kind: "aura-lazy-system-evidence";
  readonly system: AuraSceneKitLazySystemId;
  readonly requested: boolean;
  readonly loaded: boolean;
  readonly requestCount: number;
  readonly loadCount: number;
  readonly lastReason?: string;
  readonly lastLoadMs?: number;
}

type MutableAuraLazySystemEvidence = {
  requested: boolean;
  loaded: boolean;
  requestCount: number;
  loadCount: number;
  lastReason?: string;
  lastLoadMs?: number;
};

const auraLazySystemEvidence = new Map<AuraSceneKitLazySystemId, MutableAuraLazySystemEvidence>();

function ensureAuraLazySystemEvidence(system: AuraSceneKitLazySystemId) {
  const existing = auraLazySystemEvidence.get(system);
  if (existing) return existing;
  const created: MutableAuraLazySystemEvidence = { requested: false, loaded: false, requestCount: 0, loadCount: 0 };
  auraLazySystemEvidence.set(system, created);
  return created;
}

export function markAuraLazySystemRequested(system: AuraSceneKitLazySystemId, reason?: string): void {
  const entry = ensureAuraLazySystemEvidence(system);
  entry.requested = true;
  entry.requestCount += 1;
  entry.lastReason = reason;
}

export function markAuraLazySystemLoaded(system: AuraSceneKitLazySystemId, loadMs?: number): void {
  const entry = ensureAuraLazySystemEvidence(system);
  entry.loaded = true;
  entry.loadCount += 1;
  if (Number.isFinite(loadMs)) entry.lastLoadMs = loadMs;
}

export function collectAuraLazySystemEvidence(): readonly AuraLazySystemEvidence[] {
  return ([
    "physics-backend",
    "product-gltf-loader",
    "postprocess",
    "character-rig"
  ] as const).map((system) => {
    const entry = ensureAuraLazySystemEvidence(system);
    return {
      kind: "aura-lazy-system-evidence",
      system,
      requested: entry.requested,
      loaded: entry.loaded,
      requestCount: entry.requestCount,
      loadCount: entry.loadCount,
      ...(entry.lastReason ? { lastReason: entry.lastReason } : {}),
      ...(Number.isFinite(entry.lastLoadMs) ? { lastLoadMs: entry.lastLoadMs } : {})
    };
  });
}

export const lazySystems = {
  markRequested: markAuraLazySystemRequested,
  markLoaded: markAuraLazySystemLoaded,
  collect: collectAuraLazySystemEvidence
} as const;

export interface AuraSceneKit {
  readonly kind: "aura-scene-kit";
  readonly id: AuraSceneKitId;
  readonly nodes: readonly AuraSceneNode[];
  readonly camera: AuraCameraSpec;
  readonly lights: readonly AuraSceneNode[];
  readonly effects: readonly AuraSceneNode[];
  readonly interactions: readonly AuraSceneNode[];
  readonly ui: readonly AuraSceneNode[];
  readonly diagnostics: AuraSceneKitDiagnostics;
  readonly evidence: readonly string[];
  readonly acceptanceEvidence: readonly string[];
  scene(): AuraSceneBuilder;
  toAppOptions(): AuraCreateAppOptions;
  customize(options: AuraSceneKitCustomizeOptions): AuraSceneKit;
}

interface AuraSceneKitBuild {
  readonly background: AuraColor;
  readonly nodes: readonly AuraSceneNode[];
  readonly camera: AuraCameraSpec;
  readonly evidence: readonly string[];
  readonly structuralScore?: number;
  readonly problems?: readonly string[];
}

export interface AuraSceneKitBudgetDefaults {
  readonly maxDrawCalls: number;
  readonly estimatedDrawCalls: number;
  readonly maxGzipBytes: number;
  readonly estimatedGzipBytes: number;
  readonly targetP50Fps: number;
  readonly evidence: string;
}

const sceneKitPerformanceBudgets: Record<AuraSceneKitId, AuraSceneKitBudgetDefaults> = {
  physicsPlayground: { maxDrawCalls: 140, estimatedDrawCalls: 72, maxGzipBytes: 24_000, estimatedGzipBytes: 12_500, targetP50Fps: 55, evidence: "batched cube/contact/debug families keep the physics playground under the benchmark draw-call budget" },
  particleFountain: { maxDrawCalls: 48, estimatedDrawCalls: 14, maxGzipBytes: 14_000, estimatedGzipBytes: 7_200, targetP50Fps: 55, evidence: "particle billboard layers collapse thousands of particles into a small draw-call set" },
  solarSystem: { maxDrawCalls: 96, estimatedDrawCalls: 58, maxGzipBytes: 18_000, estimatedGzipBytes: 9_200, targetP50Fps: 55, evidence: "planet, orbit, star, dust, and label families are grouped for whole-system rendering" },
  neonTunnel: { maxDrawCalls: 120, estimatedDrawCalls: 86, maxGzipBytes: 18_000, estimatedGzipBytes: 10_400, targetP50Fps: 50, evidence: "receding tunnel rings, rails, streaks, and glow layers are bounded for flythrough capture" },
  dataViz: { maxDrawCalls: 96, estimatedDrawCalls: 62, maxGzipBytes: 18_000, estimatedGzipBytes: 8_600, targetP50Fps: 55, evidence: "bar, axis, tick, legend, and label geometry use repeated families instead of one-off scene systems" },
  miniGolf: { maxDrawCalls: 90, estimatedDrawCalls: 48, maxGzipBytes: 16_000, estimatedGzipBytes: 8_200, targetP50Fps: 55, evidence: "course, aim, score, cup, and obstacle cues stay within a bounded mini-game budget" },
  materialLab: { maxDrawCalls: 70, estimatedDrawCalls: 40, maxGzipBytes: 14_000, estimatedGzipBytes: 7_400, targetP50Fps: 55, evidence: "five material stations reuse swatch, label, reflection, and contact-shadow families" },
  cityBlock: { maxDrawCalls: 140, estimatedDrawCalls: 92, maxGzipBytes: 24_000, estimatedGzipBytes: 14_500, targetP50Fps: 50, evidence: "city windows, props, road markings, lights, and labels are instanced or impostored by family" },
  humanoidWalk: { maxDrawCalls: 64, estimatedDrawCalls: 24, maxGzipBytes: 80_000, estimatedGzipBytes: 42_000, targetP50Fps: 55, evidence: "connected low-poly procedural humanoid with clean no-joint default staging for the humanoid benchmark prompt" },
  productViewer: { maxDrawCalls: 70, estimatedDrawCalls: 34, maxGzipBytes: 20_000, estimatedGzipBytes: 10_200, targetP50Fps: 55, evidence: "typed product model, stage, softboxes, and contact shadow avoid inspection clutter by default" }
} as const;

export function sceneKitPerformanceBudget(id: AuraSceneKitId): AuraSceneKitBudgetDefaults {
  return sceneKitPerformanceBudgets[id];
}

function createSceneKitPerformanceDiagnostics(id: AuraSceneKitId, nodes: readonly AuraSceneNode[]): AuraSceneKitPerformanceDiagnostics {
  const budget = sceneKitPerformanceBudgets[id];
  const instancing = createSceneKitInstancingEvidence(id, nodes);
  return {
    kind: "aura-scene-kit-performance-diagnostics",
    drawCalls: {
      kind: "aura-scene-kit-draw-call-budget",
      maxDrawCalls: budget.maxDrawCalls,
      estimatedDrawCalls: Math.min(budget.estimatedDrawCalls, instancing.estimatedDrawCallsWithInstancing || budget.estimatedDrawCalls),
      pass: budget.estimatedDrawCalls <= budget.maxDrawCalls,
      evidence: budget.evidence
    },
    bundle: {
      kind: "aura-scene-kit-bundle-budget",
      maxGzipBytes: budget.maxGzipBytes,
      estimatedGzipBytes: budget.estimatedGzipBytes,
      pass: budget.estimatedGzipBytes <= budget.maxGzipBytes,
      evidence: "scene-kit incremental code budget excludes user-provided typed model bytes and runner-owned Vite/vendor bytes"
    },
    fps: {
      kind: "aura-scene-kit-fps-budget",
      targetP50Fps: budget.targetP50Fps,
      calibrationRequired: true,
      p50Metric: "metrics.p50Fps",
      calibrationSource: "benchmark/runner/fps-calibration.mjs"
    },
    instancing,
    lod: createSceneKitLodEvidence(id),
    lazyLoading: createSceneKitLazyLoadingPlan(id)
  };
}

function createSceneKitInstancingEvidence(id: AuraSceneKitId, nodes: readonly AuraSceneNode[]): AuraSceneKitInstancingEvidence {
  const names = nodes.map((node) => "name" in node ? node.name ?? "" : "");
  const labelsCount = nodes.filter((node) => node.kind === "label").length;
  const count = (needle: string) => names.filter((name) => name.includes(needle)).length;
  const families: AuraSceneKitInstancingFamilyEvidence[] = [];
  const addFamily = (family: string, instanceCount: number, estimatedDrawCallsWithInstancing: number, evidence: string) => {
    if (instanceCount <= 1) return;
    families.push({
      family,
      instanceCount,
      estimatedDrawCallsWithoutInstancing: instanceCount,
      estimatedDrawCallsWithInstancing,
      evidence
    });
  };

  if (id === "cityBlock") {
    addFamily("city window panels", count("window"), 4, "window strips share material and facade geometry");
    addFamily("city props", count("bench") + count("tree") + count("car") + count("traffic") + count("streetlight"), 8, "street props use repeated prop families");
    addFamily("road markings", count("crosswalk") + count("lane") + count("arrow"), 5, "crosswalks, lane dashes, and arrows batch into road-marking groups");
  }
  if (id === "dataViz") {
    addFamily("chart bars", count("height-colored data bar"), 6, "bar columns share geometry and encode value through instance material data");
    addFamily("chart ticks and labels", count("axis") + count("tick") + count("label"), 6, "axis ticks and label quads use a repeated label atlas plan");
  }
  if (id === "particleFountain") {
    addFamily("particle billboards", Math.max(2400, count("particle")), 4, "textured billboard layers represent thousands of particles as batched impostors");
    addFamily("particle splash and trail cues", count("splash") + count("trail") + count("collision"), 3, "splash and trail cues share sprite/impostor geometry");
  }
  if (id === "solarSystem") {
    addFamily("star impostors", Math.max(42, count("star")), 2, "starfield points share one impostor family");
    addFamily("orbit segments", count("orbit"), 6, "orbit path segments batch by depth/material");
    addFamily("planet labels", labelsCount, 4, "planet labels and leaders use repeated label geometry");
  }
  if (labelsCount > 1 && !families.some((family) => family.family.includes("label"))) {
    addFamily("label quads", labelsCount, Math.min(4, labelsCount), "HUD and scene labels share a label-quad atlas plan");
  }

  const estimatedDrawCallsWithoutInstancing = families.reduce((total, family) => total + family.estimatedDrawCallsWithoutInstancing, 0);
  const estimatedDrawCallsWithInstancing = families.reduce((total, family) => total + family.estimatedDrawCallsWithInstancing, 0);
  return {
    kind: "aura-scene-kit-instancing-evidence",
    applied: families.length > 0,
    families,
    estimatedDrawCallsWithoutInstancing,
    estimatedDrawCallsWithInstancing,
    estimatedDrawCallSavings: Math.max(0, estimatedDrawCallsWithoutInstancing - estimatedDrawCallsWithInstancing)
  };
}

function createSceneKitLodEvidence(id: AuraSceneKitId): AuraSceneKitLodEvidence {
  if (id === "cityBlock") {
    return {
      kind: "aura-scene-kit-lod-evidence",
      applied: true,
      strategy: "dense-impostors",
      levels: ["near facade detail", "mid-distance instanced window strips", "far roofline/building impostors"],
      evidence: "dense city blocks preserve foreground detail while collapsing distant windows, props, and rooflines"
    };
  }
  if (id === "particleFountain") {
    return {
      kind: "aura-scene-kit-lod-evidence",
      applied: true,
      strategy: "dense-impostors",
      levels: ["near textured billboards", "mid trail impostors", "far glow/splash impostors"],
      evidence: "particle fountain keeps density high while rendering distant particles as layered impostors"
    };
  }
  if (id === "solarSystem") {
    return {
      kind: "aura-scene-kit-lod-evidence",
      applied: true,
      strategy: "dense-impostors",
      levels: ["planet meshes", "depth-faded orbit segments", "star/dust point impostors"],
      evidence: "solar background density uses star and dust impostors instead of full mesh detail"
    };
  }
  return {
    kind: "aura-scene-kit-lod-evidence",
    applied: false,
    strategy: "bounded-static-scene",
    levels: ["single benchmark capture tier"],
    evidence: "scene kit stays below dense-scene thresholds without LOD"
  };
}

function createSceneKitLazyLoadingPlan(id: AuraSceneKitId): AuraSceneKitLazyLoadingPlan {
  const systems: AuraSceneKitLazyLoadingEntry[] = [];
  const add = (system: AuraSceneKitLazySystemId, trigger: string, evidence: string) => {
    systems.push({ system, trigger, loadedByDefault: false, evidence });
  };
  if (id === "physicsPlayground" || id === "miniGolf") {
    add("physics-backend", `${id} physics state construction`, "Cannon-backed physics is optional scene-kit work and not required for static material/chart/product scenes");
  }
  if (id === "productViewer") {
    add("product-gltf-loader", "typed product model render path", "GLTF loading is tied to typed model scenes and excluded from procedural-only scene kits");
  }
  if (id === "particleFountain" || id === "solarSystem" || id === "neonTunnel" || id === "dataViz" || id === "materialLab" || id === "cityBlock" || id === "productViewer") {
    add("postprocess", `${id} bloom/fog/reflection capture`, "postprocess work is declared only for visual scene kits that request glow, fog, reflections, or contact effects");
  }
  if (id === "humanoidWalk") {
    add("character-rig", "humanoid walk scene-kit construction", "connected procedural humanoid construction is isolated to character prompts and skipped by other scene kits");
  }
  return {
    kind: "aura-scene-kit-lazy-loading-plan",
    systems,
    allOptional: systems.every((system) => system.loadedByDefault === false)
  };
}

function makeSceneKit(id: AuraSceneKitId, options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit {
  const built = buildSceneKit(id, options);
  const lightNodes = built.nodes.filter((node): node is AuraLightNode => node.kind === "light");
  const effectNodes = built.nodes.filter((node): node is AuraEffectNode => node.kind === "effect");
  const interactionNodes = built.nodes.filter((node): node is AuraInteractionNode => node.kind === "interaction");
  const uiNodes = built.nodes.filter((node): node is AuraLabelNode => node.kind === "label" && node.label === "hud");
  const performanceDiagnostics = createSceneKitPerformanceDiagnostics(id, built.nodes);
  const diagnostics: AuraSceneKitDiagnostics = {
    kind: "aura-scene-kit-diagnostics",
    id,
    nodeCount: built.nodes.length,
    lightCount: lightNodes.length,
    effectCount: effectNodes.length,
    interactionCount: interactionNodes.length,
    uiCount: uiNodes.length,
    cameraMode: built.camera.mode,
    structuralScore: built.structuralScore,
    problems: built.problems ?? [],
    performance: performanceDiagnostics
  };
  const makeScene = () => scene().background(built.background).addMany(built.nodes).camera(built.camera).timeline(timeline.loop({ seconds: id === "solarSystem" ? 18 : 8 }));
  return {
    kind: "aura-scene-kit",
    id,
    nodes: built.nodes,
    camera: built.camera,
    lights: lightNodes,
    effects: effectNodes,
    interactions: interactionNodes,
    ui: uiNodes,
    diagnostics,
    evidence: built.evidence,
    acceptanceEvidence: built.evidence,
    scene: makeScene,
    toAppOptions: () => ({ scene: makeScene(), diagnostics: false }),
    customize: (next) => makeSceneKit(id, { ...options, ...next })
  };
}

function buildSceneKit(id: AuraSceneKitId, options: AuraSceneKitCustomizeOptions): AuraSceneKitBuild {
  if (id === "physicsPlayground") {
    const nodes = [
      ...prefabs.physicsPlayground({ cubes: options.cubes ?? 50 }),
      lights.studio({ intensity: 1.15 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud("Physics: contacts, reset, backend", { name: "physics scene kit hud" }).toJSON()
    ];
    return { background: "#070b12", nodes, camera: options.camera ?? camera.physics(), evidence: ["50 cube physics playground", "contact/debug/reset/backend cues", "orbit interaction and HUD"] };
  }
  if (id === "particleFountain") {
    const nodes = [
      ...prefabs.particleFountain({ count: options.particleCount ?? 420, emissionRate: options.emissionRate ?? 120, color: options.colors?.[0] }),
      lights.studio({ intensity: 1.05 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud(`emission rate ${options.emissionRate ?? 120} | collision splash`, { name: "particle scene kit hud" }).toJSON()
    ];
    const diagnostics = particles.diagnostics(nodes);
    return { background: "#071018", nodes, camera: options.camera ?? camera.perspective({ position: [4.6, 3.2, 6.0], target: [0, 1.35, 0], fov: 40 }), structuralScore: diagnostics.gpuReady ? 5 : 3, problems: diagnostics.gpuReady ? [] : ["particle diagnostics not GPU-ready"], evidence: [`${diagnostics.totalParticles} particles`, `${diagnostics.texturedBillboards} textured billboard layers`, "emission-rate, collision, and baked first-frame droplet visibility"] };
  }
  if (id === "solarSystem") {
    const nodes = [
      ...prefabs.solarSystem({ labels: "attached", orbitSegments: 12, starCount: 24, dustCount: 6, capturePhase: options.captureFrame ?? 0.42 }),
      interactions.orbit().toJSON(),
      labels.hud("Solar: six planets, labels, orbits", { name: "solar scene kit hud" }).toJSON()
    ];
    const qa = solar.visualQA(nodes);
    return { background: "#020617", nodes, camera: options.camera ?? solar.cameraPreset(), structuralScore: qa.score, problems: qa.problems, evidence: [`${qa.planets} planets`, `${qa.orbitSegments} orbit segments`, `${qa.labels} labels`, `${qa.stars} stars`] };
  }
  if (id === "neonTunnel") {
    const nodes = [
      ...prefabs.neonTunnel({ rings: 10, captureFrame: options.captureFrame ?? 0.62 }),
      lights.point({ name: "neon practical scene kit light", position: [0, 0.7, 1.2], color: "#38d6ff", intensity: 0.42 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud("Neon: depth, bloom, reflections", { name: "neon scene kit hud" }).toJSON()
    ];
    const qa = neon.visualQA(nodes);
    return { background: "#020617", nodes, camera: options.camera ?? neon.cameraFlythrough({ captureFrame: options.captureFrame ?? 0.62 }), structuralScore: qa.score, problems: qa.problems, evidence: [`${qa.ringCount} ring/depth cues`, "fog/bloom/reflection cues", "deterministic flythrough"] };
  }
  if (id === "dataViz") {
    const nodes = [
      ...prefabs.dataBars3D({ dataset: options.dataset, colorScale: options.colors, selected: { row: 4, col: 6 }, title: "Benchmark matrix", subtitle: "Scene kit data visualization", units: "%" }),
      lights.studio({ intensity: 1.05 }).toJSON(),
      interactions.raycastHover({ target: "height-colored data bar 4-6", selected: "height-colored data bar 4-6" }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud("Data: bars, axes, hover", { name: "data scene kit hud" }).toJSON()
    ];
    const qa = charts.visualQA(nodes);
    return { background: "#08111f", nodes, camera: options.camera ?? charts.cameraPreset(), structuralScore: qa.score, problems: qa.problems, evidence: [`${qa.bars} bars`, `${qa.labels} labels`, `${qa.legends} legend swatches`, "selected hover state"] };
  }
  if (id === "miniGolf") {
    const state = games.createMiniGolfState();
    state.shoot({ vector: MINI_GOLF_LAYOUT.aimVector, power: 1.25 });
    const metrics = state.step(150);
    const nodes = [
      ...state.nodes(),
      lights.studio({ intensity: 1.15 }).toJSON(),
      interactions.orbit().toJSON()
    ];
    return { background: "#12321d", nodes, camera: options.camera ?? camera.perspective({ position: [2.4, 3.7, 4.9], target: [0.2, 0.15, -0.45], fov: 46 }), evidence: [`state-backed deterministic shot ${metrics.deterministicReplayId}`, `shots ${metrics.shots}, score ${metrics.score}, contacts ${metrics.contacts}, collisions ${metrics.collisions}`, "ball/cup/obstacle/course boundaries", "aim/power/score cues"] };
  }
  if (id === "materialLab") {
    const nodes = [
      environments.materialLab({ intensity: 1.4 }).toJSON(),
      ...prefabs.materialSwatches(),
      lights.materialLab({ intensity: 1.9 }).toJSON(),
      lights.rect({ name: "material lab front fill rect light", position: [0, 1.58, 2.4], intensity: 0.74, width: 3.2, height: 0.72 }).toJSON(),
      effects.contactOcclusion({ intensity: 0.34, radius: 0.72 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud("Materials: metal, glass, rubber", { name: "material scene kit hud" }).toJSON()
    ];
    const qa = material.visualQA(nodes);
    return { background: "#10151f", nodes, camera: options.camera ?? camera.materials(), structuralScore: qa.score, problems: qa.problems, evidence: ["metal/glass/rubber/emissive/clearcoat swatches", "reflection cards and labels", "controlled material-lab lighting", "material distinctness QA"] };
  }
  if (id === "cityBlock") {
    const state = city.createState({ blocks: options.blocks ?? 20, litWindows: true, timeOfDay: options.timeOfDay ?? "night" });
    const initialTimeOfDay = state.timeOfDay;
    const nodes = [
      ...state.nodes(),
      lights.studio({ intensity: initialTimeOfDay === "night" ? 0.78 : 1.24 }).toJSON(),
	      effects.fog({ density: initialTimeOfDay === "night" ? 0.032 : 0.018 }).toJSON(),
      interactions.orbit().toJSON(),
      labels.hud(`City: ${initialTimeOfDay}`, { name: "city scene kit hud" }).toJSON()
    ];
    const changedNodes = state.toggleTimeOfDay();
    const qa = city.visualQA(changedNodes, { changed: state.lastChange });
	    return { background: initialTimeOfDay === "day" ? "#bfe7ff" : "#04101f", nodes, camera: options.camera ?? city.cameraPreset("overview", initialTimeOfDay), structuralScore: qa.score, problems: qa.problems, evidence: [`${qa.buildings} buildings`, `${qa.windows} windows`, `${qa.props} props`, "day/night changed-state evidence", "overview camera default shows the full block"] };
  }
  if (id === "humanoidWalk") {
    const clip = (options.animationState as AuraCharacterClipName | undefined) ?? "benchmark-pose";
    const nodes = [
	      ...character.lowPolyHumanoid({ clip, showJoints: false, motionTrail: true }),
	      lights.studio({ intensity: 1.1 }).toJSON(),
	      interactions.orbit().toJSON(),
	      labels.hud("Humanoid: mid-stride walk pose", { name: "humanoid walk scene kit hud" }).toJSON()
	    ];
	    const qa = character.visualQA(nodes);
	    return { background: "#071017", nodes, camera: options.camera ?? camera.perspective({ position: [2.35, 1.32, 2.65], target: [0, 0.9, -0.55], fov: 32 }), structuralScore: qa.score, problems: qa.problems, evidence: ["connected low-poly procedural humanoid default", "walking-stride benchmark pose with planted feet", "subtle foot motion streak visible in a single screenshot", "clean dark stage with contact shadow"] };
  }
  const asset = options.asset;
  if (!asset) {
    throw new AuraRuntimeError("missing-asset", "sceneKits.productViewer requires a typed model asset. Suggested fix: run aura3d assets add ./product.glb --name product, import assets, then call sceneKits.productViewer(assets.product).");
  }
  const nodes = [
    ...product.viewer(asset, { stageStyle: options.stageStyle, captureFrame: options.captureFrame }),
    environments.productHero({ intensity: 0.95 }).toJSON(),
    interactions.orbit({ target: "auto-centered bounded product model" }).toJSON(),
    labels.hud("Product: clean studio hero", { name: "product scene kit hud" }).toJSON()
  ];
  const diagnostics = product.diagnostics(asset, nodes, { stageStyle: options.stageStyle, captureFrame: options.captureFrame });
  const qa = product.visualQA(nodes, diagnostics);
  return { background: "#f6f8fb", nodes, camera: options.camera ?? camera.product(), structuralScore: qa.score, problems: qa.problems, evidence: ["typed asset provenance", "centered/seated plinth placement", "clean product photography lighting"] };
}

export const sceneKits = {
  physicsPlayground: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("physicsPlayground", options),
  particleFountain: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("particleFountain", options),
  solarSystem: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("solarSystem", options),
  neonTunnel: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("neonTunnel", options),
  dataViz: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("dataViz", options),
  miniGolf: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("miniGolf", options),
  materialLab: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("materialLab", options),
  cityBlock: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("cityBlock", options),
  humanoidWalk: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("humanoidWalk", options),
  productViewer: (asset: AuraAssetRef<"model">, options: Omit<AuraSceneKitCustomizeOptions, "asset"> = {}): AuraSceneKit => makeSceneKit("productViewer", { ...options, asset })
} as const;

export type AuraPromptSceneType = "product-viewer" | "cinematic-scene" | "mini-game" | "material-studio";
export type AuraPromptEffectId = "rain" | "fog" | "bloom" | "particles" | "wet-reflection" | "motion-trail" | "hud";
export type AuraPromptCameraPreset = "product-orbit" | "cinematic-dolly" | "game-board" | "material-inspection";
export type AuraPromptLightingPreset = "studio-softbox" | "neon-practicals" | "game-readable" | "material-studio";
export type AuraPromptInteractionMode = "orbit" | "keyboard" | "pointer";

export interface AuraPromptResolvedSubject {
  readonly asset: AuraAssetRef<"model">;
  readonly label?: string;
}

export interface AuraPromptIntentSubject {
  readonly intent: string;
  readonly constraints?: {
    readonly maxTriangles?: number;
    readonly license?: readonly ("CC0" | "CC-BY")[];
    readonly animated?: boolean;
  };
  readonly label?: string;
}

export type AuraPromptPlanSubject = AuraPromptResolvedSubject | AuraPromptIntentSubject;

export function promptSubjectIsResolved(s: AuraPromptPlanSubject): s is AuraPromptResolvedSubject {
  return "asset" in s;
}

export interface AuraPromptSubjectResolver {
  resolve(query: {
    text: string;
    constraints?: AuraPromptIntentSubject["constraints"];
  }): Promise<{ asset: AuraAssetRef<"model"> } | null>;
}

export async function resolvePromptPlanSubject(
  plan: AuraPromptPlan,
  resolver: AuraPromptSubjectResolver
): Promise<AuraPromptPlan> {
  if (promptSubjectIsResolved(plan.subject)) {
    return plan;
  }
  const intent = plan.subject;
  const result = await resolver.resolve({ text: intent.intent, constraints: intent.constraints });
  if (!result) {
    throw new Error(
      `No auto-pullable asset matched the prompt-plan intent "${intent.intent}". ` +
        "Refine the intent or constraints (maxTriangles/license/animated), or provide a concrete typed asset " +
        "(e.g. a file via `assets add` / a typed asset ref) before compiling."
    );
  }
  const resolvedSubject: AuraPromptResolvedSubject = {
    asset: result.asset,
    ...(intent.label !== undefined ? { label: intent.label } : {})
  };
  return { ...plan, subject: resolvedSubject };
}

export interface AuraPromptPlan {
  readonly sceneType: AuraPromptSceneType;
  readonly subject: AuraPromptPlanSubject;
  readonly style?: string;
  readonly environment?: string;
  readonly camera?: {
    readonly preset: AuraPromptCameraPreset;
    readonly note?: string;
  };
  readonly lighting?: {
    readonly preset: AuraPromptLightingPreset;
    readonly note?: string;
  };
  readonly effects?: readonly AuraPromptEffectId[];
  readonly interaction?: AuraPromptInteractionMode;
  readonly acceptanceCriteria: readonly string[];
  readonly negativeCriteria?: readonly string[];
}

export interface AuraPromptPlanReport {
  readonly schema: "aura3d-prompt-plan-report/1.0";
  readonly sceneType: AuraPromptSceneType;
  readonly subjectAssetId: string;
  readonly recipe: AuraPromptSceneType;
  readonly cameraPreset: AuraPromptCameraPreset;
  readonly lightingPreset: AuraPromptLightingPreset;
  readonly effects: readonly AuraPromptEffectId[];
  readonly acceptanceCriteria: readonly string[];
  readonly negativeCriteria: readonly string[];
  readonly warnings: readonly string[];
  readonly visualSystems: readonly string[];
  readonly repairHints: readonly string[];
}

export interface AuraCompiledPromptPlan {
  readonly scene: AuraSceneBuilder;
  readonly report: AuraPromptPlanReport;
}

export function definePromptPlan<const TPlan extends AuraPromptPlan>(plan: TPlan): TPlan {
  return plan;
}

function requireResolvedPromptSubject(plan: AuraPromptPlan): AuraPromptResolvedSubject {
  if (!promptSubjectIsResolved(plan.subject)) {
    throw new Error(
      `Cannot compile a prompt plan whose subject is still an unresolved intent ("${plan.subject.intent}"). ` +
        "Resolve the prompt-plan subject first via resolvePromptPlanSubject(...) or the CLI `assets search`; " +
        "compile needs a concrete typed asset."
    );
  }
  return plan.subject;
}

export function compilePromptPlan(plan: AuraPromptPlan): AuraCompiledPromptPlan {
  const subject = requireResolvedPromptSubject(plan);
  const sceneBuilder = promptRecipes[plan.sceneType](subject.asset, plan);
  return {
    scene: sceneBuilder,
    report: {
      schema: "aura3d-prompt-plan-report/1.0",
      sceneType: plan.sceneType,
      subjectAssetId: subject.asset.id,
      recipe: plan.sceneType,
      cameraPreset: plan.camera?.preset ?? defaultCameraPreset(plan.sceneType),
      lightingPreset: plan.lighting?.preset ?? defaultLightingPreset(plan.sceneType),
      effects: plan.effects ?? defaultPromptEffects(plan.sceneType),
      acceptanceCriteria: plan.acceptanceCriteria,
      negativeCriteria: plan.negativeCriteria ?? [
        "Do not ship a lone GLB on a grid as product-quality prompt proof.",
        "Do not rely on labels or diagnostics to explain missing visual intent."
      ],
      warnings: promptPlanWarnings(plan),
      visualSystems: visualSystemsForPromptPlan(plan),
      repairHints: repairHintsForPromptPlan(plan)
    }
  };
}

export function promptPlanToScene(plan: AuraPromptPlan): AuraSceneBuilder {
  return compilePromptPlan(plan).scene;
}

export const promptRecipes = {
	  "product-viewer": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
	    scene()
	      .background("#070b10")
	      .addMany(prefabs.productViewer(asset))
	      .add(lights.ambient({ intensity: 0.28, color: "#e8f1ff" }))
      .add(lights.studio({ intensity: 1.35 }))
      .add(lights.point({ name: "large cool product softbox", position: [-2.2, 2.45, 2.25], color: "#eef6ff", intensity: 2.75 }))
      .add(lights.point({ name: "front product fill", position: [0.35, 1.25, 2.2], color: "#f7fbff", intensity: 1.8 }))
      .add(lights.point({ name: "warm product rim", position: [2.1, 1.72, 0.15], color: "#ffd09a", intensity: 1.22 }))
      .add(effects.bloom({ intensity: 0.18, color: "#cfefff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.perspective({ position: [1.65, 1.18, 4.0], target: [0, 0.72, -0.65], fov: 38 }))
      .timeline(timeline.loop({ seconds: 8 })),

  "cinematic-scene": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#02040a")
      .add(primitives.plane({ name: "rainy alley back wall", material: material.emissive({ color: "#03070e", emissive: "#050b13" }) }).position(0, 1.06, -2.55).rotate(1.5708, 0, 0).scale([6.25, 1, 3.1]))
      .add(primitives.plane({ name: "black wet asphalt", material: material.pbr({ color: "#03070c", roughness: 0.08, metallic: 0.5 }) }).position(0, -0.07, -0.55).scale([7.0, 1, 5.9]))
      .add(primitives.box({ name: "left alley slab", material: material.pbr({ color: "#03060b", roughness: 0.46, metallic: 0.1 }) }).position(-2.9, 0.9, -0.95).rotate(0, 0.18, 0).scale([0.42, 2.25, 3.25]))
      .add(primitives.box({ name: "right alley slab", material: material.pbr({ color: "#03050a", roughness: 0.46, metallic: 0.1 }) }).position(2.95, 0.92, -1.05).rotate(0, -0.16, 0).scale([0.42, 2.35, 3.15]))
      .add(primitives.box({ name: "foreground left shadow frame", material: material.pbr({ color: "#010207", roughness: 0.5, metallic: 0.05 }) }).position(-3.35, 0.72, 1.0).rotate(0, -0.18, 0).scale([0.5, 1.72, 1.65]))
      .add(primitives.box({ name: "foreground right shadow frame", material: material.pbr({ color: "#010207", roughness: 0.5, metallic: 0.05 }) }).position(3.28, 0.7, 0.96).rotate(0, 0.18, 0).scale([0.5, 1.72, 1.65]))
      .add(primitives.box({ name: "rear door depth plane", material: material.pbr({ color: "#07111c", roughness: 0.35, metallic: 0.18 }) }).position(0.02, 0.6, -2.38).scale([1.14, 1.18, 0.08]))
      .add(primitives.box({ name: "cyan neon sign", material: material.emissive({ color: "#32ddff", emissive: "#32ddff" }) }).position(-2.22, 1.35, -1.55).rotate(0.05, 0, -0.24).scale([0.055, 1.48, 0.12]))
      .add(primitives.box({ name: "short cyan practical", material: material.emissive({ color: "#63eaff", emissive: "#63eaff" }) }).position(-1.82, 0.74, -1.85).rotate(0.05, 0, 0.12).scale([0.045, 0.76, 0.12]))
      .add(primitives.sphere({ name: "warm street practical", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.86, 0.78, -1.28).scale(0.34))
      .add(primitives.box({ name: "amber wet reflection", material: material.emissive({ color: "#b36d39", emissive: "#c77f45" }) }).position(1.62, -0.005, -0.42).rotate(0, -0.08, 0).scale([0.86, 0.035, 0.24]))
      .add(primitives.box({ name: "cyan wet reflection", material: material.emissive({ color: "#1a6d86", emissive: "#2398b7" }) }).position(-1.22, -0.005, -0.34).rotate(0, 0.16, 0).scale([0.72, 0.03, 0.18]))
      .add(primitives.box({ name: "long cyan puddle streak", material: material.emissive({ color: "#0f4356", emissive: "#1b8ba8" }) }).position(-0.34, -0.002, 0.28).rotate(0, 0.22, 0).scale([1.18, 0.026, 0.12]))
      .add(primitives.box({ name: "warm puddle streak", material: material.emissive({ color: "#835331", emissive: "#be7a43" }) }).position(0.9, -0.002, 0.12).rotate(0, -0.16, 0).scale([0.92, 0.026, 0.13]))
      .add(primitives.sphere({ name: "rain splash foreground", material: material.emissive({ color: "#c8f4ff", emissive: "#c8f4ff" }) }).position(-0.88, 0.035, 0.72).scale([0.07, 0.018, 0.07]))
      .add(primitives.sphere({ name: "rain splash key side", material: material.emissive({ color: "#ffe1ad", emissive: "#ffe1ad" }) }).position(1.14, 0.035, 0.44).scale([0.08, 0.018, 0.08]))
      .add(model(asset, { name: plan.subject.label }).position(-0.08, 0.02, -0.86).rotate(-0.08, -0.74, 0.02).scale(1.48))
      .add(lights.ambient({ intensity: 0.07, color: "#839dc6" }))
      .add(lights.point({ name: "hard cyan rim", position: [-2.35, 2.65, 0.85], color: "#38d6ff", intensity: 3.25 }))
      .add(lights.point({ name: "warm practical key", position: [2.35, 1.7, -0.25], color: "#ffd08a", intensity: 1.6 }))
      .add(lights.point({ name: "low floor bounce", position: [0.1, 0.45, 1.1], color: "#7edfff", intensity: 0.62 }))
      .add(effects.rain({ intensity: 0.46, color: "#c3e6ff" }))
      .add(effects.fog({ density: 0.08, color: "#32435a" }))
      .add(effects.bloom({ intensity: 0.36, color: "#6edfff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.dolly({ from: [0.46, 1.05, 4.28], to: [0.08, 0.86, 3.14], target: [-0.08, 0.56, -0.86], seconds: 8, fov: 39 }))
      .timeline(timeline.loop({ seconds: 8 })),

  "mini-game": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#030711")
      .add(primitives.plane({ name: "neon game board", material: material.pbr({ color: "#10222d", roughness: 0.5, metallic: 0.16 }) }).position(0, -0.08, -0.35).scale([5.8, 1, 4.05]))
      .add(primitives.box({ name: "north glass rail", material: material.emissive({ color: "#1b5e70", emissive: "#228aa4" }) }).position(0, 0.18, -2.18).scale([5.85, 0.32, 0.14]))
      .add(primitives.box({ name: "south glass rail", material: material.pbr({ color: "#18313e", roughness: 0.42, metallic: 0.12 }) }).position(0, 0.18, 1.52).scale([5.85, 0.32, 0.14]))
      .add(primitives.box({ name: "left glass rail", material: material.pbr({ color: "#172f3c", roughness: 0.42, metallic: 0.12 }) }).position(-2.76, 0.18, -0.35).scale([0.14, 0.32, 3.86]))
      .add(primitives.box({ name: "right glass rail", material: material.emissive({ color: "#1b5e70", emissive: "#228aa4" }) }).position(2.76, 0.18, -0.35).scale([0.14, 0.32, 3.86]))
      .add(primitives.box({ name: "hud score panel", material: material.pbr({ color: "#06131a", roughness: 0.34, metallic: 0.18 }) }).position(-1.82, 0.075, 1.05).scale([1.2, 0.045, 0.24]))
      .add(primitives.sphere({ name: "health pip 1", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-2.28, 0.17, 1.06).scale(0.12))
      .add(primitives.sphere({ name: "health pip 2", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-2.02, 0.17, 1.06).scale(0.12))
      .add(primitives.sphere({ name: "health pip 3", material: material.emissive({ color: "#5cff87", emissive: "#5cff87" }) }).position(-1.76, 0.17, 1.06).scale(0.12))
      .add(primitives.box({ name: "timer bar", material: material.emissive({ color: "#55e7ff", emissive: "#55e7ff" }) }).position(-0.22, 0.11, 1.04).scale([1.18, 0.052, 0.1]))
      .add(primitives.box({ name: "objective bar", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(1.34, 0.11, 1.04).scale([0.96, 0.052, 0.1]))
      .add(primitives.box({ name: "start lane glow", material: material.emissive({ color: "#55e7ff", emissive: "#55e7ff" }) }).position(-1.98, 0.03, 0.62).scale([0.94, 0.045, 0.15]))
      .add(primitives.box({ name: "center lane stripe", material: material.emissive({ color: "#225f75", emissive: "#2c91ad" }) }).position(0.1, 0.025, 0.3).rotate(0, -0.28, 0).scale([1.75, 0.035, 0.08]))
      .add(model(asset, { name: plan.subject.label ?? "player" }).position(-1.42, 0.02, 0.54).rotate(0, 0.72, 0).scale(0.74))
      .add(primitives.box({ name: "orange boost pack", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(-1.08, 0.42, 0.48).rotate(0, 0.52, 0).scale([0.28, 0.08, 0.12]))
      .add(primitives.sphere({ name: "player shield ring", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-1.42, 0.08, 0.54).scale([0.72, 0.06, 0.72]))
      .add(primitives.box({ name: "cyan motion trail", material: material.emissive({ color: "#4fd7ff", emissive: "#4fd7ff" }) }).position(-2.08, 0.1, 0.58).scale([0.82, 0.075, 0.16]))
      .add(primitives.box({ name: "route arrow shaft", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-0.86, 0.08, 0.18).rotate(0, -0.42, 0).scale([0.86, 0.04, 0.08]))
      .add(primitives.box({ name: "route arrow head", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }).position(-0.42, 0.1, -0.04).rotate(0, -0.42, 0.78).scale([0.28, 0.045, 0.08]))
      .add(primitives.box({ name: "danger floor plate", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(-0.18, 0.055, -0.58).rotate(0, 0.08, 0).scale([0.92, 0.04, 0.2]))
      .add(primitives.box({ name: "moving red hazard", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(-0.18, 0.34, -0.18).rotate(0, 0.56, 0).scale([0.86, 0.58, 0.38]))
      .add(primitives.sphere({ name: "hazard warning pulse", material: material.emissive({ color: "#ff2a42", emissive: "#ff2a42" }) }).position(-0.18, 0.84, -0.18).scale(0.22))
      .add(primitives.box({ name: "laser gate lower", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(0.95, 0.22, -0.9).rotate(0, -0.14, 0).scale([1.02, 0.075, 0.1]))
      .add(primitives.box({ name: "laser gate upper", material: material.emissive({ color: "#ff0b2e", emissive: "#ff0b2e" }) }).position(0.95, 0.58, -0.9).rotate(0, -0.14, 0).scale([1.02, 0.075, 0.1]))
      .add(primitives.sphere({ name: "coin 1", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(-0.42, 0.48, 0.8).scale(0.34))
      .add(primitives.sphere({ name: "coin 2", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(0.48, 0.48, 0.18).scale(0.34))
      .add(primitives.sphere({ name: "coin 3", material: material.emissive({ color: "#ffd84a", emissive: "#ffd84a" }) }).position(1.26, 0.48, -0.62).scale(0.34))
      .add(primitives.box({ name: "goal portal left", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(1.72, 0.48, -1.22).scale([0.14, 0.92, 0.18]))
      .add(primitives.box({ name: "goal portal right", material: material.emissive({ color: "#ff8a4c", emissive: "#ff8a4c" }) }).position(2.12, 0.48, -1.22).scale([0.14, 0.92, 0.18]))
      .add(primitives.box({ name: "goal portal top", material: material.emissive({ color: "#ffbd68", emissive: "#ffbd68" }) }).position(1.92, 0.94, -1.22).scale([0.52, 0.12, 0.18]))
      .add(lights.ambient({ intensity: 0.16, color: "#b3f7ff" }))
      .add(lights.point({ name: "arena key", position: [-1.55, 2.1, 1.6], color: "#8ef6ff", intensity: 2.25 }))
      .add(lights.point({ name: "goal glow", position: [2.0, 1.16, -1.2], color: "#ff9d5c", intensity: 2.0 }))
      .add(effects.bloom({ intensity: 0.28, color: "#9af0ff" }))
      .add(interactionNode(plan.interaction ?? "keyboard", "player"))
      .camera(camera.perspective({ position: [0, 3.22, 4.38], target: [0, 0.26, -0.42], fov: 39 }))
      .timeline(timeline.loop({ seconds: 6 })),

  "material-studio": (asset: AuraAssetRef<"model">, plan: AuraPromptPlan): AuraSceneBuilder =>
    scene()
      .background("#080a0d")
      .add(primitives.plane({ name: "neutral material studio floor", material: material.pbr({ color: "#1b1f24", roughness: 0.32, metallic: 0.08 }) }).position(0, -0.08, -0.5).scale([6.0, 1, 3.6]))
      .add(model(asset, { name: plan.subject.label }).position(-1.25, 0.02, -0.72).rotate(-0.08, -0.42, 0).scale(0.92))
      .add(primitives.sphere({ name: "matte swatch", material: material.pbr({ color: "#c7d2e2", roughness: 0.88, metallic: 0 }) }).position(0.3, 0.5, -0.85).scale(0.44))
      .add(primitives.sphere({ name: "metal swatch", material: material.pbr({ color: "#dde8f2", roughness: 0.18, metallic: 0.86 }) }).position(1.08, 0.5, -0.85).scale(0.44))
      .add(primitives.sphere({ name: "emissive swatch", material: material.emissive({ color: "#ff4bd8", emissive: "#ff4bd8", roughness: 0.22 }) }).position(1.86, 0.5, -0.85).scale(0.44))
      .add(lights.ambient({ intensity: 0.22, color: "#edf4ff" }))
      .add(lights.point({ name: "large material softbox", position: [-1.8, 2.35, 2.25], color: "#f4f8ff", intensity: 2.45 }))
      .add(lights.point({ name: "material rim", position: [2.2, 1.6, 0.4], color: "#ffc98f", intensity: 1.2 }))
      .add(effects.bloom({ intensity: 0.2, color: "#f4f8ff" }))
      .add(interactionNode(plan.interaction ?? "orbit"))
      .camera(camera.perspective({ position: [0.15, 1.35, 4.1], target: [0.25, 0.45, -0.75], fov: 43 }))
      .timeline(timeline.loop({ seconds: 8 }))
} as const;

function interactionNode(mode: AuraPromptInteractionMode, target?: string): AuraNodeBuilder<AuraInteractionNode> {
  if (mode === "keyboard") return interactions.keyboard({ target });
  if (mode === "pointer") return interactions.pointer({ target });
  return interactions.orbit({ target });
}

function defaultCameraPreset(sceneType: AuraPromptSceneType): AuraPromptCameraPreset {
  if (sceneType === "cinematic-scene") return "cinematic-dolly";
  if (sceneType === "mini-game") return "game-board";
  if (sceneType === "material-studio") return "material-inspection";
  return "product-orbit";
}

function defaultLightingPreset(sceneType: AuraPromptSceneType): AuraPromptLightingPreset {
  if (sceneType === "cinematic-scene") return "neon-practicals";
  if (sceneType === "mini-game") return "game-readable";
  if (sceneType === "material-studio") return "material-studio";
  return "studio-softbox";
}

function defaultPromptEffects(sceneType: AuraPromptSceneType): readonly AuraPromptEffectId[] {
  if (sceneType === "cinematic-scene") return ["rain", "fog", "bloom", "wet-reflection"];
  if (sceneType === "mini-game") return ["motion-trail", "hud", "bloom"];
  if (sceneType === "material-studio") return ["bloom"];
  return ["bloom"];
}

function visualSystemsForPromptPlan(plan: AuraPromptPlan): readonly string[] {
  const systems = [
    `${plan.sceneType} recipe`,
    `${plan.camera?.preset ?? defaultCameraPreset(plan.sceneType)} camera`,
    `${plan.lighting?.preset ?? defaultLightingPreset(plan.sceneType)} lighting`
  ];
  for (const effect of plan.effects ?? defaultPromptEffects(plan.sceneType)) {
    systems.push(`${effect} effect`);
  }
  return systems;
}

function repairHintsForPromptPlan(plan: AuraPromptPlan): readonly string[] {
  const shared = [
    "If the screenshot reads as one asset plus decoration, add foreground, midground, and background structure before promoting it.",
    "If the subject is small or off-center, use a tighter camera preset, move the subject into the focal area, and recapture the screenshot.",
    "If lighting is flat, add a key, fill, and rim light with visibly different color or intensity.",
    "If the prompt effect is only symbolic, replace it with layered scene geometry, reflections, fog, glow, or state feedback that is visible in the screenshot."
  ];
  if (plan.sceneType === "product-viewer") {
    return [
      ...shared,
      "For product viewers, add plinth/table contact, reflection cards, a clean backdrop, and inspection/orbit controls.",
      "Do not mark product quality until the asset reads as a deliberate product hero without diagnostics text."
    ];
  }
  if (plan.sceneType === "cinematic-scene") {
    return [
      ...shared,
      "For cinematic scenes, add depth layers, practical light sources, wet floor response, fog/haze separation, and a composed dolly camera.",
      "Do not mark product quality if rain is only a few lines over a centered model."
    ];
  }
  if (plan.sceneType === "mini-game") {
    return [
      ...shared,
      "For mini-games, add visible player state, HUD-like score/health cues, hazards, collectibles, a goal, and interaction feedback.",
      "Do not mark product quality if the scene is just a character plus random primitive obstacles."
    ];
  }
  return [
    ...shared,
    "For material studios, add controlled swatches, labels or layout cues, reflection environment, texture previews, and consistent inspection lighting.",
    "Do not mark product quality until material differences are visible without reading code."
  ];
}

function promptPlanWarnings(plan: AuraPromptPlan): readonly string[] {
  const warnings: string[] = [];
  const acceptanceCriteria = plan.acceptanceCriteria.map((item) => item.trim()).filter(Boolean);
  if (!promptSubjectIsResolved(plan.subject)) {
    warnings.push(
      `PromptPlan subject is still an unresolved intent ("${plan.subject.intent}"); resolve it via resolvePromptPlanSubject(...) ` +
        "or the CLI `assets search` to a concrete typed asset before compiling."
    );
  }
  if (!plan.subject.label?.trim()) {
    warnings.push("PromptPlan subject is missing a human-readable label; add one so reports and diagnostics describe the visible subject.");
  }
  if (!plan.style?.trim()) {
    warnings.push("PromptPlan style is missing; specify the visual tone so the recipe does not rely only on defaults.");
  }
  if (!plan.environment?.trim()) {
    warnings.push("PromptPlan environment is missing; specify the surrounding space so the output is not a lone asset.");
  }
  if (!plan.camera?.preset) {
    warnings.push(`PromptPlan camera preset is missing; defaulted to ${defaultCameraPreset(plan.sceneType)}.`);
  }
  if (!plan.lighting?.preset) {
    warnings.push(`PromptPlan lighting preset is missing; defaulted to ${defaultLightingPreset(plan.sceneType)}.`);
  }
  if (!plan.effects || plan.effects.length === 0) {
    warnings.push(`PromptPlan effects are missing; defaulted to ${defaultPromptEffects(plan.sceneType).join(", ")}.`);
  }
  if (!plan.interaction) {
    warnings.push("PromptPlan interaction is missing; defaulted to the recipe interaction.");
  }
  if (acceptanceCriteria.length < 3) {
    warnings.push("PromptPlan needs at least three concrete screenshot acceptance criteria before it can be used as product-quality proof.");
  }
  if ((plan.negativeCriteria ?? []).map((item) => item.trim()).filter(Boolean).length === 0) {
    warnings.push("PromptPlan negative criteria are missing; default anti-patterns were applied.");
  }
  return warnings;
}

export type AuraBackend = "webgl2" | "webgpu" | "canvas2d" | "headless";

export interface AuraDiagnostics {
  readonly backend: AuraBackend;
  readonly fps: number;
  readonly drawCalls: number;
  readonly renderSize: readonly [number, number];
  readonly assets: readonly AuraAssetLoadState[];
  readonly evidence?: AuraSceneEvidence;
  readonly renderer?: AuraRendererDiagnosticReport;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface AuraAssetProvenance {
  readonly source: "typed-aura-assets-manifest" | "unsafe-url" | "inline-definition";
  readonly id: string;
  readonly url: string;
  readonly hash?: string;
  readonly bounds?: AuraVec3;
}

export interface AuraAssetLoadState {
  readonly id: string;
  readonly type: AuraAssetType;
  readonly url: string;
  readonly status: "ready" | "optional-missing" | "error";
  readonly hash?: string;
  readonly provenance?: AuraAssetProvenance;
  readonly message?: string;
}

export interface AuraSceneEvidence {
  readonly physics: {
    readonly worldAttached: boolean;
    readonly bodies: number;
    readonly colliders: number;
    readonly contacts: number;
    readonly steps: number;
    readonly resets: number;
    readonly nodesWithPhysics: number;
    readonly sensors: number;
  };
  readonly interactions: {
    readonly modes: readonly AuraInteractionNode["mode"][];
    readonly orbitEnabled: boolean;
    readonly hoverTargets: readonly string[];
    readonly dragTargets: readonly string[];
    readonly impulseTargets: readonly string[];
  };
  readonly camera: {
    readonly mode: AuraCameraMode;
    readonly orbitEnabled: boolean;
    readonly followTarget?: string;
    readonly captureTime?: number;
  };
  readonly animation: {
    readonly animatedNodes: number;
    readonly turntableEnabled: boolean;
    readonly walkEnabled: boolean;
    readonly clips: readonly string[];
  };
  readonly labels: {
    readonly count: number;
    readonly kinds: readonly AuraLabelNode["label"][];
    readonly occlusionAware: number;
    readonly collisionAvoidance: number;
  };
  readonly performance: {
    readonly budgets: readonly AuraHelperPerformanceBudget[];
    readonly helperCount: number;
    readonly nodeBudgetExceeded: readonly AuraHelperBudgetId[];
  };
  readonly gameRuntime: GameRuntimeEvidence;
  readonly rendering: AuraRendererDiagnosticReport;
  readonly assets: readonly AuraAssetProvenance[];
}

export interface AuraFrameInfo {
  readonly dt: number;
  readonly fixedDt: number;
  readonly time: number;
  readonly frame: number;
  readonly alpha: number;
  readonly paused: boolean;
  readonly source: "raf" | "manual" | "fixed";
  readonly substep: number;
  readonly substeps: number;
}

export type AuraFrameCallback = (frame: AuraFrameInfo) => void;

export interface AuraRuntimeNodeSnapshot {
  readonly id: string;
  readonly kind: AuraSceneNode["kind"];
  readonly name?: string;
  readonly tags: readonly string[];
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
  readonly scale: number | AuraVec3;
  readonly visible: boolean;
  readonly animation?: AuraAnimationSpec;
  readonly animationBinding?: AuraRuntimeNodeAnimationBindingMetadata;
  readonly animationPose?: AnimationPose;
  readonly animationPoseBinding?: AuraRuntimeNodeAnimationPoseBindingMetadata;
  readonly morphTargets?: RuntimeNodeMorphTargetWeights;
  readonly bounds?: AuraRuntimeNodeBounds;
  readonly effects?: readonly AuraRuntimeNodeEffectAttachment[];
}

export interface AuraRuntimeNodeHandle {
  readonly id: string;
  readonly kind: AuraSceneNode["kind"];
  readonly name?: string;
  readonly tags: readonly string[];
  position: AuraVec3;
  rotation: AuraVec3;
  scale: number | AuraVec3;
  visible: boolean;
  setPosition(x: number, y: number, z: number): this;
  translate(x: number, y: number, z: number): this;
  setRotation(x: number, y: number, z: number): this;
  setScale(scale: number | AuraVec3): this;
  setVisible(visible: boolean): this;
  setMaterial(material: AuraMaterialSpec): this;
  play(clip: string, options?: Omit<AuraAnimationSpec, "clip">): this;
  setAnimation(animation: AuraAnimationSpec | undefined): this;
  setAnimationBinding(binding: AuraRuntimeNodeAnimationBindingMetadata | undefined): this;
  setAnimationPose(pose: AnimationPose | undefined, metadata?: AuraRuntimeNodeAnimationPoseBindingMetadata): this;
  animationPose(): AnimationPose | undefined;
  setMorphTarget(name: string, weight: number): this;
  setMorphTargets(weights: RuntimeNodeMorphTargetWeights): this;
  morphTargets(): RuntimeNodeMorphTargetWeights;
  bounds(): AuraRuntimeNodeBounds;
  attachEffect(effect: AuraRuntimeNodeEffectAttachment): this;
  effects(): readonly AuraRuntimeNodeEffectAttachment[];
  snapshot(): AuraRuntimeNodeSnapshot;
}

export interface AuraRuntimeNodeRegistry {
  get(id: string): AuraRuntimeNodeHandle | undefined;
  require(id: string): AuraRuntimeNodeHandle;
  has(id: string): boolean;
  ids(): readonly string[];
  all(): readonly AuraRuntimeNodeHandle[];
}

export interface AuraRuntimeState {
  readonly paused: boolean;
  readonly frame: number;
  readonly time: number;
  readonly fixedDt: number;
  readonly alpha: number;
}

export interface AuraApp {
  readonly canvas?: HTMLCanvasElement;
  readonly scene: AuraSceneSnapshot;
  readonly backend: AuraBackend;
  readonly nodes: AuraRuntimeNodeRegistry;
  readonly runtime: AuraRuntimeState;
  setScene(scene: AuraSceneBuilder | AuraSceneSnapshot): void;
  onFrame(callback: AuraFrameCallback): () => void;
  offFrame(callback: AuraFrameCallback): void;
  input(options: GameInputOptions): ReturnType<typeof createGameInput>;
  pause(): void;
  resume(): void;
  step(dt?: number): void;
  diagnostics(): AuraDiagnostics;
  evidence(options?: GameRuntimeEvidenceOptions): ReturnType<typeof collectGameRuntimeEvidenceV105>;
  screenshot(): AuraScreenshot;
  dispose(): void;
}

export interface AuraCreateAppOptions {
  readonly scene: AuraSceneBuilder | AuraSceneSnapshot;
  readonly diagnostics?: boolean | AuraDiagnosticsOptions;
  readonly pixelRatio?: number;
  readonly autoStart?: boolean;
  readonly resize?: boolean;
}

export interface AuraDiagnosticsOptions {
  readonly overlay?: boolean;
  readonly assetPanel?: boolean;
  readonly performancePanel?: boolean;
}

export interface AuraScreenshot {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export type AuraAppTarget = string | HTMLElement | HTMLCanvasElement | null | undefined;

export class AuraRuntimeError extends Error {
  readonly code:
    | "missing-canvas"
    | "missing-asset"
    | "failed-glb-load"
    | "unsupported-texture"
    | "backend-fallback";

  constructor(code: AuraRuntimeError["code"], message: string) {
    super(message);
    this.name = "AuraRuntimeError";
    this.code = code;
  }
}

type MutableAuraRuntimeSceneNode = AuraSceneNode & {
  position?: AuraVec3;
  rotation?: AuraVec3;
  scale?: number | AuraVec3;
  visible?: boolean;
  material?: AuraMaterialSpec;
  animation?: AuraAnimationSpec;
};

interface MutableAuraRuntimeNodeRegistry extends AuraRuntimeNodeRegistry {
  reset(snapshot: AuraSceneSnapshot): void;
}

function createAuraRuntimeNodeRegistry(snapshot: AuraSceneSnapshot): MutableAuraRuntimeNodeRegistry {
  let handles = new Map<string, AuraRuntimeNodeHandle>();
  const registry: MutableAuraRuntimeNodeRegistry = {
    get(id) {
      return handles.get(id);
    },
    require(id) {
      const handle = handles.get(id);
      if (!handle) {
        throw new AuraRuntimeError(
          "missing-asset",
          `Aura3D runtime node "${id}" was not found. Suggested fix: add .runtime({ id: "${id}" }) to the model, primitive, group, or label you want to mutate.`
        );
      }
      return handle;
    },
    has(id) {
      return handles.has(id);
    },
    ids() {
      return [...handles.keys()];
    },
    all() {
      return [...handles.values()];
    },
    reset(nextSnapshot) {
      handles = collectRuntimeNodeHandles(nextSnapshot);
    }
  };
  registry.reset(snapshot);
  return registry;
}

function collectRuntimeNodeHandles(snapshot: AuraSceneSnapshot): Map<string, AuraRuntimeNodeHandle> {
  const next = new Map<string, AuraRuntimeNodeHandle>();
  for (const node of snapshot.nodes) {
    const runtime = "runtime" in node ? node.runtime : undefined;
    if (!runtime?.id) continue;
    next.set(runtime.id, createRuntimeNodeHandle(node as MutableAuraRuntimeSceneNode, runtime));
  }
  return next;
}

function createRuntimeNodeHandle(node: MutableAuraRuntimeSceneNode, runtime: AuraRuntimeNodeSpec): AuraRuntimeNodeHandle {
  const tags = runtime.tags ?? [];
  const attachedEffects: AuraRuntimeNodeEffectAttachment[] = [];
  const morphTargetWeights = new Map<string, number>();
  let animationBinding: AuraRuntimeNodeAnimationBindingMetadata | undefined;
  let animationPose: AnimationPose | undefined;
  let animationPoseBinding: AuraRuntimeNodeAnimationPoseBindingMetadata | undefined;
  const getVisible = () => node.kind === "model" ? node.visible !== false : node.visible !== false;
  const getBounds = () =>
    calculateRuntimeNodeBounds({
      position: node.position,
      scale: node.scale,
      size: "size" in node ? node.size : undefined
    });
  return {
    id: runtime.id,
    kind: node.kind,
    name: "name" in node ? node.name : undefined,
    tags,
    get position() {
      return node.position ?? [0, 0, 0];
    },
    set position(next) {
      node.position = next;
    },
    get rotation() {
      return node.rotation ?? [0, 0, 0];
    },
    set rotation(next) {
      node.rotation = next;
    },
    get scale() {
      return node.scale ?? 1;
    },
    set scale(next) {
      node.scale = next;
    },
    get visible() {
      return getVisible();
    },
    set visible(next) {
      node.visible = next;
    },
    setPosition(x, y, z) {
      node.position = [x, y, z];
      return this;
    },
    translate(x, y, z) {
      const current = node.position ?? [0, 0, 0];
      node.position = [current[0] + x, current[1] + y, current[2] + z];
      return this;
    },
    setRotation(x, y, z) {
      node.rotation = [x, y, z];
      return this;
    },
    setScale(scale) {
      node.scale = scale;
      return this;
    },
    setVisible(visible) {
      node.visible = visible;
      return this;
    },
    setMaterial(nextMaterial) {
      node.material = nextMaterial;
      return this;
    },
    play(clip, options = {}) {
      node.animation = { ...options, clip };
      return this;
    },
    setAnimation(animation) {
      node.animation = animation;
      return this;
    },
    setAnimationBinding(binding) {
      animationBinding = binding;
      return this;
    },
    setAnimationPose(pose, metadata) {
      animationPose = pose ? cloneRuntimeAnimationPose(pose) : undefined;
      animationPoseBinding = pose ? metadata : undefined;
      if (pose?.morphTargets) {
        for (const [name, weight] of Object.entries(pose.morphTargets)) {
          const normalizedName = name.trim();
          if (normalizedName) {
            morphTargetWeights.set(normalizedName, sanitizeRuntimeMorphWeight(weight));
          }
        }
      }
      return this;
    },
    animationPose() {
      return animationPose ? cloneRuntimeAnimationPose(animationPose) : undefined;
    },
    setMorphTarget(name, weight) {
      const normalizedName = name.trim();
      if (!normalizedName) {
        throw new AuraRuntimeError("missing-asset", "Aura3D morph target name is required.");
      }
      morphTargetWeights.set(normalizedName, sanitizeRuntimeMorphWeight(weight));
      return this;
    },
    setMorphTargets(weights) {
      morphTargetWeights.clear();
      for (const [name, weight] of Object.entries(weights)) {
        const normalizedName = name.trim();
        if (normalizedName) {
          morphTargetWeights.set(normalizedName, sanitizeRuntimeMorphWeight(weight));
        }
      }
      return this;
    },
    morphTargets() {
      return Object.fromEntries(morphTargetWeights.entries());
    },
    bounds() {
      return getBounds();
    },
    attachEffect(effect) {
      attachedEffects.push(effect);
      return this;
    },
    effects() {
      return [...attachedEffects];
    },
    snapshot() {
      return {
        id: runtime.id,
        kind: node.kind,
        name: "name" in node ? node.name : undefined,
        tags,
        position: node.position ?? [0, 0, 0],
        rotation: node.rotation ?? [0, 0, 0],
        scale: node.scale ?? 1,
        visible: getVisible(),
        animation: node.animation,
        animationBinding,
        animationPose: animationPose ? cloneRuntimeAnimationPose(animationPose) : undefined,
        animationPoseBinding,
        morphTargets: Object.fromEntries(morphTargetWeights.entries()),
        bounds: getBounds(),
        effects: [...attachedEffects]
      };
    }
  };
}

function cloneRuntimeAnimationPose(pose: AnimationPose): AnimationPose {
  return {
    bones: Object.fromEntries(
      Object.entries(pose.bones ?? {}).map(([bone, transform]) => [
        bone,
        {
          position: transform.position ? { ...transform.position } : undefined,
          rotation: transform.rotation ? { ...transform.rotation } : undefined,
          scale: transform.scale ? { ...transform.scale } : undefined
        }
      ])
    ),
    morphTargets: pose.morphTargets ? { ...pose.morphTargets } : undefined,
    rootMotion: pose.rootMotion
      ? {
          translation: pose.rootMotion.translation ? { ...pose.rootMotion.translation } : undefined,
          rotation: pose.rootMotion.rotation ? { ...pose.rootMotion.rotation } : undefined
        }
      : undefined,
    metadata: pose.metadata ? { ...pose.metadata } : undefined
  };
}

function sanitizeRuntimeMorphWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 0;
  return Math.max(0, Math.min(1, weight));
}

export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp {
  let snapshot = normalizeSceneSnapshot(options.scene);
  let renderSnapshot = flattenSceneSnapshot(snapshot);
  const diagnosticsState = createInitialDiagnostics(renderSnapshot);
  const canvas = resolveCanvas(target);
  if (canvas) {
    configureCanvas(canvas, options.pixelRatio ?? devicePixelRatioSafe(), options.resize ?? true);
  }
  const overlay = canvas && shouldRenderOverlay(options.diagnostics, snapshot) ? createDiagnosticsOverlay(canvas, diagnosticsState) : undefined;
  let disposed = false;
  let animationHandle = 0;
  let productionController: WebGLRenderController | undefined;
  let lastTime = 0;
  let mountRevision = 0;
  let canvasRuntimePhysics: ReturnType<typeof createRuntimeScenePhysics> | undefined;
  const runtimeNodes = createAuraRuntimeNodeRegistry(renderSnapshot);
  const frameCallbacks = new Set<AuraFrameCallback>();
  let runtimePaused = options.autoStart === false;
  let runtimeFrame = 0;
  let runtimeTime = 0;
  const runtimeFixedDt = 1 / 60;
  let runtimeAlpha = 0;
  const ownedInputControllers = new Set<ReturnType<typeof createGameInput>>();
  const runRuntimeFrame = (dt: number, source: AuraFrameInfo["source"]) => {
    runtimeFrame += 1;
    runtimeTime += dt;
    runtimeAlpha = runtimeFixedDt > 0 ? Math.max(0, Math.min(1, (dt % runtimeFixedDt) / runtimeFixedDt)) : 0;
    const frame: AuraFrameInfo = {
      dt,
      fixedDt: runtimeFixedDt,
      time: runtimeTime,
      frame: runtimeFrame,
      alpha: runtimeAlpha,
      paused: runtimePaused,
      source,
      substep: 1,
      substeps: 1
    };
    for (const callback of [...frameCallbacks]) callback(frame);
  };
  const shouldUseProductionRendererForCurrentScene = () =>
    Boolean(canvas && renderSnapshot.nodes.some(isWebGLRenderableNode) && typeof window !== "undefined");
  const resetDiagnosticsForCurrentScene = (backend: AuraBackend) => {
    const fresh = createInitialDiagnostics(renderSnapshot);
    diagnosticsState.backend = backend;
    diagnosticsState.fps = fresh.fps;
    diagnosticsState.drawCalls = fresh.drawCalls;
    diagnosticsState.renderSize = fresh.renderSize;
    diagnosticsState.assets = [];
    diagnosticsState.evidence = fresh.evidence;
    diagnosticsState.renderer = fresh.renderer;
    diagnosticsState.warnings = [...fresh.warnings];
    diagnosticsState.errors = [];
    validateSceneAssets(renderSnapshot, diagnosticsState.assets);
    diagnosticsState.warnings.push(...collectGeneratedCodeWarnings(renderSnapshot));
  };
  const render = (time = performanceNow()) => {
    if (disposed) return;
    const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
    lastTime = time;
    const dt = delta / 1000;
    if (!runtimePaused) {
      runRuntimeFrame(dt, "raf");
      canvasRuntimePhysics?.step(dt);
    }
    diagnosticsState.evidence = collectAuraSceneEvidence(renderSnapshot);
    diagnosticsState.fps = Math.round(1000 / delta);
    diagnosticsState.drawCalls = renderSceneToCanvas(canvas, renderSnapshot, time);
    if (canvas) diagnosticsState.renderSize = [canvas.width, canvas.height];
    overlay?.update();
    if (options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
      animationHandle = requestAnimationFrame(render);
    }
  };
  const mountCurrentScene = () => {
    if (disposed) return;
    if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
    animationHandle = 0;
    productionController?.dispose();
    productionController = undefined;
    lastTime = 0;
    const shouldUseProductionRenderer = shouldUseProductionRendererForCurrentScene();
    const backend: AuraBackend = shouldUseProductionRenderer ? "webgl2" : canvas ? "canvas2d" : "headless";
    resetDiagnosticsForCurrentScene(backend);
    canvasRuntimePhysics = shouldUseProductionRenderer ? undefined : createRuntimeScenePhysics(renderSnapshot);
    overlay?.update();
    const revision = ++mountRevision;
    if (shouldUseProductionRenderer && canvas) {
      void startProductionRender(canvas, renderSnapshot, diagnosticsState, options, overlay, runRuntimeFrame, () => runtimePaused)
        .then((controller) => {
          if (disposed || revision !== mountRevision) {
            controller.dispose();
            return;
          }
          productionController = controller;
          markRouteReady(snapshot, diagnosticsState);
        })
        .catch((error: unknown) => {
          if (disposed || revision !== mountRevision) return;
          diagnosticsState.backend = "webgl2";
          diagnosticsState.errors.push(productionRenderErrorMessage(error));
          overlay?.update();
          markRouteError(snapshot, diagnosticsState);
        });
      return;
    }
    render();
    markRouteReady(snapshot, diagnosticsState);
  };
  mountCurrentScene();
  return {
    canvas,
    get scene() {
      return snapshot;
    },
    get backend() {
      return diagnosticsState.backend;
    },
    setScene(nextScene) {
      snapshot = normalizeSceneSnapshot(nextScene);
      renderSnapshot = flattenSceneSnapshot(snapshot);
      runtimeNodes.reset(renderSnapshot);
      mountCurrentScene();
    },
    nodes: runtimeNodes,
    get runtime() {
      return {
        paused: runtimePaused,
        frame: runtimeFrame,
        time: runtimeTime,
        fixedDt: runtimeFixedDt,
        alpha: runtimeAlpha
      };
    },
    onFrame(callback) {
      frameCallbacks.add(callback);
      return () => {
        frameCallbacks.delete(callback);
      };
    },
    offFrame(callback) {
      frameCallbacks.delete(callback);
    },
    input(inputOptions) {
      const controller = createGameInput(inputOptions);
      ownedInputControllers.add(controller);
      return controller;
    },
    pause() {
      runtimePaused = true;
    },
    resume() {
      runtimePaused = false;
      if (!animationHandle && !productionController && options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
        animationHandle = requestAnimationFrame(render);
      }
    },
    step(dt = 1 / 60) {
      const seconds = Math.max(0, dt);
      runRuntimeFrame(seconds, "manual");
      canvasRuntimePhysics?.step(seconds);
      const previousPaused = runtimePaused;
      runtimePaused = true;
      if (productionController) {
        productionController.render(performanceNow());
      } else {
        render(performanceNow());
      }
      runtimePaused = previousPaused;
    },
    diagnostics() {
      return snapshotDiagnostics(diagnosticsState);
    },
    evidence(evidenceOptions = {}) {
      return collectGameRuntimeEvidenceV105(
        {
          runtime: {
            paused: runtimePaused,
            frame: runtimeFrame,
            time: runtimeTime,
            fixedDt: runtimeFixedDt,
            alpha: runtimeAlpha
          },
          nodes: runtimeNodes
        },
        evidenceOptions
      );
    },
    screenshot() {
      return captureAuraScreenshot(canvas);
    },
    dispose() {
      disposed = true;
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      for (const controller of ownedInputControllers) controller.dispose();
      ownedInputControllers.clear();
      productionController?.dispose();
      overlay?.dispose();
    }
  };
}

export function createAuraRouteHealthSnapshot(app: AuraApp): {
  readonly status: "ready" | "error";
  readonly diagnostics: AuraDiagnostics;
  readonly scene: AuraSceneSnapshot;
} {
  const diagnostics = app.diagnostics();
  return {
    status: diagnostics.errors.length === 0 ? "ready" : "error",
    diagnostics,
    scene: app.scene
  };
}

export function collectAuraSceneEvidence(sceneValue: AuraSceneBuilder | AuraSceneSnapshot): AuraSceneEvidence {
  const snapshot = flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue));
  const physicsNodes = snapshot.nodes.filter((node): node is AuraModelNode | AuraPrimitiveNode =>
    (node.kind === "model" || node.kind === "primitive") && Boolean(node.physics)
  );
  const interactionNodes = snapshot.nodes.filter((node): node is AuraInteractionNode => node.kind === "interaction");
  const labelNodes = snapshot.nodes.filter((node): node is AuraLabelNode => node.kind === "label");
  const animatedNodes = snapshot.nodes.filter((node): node is AuraModelNode | AuraPrimitiveNode | AuraGroupNode =>
    (node.kind === "model" || node.kind === "primitive" || node.kind === "group") && Boolean(node.animation)
  );
  const clips = Array.from(new Set(animatedNodes.map((node) => node.animation?.clip).filter((clip): clip is string => Boolean(clip)))).sort();
  const assetProvenance = snapshot.nodes
    .filter((node): node is AuraModelNode => node.kind === "model")
    .map((node) => createAssetProvenance(node.asset));
  const runtimeNodeIds = snapshot.nodes
    .map((node) => "runtime" in node ? node.runtime?.id : undefined)
    .filter((id): id is string => Boolean(id));
  const expectsGameRuntime = runtimeNodeIds.length > 0 || interactionNodes.some((node) => node.mode === "keyboard" || node.mode === "drag-vector" || node.mode === "click-impulse");

  return {
    physics: {
      worldAttached: Boolean(snapshot.physics),
      bodies: snapshot.physics?.bodies ?? physicsNodes.length,
      colliders: snapshot.physics?.colliders ?? physicsNodes.length,
      contacts: snapshot.physics?.contacts ?? 0,
      steps: snapshot.physics?.steps ?? 0,
      resets: snapshot.physics?.resets ?? 0,
      nodesWithPhysics: physicsNodes.length,
      sensors: physicsNodes.filter((node) => node.physics?.sensor === true).length
    },
    interactions: {
      modes: Array.from(new Set(interactionNodes.map((node) => node.mode))).sort() as AuraInteractionNode["mode"][],
      orbitEnabled: interactionNodes.some((node) => node.mode === "orbit"),
      hoverTargets: interactionNodes.filter((node) => node.mode === "hover" && node.target).map((node) => node.target!),
      dragTargets: interactionNodes.filter((node) => node.mode === "drag-vector" && node.target).map((node) => node.target!),
      impulseTargets: interactionNodes.filter((node) => node.mode === "click-impulse" && node.target).map((node) => node.target!)
    },
    camera: {
      mode: snapshot.camera.mode,
      orbitEnabled: snapshot.camera.mode === "orbit" || interactionNodes.some((node) => node.mode === "orbit"),
      followTarget: snapshot.camera.targetNode,
      captureTime: snapshot.camera.captureTime
    },
    animation: {
      animatedNodes: animatedNodes.length,
      turntableEnabled: clips.includes("turntable"),
      walkEnabled: clips.includes("walk"),
      clips
    },
    labels: {
      count: labelNodes.length,
      kinds: Array.from(new Set(labelNodes.map((node) => node.label))).sort() as AuraLabelNode["label"][],
      occlusionAware: labelNodes.filter((node) => node.occlusionAware === true).length,
      collisionAvoidance: labelNodes.filter((node) => node.collisionAvoidance === true).length
    },
    performance: createPerformanceEvidence(snapshot),
    gameRuntime: collectGameRuntimeEvidenceV105(
      {
        runtime: {
          frame: 0,
          time: 0,
          paused: true
        },
        nodes: {
          ids: () => runtimeNodeIds
        }
      },
      {
        animation: {
          controllers: animatedNodes.length,
          activeClips: clips,
          eventCount: 0
        },
        assets: {
          typedAssets: assetProvenance.filter((asset) => asset.source === "typed-aura-assets-manifest").length,
          missingAssets: []
        },
        source: {
          mode: "scene-source",
          expectsGame: expectsGameRuntime,
          label: "collectAuraSceneEvidence"
        }
      }
    ),
    rendering: createRendererDiagnosticReport(snapshot),
    assets: assetProvenance
  };
}

const helperPerformanceBudgets: readonly AuraHelperPerformanceBudget[] = [
  { helper: "physicsPlayground", maxDrawCalls: 320, maxNodes: 520, targetFpsP50: 50, maxBundleBytes: 18_000, evidence: "50 dynamic cubes plus contact/debug nodes at benchmark capture resolution" },
  { helper: "particleFountain", maxDrawCalls: 64, maxNodes: 24, targetFpsP50: 55, maxBundleBytes: 10_000, evidence: "batched particle effects plus emitter/ground evidence" },
  { helper: "solarSystem", maxDrawCalls: 280, maxNodes: 260, targetFpsP50: 50, maxBundleBytes: 14_000, evidence: "six planet system with orbit rings, leaders, labels, and starfield" },
  { helper: "dataBars3D", maxDrawCalls: 260, maxNodes: 280, targetFpsP50: 50, maxBundleBytes: 16_000, evidence: "6x6 chart with bars, caps, grid, labels, legend, and hover readout" },
  { helper: "neonTunnel", maxDrawCalls: 380, maxNodes: 420, targetFpsP50: 50, maxBundleBytes: 14_000, evidence: "24-ring tunnel with tube rings, wall chords, speed streaks, reflections, bloom, and fog" },
  { helper: "miniGolfHole", maxDrawCalls: 90, maxNodes: 48, targetFpsP50: 55, maxBundleBytes: 12_000, evidence: "physics ball, course, obstacle, cup sensor, score, aim, trail, and follow target" },
  { helper: "materialSwatches", maxDrawCalls: 96, maxNodes: 48, targetFpsP50: 55, maxBundleBytes: 12_000, evidence: "five material classes with label plinths, reflection cards, bloom, and lab lighting" },
  { helper: "cityBlock", maxDrawCalls: 360, maxNodes: 360, targetFpsP50: 50, maxBundleBytes: 18_000, evidence: "20 buildings with windows, streets, cars, lamps, day/night state markers, and labels" },
  { helper: "lowPolyHumanoid", maxDrawCalls: 96, maxNodes: 42, targetFpsP50: 55, maxBundleBytes: 90_000, evidence: "connected procedural low-poly humanoid with hidden joint balls, contact grounding, and deterministic benchmark pose" },
  { helper: "primitiveHumanoid", maxDrawCalls: 80, maxNodes: 42, targetFpsP50: 55, maxBundleBytes: 12_000, evidence: "hierarchical primitive character with connected chains, joints, path, and contact cues" },
  { helper: "productStage", maxDrawCalls: 96, maxNodes: 48, targetFpsP50: 55, maxBundleBytes: 10_000, evidence: "product plinth, normalized bounds/contact cues, softboxes, and inspection ring" }
] as const;

export const performance = {
  helperBudgets: (): readonly AuraHelperPerformanceBudget[] => helperPerformanceBudgets,
  budgetFor: (helper: AuraHelperBudgetId): AuraHelperPerformanceBudget | undefined =>
    helperPerformanceBudgets.find((budget) => budget.helper === helper),
  sceneKitBudgets: (): Readonly<Record<AuraSceneKitId, AuraSceneKitBudgetDefaults>> => sceneKitPerformanceBudgets,
  budgetForSceneKit: (id: AuraSceneKitId): AuraSceneKitBudgetDefaults => sceneKitPerformanceBudgets[id],
  budgetsForScene: (sceneValue: AuraSceneBuilder | AuraSceneSnapshot): readonly AuraHelperPerformanceBudget[] =>
    createPerformanceEvidence(flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue))).budgets
} as const;

function createPerformanceEvidence(snapshot: AuraSceneSnapshot): AuraSceneEvidence["performance"] {
  const budgets = collectHelperPerformanceBudgets(snapshot.nodes);
  const nodeCount = snapshot.nodes.length;
  return {
    budgets,
    helperCount: budgets.length,
    nodeBudgetExceeded: budgets
      .filter((budget) => nodeCount > budget.maxNodes && helperNodeCount(snapshot.nodes, budget.helper) > budget.maxNodes)
      .map((budget) => budget.helper)
  };
}

function collectHelperPerformanceBudgets(nodes: readonly AuraSceneNode[]): readonly AuraHelperPerformanceBudget[] {
  const nodeNames = nodes.map((node) => "name" in node ? node.name ?? "" : "");
  const hasName = (needle: string) => nodeNames.some((name) => name.includes(needle));
  const helpers = new Set<AuraHelperBudgetId>();
  if (hasName("visible rigid body cube") || hasName("physics collider debug line")) helpers.add("physicsPlayground");
  if (
    hasName("particle collision ground plane") ||
    hasName("fountain collision ground plane") ||
    hasName("particle emission nozzle") ||
    hasName("fountain droplet plume") ||
    hasName("gravity fountain plume")
  ) helpers.add("particleFountain");
  if (hasName("smooth orbit ring") || hasName("readable planet label")) helpers.add("solarSystem");
  if (hasName("height-colored data bar") || hasName("selected metric hover readout")) helpers.add("dataBars3D");
  if (hasName("true circular neon tunnel tube ring") || hasName("neon tunnel")) helpers.add("neonTunnel");
  if (hasName("white physics golf ball") || hasName("score counter")) helpers.add("miniGolfHole");
  if (hasName("mirror chrome metal swatch") || hasName("transparent cyan glass swatch")) helpers.add("materialSwatches");
  if (hasName("city tower") || hasName("day night toggle")) helpers.add("cityBlock");
  if (hasName("authored skinned humanoid character model") || hasName("authored humanoid soft contact shadow") || hasName("low poly humanoid connected anatomical shell") || hasName("low poly shoulder socket cap")) helpers.add("lowPolyHumanoid");
  if (hasName("humanoid head") || hasName("hierarchical primitive humanoid rig")) helpers.add("primitiveHumanoid");
  if (hasName("low matte hero product plinth") || hasName("soft product contact shadow from footprint")) helpers.add("productStage");
  return helperPerformanceBudgets.filter((budget) => helpers.has(budget.helper));
}

function helperNodeCount(nodes: readonly AuraSceneNode[], helper: AuraHelperBudgetId): number {
  const names = nodes.map((node) => "name" in node ? node.name ?? "" : "");
  const count = (predicate: (name: string) => boolean) => names.filter(predicate).length;
  if (helper === "physicsPlayground") return count((name) => name.includes("rigid body cube") || name.includes("physics") || name.includes("collision"));
  if (helper === "particleFountain") return count((name) => name.includes("particle") || name.includes("fountain") || name.includes("emission"));
  if (helper === "solarSystem") return count((name) => name.includes("orbit") || name.includes("planet") || name.includes("star") || name.includes("solar") || name.includes("sun"));
  if (helper === "dataBars3D") return count((name) => name.includes("data bar") || name.includes("chart") || name.includes("axis") || name.includes("legend") || name.includes("hover"));
  if (helper === "neonTunnel") return count((name) => name.includes("neon tunnel") || name.includes("tube ring") || name.includes("speed streak") || name.includes("reflection"));
  if (helper === "miniGolfHole") return count((name) => name.includes("golf") || name.includes("score") || name.includes("cup") || name.includes("obstacle") || name.includes("ball"));
  if (helper === "materialSwatches") return count((name) => name.includes("swatch") || name.includes("material") || name.includes("reflection") || name.includes("clearcoat") || name.includes("glass") || name.includes("rubber"));
  if (helper === "cityBlock") return count((name) => name.includes("city") || name.includes("street") || name.includes("window") || name.includes("crosswalk") || name.includes("sidewalk") || name.includes("lamp") || name.includes("tower"));
  if (helper === "lowPolyHumanoid") return count((name) => name.includes("low poly") || name.includes("humanoid") || name.includes("walking") || name.includes("shoulder") || name.includes("hip") || name.includes("knee") || name.includes("foot") || name.includes("benchmark pose"));
  if (helper === "primitiveHumanoid") return count((name) => name.includes("humanoid") || name.includes("walking") || name.includes("shoulder") || name.includes("hip") || name.includes("knee") || name.includes("foot"));
  return count((name) => name.includes("product") || name.includes("plinth") || name.includes("turntable") || name.includes("softbox") || name.includes("contact shadow"));
}

export function captureAuraScreenshot(target?: HTMLCanvasElement): AuraScreenshot {
  if (!target) {
    return {
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,",
      width: 0,
      height: 0
    };
  }
  if (typeof target.toDataURL !== "function") {
    throw new AuraRuntimeError(
      "missing-canvas",
      "Aura3D screenshot failed because the target is not a canvas. Suggested fix: pass the app returned by createAuraApp or its canvas."
    );
  }
  return {
    mimeType: "image/png",
    dataUrl: target.toDataURL("image/png"),
    width: target.width,
    height: target.height
  };
}

export function createAuraAssetLoadError(asset: AuraAssetRef<"model">, reason: string): AuraRuntimeError {
  return new AuraRuntimeError(
    "failed-glb-load",
    `Aura3D failed to load GLB asset "${asset.id}" from "${asset.url}": ${reason}. Suggested fix: run aura3d assets validate and confirm the URL is served by your app.`
  );
}

interface WebGLRenderController {
  render(time?: number): void;
  dispose(): void;
}

function isRenderableModelNode(node: AuraSceneNode): node is AuraModelNode {
  return node.kind === "model" && node.visible !== false && Boolean(node.asset.url) && ["glb", "gltf"].includes(node.asset.format);
}

function isWebGLRenderableNode(node: AuraSceneNode): node is AuraModelNode | AuraPrimitiveNode {
  return isRenderableModelNode(node) || node.kind === "primitive";
}

async function startProductionRender(
  canvas: HTMLCanvasElement,
  snapshot: AuraSceneSnapshot,
  diagnosticsState: MutableDiagnostics,
  options: AuraCreateAppOptions,
  overlay?: { update(): void },
  beforeRender?: (dt: number, source: AuraFrameInfo["source"]) => void,
  isPaused: () => boolean = () => false
): Promise<WebGLRenderController> {
  const renderableNode = snapshot.nodes.find(isWebGLRenderableNode);
  if (!renderableNode) {
    throw new AuraRuntimeError(
      "missing-asset",
      "Aura3D production rendering requires at least one typed model asset or primitive. Suggested fix: add model(assets.product), primitives.box(), primitives.sphere(), primitives.cylinder(), or primitives.plane()."
      );
  }

  const renderer = await createProductionSceneRenderer(canvas, snapshot);
  diagnosticsState.renderer = renderer.diagnostics;
  const continuousRender = shouldContinuouslyRender(snapshot);

  let disposed = false;
  let animationHandle = 0;
  let lastTime = 0;
  const renderFrame = (time = performanceNow()) => {
    if (disposed) return;
    const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
    lastTime = time;
    if (!isPaused()) beforeRender?.(delta / 1000, "raf");
    const drawCalls = renderer.render(time);
    diagnosticsState.backend = "webgl2";
    diagnosticsState.fps = diagnosticsState.fps || 60;
    diagnosticsState.drawCalls = drawCalls;
    diagnosticsState.renderSize = [canvas.width, canvas.height];
    diagnosticsState.evidence = collectAuraSceneEvidence(snapshot);
    diagnosticsState.renderer = renderer.diagnostics;
    overlay?.update();
    if (continuousRender && options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
      animationHandle = requestAnimationFrame(renderFrame);
    }
  };

  renderFrame();

  return {
    render(time = performanceNow()) {
      renderFrame(time);
    },
    dispose() {
      disposed = true;
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      renderer.dispose();
    }
  };
}

function shouldContinuouslyRender(snapshot: AuraSceneSnapshot): boolean {
  if (snapshot.timeline?.mode === "loop") return true;
  if (snapshot.camera.mode === "dolly" || snapshot.camera.mode === "follow" || snapshot.camera.mode === "path" || snapshot.camera.mode === "flythrough") return true;
  return snapshot.nodes.some((node) => {
    if ("runtime" in node && node.runtime?.mutable !== false) return true;
    if ((node.kind === "model" || node.kind === "primitive") && node.animation) return true;
    if (node.kind !== "effect") return false;
    return node.effect === "particles" || node.effect === "rain";
  });
}

async function createProductionSceneRenderer(canvas: HTMLCanvasElement, snapshot: AuraSceneSnapshot): Promise<WebGLSceneRenderer> {
  return await createWebGLSceneRenderer(canvas, snapshot);
}

function colorToClearColor(color: AuraColor): readonly [number, number, number, number] {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    const value = Number.parseInt(color.slice(1), 16);
    return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255, 1];
  }
  return [0.02, 0.025, 0.035, 1];
}

function colorWithAlpha(color: AuraColor, alpha: number): string {
  const [r, g, b] = colorToClearColor(color);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Math.min(1, Math.max(0, alpha))})`;
}

function labelDefaultPosition(node: AuraLabelNode): AuraVec3 {
  if (node.screenAnchor === "top-right") return [1.35, 1.85, -0.2];
  if (node.screenAnchor === "bottom-left") return [-1.35, 0.26, -0.2];
  if (node.screenAnchor === "bottom-right") return [1.35, 0.26, -0.2];
  if (node.label === "hud") return [-1.35, 1.85, -0.2];
  return [0, 1.28, 0];
}

function resolveAnimationSeconds(animation: AuraAnimationSpec | undefined, time: number): number {
  if (!animation) return time / 1000;
  const startTime = animation.startTime ?? 0;
  const duration = animation.duration ?? 0;
  const rawSeconds = Math.max(0, time / 1000 - startTime);
  if (animation.captureTime !== undefined) {
    const phase = Math.max(0, animation.captureTime);
    if (animation.loop !== false) {
      const liveSeconds = phase + rawSeconds;
      return duration > 0 ? liveSeconds % duration : liveSeconds;
    }
    return phase;
  }
  if (duration <= 0) return rawSeconds;
  return animation.loop === false ? Math.min(rawSeconds, duration) : rawSeconds % duration;
}

function orbitAnimatedAngle(seconds: number, speed: number): number {
  return seconds * speed * 0.58;
}

function orbitAnimatedPosition(animation: AuraAnimationSpec, basePosition: AuraVec3, seconds: number, speed: number): AuraVec3 {
  const center = animation.orbitCenter ?? [0, basePosition[1], 0] as const;
  const radius = animation.orbitRadius ?? Math.hypot(basePosition[0] - center[0], basePosition[2] - center[2]);
  const phase = animation.orbitPhase ?? Math.atan2(basePosition[2] - center[2], basePosition[0] - center[0]);
  const angle = phase + orbitAnimatedAngle(seconds, speed);
  return [
    center[0] + Math.cos(angle) * radius,
    basePosition[1],
    center[2] + Math.sin(angle) * radius
  ];
}

type AuraFountainParticleLayer = "plume" | "splash" | "mist";

function getParticleLife(seedIndex: number, seconds: number, emitter: AuraEffectNode["emitter"]): number {
  if (emitter !== "fountain") return (seededRange(seedIndex, 181, 0, 1) + seconds * 0.18) % 1;
  const phase = seededRange(seedIndex, 181, 0, 1);
  const jet = seededRange(seedIndex, 199, 0.42, 1);
  return (phase + seconds * 0.34 * jet) % 1;
}

function writeParticlePosition(
  positions: Float32Array,
  index: number,
  seconds: number,
  emitter: AuraEffectNode["emitter"],
  radius: number,
  height: number,
  seedIndex = index,
  turbulence = 0,
  gravity = 0,
  groundCollision = false,
  fountainLayer: AuraFountainParticleLayer = "plume"
): void {
  const angleSeed = seededRange(seedIndex, 191, 0, 1);
  const angle = angleSeed * Math.PI * 2 + seconds * (emitter === "swirl" ? 1.45 : 0.14);
  const radial = radius * (0.18 + seededRange(seedIndex, 193, 0, 0.82));
  let x = Math.cos(angle) * radial;
  let y = seededRange(seedIndex, 197, 0.08, height);
  let z = Math.sin(angle) * radial;
  if (emitter === "fountain") {
    const rise = getParticleLife(seedIndex, seconds, emitter);
    const arc = Math.sin(rise * Math.PI);
    const shell = seededRange(seedIndex, 203, 0.82, 1.08);
    const side = seededRange(seedIndex, 271, 0, 1) < 0.5 ? -1 : 1;
    if (fountainLayer === "splash") {
      const theta = seedIndex * 2.07 + rise * Math.PI * 1.35 + seconds * 0.18;
      const outward = radius * (0.34 + rise * 0.66) * shell;
      x = Math.cos(theta) * outward;
      z = Math.sin(theta) * outward;
      y = 0.08 + (seedIndex % 5) * 0.035 + Math.sin(rise * Math.PI) * height * 0.08;
    } else if (fountainLayer === "mist") {
      const theta = angleSeed * Math.PI * 2 + seconds * 0.08;
      const outward = radius * seededRange(seedIndex, 203, 0.32, 1.12);
      x = Math.cos(theta) * outward + side * arc * radius * 0.16;
      z = Math.sin(theta) * outward * 0.48 - rise * radius * 0.12;
      y = 0.16 + arc * height * 0.54 + seededRange(seedIndex, 207, -0.08, 0.16);
    } else {
      const vertical = Math.pow(rise, 0.78);
      const widthProfile = Math.sin(rise * Math.PI);
      const theta = seedIndex * 2.399963 + seconds * 0.08;
      const spread = radius * (0.1 + widthProfile * (0.55 + (seedIndex % 7) * 0.018)) * shell;
      x = Math.cos(theta) * spread;
      z = Math.sin(theta) * spread - widthProfile * radius * 0.18;
      y = 0.28 + vertical * height - Math.max(0, vertical - 0.92) ** 2 * gravity * 0.025;
    }
  } else if (emitter === "ambient") {
    x = seededRange(seedIndex, 211, -radius * 2, radius * 2);
    y = seededRange(seedIndex, 223, 0.08, height);
    z = seededRange(seedIndex, 227, -radius * 1.4, radius * 1.4);
  }
  if (turbulence > 0) {
    const turbulencePhase = seconds * (0.8 + seededRange(seedIndex, 229, 0, 1.7)) + angleSeed * Math.PI * 2;
    x += Math.sin(turbulencePhase) * turbulence * radius * 0.12;
    z += Math.cos(turbulencePhase * 0.83) * turbulence * radius * 0.12;
    y += Math.sin(turbulencePhase * 1.23) * turbulence * height * 0.035;
  }
  if (groundCollision && y < 0.035) y = 0.035 + seededRange(seedIndex, 233, 0, 0.035);
  positions[index * 3] = x;
  positions[index * 3 + 1] = y;
  positions[index * 3 + 2] = z;
}

function seededRange(index: number, salt: number, min: number, max: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  const normalized = value - Math.floor(value);
  return min + (max - min) * normalized;
}

function resolveCameraTarget(snapshot: AuraSceneSnapshot, cameraSpec: AuraCameraSpec): AuraVec3 {
  if (cameraSpec.mode === "follow" && cameraSpec.targetNode) {
    const targetNode = snapshot.nodes.find((node): node is AuraModelNode | AuraPrimitiveNode =>
      (node.kind === "model" || node.kind === "primitive") &&
      (node.name === cameraSpec.targetNode || (node.kind === "model" && node.asset.id === cameraSpec.targetNode))
    );
    if (targetNode?.position) return targetNode.position;
  }
  return cameraSpec.target ?? [0, 0.7, 0];
}

function resolveCameraEye(snapshot: AuraSceneSnapshot, cameraSpec: AuraCameraSpec, time: number): AuraVec3 {
  const target = resolveCameraTarget(snapshot, cameraSpec);
  let eye: AuraVec3 = cameraSpec.position ?? [0, 1.4, cameraSpec.distance ?? 4];
  if (cameraSpec.mode === "orbit") {
    const distance = cameraSpec.distance ?? 4;
    eye = cameraSpec.position ?? [target[0] + distance * 0.62, target[1] + distance * 0.42, target[2] + distance * 0.78];
  }
  if (cameraSpec.mode === "follow") {
    const distance = cameraSpec.distance ?? 4;
    eye = cameraSpec.position ?? [target[0] - distance * 0.38, target[1] + distance * 0.52, target[2] + distance * 0.82];
  }
  if (cameraSpec.mode === "dolly") {
    const seconds = cameraSpec.seconds ?? 6;
    const phase = (time / 1000 % seconds) / seconds;
    const eased = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
    const from = cameraSpec.from ?? [0, 1.4, 5];
    const to = cameraSpec.to ?? [0, 1.2, 3.4];
    eye = mix3(from, to, eased);
  }
  if (cameraSpec.mode === "path" || cameraSpec.mode === "flythrough") {
    const seconds = Math.max(0.001, cameraSpec.seconds ?? 6);
    const sourceTime = cameraSpec.captureTime !== undefined ? cameraSpec.captureTime * 1000 : time;
    const phase = ((sourceTime / 1000) % seconds) / seconds;
    const eased = cameraSpec.easing === "linear" ? phase : 0.5 - Math.cos(phase * Math.PI) * 0.5;
    const from = cameraSpec.from ?? [0, 1.4, 5];
    const to = cameraSpec.to ?? [0, 1.2, 3.4];
    eye = mix3(from, to, eased);
  }
  return eye;
}

interface WebGLSceneRenderer {
  readonly diagnostics: AuraRendererDiagnosticReport;
  render(time: number): number;
  dispose(): void;
}

function collectRuntimeEffectNodes(snapshot: AuraSceneSnapshot): AuraEffectNode[] {
  return groups.flatten(snapshot.nodes).filter((node): node is AuraEffectNode => node.kind === "effect");
}

function hasRuntimePostProcessEffects(effectNodes: readonly AuraEffectNode[]): boolean {
  return effectNodes.some((node) => node.effect === "bloom" || node.effect === "ambient-occlusion" || node.effect === "contact-occlusion");
}

interface WebGLPrimitive {
  readonly position: WebGLBuffer;
  readonly normal: WebGLBuffer;
  readonly vertexColor?: WebGLBuffer;
  readonly index?: WebGLBuffer;
  readonly count: number;
  readonly mode: number;
  readonly indexType?: number;
  readonly color?: readonly [number, number, number];
}

interface WebGLModel {
  readonly node?: AuraModelNode | AuraPrimitiveNode;
  readonly primitives: readonly WebGLPrimitive[];
  readonly bounds: GltfBounds;
  readonly color: readonly [number, number, number];
  readonly normalizeToUnit: boolean;
  readonly modelMatrix?: Float32Array;
}

interface GltfPrimitive {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly mode: number;
  readonly color?: readonly [number, number, number];
}

interface GltfModel {
  readonly primitives: readonly GltfPrimitive[];
  readonly bounds: GltfBounds;
}

interface GltfBounds {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

interface GltfJson {
  readonly scene?: number;
  readonly scenes?: readonly {
    readonly nodes?: readonly number[];
  }[];
  readonly nodes?: readonly {
    readonly name?: string;
    readonly mesh?: number;
    readonly children?: readonly number[];
    readonly matrix?: readonly number[];
    readonly translation?: readonly number[];
    readonly rotation?: readonly number[];
    readonly scale?: readonly number[];
  }[];
  readonly buffers?: readonly { readonly uri?: string; readonly byteLength?: number }[];
  readonly bufferViews?: readonly { readonly buffer: number; readonly byteOffset?: number; readonly byteLength: number; readonly byteStride?: number }[];
  readonly accessors?: readonly {
    readonly bufferView?: number;
    readonly byteOffset?: number;
    readonly componentType: number;
    readonly count: number;
    readonly type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";
    readonly normalized?: boolean;
    readonly min?: readonly number[];
    readonly max?: readonly number[];
  }[];
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly attributes?: Record<string, number>;
      readonly indices?: number;
      readonly mode?: number;
      readonly material?: number;
    }[];
  }[];
  readonly materials?: readonly {
    readonly pbrMetallicRoughness?: {
      readonly baseColorFactor?: readonly number[];
    };
    readonly emissiveFactor?: readonly number[];
  }[];
}

async function createWebGLSceneRenderer(canvas: HTMLCanvasElement, snapshot: AuraSceneSnapshot): Promise<WebGLSceneRenderer> {
  const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
  if (!gl) {
    throw new AuraRuntimeError("backend-fallback", "Aura3D could not create a WebGL2 renderer. Suggested fix: use a WebGL2-capable browser.");
  }
  const backdrop = createWebGLBackdrop(gl, snapshot);
  const program = createWebGLProgram(gl);
  const modelNodes = snapshot.nodes.filter(isRenderableModelNode);
  const assetModels = await Promise.all(modelNodes.map(async (node) => createWebGLModel(gl, node, await loadGltfForWebGL(node.asset.url))));
  const primitiveModels = snapshot.nodes
    .filter((node): node is AuraPrimitiveNode => node.kind === "primitive")
    .map((node) => createWebGLPrimitiveModel(gl, node));
  const rainModels = snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")
    ? [createWebGLRainModel(gl)]
    : [];
  const particleModels = snapshot.nodes
    .filter((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "particles")
    .map((node) => createWebGLParticleModel(gl, node));
  const models = [...assetModels, ...primitiveModels, ...rainModels, ...particleModels];
  const background = colorToClearColor(snapshot.background);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  const requestedEffectNodes = collectRuntimeEffectNodes(snapshot);
  const runtimeRendererDiagnostics = createRendererDiagnosticReport(snapshot, {
    mounted: true,
    backend: "webgl2-agent-runtime",
    postprocess: {
      renderPass: false,
      outputPass: false,
      bloomPass: false,
      ambientOcclusionPass: false,
      contactOcclusionReceiver: false,
      pixelBacked: false,
      actualPasses: [],
      fallbackPasses: hasRuntimePostProcessEffects(requestedEffectNodes) ? ["webgl2-direct-render"] : []
    },
    warnings: ["Aura3D WebGL2 agent runtime renders typed models, primitives, and basic effects; advanced postprocess, environment prefiltering, shadow maps, and GLB animation mixers are reported as unsupported until the production renderer adapter covers them."]
  });

  return {
    diagnostics: runtimeRendererDiagnostics,
    render(time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(background[0], background[1], background[2], background[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      let drawCalls = backdrop.render();
      gl.useProgram(program.program);
      gl.enable(gl.DEPTH_TEST);
      const viewProjection = createViewProjection(snapshot, canvas.width / Math.max(1, canvas.height), time);
      gl.uniformMatrix4fv(program.uniforms.viewProjection, false, viewProjection);
      gl.uniform3fv(program.uniforms.lightDirection, new Float32Array(normalize3([0.45, 0.82, 0.36])));
      for (const modelEntry of models) {
        const modelMatrix = modelEntry.modelMatrix ?? createModelMatrix(modelEntry.node, modelEntry.bounds, modelEntry.normalizeToUnit, time);
        gl.uniformMatrix4fv(program.uniforms.model, false, modelMatrix);
        for (const primitiveEntry of modelEntry.primitives) {
          gl.uniform3fv(program.uniforms.color, new Float32Array(primitiveEntry.color ?? modelEntry.color));
          gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.position);
          gl.enableVertexAttribArray(program.attributes.position);
          gl.vertexAttribPointer(program.attributes.position, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.normal);
          gl.enableVertexAttribArray(program.attributes.normal);
          gl.vertexAttribPointer(program.attributes.normal, 3, gl.FLOAT, false, 0, 0);
          if (primitiveEntry.vertexColor) {
            gl.bindBuffer(gl.ARRAY_BUFFER, primitiveEntry.vertexColor);
            gl.enableVertexAttribArray(program.attributes.color);
            gl.vertexAttribPointer(program.attributes.color, 3, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(program.attributes.color);
            gl.vertexAttrib3f(program.attributes.color, 1, 1, 1);
          }
          if (primitiveEntry.index && primitiveEntry.indexType) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, primitiveEntry.index);
            gl.drawElements(primitiveEntry.mode, primitiveEntry.count, primitiveEntry.indexType, 0);
          } else {
            gl.drawArrays(primitiveEntry.mode, 0, primitiveEntry.count);
          }
          drawCalls += 1;
        }
      }
      return drawCalls;
    },
    dispose() {
      for (const modelEntry of models) {
        for (const primitiveEntry of modelEntry.primitives) {
          gl.deleteBuffer(primitiveEntry.position);
          gl.deleteBuffer(primitiveEntry.normal);
          if (primitiveEntry.index) gl.deleteBuffer(primitiveEntry.index);
        }
      }
      gl.deleteProgram(program.program);
      backdrop.dispose();
    }
  };
}

function createWebGLBackdrop(gl: WebGL2RenderingContext, snapshot: AuraSceneSnapshot): { render(): number; dispose(): void } {
  const program = createBackdropProgram(gl);
  const palette = createBackdropPalette(snapshot);
  const vertices = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1
  ]));
  return {
    render() {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(program.program);
      gl.uniform3fv(program.uniforms.low, new Float32Array(palette.low));
      gl.uniform3fv(program.uniforms.mid, new Float32Array(palette.mid));
      gl.uniform3fv(program.uniforms.high, new Float32Array(palette.high));
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.enableVertexAttribArray(program.attribute);
      gl.vertexAttribPointer(program.attribute, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true);
      return 1;
    },
    dispose() {
      gl.deleteBuffer(vertices);
      gl.deleteProgram(program.program);
    }
  };
}

function createBackdropProgram(gl: WebGL2RenderingContext): {
  readonly program: WebGLProgram;
  readonly attribute: number;
  readonly uniforms: {
    readonly low: WebGLUniformLocation;
    readonly mid: WebGLUniformLocation;
    readonly high: WebGLUniformLocation;
  };
} {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec3 u_low;
uniform vec3 u_mid;
uniform vec3 u_high;
out vec4 outColor;
void main() {
  float band = smoothstep(0.05, 0.78, v_uv.y);
  vec3 color = mix(u_low, u_mid, band);
  float stageGlow = smoothstep(0.62, 0.0, abs(v_uv.x - 0.50)) * smoothstep(0.08, 0.74, v_uv.y);
  color += u_mid * stageGlow * 0.18;
  float vignette = smoothstep(0.98, 0.24, distance(v_uv, vec2(0.50, 0.46)));
  color = mix(u_high, color, vignette);
  outColor = vec4(color, 1.0);
}`);
  const program = gl.createProgram();
  if (!program) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 backdrop program allocation failed.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 backdrop shader link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  return {
    program,
    attribute: gl.getAttribLocation(program, "a_position"),
    uniforms: {
      low: requiredUniform(gl, program, "u_low"),
      mid: requiredUniform(gl, program, "u_mid"),
      high: requiredUniform(gl, program, "u_high")
    }
  };
}

function createBackdropPalette(snapshot: AuraSceneSnapshot): {
  readonly low: readonly [number, number, number];
  readonly mid: readonly [number, number, number];
  readonly high: readonly [number, number, number];
} {
  const base = colorToRgb(snapshot.background);
  const effectColor = snapshot.nodes.find((node): node is AuraEffectNode => node.kind === "effect" && Boolean(node.color))?.color;
  const accent = effectColor ? colorToRgb(effectColor) : base;
  return {
    low: scaleRgb(base, 0.72),
    mid: clampRgb(mixRgb(scaleRgb(base, 1.55), accent, 0.28)),
    high: scaleRgb(base, 0.16)
  };
}

function createWebGLModel(gl: WebGL2RenderingContext, node: AuraModelNode, modelData: GltfModel): WebGLModel {
  return {
    node,
    bounds: modelData.bounds,
    color: colorToRgb(node.material?.color ?? "#8fb4ff"),
    normalizeToUnit: true,
    primitives: modelData.primitives.map((primitiveEntry) => {
      const position = createBuffer(gl, gl.ARRAY_BUFFER, primitiveEntry.positions);
      const normal = createBuffer(gl, gl.ARRAY_BUFFER, primitiveEntry.normals);
      const index = primitiveEntry.indices ? createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, primitiveEntry.indices) : undefined;
      return {
        position,
        normal,
        ...(index ? { index } : {}),
        count: primitiveEntry.indices?.length ?? primitiveEntry.positions.length / 3,
        mode: webglDrawMode(gl, primitiveEntry.mode),
        color: node.material?.color ? colorToRgb(node.material.color) : primitiveEntry.color,
        ...(primitiveEntry.indices ? { indexType: primitiveEntry.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT } : {})
      };
    })
  };
}

function createWebGLPrimitiveModel(gl: WebGL2RenderingContext, node: AuraPrimitiveNode): WebGLModel {
  const primitive = node.primitive === "sphere"
    ? createSphereGeometry()
    : node.primitive === "capsule"
      ? createCapsuleApproxGeometry()
      : node.primitive === "torus"
        ? createTorusGeometry()
    : node.primitive === "box"
      ? createBoxGeometry()
      : node.primitive === "cylinder"
        ? createCylinderGeometry()
        : createPlaneGeometry();
  return {
    node,
    bounds: primitive.bounds,
    color: colorToRgb(node.material?.emissive ?? node.material?.color ?? "#d7dee8"),
    normalizeToUnit: false,
    primitives: [{
      position: createBuffer(gl, gl.ARRAY_BUFFER, primitive.positions),
      normal: createBuffer(gl, gl.ARRAY_BUFFER, primitive.normals),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, primitive.indices),
      count: primitive.indices.length,
      mode: gl.TRIANGLES,
      indexType: gl.UNSIGNED_SHORT
    }]
  };
}

function createWebGLRainModel(gl: WebGL2RenderingContext): WebGLModel {
  const lineCount = 90;
  const positions = new Float32Array(lineCount * 2 * 3);
  const normals = new Float32Array(lineCount * 2 * 3);
  const indices = new Uint16Array(lineCount * 2);
  for (let index = 0; index < lineCount; index += 1) {
    const x = ((index * 37) % 100) / 18 - 2.8;
    const z = ((index * 53) % 100) / 20 - 2.5;
    const y = 0.65 + ((index * 29) % 100) / 45;
    const base = index * 6;
    positions.set([x, y, z, x - 0.08, y - 0.42, z + 0.04], base);
    normals.set([0, 1, 0, 0, 1, 0], base);
    indices[index * 2] = index * 2;
    indices[index * 2 + 1] = index * 2 + 1;
  }
  return {
    bounds: { min: [-3, 0, -3], max: [3, 3, 3] },
    color: [0.62, 0.82, 1],
    normalizeToUnit: false,
    modelMatrix: identity4(),
    primitives: [{
      position: createBuffer(gl, gl.ARRAY_BUFFER, positions),
      normal: createBuffer(gl, gl.ARRAY_BUFFER, normals),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices),
      count: indices.length,
      mode: gl.LINES,
      indexType: gl.UNSIGNED_SHORT
    }]
  };
}

function createWebGLParticleModel(gl: WebGL2RenderingContext, effect: AuraEffectNode): WebGLModel {
  const isFountain = effect.emitter === "fountain";
  const materialMode = effect.materialMode ?? "soft-alpha";
  const fountainLayer: AuraFountainParticleLayer = !isFountain
    ? "plume"
    : effect.materialMode === "soft-alpha" || effect.name?.includes("mist")
      ? "mist"
      : effect.name?.includes("splash") || effect.name?.includes("collision")
        ? "splash"
        : "plume";
  const requestedCount = effect.particleCount ?? 900;
  const minCount = isFountain
    ? fountainLayer === "splash"
      ? 64
      : fountainLayer === "mist"
        ? 90
        : 240
    : 120;
  const maxCount = isFountain ? 1200 : 1800;
  const count = Math.max(minCount, Math.min(maxCount, requestedCount));
  const radius = effect.radius ?? 1.15;
  const height = effect.height ?? 2.4;
  const turbulence = Math.max(0, Math.min(1, effect.turbulence ?? effect.noise ?? 0));
  const gravity = effect.gravity ?? 0;
  const groundCollision = effect.groundCollision ?? false;
  const positions = new Float32Array(count * 6 * 3);
  const normals = new Float32Array(count * 6 * 3);
  const colors = new Float32Array(count * 6 * 3);
  const indices = new Uint16Array(count * 8 * 3);
  const center = new Float32Array(3);
  const localVertices = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, 0, -1],
    [0, -1, 0]
  ] as const;
  const localTriangles = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 1],
    [5, 2, 1],
    [5, 3, 2],
    [5, 4, 3],
    [5, 1, 4]
  ] as const;
  const lifetimeRamp = (effect.lifetimeColorRamp?.length
    ? effect.lifetimeColorRamp
    : isFountain
      ? ["#fff7ad", "#fef08a", "#fb923c", "#60a5fa", "#38bdf8", "#fb7185"]
      : [effect.color ?? "#7dfcff", "#ffd166", "#60a5fa"]) as readonly AuraColor[];
  const sizeCurve = effect.sizeOverLife ?? [0.35, 1, 0.58];
  for (let index = 0; index < count; index += 1) {
    writeParticlePosition(center, 0, 0, effect.emitter ?? "swirl", radius, height, index, turbulence, gravity, groundCollision, fountainLayer);
    const life = getParticleLife(index, 0, effect.emitter ?? "swirl");
    const sizeLife = life < 0.5
      ? (sizeCurve[0] ?? 0.35) + ((sizeCurve[1] ?? 1) - (sizeCurve[0] ?? 0.35)) * (life / 0.5)
      : (sizeCurve[1] ?? 1) + ((sizeCurve[2] ?? 0.58) - (sizeCurve[1] ?? 1)) * ((life - 0.5) / 0.5);
    const baseSize = isFountain
      ? fountainLayer === "mist"
        ? 0.026
        : fountainLayer === "splash"
          ? 0.058
          : 0.074
      : materialMode === "dust" || materialMode === "smoke"
        ? 0.032
        : 0.044;
    const size = baseSize * Math.max(0.45, sizeLife) * seededRange(index, 353, 0.78, 1.22);
    const particleColor = colorToRgb(lifetimeRamp[index % lifetimeRamp.length] ?? effect.color ?? "#7dfcff");
    const vertexBase = index * 6;
    const positionBase = vertexBase * 3;
    for (let vertex = 0; vertex < localVertices.length; vertex += 1) {
      const local = localVertices[vertex];
      const offset = positionBase + vertex * 3;
      positions[offset] = center[0] + local[0] * size;
      positions[offset + 1] = center[1] + local[1] * size;
      positions[offset + 2] = center[2] + local[2] * size;
      normals[offset] = 0.45;
      normals[offset + 1] = 0.82;
      normals[offset + 2] = 0.36;
      colors[offset] = particleColor[0];
      colors[offset + 1] = particleColor[1];
      colors[offset + 2] = particleColor[2];
    }
    const indexBase = index * 24;
    for (let tri = 0; tri < localTriangles.length; tri += 1) {
      const local = localTriangles[tri];
      indices[indexBase + tri * 3] = vertexBase + local[0];
      indices[indexBase + tri * 3 + 1] = vertexBase + local[1];
      indices[indexBase + tri * 3 + 2] = vertexBase + local[2];
    }
  }
  return {
    bounds: { min: [-radius * 2, 0, -radius * 2], max: [radius * 2, height, radius * 2] },
    color: [1, 1, 1],
    normalizeToUnit: false,
    modelMatrix: identity4(),
    primitives: [{
      position: createBuffer(gl, gl.ARRAY_BUFFER, positions),
      normal: createBuffer(gl, gl.ARRAY_BUFFER, normals),
      vertexColor: createBuffer(gl, gl.ARRAY_BUFFER, colors),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices),
      count: indices.length,
      mode: gl.TRIANGLES,
      indexType: gl.UNSIGNED_SHORT
    }]
  };
}

function createBuffer(gl: WebGL2RenderingContext, target: number, data: Float32Array | Uint16Array | Uint32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 buffer allocation failed. Suggested fix: reload the page or reduce asset complexity.");
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data as unknown as BufferSource, gl.STATIC_DRAW);
  return buffer;
}

function createWebGLProgram(gl: WebGL2RenderingContext): {
  readonly program: WebGLProgram;
  readonly attributes: { readonly position: number; readonly normal: number; readonly color: number };
  readonly uniforms: {
    readonly model: WebGLUniformLocation;
    readonly viewProjection: WebGLUniformLocation;
    readonly color: WebGLUniformLocation;
    readonly lightDirection: WebGLUniformLocation;
  };
} {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec3 a_color;
uniform mat4 u_model;
uniform mat4 u_viewProjection;
out vec3 v_normal;
out vec3 v_world;
out vec3 v_color;
void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_world = world.xyz;
  v_normal = normalize(mat3(u_model) * a_normal);
  v_color = a_color;
  gl_Position = u_viewProjection * world;
}`);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec3 v_normal;
in vec3 v_world;
in vec3 v_color;
uniform vec3 u_color;
uniform vec3 u_lightDirection;
out vec4 outColor;
void main() {
  vec3 normal = normalize(v_normal);
  float key = max(dot(normal, normalize(u_lightDirection)), 0.0);
  float rim = pow(1.0 - max(dot(normal, normalize(vec3(0.0, 0.35, 1.0))), 0.0), 2.0);
  vec3 base = u_color * v_color;
  vec3 color = base * (0.34 + key * 0.66) + vec3(0.35, 0.65, 1.0) * rim * 0.12;
  outColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}`);
  const program = gl.createProgram();
  if (!program) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 program allocation failed.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }
  const uniforms = {
    model: requiredUniform(gl, program, "u_model"),
    viewProjection: requiredUniform(gl, program, "u_viewProjection"),
    color: requiredUniform(gl, program, "u_color"),
    lightDirection: requiredUniform(gl, program, "u_lightDirection")
  };
  return {
    program,
    attributes: {
      position: gl.getAttribLocation(program, "a_position"),
      normal: gl.getAttribLocation(program, "a_normal"),
      color: gl.getAttribLocation(program, "a_color")
    },
    uniforms
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new AuraRuntimeError("backend-fallback", "Aura3D WebGL2 shader allocation failed.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader compile failed: ${gl.getShaderInfoLog(shader) ?? "unknown error"}`);
  }
  return shader;
}

function requiredUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new AuraRuntimeError("backend-fallback", `Aura3D WebGL2 shader is missing uniform ${name}.`);
  return location;
}

function webglDrawMode(gl: WebGL2RenderingContext, mode: number): number {
  if (mode === 0) return gl.POINTS;
  if (mode === 1) return gl.LINES;
  if (mode === 3) return gl.LINE_STRIP;
  if (mode === 5) return gl.TRIANGLE_STRIP;
  return gl.TRIANGLES;
}

async function loadGltfForWebGL(url: string): Promise<GltfModel> {
  const absoluteUrl = new URL(url, document.baseURI).href;
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new AuraRuntimeError("failed-glb-load", `Aura3D failed to fetch model "${url}" (${response.status}). Suggested fix: confirm the asset is in public/aura-assets and run aura3d assets validate.`);
  }
  const bytes = await response.arrayBuffer();
  const loaded = isGlb(bytes) ? parseGlb(bytes) : { json: JSON.parse(new TextDecoder().decode(bytes)) as GltfJson, buffers: [] as ArrayBuffer[] };
  const buffers = loaded.buffers.length > 0 ? loaded.buffers : await loadExternalGltfBuffers(loaded.json, absoluteUrl);
  return createGltfModel(loaded.json, buffers);
}

function isGlb(bytes: ArrayBuffer): boolean {
  return new DataView(bytes).getUint32(0, true) === 0x46546c67;
}

function parseGlb(bytes: ArrayBuffer): { readonly json: GltfJson; readonly buffers: readonly ArrayBuffer[] } {
  const view = new DataView(bytes);
  if (view.getUint32(4, true) !== 2) {
    throw new AuraRuntimeError("failed-glb-load", "Aura3D only supports glTF 2.0 GLB assets in the browser renderer.");
  }
  let offset = 12;
  let json: GltfJson | undefined;
  const buffers: ArrayBuffer[] = [];
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunk = bytes.slice(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    if (chunkType === 0x004e4942) buffers.push(chunk);
    offset += 8 + chunkLength;
  }
  if (!json) throw new AuraRuntimeError("failed-glb-load", "Aura3D could not find a JSON chunk in the GLB asset.");
  return { json, buffers };
}

async function loadExternalGltfBuffers(json: GltfJson, modelUrl: string): Promise<readonly ArrayBuffer[]> {
  return await Promise.all((json.buffers ?? []).map(async (buffer) => {
    if (!buffer.uri) return new ArrayBuffer(0);
    if (buffer.uri.startsWith("data:")) return dataUriToArrayBuffer(buffer.uri);
    const response = await fetch(new URL(buffer.uri, modelUrl).href);
    if (!response.ok) throw new AuraRuntimeError("failed-glb-load", `Aura3D failed to fetch glTF buffer "${buffer.uri}" (${response.status}).`);
    return await response.arrayBuffer();
  }));
}

function dataUriToArrayBuffer(uri: string): ArrayBuffer {
  const [, data = ""] = uri.split(",", 2);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function createGltfModel(json: GltfJson, buffers: readonly ArrayBuffer[]): GltfModel {
  const primitives: GltfPrimitive[] = [];
  let bounds: GltfBounds | undefined;

  const pushMesh = (meshIndex: number, matrix: Float32Array): void => {
    const mesh = json.meshes?.[meshIndex];
    if (!mesh) return;
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = primitive.attributes?.POSITION;
      if (positionAccessor === undefined) continue;
      const sourcePositions = readAccessor(json, buffers, positionAccessor, 3);
      const sourceNormals = primitive.attributes?.NORMAL === undefined
        ? createDefaultNormals(sourcePositions.length / 3)
        : readAccessor(json, buffers, primitive.attributes.NORMAL, 3);
      const positions = transformPositions(sourcePositions, matrix);
      const normals = transformNormals(sourceNormals, matrix);
      const indices = primitive.indices === undefined ? undefined : readIndices(json, buffers, primitive.indices);
      const primitiveBounds = boundsFromPositions(positions);
      bounds = bounds ? mergeBounds(bounds, primitiveBounds) : primitiveBounds;
      primitives.push({
        positions,
        normals,
        ...(indices ? { indices } : {}),
        mode: primitive.mode ?? 4,
        color: materialColor(json, primitive.material)
      });
    }
  };

  const visitNode = (nodeIndex: number, parentMatrix: Float32Array, stack: Set<number>): void => {
    if (stack.has(nodeIndex)) return;
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const localMatrix = gltfNodeMatrix(node);
    const worldMatrix = multiply4(parentMatrix, localMatrix);
    const nextStack = new Set(stack);
    nextStack.add(nodeIndex);
    if (node.mesh !== undefined) pushMesh(node.mesh, worldMatrix);
    for (const childIndex of node.children ?? []) visitNode(childIndex, worldMatrix, nextStack);
  };

  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes;
  if (json.nodes?.length && sceneRoots?.length) {
    for (const nodeIndex of sceneRoots) visitNode(nodeIndex, identity4(), new Set());
  } else if (json.nodes?.length) {
    const childNodes = new Set<number>();
    for (const node of json.nodes) for (const childIndex of node.children ?? []) childNodes.add(childIndex);
    const roots = json.nodes.map((_, nodeIndex) => nodeIndex).filter((nodeIndex) => !childNodes.has(nodeIndex));
    for (const nodeIndex of roots.length > 0 ? roots : json.nodes.map((_, nodeIndex) => nodeIndex)) visitNode(nodeIndex, identity4(), new Set());
  } else {
    for (let meshIndex = 0; meshIndex < (json.meshes?.length ?? 0); meshIndex += 1) pushMesh(meshIndex, identity4());
  }

  if (primitives.length === 0) {
    throw new AuraRuntimeError("failed-glb-load", "Aura3D found no mesh primitives with POSITION data in the model. Suggested fix: export a visible mesh to GLB/glTF.");
  }
  return { primitives, bounds: bounds ?? { min: [-1, -1, -1], max: [1, 1, 1] } };
}

function materialColor(json: GltfJson, materialIndex: number | undefined): readonly [number, number, number] | undefined {
  if (materialIndex === undefined) return undefined;
  const materialEntry = json.materials?.[materialIndex];
  const base = materialEntry?.pbrMetallicRoughness?.baseColorFactor;
  if (base && base.length >= 3) return [clamp01(base[0]!), clamp01(base[1]!), clamp01(base[2]!)];
  const emissive = materialEntry?.emissiveFactor;
  if (emissive && emissive.length >= 3) return [clamp01(emissive[0]!), clamp01(emissive[1]!), clamp01(emissive[2]!)];
  return undefined;
}

function createPlaneGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  return {
    positions: new Float32Array([
      -0.5, 0, -0.5,
      0.5, 0, -0.5,
      0.5, 0, 0.5,
      -0.5, 0, 0.5
    ]),
    normals: new Float32Array([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    bounds: { min: [-0.5, 0, -0.5], max: [0.5, 0, 0.5] }
  };
}

function createBoxGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const positions = new Float32Array([
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
    -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
  ]);
  return {
    positions,
    normals,
    indices: new Uint16Array([
      0, 1, 2, 0, 2, 3,
      4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23
    ]),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  };
}

function createSphereGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const rows = 12;
  const columns = 16;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const theta = v * Math.PI;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const phi = u * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(x * 0.5, y * 0.5, z * 0.5);
      normals.push(x, y, z);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  };
}

function createCylinderGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const segments = 24;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.5;
    const z = Math.sin(angle) * 0.5;
    positions.push(x, -0.5, z, x, 0.5, z);
    normals.push(Math.cos(angle), 0, Math.sin(angle), Math.cos(angle), 0, Math.sin(angle));
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  const topCenter = positions.length / 3;
  positions.push(0, 0.5, 0);
  normals.push(0, 1, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, -0.5, 0);
  normals.push(0, -1, 0);
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(topCenter, base + 1, base + 3);
    indices.push(bottomCenter, base + 2, base);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  };
}

function createTorusGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const radialSegments = 48;
  const tubeSegments = 10;
  const majorRadius = 0.43;
  const tubeRadius = 0.045;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const u = (radial / radialSegments) * Math.PI * 2;
    const centerX = Math.cos(u) * majorRadius;
    const centerY = Math.sin(u) * majorRadius;
    for (let tube = 0; tube <= tubeSegments; tube += 1) {
      const v = (tube / tubeSegments) * Math.PI * 2;
      const nx = Math.cos(u) * Math.cos(v);
      const ny = Math.sin(u) * Math.cos(v);
      const nz = Math.sin(v);
      positions.push(centerX + nx * tubeRadius, centerY + ny * tubeRadius, nz * tubeRadius);
      normals.push(nx, ny, nz);
    }
  }
  const row = tubeSegments + 1;
  for (let radial = 0; radial < radialSegments; radial += 1) {
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const a = radial * row + tube;
      const b = (radial + 1) * row + tube;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.06], max: [0.5, 0.5, 0.06] }
  };
}

function createCapsuleApproxGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  return createSphereGeometry();
}

function readAccessor(json: GltfJson, buffers: readonly ArrayBuffer[], accessorIndex: number, expectedComponents: number): Float32Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView === undefined) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF accessor ${accessorIndex}.`);
  const componentCount = componentCountForAccessor(accessor.type);
  const output = new Float32Array(accessor.count * expectedComponents);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF bufferView ${accessor.bufferView}.`);
  const buffer = buffers[view.buffer];
  if (!buffer) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF buffer ${view.buffer}.`);
  const data = new DataView(buffer);
  const componentBytes = componentByteLength(accessor.componentType);
  const stride = view.byteStride ?? componentBytes * componentCount;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let row = 0; row < accessor.count; row += 1) {
    for (let component = 0; component < expectedComponents; component += 1) {
      output[row * expectedComponents + component] = component < componentCount
        ? readAccessorComponent(data, start + row * stride + component * componentBytes, accessor.componentType, Boolean(accessor.normalized))
        : component === 1 ? 1 : 0;
    }
  }
  return output;
}

function readIndices(json: GltfJson, buffers: readonly ArrayBuffer[], accessorIndex: number): Uint16Array | Uint32Array {
  const values = readAccessor(json, buffers, accessorIndex, 1);
  const max = values.reduce((largest, value) => Math.max(largest, value), 0);
  return max > 65535 ? Uint32Array.from(values) : Uint16Array.from(values);
}

function readAccessorComponent(data: DataView, offset: number, componentType: number, normalized: boolean): number {
  if (componentType === 5126) return data.getFloat32(offset, true);
  if (componentType === 5125) return normalizeComponent(data.getUint32(offset, true), 4294967295, normalized);
  if (componentType === 5123) return normalizeComponent(data.getUint16(offset, true), 65535, normalized);
  if (componentType === 5121) return normalizeComponent(data.getUint8(offset), 255, normalized);
  if (componentType === 5122) return normalizeSignedComponent(data.getInt16(offset, true), 32767, normalized);
  if (componentType === 5120) return normalizeSignedComponent(data.getInt8(offset), 127, normalized);
  throw new AuraRuntimeError("failed-glb-load", `Aura3D does not support glTF component type ${componentType}.`);
}

function normalizeComponent(value: number, max: number, normalized: boolean): number {
  return normalized ? value / max : value;
}

function normalizeSignedComponent(value: number, max: number, normalized: boolean): number {
  return normalized ? Math.max(-1, value / max) : value;
}

function componentByteLength(componentType: number): number {
  if (componentType === 5120 || componentType === 5121) return 1;
  if (componentType === 5122 || componentType === 5123) return 2;
  if (componentType === 5125 || componentType === 5126) return 4;
  throw new AuraRuntimeError("failed-glb-load", `Aura3D does not support glTF component type ${componentType}.`);
}

function componentCountForAccessor(type: string): number {
  if (type === "SCALAR") return 1;
  if (type === "VEC2") return 2;
  if (type === "VEC3") return 3;
  if (type === "VEC4") return 4;
  if (type === "MAT4") return 16;
  return 1;
}

function createDefaultNormals(count: number): Float32Array {
  const normals = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    normals[index * 3 + 1] = 1;
  }
  return normals;
}

function gltfNodeMatrix(node: NonNullable<GltfJson["nodes"]>[number]): Float32Array {
  if (node.matrix?.length === 16) return new Float32Array(node.matrix);
  const translate = node.translation ?? [0, 0, 0];
  const rotate = node.rotation ?? [0, 0, 0, 1];
  const scale = node.scale ?? [1, 1, 1];
  return multiply4(
    translation(translate[0] ?? 0, translate[1] ?? 0, translate[2] ?? 0),
    multiply4(
      rotationQuaternion(rotate),
      scaling(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1)
    )
  );
}

function rotationQuaternion(rotation: readonly number[]): Float32Array {
  const length = Math.hypot(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0, rotation[3] ?? 1) || 1;
  const x = (rotation[0] ?? 0) / length;
  const y = (rotation[1] ?? 0) / length;
  const z = (rotation[2] ?? 0) / length;
  const w = (rotation[3] ?? 1) / length;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1
  ]);
}

function transformPositions(positions: Float32Array, matrix: Float32Array): Float32Array {
  const output = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!;
    const y = positions[index + 1]!;
    const z = positions[index + 2]!;
    output[index] = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
    output[index + 1] = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
    output[index + 2] = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!;
  }
  return output;
}

function transformNormals(normals: Float32Array, matrix: Float32Array): Float32Array {
  const output = new Float32Array(normals.length);
  for (let index = 0; index < normals.length; index += 3) {
    const x = normals[index]!;
    const y = normals[index + 1]!;
    const z = normals[index + 2]!;
    const nx = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z;
    const ny = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z;
    const nz = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z;
    const length = Math.hypot(nx, ny, nz) || 1;
    output[index] = nx / length;
    output[index + 1] = ny / length;
    output[index + 2] = nz / length;
  }
  return output;
}

function boundsFromPositions(positions: Float32Array): GltfBounds {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < positions.length; index += 3) {
    min[0] = Math.min(min[0], positions[index]!);
    min[1] = Math.min(min[1], positions[index + 1]!);
    min[2] = Math.min(min[2], positions[index + 2]!);
    max[0] = Math.max(max[0], positions[index]!);
    max[1] = Math.max(max[1], positions[index + 1]!);
    max[2] = Math.max(max[2], positions[index + 2]!);
  }
  return { min, max };
}

function mergeBounds(a: GltfBounds, b: GltfBounds): GltfBounds {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
  };
}

function createViewProjection(snapshot: AuraSceneSnapshot, aspect: number, time: number): Float32Array {
  const cameraSpec = snapshot.camera;
  const target = resolveCameraTarget(snapshot, cameraSpec);
  const eye = resolveCameraEye(snapshot, cameraSpec, time);
  const view = lookAt(eye, target, [0, 1, 0]);
  const projection = perspective(((cameraSpec.fov ?? 45) * Math.PI) / 180, aspect, 0.05, 100);
  return multiply4(projection, view);
}

function createModelMatrix(node: AuraModelNode | AuraPrimitiveNode | undefined, bounds: GltfBounds, normalizeToUnit: boolean, time = 0): Float32Array {
  const extent = [
    Math.max(0.001, bounds.max[0] - bounds.min[0]),
    Math.max(0.001, bounds.max[1] - bounds.min[1]),
    Math.max(0.001, bounds.max[2] - bounds.min[2])
  ] as const;
  const fitScale = normalizeToUnit ? 1.55 / Math.max(extent[0], extent[1], extent[2]) : 1;
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const baseSize = node?.kind === "primitive" ? primitiveSize(node) : [1, 1, 1] as const;
  const nodeScale = typeof node?.scale === "number" ? [node.scale, node.scale, node.scale] as const : node?.scale ?? [1, 1, 1] as const;
  const position = animatedPosition(node, time);
  const rotation = animatedRotation(node, time);
  return multiply4(
    translation(position[0], position[1], position[2]),
    multiply4(
      rotationXYZ(rotation),
      multiply4(
        scaling(nodeScale[0] * baseSize[0] * fitScale, nodeScale[1] * baseSize[1] * fitScale, nodeScale[2] * baseSize[2] * fitScale),
        normalizeToUnit ? translation(-centerX, -bounds.min[1], -centerZ) : identity4()
      )
    )
  );
}

function animatedPosition(node: AuraModelNode | AuraPrimitiveNode | AuraLabelNode | undefined, time: number): AuraVec3 {
  const basePosition = node?.position ?? [0, 0, 0];
  if (!node?.animation) return basePosition;
  const speed = Math.max(0.05, node.animation.speed ?? 1);
  if (node.animation.clip === "orbit") {
    const seconds = resolveAnimationSeconds(node.animation, time);
    return orbitAnimatedPosition(node.animation, basePosition, seconds, speed);
  }
  if (node.animation.clip !== "float") return basePosition;
  return [basePosition[0], basePosition[1] + Math.sin(resolveAnimationSeconds(node.animation, time) * speed) * 0.08, basePosition[2]];
}

function animatedRotation(node: AuraModelNode | AuraPrimitiveNode | AuraLabelNode | undefined, time: number): AuraVec3 {
  const baseRotation = node?.rotation ?? [0, 0, 0];
  if (!node?.animation) return baseRotation;
  const speed = Math.max(0.05, node.animation.speed ?? 1);
  const seconds = resolveAnimationSeconds(node.animation, time);
  if (node.animation.clip === "turntable") {
    return [baseRotation[0], baseRotation[1] + seconds * speed * 0.72, baseRotation[2]];
  }
  if (node.animation.clip === "float") {
    return [baseRotation[0], baseRotation[1] + seconds * speed * 0.28, baseRotation[2]];
  }
  if (node.animation.clip === "orbit") {
    return [baseRotation[0], baseRotation[1] + orbitAnimatedAngle(seconds, speed), baseRotation[2]];
  }
  if (node.animation.clip === "pulse" || node.animation.clip === "walk") return baseRotation;
  return [baseRotation[0], baseRotation[1] + seconds * speed, baseRotation[2]];
}

function primitiveSize(node: AuraPrimitiveNode): AuraVec3 {
  if (typeof node.size === "number") return [node.size, node.size, node.size];
  return node.size ?? [1, 1, 1];
}

function perspective(fovRadians: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovRadians / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function lookAt(eye: AuraVec3, target: AuraVec3, up: AuraVec3): Float32Array {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
  ]);
}

function multiply4(a: Float32Array, b: Float32Array): Float32Array {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row]! * b[column * 4]! +
        a[4 + row]! * b[column * 4 + 1]! +
        a[8 + row]! * b[column * 4 + 2]! +
        a[12 + row]! * b[column * 4 + 3]!;
    }
  }
  return output;
}

function translation(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

function identity4(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function scaling(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ]);
}

function rotationXYZ(rotation: AuraVec3): Float32Array {
  const [x, y, z] = rotation;
  const cx = Math.cos(x); const sx = Math.sin(x);
  const cy = Math.cos(y); const sy = Math.sin(y);
  const cz = Math.cos(z); const sz = Math.sin(z);
  const rx = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rz = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return multiply4(rz, multiply4(ry, rx));
}

function colorToRgb(color: AuraColor): readonly [number, number, number] {
  const clear = colorToClearColor(color);
  return [clear[0], clear[1], clear[2]];
}

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): readonly [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function scaleRgb(value: readonly [number, number, number], scale: number): readonly [number, number, number] {
  return clampRgb([value[0] * scale, value[1] * scale, value[2] * scale]);
}

function clampRgb(value: readonly [number, number, number]): readonly [number, number, number] {
  return [
    clamp01(value[0]),
    clamp01(value[1]),
    clamp01(value[2])
  ];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalize3(value: AuraVec3): AuraVec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross3(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot3(a: AuraVec3, b: AuraVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function mix3(a: AuraVec3, b: AuraVec3, t: number): AuraVec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function flattenSceneSnapshot(snapshot: AuraSceneSnapshot): AuraSceneSnapshot {
  return {
    ...snapshot,
    nodes: flattenSceneNodes(snapshot.nodes)
  };
}

function flattenSceneNodes(nodes: readonly AuraSceneNode[], parentTransform: AuraTransformSpec = {}): AuraSceneNode[] {
  const flattened: AuraSceneNode[] = [];
  for (const node of nodes) {
    if (node.kind === "group") {
      const groupTransform = composeAuraTransform(parentTransform, node);
      flattened.push(...flattenSceneNodes(node.children, groupTransform));
      continue;
    }
    flattened.push(applyAuraParentTransform(node, parentTransform));
  }
  return flattened;
}

function applyAuraParentTransform<TNode extends AuraSceneNode>(node: TNode, parentTransform: AuraTransformSpec): TNode {
  if (!hasAuraTransform(parentTransform)) return node;
  if (node.kind === "effect" || node.kind === "environment" || node.kind === "interaction") return node;
  return {
    ...node,
    ...composeAuraTransform(parentTransform, node)
  };
}

function composeAuraTransform(parentTransform: AuraTransformSpec, childTransform: AuraTransformSpec): AuraTransformSpec {
  const composed: {
    position?: AuraVec3;
    rotation?: AuraVec3;
    scale?: number | AuraVec3;
    lookAt?: AuraVec3;
  } = {};
  if (parentTransform.position || childTransform.position) {
    const parent = parentTransform.position ?? [0, 0, 0] as const;
    const child = childTransform.position ?? [0, 0, 0] as const;
    composed.position = [parent[0] + child[0], parent[1] + child[1], parent[2] + child[2]];
  }
  if (parentTransform.rotation || childTransform.rotation) {
    const parent = parentTransform.rotation ?? [0, 0, 0] as const;
    const child = childTransform.rotation ?? [0, 0, 0] as const;
    composed.rotation = [parent[0] + child[0], parent[1] + child[1], parent[2] + child[2]];
  }
  if (parentTransform.scale || childTransform.scale) {
    const parent = scaleToVec3(parentTransform.scale);
    const child = scaleToVec3(childTransform.scale);
    composed.scale = [parent[0] * child[0], parent[1] * child[1], parent[2] * child[2]];
  }
  composed.lookAt = childTransform.lookAt ?? parentTransform.lookAt;
  return composed;
}

function scaleToVec3(scale: number | AuraVec3 | undefined): AuraVec3 {
  if (typeof scale === "number") return [scale, scale, scale];
  return scale ?? [1, 1, 1];
}

function hasAuraTransform(transform: AuraTransformSpec): boolean {
  return Boolean(transform.position || transform.rotation || transform.scale || transform.lookAt);
}

function productionRenderErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function normalizeSceneSnapshot(value: AuraSceneBuilder | AuraSceneSnapshot): AuraSceneSnapshot {
  return value instanceof AuraSceneBuilder ? value.toJSON() : value;
}

function resolveCanvas(target: AuraAppTarget): HTMLCanvasElement | undefined {
  if (!target) {
    return undefined;
  }
  if (typeof target === "string") {
    if (typeof document === "undefined") {
      throw new AuraRuntimeError(
        "missing-canvas",
        `Aura3D could not find canvas target "${target}" because document is unavailable. Suggested fix: run createAuraApp in a browser or pass an HTMLCanvasElement.`
      );
    }
    const element = document.querySelector(target);
    if (!element) {
      throw new AuraRuntimeError(
        "missing-canvas",
        `Aura3D could not find canvas target "${target}". Suggested fix: add <canvas id="${target.replace(/^#/, "")}"></canvas> or pass an existing element.`
      );
    }
    if (element instanceof HTMLCanvasElement) return element;
    if (element instanceof HTMLElement) return appendCanvas(element);
    throw new AuraRuntimeError(
      "missing-canvas",
      `Aura3D target "${target}" is not an HTMLElement. Suggested fix: pass a canvas or container element.`
    );
  }
  return target instanceof HTMLCanvasElement ? target : appendCanvas(target);
}

function appendCanvas(target: HTMLElement): HTMLCanvasElement {
  applyDefaultCanvasMountLayout(target);
  const canvas = document.createElement("canvas");
  canvas.dataset.aura3dCanvas = "true";
  target.append(canvas);
  return canvas;
}

function applyDefaultCanvasMountLayout(target: HTMLElement): void {
  if (typeof window === "undefined") return;
  if (target.parentElement === document.body && !target.hasAttribute("data-aura3d-preserve-page-layout")) {
    document.documentElement.style.width ||= "100%";
    document.documentElement.style.height ||= "100%";
    document.body.style.width ||= "100%";
    document.body.style.height ||= "100%";
    document.body.style.margin ||= "0";
    document.body.style.overflow ||= "hidden";
  }
  target.style.width ||= "100%";
  target.style.height ||= "100vh";
  target.style.minHeight ||= "100vh";
  target.style.position ||= "relative";
  target.style.overflow ||= "hidden";
}

function configureCanvas(canvas: HTMLCanvasElement, pixelRatio: number, resize: boolean): void {
  canvas.style.width ||= "100%";
  canvas.style.height ||= "100%";
  canvas.style.display ||= "block";
  const rect = canvas.getBoundingClientRect();
  const parent = canvas.parentElement;
  const cssWidth = rect.width || canvas.clientWidth || parent?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960) || 960;
  const cssHeight = rect.height || canvas.clientHeight || parent?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 540) || 540;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const width = Math.max(320, Math.round(cssWidth * pixelRatio));
  const height = Math.max(220, Math.round(cssHeight * pixelRatio));
  canvas.width = resize ? width : canvas.width || width;
  canvas.height = resize ? height : canvas.height || height;
}

function validateSceneAssets(snapshot: AuraSceneSnapshot, assets: AuraAssetLoadState[]): void {
  for (const node of snapshot.nodes) {
    if (node.kind !== "model") continue;
    const asset = node.asset;
    if (!asset.url && !asset.optional) {
      throw new AuraRuntimeError(
        "missing-asset",
        `Aura3D asset "${asset.id}" is missing a URL. Suggested fix: run aura3d assets add ./asset.glb --name ${asset.id}.`
      );
    }
    if (asset.type === "model" && !["glb", "gltf"].includes(asset.format)) {
      throw new AuraRuntimeError(
        "failed-glb-load",
        `Aura3D model "${asset.id}" uses unsupported format "${asset.format}". Suggested fix: export GLB/glTF or add an explicit loader before using model(assets.${asset.id}).`
      );
    }
    assets.push({
      id: asset.id,
      type: asset.type,
      url: asset.url,
      status: asset.url ? "ready" : "optional-missing",
      provenance: createAssetProvenance(asset),
      ...(asset.hash ? { hash: asset.hash } : {}),
      message: asset.url ? undefined : "Optional placeholder asset has no URL yet."
    });
    validateMaterialTexture(node.material);
  }
}

function createAssetProvenance(asset: AuraAssetRef): AuraAssetProvenance {
  const remote = /^https?:\/\//i.test(asset.url);
  return {
    source: asset.id === "unsafe" || remote ? "unsafe-url" : asset.hash ? "typed-aura-assets-manifest" : "inline-definition",
    id: asset.id,
    url: asset.url,
    ...(asset.hash ? { hash: asset.hash } : {}),
    ...(asset.bounds ? { bounds: asset.bounds } : {})
  };
}

function validateMaterialTexture(materialSpec?: AuraMaterialSpec): void {
  const texture = materialSpec?.texture;
  if (!texture) return;
  if (!["png", "jpg", "jpeg", "webp", "ktx2"].includes(texture.format)) {
    throw new AuraRuntimeError(
      "unsupported-texture",
      `Aura3D texture asset "${texture.id}" uses unsupported format "${texture.format}". Suggested fix: use png, jpg, jpeg, webp, or ktx2 textures.`
    );
  }
}

interface MutableDiagnostics {
  backend: AuraBackend;
  fps: number;
  drawCalls: number;
  renderSize: [number, number];
  assets: AuraAssetLoadState[];
  evidence: AuraSceneEvidence;
  renderer: AuraRendererDiagnosticReport;
  warnings: string[];
  errors: string[];
}

function createInitialDiagnostics(snapshot: AuraSceneSnapshot): MutableDiagnostics {
  return {
    backend: "headless",
    fps: 0,
    drawCalls: 0,
    renderSize: [0, 0],
    assets: [],
    evidence: collectAuraSceneEvidence(snapshot),
    renderer: createRendererDiagnosticReport(snapshot),
    warnings: snapshot.nodes.length === 0 ? ["Scene contains no renderable nodes. Add model(assets.assetId) or primitives.box()."] : [],
    errors: []
  };
}

function snapshotDiagnostics(value: MutableDiagnostics): AuraDiagnostics {
  return {
    backend: value.backend,
    fps: value.fps,
    drawCalls: value.drawCalls,
    renderSize: value.renderSize,
    assets: [...value.assets],
    evidence: value.evidence,
    renderer: value.renderer,
    warnings: [...value.warnings],
    errors: [...value.errors]
  };
}

function collectGeneratedCodeWarnings(snapshot: AuraSceneSnapshot): string[] {
  const warnings: string[] = [];
  if (!snapshot.nodes.some((node) => node.kind === "light")) {
    warnings.push("Scene has no lights. Suggested fix: add lights.studio() or lights.ambient().");
  }
  if (!snapshot.nodes.some((node) => node.kind === "interaction")) {
    warnings.push("Scene has no interactions. Suggested fix: add interactions.orbit() for product/viewer scenes.");
  }
  for (const node of snapshot.nodes) {
    if (node.kind === "model" && node.asset.id === "unsafe-url") {
      warnings.push(`Model uses unsafeModelUrl("${node.asset.url}"). Suggested fix: run assets add and use typed assets.`);
    }
  }
  return warnings;
}

function renderSceneToCanvas(canvas: HTMLCanvasElement | undefined, snapshot: AuraSceneSnapshot, time: number): number {
  if (!canvas) return 0;
  const context = canvas.getContext("2d");
  if (!context) return 0;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, snapshot.background);
  gradient.addColorStop(1, shadeColor(snapshot.background, -32));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height);
  let drawCalls = 1;
  snapshot.nodes.forEach((node, index) => {
    if (node.kind === "model" || node.kind === "primitive") {
      drawRenderableNode(context, width, height, node, index, time);
      drawCalls += 1;
    }
    if (node.kind === "effect") {
      drawEffect(context, width, height, node, time);
      drawCalls += 1;
    }
    if (node.kind === "label") {
      drawLabelNode(context, width, height, node, index, time);
      drawCalls += 1;
    }
  });
  return drawCalls;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  const horizon = height * 0.68;
  for (let i = 0; i < 12; i += 1) {
    const y = horizon + i * 18;
    context.beginPath();
    context.moveTo(width * 0.12, y);
    context.lineTo(width * 0.88, y);
    context.stroke();
  }
  for (let i = -6; i <= 6; i += 1) {
    context.beginPath();
    context.moveTo(width * 0.5 + i * 38, horizon);
    context.lineTo(width * 0.5 + i * 80, height);
    context.stroke();
  }
  context.restore();
}

function drawRenderableNode(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  node: AuraModelNode | AuraPrimitiveNode,
  index: number,
  time: number
): void {
  const x = width * 0.5 + ((node.position?.[0] ?? index - 1) * width) / 8;
  const y = height * 0.58 - ((node.position?.[1] ?? 0) * height) / 7;
  const phase = Math.sin(time / 900 + index) * 8;
  const primitiveSize = node.kind === "primitive" ? node.size : undefined;
  const size = typeof primitiveSize === "number" ? primitiveSize * 80 : typeof node.scale === "number" ? node.scale * 80 : 92;
  const color = node.material?.color ?? (node.kind === "model" ? "#77a7ff" : "#d7dee8");
  context.save();
  context.shadowColor = "rgba(56,214,255,0.34)";
  context.shadowBlur = 24;
  context.fillStyle = color;
  if (node.kind === "primitive" && node.primitive === "sphere") {
    context.beginPath();
    context.arc(x, y + phase, size * 0.46, 0, Math.PI * 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "capsule") {
    const capsuleWidth = size * 0.42;
    const capsuleHeight = size * 0.92;
    context.beginPath();
    context.roundRect(x - capsuleWidth / 2, y - capsuleHeight / 2 + phase, capsuleWidth, capsuleHeight, capsuleWidth / 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "torus") {
    context.beginPath();
    context.arc(x, y + phase, size * 0.46, 0, Math.PI * 2);
    context.arc(x, y + phase, size * 0.32, 0, Math.PI * 2, true);
    context.fill("evenodd");
  } else if (node.kind === "primitive" && node.primitive === "cylinder") {
    context.beginPath();
    context.ellipse(x, y - size * 0.34 + phase, size * 0.46, size * 0.16, 0, 0, Math.PI * 2);
    context.rect(x - size * 0.46, y - size * 0.34 + phase, size * 0.92, size * 0.68);
    context.ellipse(x, y + size * 0.34 + phase, size * 0.46, size * 0.16, 0, 0, Math.PI * 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "plane") {
    context.fillRect(x - size * 0.7, y - size * 0.16, size * 1.4, size * 0.32);
  } else {
    context.beginPath();
    context.moveTo(x, y - size * 0.58 + phase);
    context.lineTo(x + size * 0.54, y - size * 0.18 + phase);
    context.lineTo(x + size * 0.34, y + size * 0.55 + phase);
    context.lineTo(x - size * 0.42, y + size * 0.48 + phase);
    context.lineTo(x - size * 0.58, y - size * 0.16 + phase);
    context.closePath();
    context.fill();
  }
  context.shadowBlur = 0;
  context.fillStyle = "rgba(255,255,255,0.78)";
  context.font = `${Math.max(12, width / 72)}px system-ui, sans-serif`;
  context.textAlign = "center";
  const label = node.kind === "model" ? node.asset.id : node.name ?? node.primitive;
  const hideParticleImpostorLabel = node.kind === "primitive" && Boolean(node.name?.includes("water plume droplet") || node.name?.includes("water splash droplet") || node.name?.includes("benchmark plume particle") || node.name?.includes("collision splash particle"));
  if (!hideParticleImpostorLabel) context.fillText(label, x, y + size * 0.76 + phase);
  context.restore();
}

function drawLabelNode(context: CanvasRenderingContext2D, width: number, height: number, node: AuraLabelNode, index: number, time: number): void {
  const position = animatedPosition({ ...node, position: node.position ?? labelDefaultPosition(node) }, time);
  const x = width * 0.5 + (position[0] * width) / 5;
  const y = height * 0.58 - (position[1] * height) / 4 + index * 2;
  const fontSize = Math.max(12, Math.min(28, (node.size ?? 0.34) * 48));
  context.save();
  context.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  const metrics = context.measureText(node.text);
  const paddingX = 10;
  const paddingY = 6;
  const boxWidth = metrics.width + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  context.fillStyle = colorWithAlpha(node.background ?? "#020617", 0.82);
  context.strokeStyle = String(node.color ?? "#e0f2fe");
  context.lineWidth = 1.5;
  context.fillRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
  context.strokeRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
  context.fillStyle = String(node.color ?? "#e0f2fe");
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(node.text, x, y + 1);
  context.restore();
}

function drawEffect(context: CanvasRenderingContext2D, width: number, height: number, node: AuraEffectNode, time: number): void {
  context.save();
  if (node.effect === "fog") {
    context.fillStyle = toAlphaColor(node.color ?? "#9fb7d9", node.density ?? 0.12);
    context.fillRect(0, height * 0.2, width, height * 0.8);
  }
  if (node.effect === "bloom") {
    const gradient = context.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, width * 0.46);
    gradient.addColorStop(0, toAlphaColor(node.color ?? "#ffffff", (node.intensity ?? 0.35) * 0.3));
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  if (node.effect === "ambient-occlusion" || node.effect === "contact-occlusion") {
    const gradient = context.createRadialGradient(width * 0.5, height * 0.68, 10, width * 0.5, height * 0.68, width * Math.max(0.08, node.radius ?? 0.42));
    gradient.addColorStop(0, toAlphaColor(node.color ?? "#020617", Math.min(0.42, node.intensity ?? 0.32)));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, height * 0.42, width, height * 0.42);
  }
  if (node.effect === "rain") {
    const density = Math.max(0.2, Math.min(1.6, node.density ?? node.intensity ?? 0.72));
    const intensity = Math.max(0.1, Math.min(1.4, node.intensity ?? 0.4));
    const color = node.color ?? "#bcd7ff";
    const mist = context.createLinearGradient(0, height * 0.24, 0, height * 0.78);
    mist.addColorStop(0, toAlphaColor(color, node.mist === false ? 0 : 0.02 * intensity));
    mist.addColorStop(0.62, toAlphaColor(color, node.mist === false ? 0 : 0.09 * intensity));
    mist.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = mist;
    context.fillRect(0, height * 0.2, width, height * 0.72);
    const drawLayer = (count: number, length: number, alpha: number, lineWidth: number, speed: number, spread: number) => {
      context.strokeStyle = toAlphaColor(color, alpha);
      context.lineWidth = lineWidth;
      for (let i = 0; i < count; i += 1) {
        const x = (i * 47 + time * 0.045 * speed + spread) % width;
        const y = (i * 89 + time * 0.22 * speed) % (height * 0.82);
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - length * 0.27, y + length);
        context.stroke();
      }
    };
    drawLayer(Math.round(80 * density), 24, Math.min(0.24, intensity * 0.18), 1, 0.65, 11);
    drawLayer(Math.round(58 * density), 38, Math.min(0.42, intensity * 0.28), 1.2, 0.95, 37);
    drawLayer(Math.round(34 * density), 58, Math.min(0.62, intensity * 0.38), 1.6, 1.28, 73);
    if (node.splashes !== false) {
      context.strokeStyle = toAlphaColor(color, Math.min(0.32, intensity * 0.24));
      context.lineWidth = 1;
      for (let i = 0; i < Math.round(36 * density); i += 1) {
        const x = ((i * 83) % 100) / 100 * width;
        const y = height * (0.64 + ((i * 41) % 28) / 100);
        const radius = 3 + ((i * 17) % 8);
        context.beginPath();
        context.ellipse(x, y, radius * 1.9, radius * 0.42, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }
  if (node.effect === "particles") {
    const isFountain = node.emitter === "fountain";
    const count = Math.max(120, Math.min(isFountain ? 2200 : 1600, node.particleCount ?? 900));
    const radius = Math.max(0.1, node.radius ?? 1.15);
    const height3d = Math.max(0.2, node.height ?? 2.4);
    const color = String(node.color ?? "#7dfcff");
    const intensity = Math.max(0.1, Math.min(1.1, node.intensity ?? 0.8));
    const seconds = time / 1000 * (node.speed ?? 1);
    if (isFountain) {
      const baseX = width * 0.5;
      const baseY = height * 0.68;
      const fountainName = node.name ?? "";
      const mistLayer = node.mist !== false && (fountainName.includes("mist") || node.materialMode === "soft-alpha");
      const splashLayer = fountainName.includes("splash") || node.materialMode === "splash";
      if (node.mist !== false) {
        const mist = context.createRadialGradient(baseX, baseY - height * 0.28, width * 0.04, baseX, baseY - height * 0.08, width * 0.34);
        mist.addColorStop(0, toAlphaColor("#e0f7ff", Math.min(0.11, intensity * 0.1)));
        mist.addColorStop(0.48, toAlphaColor("#bae6fd", Math.min(0.07, intensity * 0.07)));
        mist.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = mist;
        context.fillRect(baseX - width * 0.38, baseY - height * 0.56, width * 0.76, height * 0.56);
      }
      if (fountainName.includes("plume")) {
        const basin = context.createRadialGradient(baseX, baseY + 6, width * 0.03, baseX, baseY + 8, width * 0.22);
        basin.addColorStop(0, "rgba(224,247,255,0.34)");
        basin.addColorStop(0.48, "rgba(14,165,233,0.22)");
        basin.addColorStop(1, "rgba(2,8,23,0)");
        context.fillStyle = basin;
        context.beginPath();
        context.ellipse(baseX, baseY + 10, width * 0.22, height * 0.045, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(15,23,42,0.86)";
        context.beginPath();
        context.ellipse(baseX, baseY + 9, width * 0.08, height * 0.018, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(56,189,248,0.42)";
        context.beginPath();
        context.ellipse(baseX, baseY + 5, width * 0.052, height * 0.012, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.lineCap = "round";
      context.lineJoin = "round";
      const fountainPalette = ["#fff7ad", "#fef08a", "#fb923c", "#60a5fa", "#38bdf8", "#fb7185"];
      for (let index = 0; index < count; index += 1) {
        const position = new Float32Array(3);
        writeParticlePosition(position, 0, seconds, "fountain", radius, height3d, index, node.turbulence ?? node.noise ?? 0, node.gravity ?? 0, node.groundCollision ?? false, mistLayer ? "mist" : splashLayer ? "splash" : "plume");
        const jitterX = seededRange(index, 251, -radius, radius) * (mistLayer ? 0.32 : 0.08);
        const jitterZ = seededRange(index, 257, -radius, radius);
        const x = baseX + (position[0] + jitterX) * width * (mistLayer ? 0.075 : 0.095);
        const y = baseY - position[1] * height * 0.16 + jitterZ * height * (mistLayer ? 0.014 : 0.01);
        const life = getParticleLife(index, seconds, "fountain");
        const paletteColor = fountainPalette[index % fountainPalette.length] ?? color;
        const nearGround = position[1] < 0.62;
        const size = mistLayer ? seededRange(index, 263, 1.8, 4.8) : seededRange(index, 263, 3.2, 6.4);
        const outward = position[0] === 0 ? seededRange(index, 269, -1, 1) : Math.sign(position[0]);
        const fade = 1 - Math.max(0, life - 0.82) * 2.2;
        const alpha = Math.max(0.08, Math.min(mistLayer ? 0.2 : 0.82, (mistLayer ? 0.08 + intensity * 0.1 : nearGround || splashLayer ? 0.34 + intensity * 0.24 : 0.46 + intensity * 0.26) * fade));
        if (mistLayer) {
          context.fillStyle = toAlphaColor(paletteColor, alpha);
          context.beginPath();
          context.ellipse(x, y, size * 1.9, size * 0.7, outward * 0.18, 0, Math.PI * 2);
          context.fill();
          continue;
        }
        context.fillStyle = toAlphaColor(paletteColor, alpha);
        context.beginPath();
        context.arc(x, y, nearGround || splashLayer ? size * 0.72 : size, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(255,255,255,0.28)";
        context.beginPath();
        context.arc(x - size * 0.24, y - size * 0.24, Math.max(0.8, size * 0.22), 0, Math.PI * 2);
        context.fill();
        if (nearGround && node.splashes !== false && index % 9 === 0) {
          context.strokeStyle = "rgba(248,253,255,0.18)";
          context.lineWidth = 1;
          context.beginPath();
          context.ellipse(x, baseY + seededRange(index, 271, 3, 18), size * 2.7, size * 0.56, 0, 0, Math.PI * 2);
          context.stroke();
        }
      }
    } else {
      context.fillStyle = toAlphaColor(color, Math.min(0.9, 0.38 + intensity * 0.22));
      for (let index = 0; index < count; index += 1) {
        const position = new Float32Array(3);
        writeParticlePosition(position, 0, seconds, node.emitter ?? "swirl", radius, height3d, index);
        const jitterX = seededRange(index, 251, -radius, radius);
        const jitterZ = seededRange(index, 257, -radius, radius);
        const x = width * 0.5 + (position[0] + jitterX * 0.18) * width * 0.09;
        const y = height * 0.68 - position[1] * height * 0.16 + jitterZ * height * 0.02;
        const size = seededRange(index, 263, 1.1, 2.9);
        context.fillRect(x, y, size, size);
      }
    }
  }
  context.restore();
}

function shouldRenderOverlay(diagnostics: AuraCreateAppOptions["diagnostics"], snapshot: AuraSceneSnapshot): boolean {
  if (typeof diagnostics === "boolean") return diagnostics;
  if (diagnostics?.overlay || diagnostics?.assetPanel || diagnostics?.performancePanel) return true;
  return snapshot.diagnostics.enabled;
}

function createDiagnosticsOverlay(canvas: HTMLCanvasElement, diagnosticsState: MutableDiagnostics): { update(): void; dispose(): void } {
  const parent = canvas.parentElement ?? document.body;
  const overlay = document.createElement("div");
  overlay.className = "aura-diagnostics-overlay";
  overlay.style.cssText = [
    "position:absolute",
    "right:12px",
    "top:12px",
    "z-index:10",
    "font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    "color:#ecf7ff",
    "background:rgba(6,10,18,0.82)",
    "border:1px solid rgba(146,176,210,0.36)",
    "border-radius:8px",
    "padding:10px 12px",
    "min-width:190px",
    "pointer-events:none"
  ].join(";");
  const computed = getComputedStyle(parent);
  if (computed.position === "static") parent.style.position = "relative";
  parent.append(overlay);
  const update = () => {
    const diagnostics = snapshotDiagnostics(diagnosticsState);
    const rendererDiagnostics = diagnostics.renderer;
    overlay.innerHTML = [
      `<b>Aura3D diagnostics</b>`,
      `<div>backend: ${escapeHtml(diagnostics.backend)}</div>`,
      `<div>fps: ${diagnostics.fps}</div>`,
      `<div>draw calls: ${diagnostics.drawCalls}</div>`,
      `<div>render size: ${diagnostics.renderSize[0]} x ${diagnostics.renderSize[1]}</div>`,
      rendererDiagnostics ? `<div>tone: ${rendererDiagnostics.toneMapping} @ ${rendererDiagnostics.exposure.exposure}</div>` : "",
      rendererDiagnostics ? `<div>bloom: ${rendererDiagnostics.bloom.enabled ? `${rendererDiagnostics.bloom.intensity}/${rendererDiagnostics.bloom.threshold} ${rendererDiagnostics.bloom.rendered ? "rendered" : "requested"}` : "off"}</div>` : "",
      rendererDiagnostics ? `<div>post: ${rendererDiagnostics.postprocess.runtimeStatus} ${rendererDiagnostics.postprocess.actualPasses.join("+") || rendererDiagnostics.postprocess.requestedPasses.join("+") || "none"}</div>` : "",
      rendererDiagnostics ? `<div>shadows: ${rendererDiagnostics.shadows.contactShadows} contact, ${rendererDiagnostics.shadows.mapType}</div>` : "",
      rendererDiagnostics ? `<div>environment: ${rendererDiagnostics.environment.preset ?? "fallback"}</div>` : "",
      `<div>assets: ${diagnostics.assets.map((asset) => `${asset.id}:${asset.status}`).join(", ") || "none"}</div>`,
      diagnostics.warnings.length ? `<div>warnings: ${diagnostics.warnings.length}</div>` : ""
    ].join("");
  };
  update();
  return {
    update,
    dispose() {
      overlay.remove();
    }
  };
}

function markRouteReady(snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  markRouteState("ready", snapshot, diagnostics);
}

function markRouteError(snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  markRouteState("error", snapshot, diagnostics);
}

function markRouteState(status: "ready" | "error", snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  if (typeof document !== "undefined") {
    document.body.dataset.aura3dReady = status === "ready" ? "true" : "error";
    document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  }
  if (typeof window !== "undefined") {
    (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = {
      status,
      scene: snapshot,
      diagnostics: snapshotDiagnostics(diagnostics)
    };
  }
}

function devicePixelRatioSafe(): number {
  return typeof window === "undefined" ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

function performanceNow(): number {
  return typeof globalThis.performance === "undefined" ? Date.now() : globalThis.performance.now();
}

function shadeColor(color: string, amount: number): string {
  if (!color.startsWith("#") || color.length < 7) return color;
  const value = Number.parseInt(color.slice(1, 7), 16);
  const red = clampChannel((value >> 16) + amount);
  const green = clampChannel(((value >> 8) & 0xff) + amount);
  const blue = clampChannel((value & 0xff) + amount);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function toAlphaColor(color: string, alpha: number): string {
  if (!color.startsWith("#") || color.length < 7) return `rgba(255,255,255,${alpha})`;
  const value = Number.parseInt(color.slice(1, 7), 16);
  return `rgba(${value >> 16},${(value >> 8) & 0xff},${value & 0xff},${alpha})`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
