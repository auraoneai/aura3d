// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AnimationPose } from "@aura3d/animation";
import type { AuraCollisionLayers, AuraPhysicsRuntime } from "../PhysicsRuntime.js";
import type { AuraCustomGeometrySpec, AuraText3DGeometry } from "../RootGeometry.js";
import type { AuraNodeBuilder } from "./builder.js";
import type { AuraPerformanceQuality } from "../RootRuntimeSupport.js";
import type { AuraRuntimeNodeAnimationPoseBindingMetadata, AuraRuntimeNodeAnimationBindingMetadata, AuraRuntimeNodeBounds, AuraRuntimeNodeEffectAttachment, RuntimeNodeBoundsInput, RuntimeNodeMorphTargetWeights } from "../RuntimeNodeHandle";
import type { AuraSceneBuilder, scene } from "./scene.js";
import type { Collider, ColliderDescriptor, CollisionEvent, Constraint, ConstraintDescriptor, Contact, DebugLine, PhysicsBackendSelection, PhysicsContinuousCollisionDescriptor, PhysicsShape, PhysicsSnapshot, RaycastHit, RaycastOptions, RigidBody, RigidBodyDescriptor, PhysicsVehicleController, PhysicsWheelSpec, PhysicsWheelState, PhysicsWheelCommand, PhysicsWheelTuning, PhysicsVehicleAxis, PhysicsCharacterController, PhysicsCharacterControllerDescriptor, PhysicsCharacterMovement, RigidBodyType, ScenePhysicsNode, SphereCastHit } from "@aura3d/physics";
import type { GameAppRuntimeOptions } from "../GameAppRuntime";
import type { GameAssetBoundPlatformerLevel, GameAssetBoundRacingRoute, GameKitRect, GameKitVec2, GamePlatformerCheckpoint } from "../GameGenreKits";
import type { GameHudBindingKind, GameRuntimeSubsystemOwnership, createCombatWorld, createGameCameraDirector, createGameEffects, createGameInput, createGameKinematicBody, GameInputOptions } from "../GameRuntime";
import type { GamePlatformerSceneBinding, GameRacingSceneBinding } from "../GameSceneGeometryBindings";
import type { GltfBounds } from "../compiler/gltfRuntime.js";
import type { LabelTelemetry, TextBucketSummary } from "../LabelTelemetry.js";
import type { ProjectedLabel } from "../WorldLabelRenderer.js";
import type { PublicPlatformerGeometryContract, PublicRacingGeometryContract } from "../PublicGameGeometry";
import type { SdfTextOcclusionPolicy, Geometry, InstancedPBRMaterial, PBRMaterial, TexturedPBRMaterial, CollectedLight, RenderDeviceDiagnostics, RendererPostprocessExecutionMode, WrinkleMapHook } from "@aura3d/rendering";
import type { TypedGLBActor, TypedGLBActorEvidence } from "../../production-runtime/TypedGLBActor.js";
import type { WebGLPrimitive } from "../compiler/webglRuntime.js";
import type { animation } from "./animation.js";
import type { auraAssetRefBrand } from "./assets.js";
import type { character } from "./character.js";
import type { effects } from "./effects.composite.js";
import type { geometry } from "./geometry.js";
import type { groups } from "./groups.js";
import type { interactions } from "./interactions.js";
import type { labels } from "./labels.js";
import type { performance } from "../performanceEvidence.js";
import type { physics } from "./physics.js";
import type { primitive, primitives } from "./primitives.js";
import type { renderer } from "../rendererDiagnostics.js";
import type { text3D } from "./text3d.js";
import type { timeline } from "./timeline.js";
import type { ui } from "./ui.js";
import type { camera } from "./camera.js";
import type { collectGameRuntimeEvidence as collectGameRuntimeEvidenceV105, GameRuntimeEvidence, GameRuntimeEvidenceOptions, GameRuntimeSourceEvidence } from "../GameEvidence";
import type { game } from "./game/index.js";
import type { instances } from "./instances.js";
import type { lights } from "./lights.js";
import type { material } from "./material.js";
import type { shadows } from "./shadows.js";
import type { assets } from "../AssetDecoders.js";
import type { cameraPreset } from "../CameraPresetLibrary.js";
import type { footPlanting } from "../FootPlanting.js";

export type AuraVec3 = readonly [number, number, number];

export type AuraColor = `#${string}` | string;

export type AuraAssetType = "model" | "texture" | "environment" | "audio" | "navigation";

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

/**
 * Per-map UV transform for the C1 textured-PBR slots (muse3jsparity-PRD C1).
 * Offset/scale apply in UV units, rotation in radians, matching the native
 * per-slot `*TextureTransform` uniforms.
 */
export interface AuraTextureTransform {
  readonly offset?: readonly [number, number];
  readonly scale?: readonly [number, number];
  readonly rotation?: number;
}

export interface AuraAssetDefinition {
  readonly type: AuraAssetType;
  readonly format: string;
  readonly url: string;
  readonly hash?: string;
  readonly bounds?: AuraVec3;
  readonly sizeBytes?: number;
  readonly optional?: boolean;
  readonly metadata?: AuraAssetMetadata;
  // C-17 additions (PR 0a, PRD 05)
  readonly variants?: import("../../contracts/assets").AuraAssetVariants;
  readonly requiredDecoders?: readonly import("../../contracts/assets").AuraAssetRequiredDecoder[];
  readonly lods?: readonly import("../../contracts/assets").AuraAssetLodLevel[];
  readonly colliderUrl?: string;
  readonly budget?: import("../../contracts/assets").AuraAssetBudget;
}

export interface AuraAssetMetadata {
  readonly materials?: readonly string[];
  readonly animations?: readonly string[];
  readonly textures?: readonly string[];
  /** Manifest-relative source path retained by the generated asset map. */
  readonly sourcePath?: string;
  /** Published `/aura-assets/` output path retained by the generated asset map. */
  readonly outputPath?: string;
  readonly boundsMetadata?: {
    readonly min?: readonly number[];
    readonly max?: readonly number[];
    readonly size?: readonly number[];
    readonly center?: readonly number[];
  };
  readonly thumbnailUrl?: string;
  readonly license?: string;
  readonly author?: string;
  readonly provenance?: {
    readonly sourceUrl?: string;
    readonly [key: string]: unknown;
  };
}

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

export interface AuraTransformSpec {
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
  readonly lookAt?: AuraVec3;
  /** C-06 (PR 0a): Euler order, default "ZYX" = today's behaviour. */
  readonly rotationOrder?: import("../../contracts/sceneGraph").AuraEulerOrder;
  /** C-06 (PR 0a): wins over `rotation` when set. */
  readonly quaternion?: import("../../contracts/sceneGraph").AuraQuat;
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
  /**
   * Desired texture sampler anisotropy (muse3jsparity-PRD C3). Defaults to 8;
   * the request snaps to a device step and the renderer clamps to the device
   * maximum at upload time, so low-capability devices fold down safely.
   */
  readonly textureAnisotropy?: number;
  readonly attenuationColor?: AuraColor;
  readonly attenuationDistance?: number;
  /** P3 physical-extension bounded warnings, stamped by `material.physical` (muse3jsparity-PRD): surfaced by capability diagnostics, never silent. */
  readonly physicalWarnings?: readonly string[];
  readonly envMapIntensity?: number;
  readonly normal?: AuraMaterialTextureInput;
  readonly normalScale?: number;
  readonly roughnessMap?: AuraMaterialTextureInput;
  readonly metalnessMap?: AuraMaterialTextureInput;
  readonly texture?: AuraAssetRef<"texture">;
  /** Occlusion (AO/lightmap) slot: scalar is the strength 0..1, asset ref is the occlusion map. */
  readonly occlusionMap?: AuraMaterialTextureInput;
  readonly occlusionStrength?: number;
  /** Emissive map slot: multiplied by `emissive` (default white when only the map is set) × `emissiveIntensity`. */
  readonly emissiveMap?: AuraMaterialTextureInput;
  /** glTF extension maps: data channels are linear; sheen color is sRGB. */
  readonly clearcoatMap?: AuraAssetRef<"texture">;
  readonly clearcoatRoughnessMap?: AuraAssetRef<"texture">;
  readonly clearcoatNormalMap?: AuraAssetRef<"texture">;
  readonly clearcoatNormalScale?: number;
  readonly sheenColorMap?: AuraAssetRef<"texture">;
  readonly sheenRoughnessMap?: AuraAssetRef<"texture">;
  readonly iridescenceMap?: AuraAssetRef<"texture">;
  readonly iridescenceThicknessMap?: AuraAssetRef<"texture">;
  readonly anisotropyMap?: AuraAssetRef<"texture">;
  /**
   * Per-slot UV set selection for the native texCoord selector (muse3jsparity-PRD C1).
   * 0 samples the authored unwrap, 1 the procedural 2x tiling unwrap.
   */
  readonly texCoords?: {
    readonly baseColor?: 0 | 1;
    readonly normal?: 0 | 1;
    readonly metallicRoughness?: 0 | 1;
    readonly occlusion?: 0 | 1;
    readonly emissive?: 0 | 1;
    readonly clearcoat?: 0 | 1;
    readonly clearcoatRoughness?: 0 | 1;
    readonly clearcoatNormal?: 0 | 1;
    readonly sheenColor?: 0 | 1;
    readonly sheenRoughness?: 0 | 1;
    readonly iridescence?: 0 | 1;
    readonly iridescenceThickness?: 0 | 1;
    readonly anisotropy?: 0 | 1;
  };
  /** Per-slot UV transforms, passed through to the native per-slot transform uniforms. */
  readonly texTransforms?: {
    readonly baseColor?: AuraTextureTransform;
    readonly normal?: AuraTextureTransform;
    readonly metallicRoughness?: AuraTextureTransform;
    readonly occlusion?: AuraTextureTransform;
    readonly emissive?: AuraTextureTransform;
    readonly clearcoat?: AuraTextureTransform;
    readonly clearcoatRoughness?: AuraTextureTransform;
    readonly clearcoatNormal?: AuraTextureTransform;
    readonly sheenColor?: AuraTextureTransform;
    readonly sheenRoughness?: AuraTextureTransform;
    readonly iridescence?: AuraTextureTransform;
    readonly iridescenceThickness?: AuraTextureTransform;
    readonly anisotropy?: AuraTextureTransform;
  };
  // C-15 additions (PR 0a; owner tags per CONTRACTS.md)
  /** C-04 (PRD 01): named blend state. */
  readonly blend?: import("@aura3d/rendering/contracts").AuraBlendMode;
  /** PRD 01. */
  readonly depthWrite?: boolean;
  /** PRD 04: KHR_materials_specular. */
  readonly specularIntensity?: number;
  readonly specularColor?: AuraColor;
  readonly specularIntensityMap?: AuraMaterialTextureInput;
  readonly specularColorMap?: AuraMaterialTextureInput;
  /** PRD 04. */
  readonly dispersion?: number;
  readonly transmissionMap?: AuraMaterialTextureInput;
  readonly thicknessMap?: AuraMaterialTextureInput;
  /** PRD 04: alpha handling. */
  readonly alphaMode?: "opaque" | "mask" | "blend";
  readonly alphaCutoff?: number;
  readonly alphaToCoverage?: boolean;
  readonly doubleSided?: boolean;
  readonly unlit?: boolean;
  /** C-12 (PRD 02): per-material / per-slot sampler overrides. */
  readonly sampling?: import("@aura3d/rendering/contracts").AuraTextureSampling;
  readonly slotSampling?: Partial<Record<import("../../contracts/materials").AuraMaterialTextureSlot, import("@aura3d/rendering/contracts").AuraTextureSampling>>;
  /** PRD 10: emissive practical light scale. */
  readonly practical?: boolean;
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

export type AuraMaterialCapabilityFeatureId =
  | "base-color"
  | "base-color-texture"
  | "metallic-roughness"
  | "normal-map"
  | "occlusion-map"
  | "emissive"
  | "alpha"
  | "double-sided"
  | "clearcoat"
  | "sheen"
  | "transmission"
  | "variants"
  | "hdr-ibl"
  | "shadow-maps";

export type AuraMaterialCapabilitySupport = "supported" | "partial" | "metadata-only" | "unsupported" | "internal";

export interface AuraMaterialCapabilityFeature {
  readonly id: AuraMaterialCapabilityFeatureId;
  readonly label: string;
  readonly rootSafeApi: AuraMaterialCapabilitySupport;
  readonly productionRuntime: AuraMaterialCapabilitySupport;
  readonly requested: boolean;
  readonly evidence: string;
  readonly claimRule: string;
}

export interface AuraMaterialCapabilityDiagnostics {
  readonly kind: "aura-material-capability-diagnostics";
  readonly rendererPath: "root-createAuraApp";
  readonly requestedFeatures: readonly AuraMaterialCapabilityFeatureId[];
  readonly unsupportedRequestedFeatures: readonly AuraMaterialCapabilityFeatureId[];
  readonly partialRequestedFeatures: readonly AuraMaterialCapabilityFeatureId[];
  readonly features: readonly AuraMaterialCapabilityFeature[];
  readonly warnings: readonly string[];
  readonly claimBoundary: string;
}

export type AuraMaterialCapabilityInput =
  | AuraMaterialSpec
  | readonly AuraMaterialSpec[]
  | AuraSceneBuilder
  | AuraSceneSnapshot
  | readonly AuraSceneNode[]
  | undefined;

export type AuraModelRole =
  | "primaryCharacter"
  | "primaryVehicle"
  | "primaryWorld"
  | "primaryTrack"
  | "setDressing"
  | "debug"
  | "collider"
  | "uiOnly";

export type AuraModelScaleMode = "normalized" | "fit" | "world";

export interface AuraModelOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly visible?: boolean;
  readonly role?: AuraModelRole;
  readonly scaleMode?: AuraModelScaleMode;
  readonly targetHeight?: number;
  readonly targetMaxDimension?: number;
  readonly targetLength?: number;
  readonly physics?: AuraNodePhysicsSpec;
  /** Exact glTF node names to suppress when composing a typed model into a route. */
  readonly hiddenNodeNames?: readonly string[];
  /** C-15 (PR 0a, PRD 04): material override table. */
  readonly materialOverrides?: readonly import("../../contracts/materials").AuraModelMaterialOverride[];
  /** C-15 (PR 0a, PRD 04): named material variant. */
  readonly variant?: string;
  /** C-17 (PR 0a, PRD 05): LOD control; widened union accepts the authored form too. */
  readonly lod?: false | "auto" | import("../../contracts/assets").AuraAssetLodOption | AuraRootLodSpec;
  /** C-17 (PR 0a, PRD 05): collider resolution. */
  readonly collider?: "auto" | "bounds" | false;
  /**
   * Wrinkle-detail hook (E1 face-rig demo): per-frame the engine resolves
   * `resolveWrinkleMapStrength(liveMorphWeights, wrinkle)` and uploads it as
   * `u_wrinkleStrength` on shaders that declare it (skinned-lit family), modulating
   * procedural normal detail. No authored wrinkle texture required; strength 0 renders
   * exactly as without the hook. `textureUniform` is accepted but currently unused.
   */
  readonly wrinkle?: WrinkleMapHook;
}

export interface AuraPrimitiveOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly size?: number | AuraVec3;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly physics?: AuraNodePhysicsSpec;
  readonly instances?: readonly AuraTransformSpec[];
  readonly instanceColors?: readonly AuraColor[];
  readonly geometry?: AuraCustomGeometrySpec;
  readonly text3D?: Omit<AuraText3DGeometry, "geometry">;
  readonly lod?: AuraRootLodSpec;
}

export type AuraBuiltinPrimitive = "box" | "sphere" | "plane" | "cylinder" | "capsule" | "torus";

export interface AuraRootLodLevelSpec {
  readonly name: string;
  readonly maxDistance?: number;
  readonly primitive?: AuraBuiltinPrimitive;
  readonly geometry?: AuraCustomGeometrySpec;
  readonly material?: AuraMaterialSpec;
}

export interface AuraRootLodSpec {
  readonly levels: readonly AuraRootLodLevelSpec[];
  readonly hysteresis?: number;
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
  // C-19 additions (PR 0a, PRD 06)
  readonly crossFade?: number | false;
  readonly transition?: "crossfade" | "inertialize";
  readonly warp?: boolean;
  readonly syncGroup?: string;
  readonly layer?: string;
  readonly blendMode?: "override" | "additive";
  readonly additiveReference?: { readonly clip?: string; readonly time?: number };
  readonly mask?: import("../../contracts/animation").AuraBoneMaskSpec;
  readonly weight?: number;
  readonly rootMotion?: import("../../contracts/animation").AuraRootMotionSpec | false;
  readonly fallback?: "error" | "first";
  readonly restPoseReset?: boolean;
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
  /** P2 model instancing (muse3jsparity-PRD): per-instance transforms consumed at mount exactly like primitive nodes. */
  readonly instances?: readonly AuraTransformSpec[];
  readonly instanceColors?: readonly AuraColor[];
  readonly instanceLod?: { readonly levels: readonly { readonly maxDistance: number }[]; readonly hysteresis?: number };
  /** P2 culling telemetry stamped by `instances.model`: centroid + bounding radius over instance positions. */
  readonly instanceCulling?: { readonly instanceCount: number; readonly centroid: AuraVec3; readonly boundingRadius: number; readonly cullable: true };
  /** P2 D1 fallback diagnostic stamped by `instances.model` when the material is not instancing-aware. */
  readonly instancedModelWarning?: string;
  readonly role?: AuraModelRole;
  readonly scaleMode?: AuraModelScaleMode;
  readonly targetHeight?: number;
  readonly targetMaxDimension?: number;
  readonly targetLength?: number;
  readonly animation?: AuraAnimationSpec;
  readonly interaction?: AuraInteractionSpec;
  readonly physics?: AuraNodePhysicsSpec;
  readonly hiddenNodeNames?: readonly string[];
  readonly runtime?: AuraRuntimeNodeSpec;
  /** Wrinkle-detail hook; see `AuraModelOptions.wrinkle`. */
  readonly wrinkle?: WrinkleMapHook;
}

export interface AuraPrimitiveNode extends AuraTransformSpec {
  readonly kind: "primitive";
  readonly primitive: AuraBuiltinPrimitive | "custom";
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly size?: number | AuraVec3;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly animation?: AuraAnimationSpec;
  readonly interaction?: AuraInteractionSpec;
  readonly physics?: AuraNodePhysicsSpec;
  readonly runtime?: AuraRuntimeNodeSpec;
  readonly instances?: readonly AuraTransformSpec[];
  readonly instanceColors?: readonly AuraColor[];
  readonly geometry?: AuraCustomGeometrySpec;
  readonly text3D?: Omit<AuraText3DGeometry, "geometry">;
  readonly lod?: AuraRootLodSpec;
}

export interface AuraGroupNode extends AuraTransformSpec {
  readonly kind: "group";
  readonly name?: string;
  readonly children: readonly AuraSceneNode[];
  readonly animation?: AuraAnimationSpec;
  readonly character?: AuraCharacterRigSpec;
  readonly runtime?: AuraRuntimeNodeSpec;
}

export type AuraLightType = "ambient" | "directional" | "point" | "studio" | "rect" | "softbox" | "spot" | "hemisphere";

export interface AuraLightNode extends AuraTransformSpec {
  readonly kind: "light";
  readonly light: AuraLightType;
  readonly name?: string;
  readonly color?: AuraColor;
  readonly intensity: number;
  readonly width?: number;
  readonly height?: number;
  readonly target?: AuraVec3;
  readonly angle?: number;
  readonly penumbra?: number;
  readonly distance?: number;
  readonly decay?: number;
  /** C-10 (PR 0a): source power in lumens (point/spot). */
  readonly power?: number;
  /** C-10 (PR 0a): shadow options; boolean stays accepted. */
  readonly shadow?: boolean | import("../../contracts/lighting").AuraLocalShadowOptions | import("../../contracts/lighting").AuraDirectionalShadowOptions;
}

export type AuraEffectType =
  | "fog" | "bloom" | "rain" | "particles" | "ambient-occlusion" | "contact-occlusion"
  | "color-grade" | "anti-alias" | "outline"
  | "screen-space-reflections" | "depth-of-field" | "motion-blur" | "volumetric-fog" | "snow"
  | "flipbook-sprite" | "light-beam";

export type AuraParticleMaterialMode = "additive-glow" | "soft-alpha" | "spark" | "smoke" | "splash" | "dust" | "star";

export interface AuraEffectNode extends AuraTransformSpec {
  readonly kind: "effect";
  readonly effect: AuraEffectType;
  readonly name?: string;
  readonly animation?: AuraAnimationSpec;
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
  /** Native bloom path (muse3jsparity-PRD A1): performance keeps the legacy single-scale ping-pong; balanced/cinematic use the mip pyramid. */
  readonly quality?: "performance" | "balanced" | "cinematic";
  /** HDR bright-extract knee width in [0, 0.5]; 0 keeps the hard threshold step. */
  readonly softKnee?: number;
  /** LDR composite highlight shoulder in [0, 1]; 0 keeps the legacy clamp. */
  readonly shoulder?: number;
  /** Color-grade exposure multiplier (muse3jsparity-PRD A3). */
  readonly exposure?: number;
  /** Color-grade contrast around mid-grey (muse3jsparity-PRD A3). */
  readonly contrast?: number;
  /** Color-grade saturation multiplier (muse3jsparity-PRD A3). */
  readonly saturation?: number;
  /** Recorded color-grade shadow lift: no native grade target yet, warned when set. */
  readonly shadows?: number;
  /** Recorded color-grade highlight gain: no native grade target yet, warned when set. */
  readonly highlights?: number;
  /** Reserved color-grade LUT asset id: recorded on the node, not yet sampled by the native grade. */
  readonly lut?: string;
  /** Anti-alias mode (muse3jsparity-PRD A3): fxaa executes natively; taa/off never submit a pass. */
  readonly mode?: "fxaa" | "taa" | "off";
  /** Outline width in pixels, 1-6 (muse3jsparity-PRD A3). */
  readonly width?: number;
  /** Depth-of-field focus as a linear-distance fraction, 0 = near, 1 = far (muse3jsparity-PRD A3). */
  readonly focus?: number;
  /** Depth-of-field blur-band width derived control in [0, 1] (muse3jsparity-PRD A3). */
  readonly aperture?: number;
  /** Depth-of-field maximum blur radius in pixels (muse3jsparity-PRD A3). */
  readonly maxBlur?: number;
  /** Volumetric-fog quality (muse3jsparity-PRD A5): "off" keeps forward exp2 fog only, never submits the inscatter pass. */
  readonly volumetricQuality?: "off" | "balanced" | "quality" | "ultra";
  /** Volumetric-fog radial anchor override in UV (muse3jsparity-PRD A5); defaults to the upper third. */
  readonly lightPosition?: readonly [number, number];
  /** Volumetric height falloff (muse3jsparity-PRD A5); 0 disables the height gate. */
  readonly heightFalloff?: number;
  /** Volumetric height reference in world units (muse3jsparity-PRD A5). */
  readonly heightReference?: number;
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
  /** Flipbook sprite sheet columns (muse3jsparity-PRD D4); validated fail-loud by resolveFlipbookUv. */
  readonly spriteColumns?: number;
  /** Flipbook sprite sheet rows (muse3jsparity-PRD D4). */
  readonly spriteRows?: number;
  /** Flipbook playback rate in frames per second (muse3jsparity-PRD D4). */
  readonly frameRate?: number;
  /** Light-beam start point in world units (muse3jsparity-PRD D4). */
  readonly from?: AuraVec3;
  /** Light-beam end point in world units (muse3jsparity-PRD D4). */
  readonly to?: AuraVec3;
  /** Light-beam width in world units (muse3jsparity-PRD D4). */
  readonly widthWorld?: number;
  /** Light-beam quad-strip segment count (muse3jsparity-PRD D4). */
  readonly segmentCount?: number;
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
  /**
   * World point the label is attached to.
   *
   * `position` is where the label box sits; `anchorWorldPosition` is what a
   * leader line points at. When omitted the label anchors to its own position.
   * Both are projected every frame by the world-label layer, so a label tracks
   * its subject as the camera moves.
   */
  readonly anchorWorldPosition?: AuraVec3;
  /** Behaviour when the anchor projects outside the viewport. Defaults to "clamp". */
  readonly offscreenPolicy?: "hide" | "clamp" | "draw";
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
  readonly environment: "studio" | "material-lab" | "product-hero" | "night-cinematic" | "metal-studio" | "glass-studio" | "hdri";
  readonly name?: string;
  readonly intensity: number;
  readonly color?: AuraColor;
  /**
   * B3 root HDRI input (muse3jsparity-PRD). Only meaningful with
   * `environment: "hdri"`: a Radiance `.hdr` asset ref resolved post-mount
   * through the HDR→cubemap→GGX→BRDF-LUT chain. Scalar/procedural first
   * frames stay honest; `iblPixelBacked` reports the swap.
   */
  readonly texture?: AuraAssetRef<"texture">;
  /**
   * B3 second probe slot (muse3jsparity-PRD). Optional reflection `.hdr`:
   * the diffuse/illumination term keeps sampling `texture` (roughest mip)
   * while the specular term samples `reflectionTexture` (sharper mips).
   * Absent, both terms sample `texture` (single probe).
   */
  readonly reflectionTexture?: AuraAssetRef<"texture">;
  /**
   * M3 HDRI rotation (muse3jsparity-PRD) in radians. Forwards into the
   * production HDR chain (`environmentMapRotation`); 0 keeps B3 behavior.
   */
  readonly rotation?: number;
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

export type AuraRendererQualityProfileId = "safe-basic" | "production" | "cinematic" | "experimental-webgpu";

export type AuraRendererMode = "safe-basic" | "production";

export type AuraRendererFallbackMode = "safe-basic";

export interface AuraRendererQualityProfile {
  readonly kind: "aura-renderer-quality-profile";
  readonly id: AuraRendererQualityProfileId;
  readonly label: string;
  readonly rendererMode: AuraRendererMode;
  readonly status: "supported" | "fallback-only" | "experimental";
  readonly antialiasing: "msaa" | "msaa-plus-high-dpi";
  readonly pixelRatio: number;
  readonly preserveDrawingBuffer: boolean;
  readonly maxRecommendedDrawCalls: number;
  readonly requestedFeatures: readonly string[];
  readonly supportedInRoot: readonly string[];
  readonly blockedInRoot: readonly string[];
  readonly claimBoundary: string;
}

export interface AuraCreateAppRendererOptions {
  readonly mode?: AuraRendererMode;
  readonly fallback?: AuraRendererFallbackMode;
  readonly qualityProfile?: AuraRendererQualityProfileId;
  /**
   * M2 texture streaming budget in bytes (muse3jsparity-PRD). Funds the
   * distance-prioritized mip residency; the unfunded tail surfaces as
   * over-budget telemetry instead of silent thrash. Default 256 MiB.
   */
  readonly textureBudgetBytes?: number;
  // C-38 additions (PR 0a, all optional)
  readonly quality?: unknown /* C-27 AuraQualityOptions (prd11) */;
  readonly output?: import("../../contracts/output").AuraOutputOptions;
  readonly resolution?: unknown /* prd01 */;
  readonly msaa?: unknown /* prd03 */;
  readonly compile?: unknown /* C-36 (prd15) */;
  readonly strictMount?: boolean;
  readonly debug?: unknown;
  readonly renderScale?: number;
  readonly backend?: unknown /* prd01 */;
  readonly adaptive?: unknown /* prd11 */;
  readonly targetFrameRate?: number;
  readonly batching?: unknown /* prd11 */;
  readonly vfx?: unknown /* C-20 (prd07) */;
  readonly vfxOverrides?: Readonly<Record<string, unknown>>;
  readonly skinnedShadows?: boolean /* C-19 (prd06) */;
  readonly morph?: "gpu" | "cpu" /* C-19 (prd06) */;
  readonly skinnedPbr?: "unified" | "fork" /* C-19 (prd06) */;
  readonly materialStrictness?: "warn" | "strict" /* C-15 (prd04) */;
  readonly materialModel?: "legacy" | "physical-r185" /* C-15 (prd04) */;
  readonly transmission?: "auto" | "env" | "off" /* C-15 (prd04) */;
  readonly alphaToCoverage?: boolean /* C-15 (prd04) */;
  readonly debugView?: import("../../contracts/materials").AuraRendererMaterialOptions["debugView"];
}

export interface AuraRendererDiagnosticReport {
  readonly kind: "aura-renderer-diagnostics";
  readonly colorManagement: AuraRendererColorManagementPreset;
  readonly rendererMode: AuraRendererMode;
  readonly fallbackMode?: AuraRendererFallbackMode;
  readonly qualityProfile: AuraRendererQualityProfile;
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
    readonly quality?: "performance" | "balanced" | "cinematic";
  };
  readonly shadows: {
    /** True only when a mounted runtime actually sampled a shadow map. */
    readonly enabled: boolean;
    /** The scene asked for shadows: a shadow-casting light was collected. */
    readonly requested: boolean;
    /** A shadow depth target was allocated and rendered by the device. */
    readonly mapRendered: boolean;
    /** A shader actually bound and sampled the shadow map. */
    readonly mapSampled: boolean;
    readonly mapSize?: number;
    readonly label?: string;
    readonly nativeShadowMapBindings: number;
    readonly shadowRenderTargetsAllocated: number;
    /** Submitted cascade matrices/point atlas state; null before a real shadow frame. */
    readonly observed: Readonly<Record<string, unknown>> | null;
    readonly contactShadows: number;
    readonly mapType: "pcf-soft";
    /**
     * N1 authored spot shadow state (muse3jsparity-PRD). `requested` is the
     * author intent (`lights.spot({ shadow: true })` winning the caster
     * slot); `spotPixelBacked` additionally requires the device-observed
     * map signals — never declared from intent alone.
     */
    readonly spot?: {
      readonly requested: boolean;
      readonly casterIsSpot: boolean;
      readonly casterName?: string;
      readonly angle?: number;
      readonly penumbra?: number;
      readonly range?: number;
      readonly atlasResolution?: number;
      readonly atlasReason?: string;
      readonly spotPixelBacked: boolean;
      readonly reason: string;
    };
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
    /** Device-observed render-target format used by the mounted composer. */
    readonly targetFormat?: "rgba8" | "rgba16f" | "rgba32f";
    /** Device-observed postprocess execution path (muse3jsparity-PRD A1). */
    readonly executionMode: RendererPostprocessExecutionMode | "unknown";
    readonly evidence: string;
  };
  readonly runtime: {
    readonly mounted: boolean;
    readonly backend: "scene-plan" | "webgl2-agent-runtime" | "production-runtime";
    readonly postprocessVerified: boolean;
    readonly passNames: readonly string[];
    readonly warnings: readonly string[];
    readonly nativeInstancedSubmissions: number;
    readonly nativeTemporalPasses?: number;
    readonly nativeTemporalBindings?: number;
    readonly submittedObjects: number;
    readonly visibleObjects: number;
    readonly culledObjects: number;
    readonly frustumTestedObjects: number;
    /** Most recent native bloom execution observed on the device (muse3jsparity-PRD A1); null until a native bloom pass runs. */
    readonly bloom: RenderDeviceDiagnostics["bloom"];
    /** C3 sampler anisotropy telemetry: uploads issued and device maximum (1 when unsupported). */
    readonly samplerAnisotropyUploads?: number;
    readonly maxTextureAnisotropy?: number;
    readonly lodSelections: readonly {
      readonly nodeName: string;
      readonly levelIndex: number;
      readonly levelName: string;
    }[];
    /** C1 per-material textured diagnostics; pixelBacked only after the post-mount upgrade swaps materials. */
    readonly texturedMaterials: readonly {
      readonly nodeName: string;
      readonly levelName: string;
      readonly status: "none" | "pending" | "textured" | "fallback";
      readonly slots: readonly string[];
      readonly pixelBacked: boolean;
      readonly warnings: readonly string[];
    }[];
  };
  readonly environment: {
    readonly enabled: boolean;
    readonly preset?: AuraEnvironmentNode["environment"];
    readonly intensity?: number;
    readonly evidence: string;
    /** B3: true only after the HDRI chain swaps the live lighting object. */
    readonly iblPixelBacked: boolean;
    readonly hdriStatus: "none" | "pending" | "ready" | "fallback";
    readonly dualProbe?: boolean;
  };
  /**
   * G1 SDF world-text state (muse3jsparity-PRD). `textPixelBacked` is true
   * only when the atlas-derived label texture uploaded AND SDF quads were
   * submitted this frame — layout alone never backs pixels.
   */
  readonly text: {
    readonly sdfTexts: number;
    readonly textPixelBacked: boolean;
    readonly quadCount: number;
    readonly lastOpacity: number;
    readonly reason: string;
  };
  /**
   * M2 texture streaming residency (muse3jsparity-PRD). Funded from the
   * post-upgrade texture table against `textureBudgetBytes`; the unfunded
   * tail reports over-budget bytes instead of thrashing silently.
   */
  readonly textures: {
    readonly budgetBytes: number;
    readonly usedBytes: number;
    readonly requestedBytes: number;
    readonly overBudget: boolean;
    readonly overBudgetBytes: number;
    readonly residentEntries: number;
    readonly evictedEntries: readonly string[];
  };
  readonly antialiasing: AuraRendererQualityPreset["antialiasing"];
  readonly screenshotQuality: AuraRendererQualityPreset;
  readonly materialCapabilities: AuraMaterialCapabilityDiagnostics;
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

/** Public vehicle/character aliases. Named `Aura*` so a route never imports the solver package. */
export type AuraPhysicsWheelSpec = PhysicsWheelSpec;

export type AuraPhysicsWheelTuning = PhysicsWheelTuning;

export type AuraPhysicsWheelCommand = PhysicsWheelCommand;

export type AuraPhysicsWheelState = PhysicsWheelState;

export type AuraPhysicsVehicleAxis = PhysicsVehicleAxis;

export type AuraPhysicsVehicleController = PhysicsVehicleController;

export type AuraPhysicsCharacterDescriptor = PhysicsCharacterControllerDescriptor;

export type AuraPhysicsCharacterMovement = PhysicsCharacterMovement;

export type AuraPhysicsCharacterController = PhysicsCharacterController;

export interface AuraPhysicsWorldController {
  readonly kind: "aura-physics-world";
  createBody(options?: RigidBodyDescriptor & { readonly shape?: PhysicsShape; readonly sensor?: boolean; readonly material?: ColliderDescriptor["material"] }): RigidBody;
  createCollider(body: RigidBody | number, descriptor: ColliderDescriptor): Collider;
  createConstraint(descriptor: ConstraintDescriptor): Constraint;
  /**
   * Suspension-backed physical vehicle on a chassis body.
   *
   * The controller is replayed on `reset()`, so a restart rebuilds the wheels and
   * their tuning against the fresh world instead of leaving a stale solver handle
   * bound to a destroyed chassis.
   */
  createVehicleController(chassis: RigidBody | number, wheels?: readonly AuraPhysicsWheelSpec[]): AuraPhysicsVehicleController;
  /** Solver-backed character: grounding, slope limits, auto-step and snap-to-ground. */
  createCharacterController(body: RigidBody | number, descriptor?: AuraPhysicsCharacterDescriptor): AuraPhysicsCharacterController;
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

export type AuraNodeInput = AuraNodeBuilder<AuraSceneNode> | AuraSceneNode;

export type AuraCameraMode = "perspective" | "orbit" | "dolly" | "follow" | "path" | "flythrough" | "orthographic" | "isometric";

export interface AuraCameraSpec {
  readonly mode: AuraCameraMode;
  readonly position?: AuraVec3;
  readonly target?: AuraVec3;
  readonly offset?: AuraVec3;
  readonly targetOffset?: AuraVec3;
  readonly offsetMode?: "scene" | "target-yaw";
  readonly fov?: number;
  /** Positive near clipping distance in world units; defaults to 0.05. */
  readonly near?: number;
  /** Far clipping distance in world units, greater than near; defaults to 100. */
  readonly far?: number;
  readonly distance?: number;
  readonly from?: AuraVec3;
  readonly to?: AuraVec3;
  readonly seconds?: number;
  readonly targetNode?: string;
  readonly easing?: "linear" | "easeInOut";
  readonly captureTime?: number;
  readonly smoothing?: number;
  readonly subjectEmphasis?: number;
  /**
   * Half-height of the orthographic frustum, in world units.
   *
   * Orthographic projection has no field of view, so this is what sets image
   * scale: the camera sees `orthographicSize` units above and below its target
   * regardless of how far away it sits. Horizontal extent follows from the
   * viewport aspect, which keeps the image square-on rather than stretched.
   * Ignored by every perspective mode.
   */
  readonly orthographicSize?: number;
}

export interface AuraBoundsSpec {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

export interface AuraCameraFrameAssetOptions {
  readonly targetHeight?: number;
  readonly targetMaxDimension?: number;
  readonly targetLength?: number;
  readonly position?: AuraVec3;
  readonly floorY?: number;
  readonly target?: AuraVec3;
  readonly padding?: number;
  readonly fov?: number;
  readonly azimuth?: number;
  readonly elevation?: number;
  readonly minDistance?: number;
}

export interface AuraTimelineSpec {
  readonly mode: "loop" | "once";
  readonly seconds?: number;
  readonly startTime?: number;
  readonly duration?: number;
  readonly loop?: boolean;
  readonly easing?: "linear" | "easeInOut";
  readonly captureTime?: number;
}

export type AuraEnvironmentOptions = Partial<Omit<AuraEnvironmentNode, "kind" | "environment">>;

export interface AuraRendererRuntimeObservation {
  readonly mounted: boolean;
  readonly backend: "scene-plan" | "webgl2-agent-runtime" | "production-runtime";
  readonly postprocess: {
    readonly renderPass: boolean;
    readonly outputPass: boolean;
    readonly bloomPass: boolean;
    readonly ambientOcclusionPass: boolean;
    readonly contactOcclusionReceiver: boolean;
    readonly pixelBacked: boolean;
    readonly actualPasses: readonly string[];
    readonly fallbackPasses: readonly string[];
    readonly targetFormat?: "rgba8" | "rgba16f" | "rgba32f";
    /** Device-observed postprocess execution path (muse3jsparity-PRD A1). */
    readonly executionMode: RendererPostprocessExecutionMode | "unknown";
  };
  readonly environment?: {
    readonly enabled: boolean;
    readonly preset?: AuraEnvironmentNode["environment"] | string;
    readonly intensity?: number;
    readonly evidence: string;
    /** B3: true only after the HDRI chain swaps the live lighting object. */
    readonly iblPixelBacked?: boolean;
    readonly hdriStatus?: "none" | "pending" | "ready" | "fallback";
    readonly dualProbe?: boolean;
    readonly hdriRotation?: number;
  };
  /**
   * Device-observed shadow-map activity. This exists because the root report
   * previously published `shadows.enabled: true` unconditionally, which is a
   * source-authored boolean rather than evidence that any shadow map was
   * rendered or sampled.
   */
  readonly shadow?: {
    readonly requested: boolean;
    readonly mapRendered: boolean;
    readonly mapSampled: boolean;
    readonly mapSize?: number;
    readonly label?: string;
    readonly nativeShadowMapBindings?: number;
    readonly shadowRenderTargetsAllocated?: number;
    readonly observed?: Readonly<Record<string, unknown>> | null;
    /**
     * N1 authored spot shadow state (muse3jsparity-PRD). `spotPixelBacked`
     * requires the device-observed map signals on a spot caster.
     */
    readonly spot?: {
      readonly requested: boolean;
      readonly casterIsSpot: boolean;
      readonly casterName?: string;
      readonly angle?: number;
      readonly penumbra?: number;
      readonly range?: number;
      readonly atlasResolution?: number;
      readonly atlasReason?: string;
      readonly spotPixelBacked: boolean;
      readonly reason: string;
    };
  };
  /** G1 SDF text observation, computed from the mounted primitive entries. */
  readonly text?: {
    readonly sdfTexts: number;
    readonly textPixelBacked: boolean;
    readonly quadCount: number;
    readonly lastOpacity: number;
    readonly reason: string;
  };
  /** M2 streaming residency, funded from the post-upgrade texture table. */
  readonly textures?: {
    readonly budgetBytes: number;
    readonly usedBytes: number;
    readonly requestedBytes: number;
    readonly overBudget: boolean;
    readonly overBudgetBytes: number;
    readonly residentEntries: number;
    readonly evictedEntries: readonly string[];
  };
  readonly warnings?: readonly string[];
  readonly deviceDiagnostics?: Pick<RenderDeviceDiagnostics, "nativeTemporalPasses" | "nativeTemporalBindings" | "nativeInstancedSubmissions" | "submittedObjects" | "visibleObjects" | "culledObjects" | "frustumTestedObjects" | "bloom" | "samplerAnisotropyUploads" | "maxTextureAnisotropy">;
  readonly lodSelections?: readonly {
    readonly nodeName: string;
    readonly levelIndex: number;
    readonly levelName: string;
  }[];
  /**
   * C1 per-material textured diagnostics. pixelBacked is true only after the
   * post-mount upgrade swaps in the TexturedPBRMaterial (scalar first frames
   * report false, never a premature true).
   */
  readonly texturedMaterials?: readonly {
    readonly nodeName: string;
    readonly levelName: string;
    readonly status: "none" | "pending" | "textured" | "fallback";
    readonly slots: readonly string[];
    readonly pixelBacked: boolean;
    readonly warnings: readonly string[];
  }[];
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
  readonly rendererPath: "productionRuntimeNativeInstancing";
  readonly windows: number;
  readonly props: number;
  readonly roadMarkings: number;
  readonly lights: number;
  readonly nativeInstanceGroups: number;
  readonly nativeInstances: number;
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

/*
 * WS-3.1 — `createGameInputController` deleted here: 175 lines, ZERO consumers, and a second keyboard
 * service.
 *
 * Found while enforcing WS-3.1's stated invariant — *a single runtime input service owns keyboard state for
 * a mounted Aura3D application*. The ownership test flagged a `keydown` attachment in this file that was
 * not `GameRuntime`'s, and `grep -rn createGameInputController` across packages, apps, examples, tests and
 * tools returns exactly its own definition.
 *
 * It was a simpler duplicate of `GameRuntime.ts`'s `createGameInput`: same action-mapping concept, its own
 * `activeBindings`/`previousHeld`/`pressedEdges` state, its own `window` listeners, and a subtly different
 * `update()` — no press history, so no `combo()`, and no pointer or gamepad handling. Anything that had
 * reached it would have got quietly weaker input semantics than `game.input()` provides.
 *
 * This is precisely the R12 duplicate-ownership class the PRD names, in the one place it is least visible:
 * not two packages, but two functions in the same file, one of which nothing called.
 */

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

export interface AuraRacingPresentationTrackOptions {
  readonly sceneBinding: GameRacingSceneBinding;
  readonly route: GameAssetBoundRacingRoute;
  readonly mode?: "standalone" | "asset-overlay" | "game-circuit";
  readonly guideVisibility?: "public" | "evidence" | "full";
  readonly roadY?: number;
  readonly roadColor?: AuraColor;
  readonly terrainColor?: AuraColor;
  readonly curbColor?: AuraColor;
  readonly laneColor?: AuraColor;
}

export interface AuraRacingRoadMeshOptions extends Omit<AuraRacingPresentationTrackOptions, "guideVisibility"> {
  readonly includeTerrain?: boolean;
  readonly pitLaneColor?: AuraColor;
  readonly markingVisibility?: "full" | "subtle" | "none";
  readonly terrainPaddingScale?: number;
}

export interface AuraRacingCheckpointGateOptions {
  readonly sceneBinding: GameRacingSceneBinding;
  readonly route: GameAssetBoundRacingRoute;
  readonly progress: number;
  readonly index?: number;
  readonly mode?: "scene-bound" | "asset-bound";
  readonly roadY?: number;
  readonly roadWidth?: number;
  readonly gateColor?: AuraColor;
  readonly accentColor?: AuraColor;
  readonly lightColor?: AuraColor;
}

export interface AuraRacingStartFinishOptions {
  readonly sceneBinding: GameRacingSceneBinding;
  readonly route: GameAssetBoundRacingRoute;
  readonly mode?: "scene-bound" | "asset-bound";
  readonly roadY?: number;
  readonly roadWidth?: number;
  readonly checkerColorA?: AuraColor;
  readonly checkerColorB?: AuraColor;
  readonly gantryColor?: AuraColor;
  readonly lightColor?: AuraColor;
}

export interface AuraPublicRacingPresentationOptions extends Omit<AuraRacingRoadMeshOptions, "mode"> {
  readonly checkpointColor?: AuraColor;
  readonly checkpointAccentColor?: AuraColor;
  readonly startLightColor?: AuraColor;
}

export interface AuraRacingPresentationCertificationInput extends PublicRacingGeometryContract {
  readonly presentation?: {
    readonly roadMeshNodes?: number;
    readonly checkpointGateNodes?: number;
    readonly startFinishNodes?: number;
    readonly cameraMode?: "follow" | "perspective" | "overview";
    readonly debugMarkerCount?: number;
  };
}

export interface AuraPlatformerPresentationSurfaceOptions {
  readonly sceneBinding: GamePlatformerSceneBinding;
  readonly level: GameAssetBoundPlatformerLevel;
  readonly mode?: "standalone" | "asset-overlay" | "game-level";
  readonly guideVisibility?: "public" | "evidence" | "full";
  readonly platformColor?: AuraColor;
  readonly platformTrimColor?: AuraColor;
  readonly checkpointColor?: AuraColor;
  readonly hazardColor?: AuraColor;
  readonly collectibleColor?: AuraColor;
  readonly finishColor?: AuraColor;
  readonly includeBackdrop?: boolean;
}

export type AuraPlatformerPublicSurfaceMode = "scene-bound" | "asset-bound" | "game-level";

export interface AuraPublicPlatformerPresentationOptions extends Omit<AuraPlatformerPresentationSurfaceOptions, "mode" | "guideVisibility"> {}

export interface AuraPlatformerSurfaceMeshOptions {
  readonly sceneBinding: GamePlatformerSceneBinding;
  readonly surface: GameKitRect;
  readonly mode?: AuraPlatformerPublicSurfaceMode;
  readonly color?: AuraColor;
  readonly trimColor?: AuraColor;
}

export interface AuraPlatformerHazardOptions {
  readonly sceneBinding: GamePlatformerSceneBinding;
  readonly hazard: GameKitRect;
  readonly mode?: AuraPlatformerPublicSurfaceMode;
  readonly color?: AuraColor;
}

export interface AuraPlatformerCheckpointOptions {
  readonly sceneBinding: GamePlatformerSceneBinding;
  readonly checkpoint: GamePlatformerCheckpoint;
  readonly color?: AuraColor;
}

export interface AuraPlatformerFinishOptions {
  readonly sceneBinding: GamePlatformerSceneBinding;
  readonly finish: GameKitVec2 & { readonly id?: string };
  readonly color?: AuraColor;
}

export interface AuraPlatformerPresentationCertificationInput extends PublicPlatformerGeometryContract {
  readonly presentation?: {
    readonly groundMeshNodes?: number;
    readonly platformMeshNodes?: number;
    readonly hazardNodes?: number;
    readonly checkpointNodes?: number;
    readonly finishNodes?: number;
    readonly cameraMode?: "follow" | "perspective" | "establishing";
    readonly debugMarkerCount?: number;
    readonly characterGrounded?: boolean;
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

export interface AuraSceneKitBudgetDefaults {
  readonly maxDrawCalls: number;
  readonly estimatedDrawCalls: number;
  readonly maxGzipBytes: number;
  readonly estimatedGzipBytes: number;
  readonly targetP50Fps: number;
  readonly evidence: string;
}

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

export interface AuraPromptSubjectResolver {
  resolve(query: {
    text: string;
    constraints?: AuraPromptIntentSubject["constraints"];
  }): Promise<{ asset: AuraAssetRef<"model"> } | null>;
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

/**
 * Which backend a mounted app is drawing with.
 *
 * `"canvas2d"` is **internal and diagnostic-only** (WS-2.5). It is never selected for a scene that
 * declares renderable content: such a scene either renders through WebGL2/WebGPU or raises a diagnosable
 * error. It appears here because `diagnostics().backend` can still report it for a scene with nothing to
 * render, and hiding that would make the diagnostic less useful, not more honest.
 *
 * Do not treat a `"canvas2d"` reading as a render. See `renderDiagnosticPreviewToCanvas`.
 */
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
  /**
   * Labels the world-label layer actually placed on screen this frame, with their
   * projected pixel positions and visibility.
   *
   * This distinguishes "a label node exists in the scene" from "a label is drawn
   * where the user can read it". Every production callout was silently dropped
   * while evidence counted the nodes, so the counted-node signal is not enough.
   */
  readonly labels?: readonly ProjectedLabel[];
  readonly labelTelemetry?: LabelTelemetry;
  readonly textBuckets?: TextBucketSummary;
  // C-31 section keys (PR 0a, all optional; populated by registered sections)
  readonly output?: unknown; readonly resolution?: unknown; readonly programs?: unknown; readonly frameAllocations?: unknown;
  readonly lighting?: unknown; readonly shadows?: unknown;
  readonly post?: unknown; readonly exposure?: unknown;
  readonly materials?: unknown;
  readonly animation?: unknown;
  readonly effects?: unknown; readonly atmosphere?: unknown;
  readonly camera?: unknown; readonly loop?: unknown;
  readonly game?: unknown;
  readonly world?: unknown;
  readonly frame?: unknown; readonly "renderer.batching"?: unknown; readonly quality?: unknown;
  readonly appliedLook?: import("../../contracts/diagnostics").AppliedLookReport; readonly frameTiming?: unknown;
  readonly look?: unknown;
  readonly degradations?: readonly import("../../contracts/compiler").AuraDegradation[];
  readonly compiledFeatures?: readonly string[];
  readonly qrFlags?: readonly string[];
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
  readonly importedAssetEvidence?: AuraRuntimeNodeImportedAssetEvidence;
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
  setImportedAssetEvidence(evidence: AuraRuntimeNodeImportedAssetEvidence | undefined): this;
  importedAssetEvidence(): AuraRuntimeNodeImportedAssetEvidence | undefined;
  setMorphTarget(name: string, weight: number): this;
  setMorphTargets(weights: RuntimeNodeMorphTargetWeights): this;
  morphTargets(): RuntimeNodeMorphTargetWeights;
  /** First-class named morph-influence API: read a target's weight (omit `weight`), or set it (e.g. `node.morphInfluence("smile", 0.8)`). */
  morphInfluence(name: string, weight?: number): this | number;
  bounds(): AuraRuntimeNodeBounds;
  attachEffect(effect: AuraRuntimeNodeEffectAttachment): this;
  effects(): readonly AuraRuntimeNodeEffectAttachment[];
  snapshot(): AuraRuntimeNodeSnapshot;
}

export interface AuraRuntimeNodeImportedAssetEvidence {
  readonly kind: "aura-runtime-node-imported-asset-evidence";
  readonly assetId: string;
  readonly nodeId?: string | undefined;
  readonly skeleton?: {
    readonly boneCount: number;
    readonly boneNames: readonly string[];
  } | undefined;
  readonly clips: readonly string[];
  readonly activeClip?: string | undefined;
  readonly skinningPalette?: {
    readonly jointCount: number;
    readonly matrixCount: number;
    readonly updated: boolean;
  } | undefined;
  readonly morphTargets: readonly string[];
  readonly activeMorphTargets: RuntimeNodeMorphTargetWeights;
  readonly missingMorphTargets: readonly string[];
  readonly bounds?: AuraRuntimeNodeBounds | undefined;
  readonly renderItemCount: number;
  readonly skinnedRenderItemCount: number;
  readonly morphRenderItemCount: number;
  readonly lastMaterialTracksApplied?: number | undefined;
  readonly lastLightTracksApplied?: number | undefined;
  readonly lastFootPlantingGroundedFeet?: number | undefined;
  readonly lastFootPlantingTargetError?: number | undefined;
  readonly lastFootPlantingHipOffset?: number | undefined;
  readonly lastFootPlantingMissingLegs?: readonly string[] | undefined;
  readonly lastFootPlantingDeformation?: TypedGLBActorEvidence["lastFootPlantingDeformation"];
  readonly lastFootPlantingSurfaces?: TypedGLBActorEvidence["lastFootPlantingSurfaces"];
  readonly lastFootPlantingFeet?: readonly { readonly side: "left" | "right"; readonly worldPosition: readonly [number, number, number]; readonly contactError: number; readonly locked: boolean }[] | undefined;
  readonly footPlantingConfigured?: boolean | undefined;
  readonly diagnostics: readonly AuraRuntimeNodeImportedAssetDiagnostic[];
}

export interface AuraRuntimeNodeImportedAssetDiagnostic {
  readonly severity: "info" | "warning" | "error";
  readonly code:
    | "missing-clip"
    | "missing-bone"
    | "missing-morph"
    | "missing-skeleton"
    | "missing-skinning-palette"
    | "missing-render-items";
  readonly message: string;
}

export interface AuraRuntimeNodeImportedAssetEvidenceInput {
  readonly assetId: string;
  readonly nodeId?: string | undefined;
  readonly skeletonBones?: readonly string[] | undefined;
  readonly clips?: readonly string[] | undefined;
  readonly activeClip?: string | undefined;
  readonly skinningPalette?: {
    readonly jointCount: number;
    readonly matrixCount?: number | undefined;
    readonly updated?: boolean | undefined;
  } | undefined;
  readonly morphTargets?: readonly string[] | undefined;
  readonly activeMorphTargets?: RuntimeNodeMorphTargetWeights | undefined;
  readonly missingMorphTargets?: readonly string[] | undefined;
  readonly bounds?: AuraRuntimeNodeBounds | RuntimeNodeBoundsInput | undefined;
  readonly renderItemCount?: number | undefined;
  readonly skinnedRenderItemCount?: number | undefined;
  readonly morphRenderItemCount?: number | undefined;
  readonly lastMaterialTracksApplied?: number | undefined;
  readonly lastLightTracksApplied?: number | undefined;
  readonly lastFootPlantingGroundedFeet?: number | undefined;
  readonly lastFootPlantingTargetError?: number | undefined;
  readonly lastFootPlantingHipOffset?: number | undefined;
  readonly lastFootPlantingMissingLegs?: readonly string[] | undefined;
  readonly lastFootPlantingDeformation?: TypedGLBActorEvidence["lastFootPlantingDeformation"];
  readonly lastFootPlantingSurfaces?: TypedGLBActorEvidence["lastFootPlantingSurfaces"];
  readonly lastFootPlantingFeet?: readonly { readonly side: "left" | "right"; readonly worldPosition: readonly [number, number, number]; readonly contactError: number; readonly locked: boolean }[] | undefined;
  readonly footPlantingConfigured?: boolean | undefined;
  readonly requiredClips?: readonly string[] | undefined;
  readonly requiredBones?: readonly string[] | undefined;
  readonly requiredMorphTargets?: readonly string[] | undefined;
}

export interface AuraRuntimeNodeRegistry {
  get(id: string): AuraRuntimeNodeHandle | undefined;
  require(id: string): AuraRuntimeNodeHandle;
  has(id: string): boolean;
  ids(): readonly string[];
  all(): readonly AuraRuntimeNodeHandle[];
  // C-37 merge (PR 0a, optional until PRD 15's real add/remove lands)
  add?(node: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>, options?: { readonly parent?: string }): AuraRuntimeNodeHandle;
  remove?(idOrHandle: string | AuraRuntimeNodeHandle): boolean;
  readonly version?: number;
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
  /**
   * The live physics simulation for this app.
   *
   * This is the seam that makes `@aura3d/engine` a game engine rather than a scene
   * declaration format. Before it existed, `.physics({ type: "dynamic" })` let a developer
   * watch a box fall and nothing else: no force, no collision callback, no raycast, no
   * joint. Every genre outside the four bundled kits had no path at all.
   *
   * Bodies declared on scene nodes are registered here under their node name, so
   * `app.physics.bodies.require("crate").applyImpulse([4, 0, 0])` works with no extra setup.
   */
  readonly physics: AuraPhysicsRuntime;
  setScene(scene: AuraSceneBuilder | AuraSceneSnapshot): void;
  /** Apply native renderer quality between completed frames; rejects unsupported particle owners. */
  setPerformanceQuality(settings: AuraPerformanceQuality): void;
  onFrame(callback: AuraFrameCallback): () => void;
  offFrame(callback: AuraFrameCallback): void;
  input(options: GameInputOptions): ReturnType<typeof createGameInput>;
  pause(): void;
  resume(): void;
  /**
   * Resolves once the renderer has finished mounting and a frame can be drawn.
   *
   * WS-2.9. The production WebGL renderer mounts asynchronously, so immediately after
   * `createAuraApp` returns there is a window in which nothing can be drawn yet. `step(dt)` used to
   * fall through to a Canvas-2D path in that window and render nothing, with no warning — a blank
   * image for anyone writing a headless capture or a deterministic test.
   *
   * Awaiting this is the fix, and it exists because a warning that says "wait for the mount" is
   * useless without a way to wait:
   *
   * ```ts
   * const app = createAuraApp(canvas, { scene, autoStart: false });
   * await app.ready();
   * app.step(1 / 60);           // now renders
   * ```
   *
   * Resolves immediately for a scene with no async mount, and resolves — rather than rejecting — if
   * the mount fails, because the failure is already reported through `diagnostics().errors` and a
   * rejection here would make the common `await app.ready()` line throw for a diagnosable condition.
   */
  ready(): Promise<void>;
  /**
   * Subscribe to WebGL context loss. Returns an unsubscribe function.
   *
   * WS-2.6. A lost context is not something a developer can prevent — the browser reclaims GPU
   * resources under memory pressure, on driver reset, or when a tab is backgrounded too long. What they
   * can do is be told, and until 1.6 they could not be: `WebGL2Device` has tracked and handled
   * `webglcontextlost` for a long time, but nothing surfaced it, so the only symptom reaching a
   * developer was a canvas that stopped updating.
   *
   * That distinction is why the parity table listed this as a gap while the listeners existed. The
   * device layer was never the gap; the absence of a public signal was.
   *
   * ```ts
   * app.onDeviceLost(() => showReconnectingOverlay());
   * app.onDeviceRestored(() => hideReconnectingOverlay());
   * ```
   *
   * Registering before the renderer has mounted is safe: the subscription is held and attached when the
   * device arrives, so a caller does not have to await `ready()` first.
   */
  onDeviceLost(listener: () => void): () => void;
  /** Subscribe to WebGL context restoration. Returns an unsubscribe function. See {@link onDeviceLost}. */
  onDeviceRestored(listener: () => void): () => void;
  /** True while the WebGL context is lost, so a caller can check state rather than only react to events. */
  deviceLost(): boolean;
  /**
   * Advance deterministic application state without presenting a rendered frame.
   *
   * This runs the same `onFrame` callbacks and app-owned physics step as {@link step},
   * but deliberately skips renderer submission. Use it for fixed-step simulation,
   * replay, and evidence runs that only need pixels at named milestones; call
   * `step(0)` when a milestone should be presented.
   */
  advance(dt?: number): void;
  step(dt?: number): void;
  /** Submit a native asynchronous production frame. Rejects unavailable or disposed renderers. */
  stepAsync(dt?: number): Promise<void>;
  /** Wait for pending submissions and release renderer resources. */
  disposeAsync(): Promise<void>;
  diagnostics(): AuraDiagnostics;
  evidence(options?: GameRuntimeEvidenceOptions): ReturnType<typeof collectGameRuntimeEvidenceV105>;
  screenshot(): AuraScreenshot;
  dispose(): void;
  // C-38 extension surface (PR 0a, all optional until providers register)
  readonly lighting?: import("../../contracts/app").AuraAppExtensionMap["lighting"];
  readonly camera?: import("../../contracts/app").AuraAppExtensionMap["camera"];
  readonly time?: import("../../contracts/app").AuraAppExtensionMap["time"];
  readonly feel?: import("../../contracts/app").AuraAppExtensionMap["feel"];
  readonly effects?: import("../../contracts/app").AuraAppExtensionMap["effects"];
  readonly atmosphere?: import("../../contracts/app").AuraAppExtensionMap["atmosphere"];
  readonly world?: import("../../contracts/app").AuraAppExtensionMap["world"];
  readonly quality?: import("../../contracts/app").AuraAppExtensionMap["quality"];
  readonly output?: import("../../contracts/app").AuraAppExtensionMap["output"];
  readonly post?: import("../../contracts/app").AuraAppExtensionMap["post"];
  // C-38 flattened methods (PR 0a, all optional)
  setOutput?(output: Partial<import("../../contracts/output").AuraOutputOptions>): void;
  setOutputOverlay?(overlay: import("../../contracts/output").AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" };
  capture?(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>;
  onRendererError?(listener: (e: { readonly code: string; readonly message: string; readonly cause?: unknown }) => void): () => void;
  addPostPass?(p: import("../../contracts/post").AuraCustomPostPass): () => void;
  setQualityTier?(t: import("@aura3d/rendering/contracts").AuraQualityTier | "auto"): void;
  cutCamera?(): void;
  precompile?(snapshot: AuraSceneSnapshot): Promise<unknown>;
  lookSignature?(): Promise<string>;
  lookManifest?(): unknown /* AuraLookManifest (prd09) */;
  onRender?(cb: (f: { readonly alpha: number; readonly realDt: number; readonly simTime: number }) => void): () => void;
}

export interface AuraCreateAppOptions {
  /** Native asynchronous presentation for the automatic loop; synchronous remains the default. */
  readonly frameMode?: "sync" | "async";
  readonly scene: AuraSceneBuilder | AuraSceneSnapshot;
  /**
   * Configuration for {@link AuraApp.physics}.
   *
   * `layers` has to be supplied here rather than per body, because a collision mask is only
   * meaningful relative to the complete set of layers: building the bitmask for "bullet"
   * requires knowing every layer that exists. Without this option a developer could call
   * `createCollisionLayers` and then have nowhere to put the result — which is exactly the
   * hole the clean-room top-down shooter hit, since "bullets hit enemies but not each other"
   * is the first thing any shooter needs.
   */
  readonly physics?: {
    readonly layers?: AuraCollisionLayers | undefined;
    /** World gravity. Defaults to `[0, -9.81, 0]`; top-down games usually want zero. */
    readonly gravity?: readonly [number, number, number] | undefined;
    /** Repeatability seed provenance (H1): recorded on the world, fail-loud unless a finite integer. */
    readonly seed?: number | undefined;
    /** Continuous-collision selection (H1): without this the app world never enables CCD. */
    readonly continuousCollision?: PhysicsContinuousCollisionDescriptor | undefined;
  };
  readonly diagnostics?: boolean | AuraDiagnosticsOptions;
  readonly renderer?: AuraCreateAppRendererOptions;
  /**
   * Native renderer quality applied before the first production frame. Use this
   * when a known device/capture budget must constrain the initial render; later
   * changes use {@link AuraApp.setPerformanceQuality} between completed frames.
   */
  readonly performanceQuality?: AuraPerformanceQuality;
  readonly autoStart?: boolean;
  readonly resize?: boolean;
  // C-38 additions (PR 0a, all optional)
  readonly pixelRatio?: number | { readonly max?: number; readonly min?: number };
  readonly qualityRebuild?: { readonly flags?: readonly string[] };
  readonly lighting?: import("../../contracts/lighting").AuraLightingOptions;
  readonly output?: import("../../contracts/output").AuraOutputOptions;
  readonly assets?: import("../../contracts/assets").AuraAssetsOption;
  readonly animation?: import("../../contracts/animation").AuraCreateAppAnimationOptions;
  readonly camera?: import("../../contracts/camera").AuraCameraOption;
  readonly accessibility?: { readonly reducedMotion?: boolean; readonly reducedFlash?: boolean; readonly highContrast?: boolean };
  readonly strict?: boolean;
  readonly onDegradation?: (d: import("../../contracts/compiler").AuraDegradation) => void;
  readonly compat?: { readonly post?: "3.0" };
  readonly loop?: import("../../contracts/time").AuraLoopOptions;
}

export interface AuraCreateGameAppOptions extends AuraCreateAppOptions {
  readonly loop?: GameAppRuntimeOptions["loop"];
  readonly input?: GameAppRuntimeOptions["input"];
  readonly runtimeEvidence?: GameAppRuntimeOptions["evidence"];
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

/**
 * Control surface for every app mounted on this page.
 *
 * Exposed on `globalThis.__AURA3D_LIVE_APPS__` as well as being exported, so a Playwright
 * `page.evaluate` can reach it without the route having to opt in.
 */
export interface AuraAppRegistry {
  readonly kind: "aura3d-live-app-registry";
  /** Number of apps currently mounted. */
  count(): number;
  /** Pause every app's frame loop. Returns how many were paused. */
  pauseAll(): number;
  /** Resume every app's frame loop. */
  resumeAll(): number;
  /**
   * Pause every app and advance each by a fixed number of fixed-size steps.
   *
   * This is what makes a capture reproducible: rather than photographing an arbitrary moment of a
   * live loop, a caller settles every scene to a *named* frame — the same `steps` and `dt` always
   * produce the same state, so a screenshot hash becomes a stable thing to approve.
   */
  settle(steps?: number, dt?: number): number;
  all(): readonly AuraApp[];
}

export interface WebGLRenderController {
  diagnostics?(): AuraRendererDiagnosticReport | undefined;
  setPerformanceQuality?(settings: AuraPerformanceQuality): void;
  /** Advance renderer-owned actor animation/IK/evidence without presenting pixels. */
  update?(time: number): void;
  render(time?: number): void;
  renderAsync?(time: () => number): Promise<void>;
  busy?(): boolean;
  whenIdle?(): Promise<void>;
  resetTemporalHistory?(reason: string): void;
  pause?(): void;
  resume?(): void;
  dispose(): void;
  /** WS-2.6 — device-loss subscription, when the backing renderer has a real WebGL2 device. */
  onDeviceLost?(listener: () => void): () => void;
  onDeviceRestored?(listener: () => void): () => void;
  deviceLost?(): boolean;
}

export interface ProductionRuntimeActorEntry {
  readonly node: AuraModelNode;
  readonly actor: TypedGLBActor;
  rootMotionCursors?: Map<string, number>;
}

export interface ProductionRuntimePrimitiveEntry {
  readonly node: AuraPrimitiveNode;
  readonly resources: readonly ProductionRuntimePrimitiveResource[];
  currentLodIndex: number;
}

export interface ProductionRuntimePrimitiveResource {
  readonly geometry: Geometry;
  readonly material: PBRMaterial | InstancedPBRMaterial;
  readonly bounds: GltfBounds;
  readonly name: string;
  /** Source material spec (for the C1 textured upgrade); undefined when the node carries none. */
  readonly materialSpec: AuraMaterialSpec | undefined;
  /** Effective primitive node (LOD level node when applicable) for scalar re-derivation on upgrade. */
  readonly sourceNode: AuraPrimitiveNode;
  /**
   * C1 textured upgrade slot. The sync factory always installs a scalar
   * material first; the post-mount upgrade swaps in a TexturedPBRMaterial
   * once authored texture refs resolve. Reads prefer this slot.
   */
  texturedMaterial: TexturedPBRMaterial | null;
  /** Owns decoded bitmap and texture resources created by asynchronous upgrade. */
  textureDisposer?: () => void;
  /** C1 upgrade lifecycle: none (no texture inputs) → pending → textured | fallback. */
  textureStatus: "none" | "pending" | "textured" | "fallback";
  /** Native texture slots bound by the upgrade (subset of baseColor/normal/metallicRoughness). */
  textureSlots: readonly string[];
  /** Per-resource texture warnings (procedural inputs, fetch failures, skips). */
  textureWarnings: string[];
  /**
   * G1 SDF text state. Non-null only when the SDF sampler mounted this
   * resource as atlas-derived quads (textPixelBacked diagnostics source).
   */
  sdfText: {
    readonly quadCount: number;
    readonly imageBytes: number;
    readonly lodFadeNear?: number;
    readonly lodFadeFar?: number;
    readonly occlusionPolicy: SdfTextOcclusionPolicy;
    /** Last per-frame opacity written to the quad material (LOD x occlusion). */
    lastOpacity: number;
    /** Last per-frame visibility (occlusion hide policy skips submission). */
    lastVisible: boolean;
    /** True when quads were submitted on the last frame (pixel-backing leg). */
    lastSubmitted: boolean;
  } | null;
  /**
   * M2 streaming table: resident texture bytes on this resource (base +
   * full mip-chain estimate) feeding the distance-prioritized residency.
   */
  textureBytes: number;
  /** Coarse-to-fine mip-level bytes for the residency funding walk. */
  textureMipBytes: readonly number[];
}

export interface ProductionRuntimePrimitiveState {
  readonly node: AuraPrimitiveNode;
  readonly visible: boolean;
}

export interface ProductionRuntimeLightDescriptor {
  readonly kind: CollectedLight["kind"];
  readonly name: string;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly position: AuraVec3;
  readonly direction: AuraVec3;
  readonly range: number;
  readonly spotAngle: number;
  readonly penumbra: number;
  readonly shadowPriority: number;
  /**
   * N1 explicit shadow request (`lights.spot({ shadow: true })`). Requested
   * descriptors outrank unrequested ones for the single caster slot; when
   * nobody requests, the legacy first-by-priority fallback applies
   * unchanged, so existing scenes render byte-identical maps. Explicit
   * `shadow: false` is retained separately so a negative control can disable
   * the map rather than falling back to an implicit caster.
   */
  readonly shadowRequested: boolean;
  readonly shadowDisabled?: boolean;
  readonly authoredLight: AuraLightType | "fallback";
  readonly authoredWidth?: number;
  readonly authoredHeight?: number;
}

export type AuraFountainParticleLayer = "plume" | "splash" | "mist";

export interface WebGLSceneRenderer {
  readonly backend: AuraBackend;
  readonly diagnostics: AuraRendererDiagnosticReport;
  /** Update CPU-owned runtime actor state without issuing a device submission. */
  update?(time: number): void;
  render(time: number): number;
  renderAsync?(time: number): Promise<number>;
  resetTemporalHistory?(reason: string): void;
  /**
   * View-projection matrix for a frame.
   *
   * Exposed so the world-label layer projects labels with the *same* camera the
   * renderer drew with. Recomputing it independently is how a label layer drifts
   * away from the geometry it annotates.
   */
  viewProjection(time: number): Float32Array;
  /** Resize renderer-owned attachments after the canvas backing store changes. */
  resize?(width: number, height: number): void;
  /**
   * WS-2.6 — device-loss hooks, when this renderer is backed by a real WebGL2 device.
   *
   * Optional because the agent-runtime path owns its `WebGL2RenderingContext` directly rather than a
   * `WebGL2Device`, and the mock/headless paths have no device at all. A caller must therefore treat
   * absence as "no device to lose" rather than assuming the hooks exist.
   */
  onDeviceLost?(listener: () => void): () => void;
  onDeviceRestored?(listener: () => void): () => void;
  deviceLost?(): boolean;
  dispose(): void;
}

export interface WebGLModel {
  readonly node?: AuraModelNode | AuraPrimitiveNode | AuraEffectNode;
  readonly primitives: readonly WebGLPrimitive[];
  readonly bounds: GltfBounds;
  readonly color: readonly [number, number, number];
  readonly normalizeToUnit: boolean;
  readonly modelMatrix?: Float32Array;
  readonly update?: (time: number) => void;
}
