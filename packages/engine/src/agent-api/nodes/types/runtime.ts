// Split from nodes/types.ts (PRD-15 T3.9 max-file-lines): runtime/app-facing
// interfaces moved here verbatim; re-exported through ../types.js unchanged.

import type { AnimationPose } from "@aura3d/animation";
import type { AuraCollisionLayers, AuraPhysicsRuntime } from "../../PhysicsRuntime.js";
import type { AuraNodeBuilder } from "../builder.js";
import type { AuraPerformanceQuality } from "../../RootRuntimeSupport.js";
import type { AuraRuntimeNodeAnimationPoseBindingMetadata, AuraRuntimeNodeAnimationBindingMetadata, AuraRuntimeNodeBounds, AuraRuntimeNodeEffectAttachment, RuntimeNodeBoundsInput, RuntimeNodeMorphTargetWeights } from "../../RuntimeNodeHandle";
import type { AuraSceneBuilder, scene } from "../scene.js";
import type { PhysicsContinuousCollisionDescriptor } from "@aura3d/physics";
import type { GameAppRuntimeOptions } from "../../GameAppRuntime";
import type { createGameInput, GameInputOptions } from "../../GameRuntime";
import type { GltfBounds } from "../../compiler/gltfRuntime.js";
import type { SdfTextOcclusionPolicy, Geometry, InstancedPBRMaterial, PBRMaterial, TexturedPBRMaterial, CollectedLight } from "@aura3d/rendering";
import type { TypedGLBActor, TypedGLBActorEvidence } from "../../../production-runtime/TypedGLBActor.js";
import type { WebGLPrimitive } from "../../compiler/webglRuntime.js";
import type { animation } from "../animation.js";
import type { effects } from "../effects.composite.js";
import type { geometry } from "../geometry.js";
import type { interactions } from "../interactions.js";
import type { labels } from "../labels.js";
import type { performance } from "../../performanceEvidence.js";
import type { physics } from "../physics.js";
import type { primitives } from "../primitives.js";
import type { renderer } from "../../rendererDiagnostics.js";
import type { camera } from "../camera.js";
import type { collectGameRuntimeEvidence as collectGameRuntimeEvidenceV105, GameRuntimeEvidence, GameRuntimeEvidenceOptions } from "../../GameEvidence";
import type { material } from "../material.js";
import type { assets } from "../../AssetDecoders.js";
import type {
  AuraAnimationSpec,
  AuraAssetProvenance,
  AuraBackend,
  AuraCameraMode,
  AuraCreateAppRendererOptions,
  AuraDiagnostics,
  AuraEffectNode,
  AuraHelperBudgetId,
  AuraHelperPerformanceBudget,
  AuraInteractionNode,
  AuraLabelNode,
  AuraLightType,
  AuraMaterialSpec,
  AuraModelNode,
  AuraPrimitiveNode,
  AuraRendererDiagnosticReport,
  AuraSceneNode,
  AuraSceneSnapshot,
  AuraVec3
} from "../types.js";

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
  /** C-37 (PRD 15): per-node version counter, incremented by every mutator on the handle. */
  readonly version: number;
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
  readonly lighting?: import("../../../contracts/app").AuraAppExtensionMap["lighting"];
  readonly camera?: import("../../../contracts/app").AuraAppExtensionMap["camera"];
  readonly time?: import("../../../contracts/app").AuraAppExtensionMap["time"];
  readonly feel?: import("../../../contracts/app").AuraAppExtensionMap["feel"];
  readonly effects?: import("../../../contracts/app").AuraAppExtensionMap["effects"];
  readonly atmosphere?: import("../../../contracts/app").AuraAppExtensionMap["atmosphere"];
  readonly world?: import("../../../contracts/app").AuraAppExtensionMap["world"];
  readonly quality?: import("../../../contracts/app").AuraAppExtensionMap["quality"];
  readonly output?: import("../../../contracts/app").AuraAppExtensionMap["output"];
  readonly post?: import("../../../contracts/app").AuraAppExtensionMap["post"];
  // C-38 flattened methods (PR 0a, all optional)
  setOutput?(output: Partial<import("../../../contracts/output").AuraOutputOptions>): void;
  setOutputOverlay?(overlay: import("../../../contracts/output").AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" };
  capture?(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>;
  onRendererError?(listener: (e: { readonly code: string; readonly message: string; readonly cause?: unknown }) => void): () => void;
  addPostPass?(p: import("../../../contracts/post").AuraCustomPostPass): () => void;
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
  readonly lighting?: import("../../../contracts/lighting").AuraLightingOptions;
  readonly output?: import("../../../contracts/output").AuraOutputOptions;
  readonly assets?: import("../../../contracts/assets").AuraAssetsOption;
  readonly animation?: import("../../../contracts/animation").AuraCreateAppAnimationOptions;
  readonly camera?: import("../../../contracts/camera").AuraCameraOption;
  readonly accessibility?: { readonly reducedMotion?: boolean; readonly reducedFlash?: boolean; readonly highContrast?: boolean };
  readonly strict?: boolean;
  readonly onDegradation?: (d: import("../../../contracts/compiler").AuraDegradation) => void;
  readonly compat?: { readonly post?: "3.0" };
  readonly loop?: import("../../../contracts/time").AuraLoopOptions;
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

