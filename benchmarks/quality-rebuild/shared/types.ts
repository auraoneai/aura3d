import type { HdriAssetId, ModelAssetId } from "./assets";

export type Vec3 = readonly [number, number, number];

export const RESOLUTION = { width: 1280, height: 720, devicePixelRatio: 1 } as const;

/** Tone mapping requested by a scene. "contract" scenes keep "aces-filmic"; showcase scenes may pick agx/neutral. */
export type ToneMappingId = "aces-filmic" | "agx" | "neutral";

export interface CameraSpec {
  readonly position: Vec3;
  readonly target: Vec3;
  /** Vertical field of view in degrees. */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

export interface MaterialSpec {
  /** sRGB hex; both engines convert to linear. */
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
  readonly envMapIntensity?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly sheen?: number;
  readonly sheenColor?: string;
  readonly sheenRoughness?: number;
  readonly transmission?: number;
  readonly thickness?: number;
  readonly ior?: number;
}

export interface TransformSpec {
  readonly position: Vec3;
  /**
   * Euler radians. Aura3D composes Rz * Ry * Rx (see rotationXYZ in the agent
   * API), so the three.js side uses Euler order "ZYX" to match.
   */
  readonly rotation?: Vec3;
  readonly scale?: number | Vec3;
}

export type PrimitiveShape = "box" | "sphere" | "plane" | "cylinder";

export interface PrimitiveObjectSpec extends TransformSpec {
  readonly kind: "primitive";
  readonly name: string;
  readonly shape: PrimitiveShape;
  /**
   * World dimensions before `scale`: box [w,h,d]; sphere [d,d,d];
   * plane [w,1,d] lying on XZ facing +Y; cylinder [d,h,d].
   */
  readonly size: Vec3;
  readonly material: MaterialSpec;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export interface ModelAnimationSpec {
  readonly clip: string;
  /**
   * Clip-local sample time in seconds. With `loop` unset/false the pose is
   * frozen at `time` (captureTime semantics); with `loop: true` the clip plays
   * continuously and `time` is the start offset.
   */
  readonly time: number;
  /**
   * PRD-06 perf-tier scenes (S12): `true` keeps the clip playing across the
   * captured frames instead of freezing the sampled pose — the mixer cost is
   * the thing being measured.
   */
  readonly loop?: boolean;
  /**
   * Runtime node id registered on the model node (`.runtime({ id })`) so lane
   * collectors can address `nodes.get(id)`. `footIk.runtimeId` remains the
   * required spelling inside the foot-IK block; this top-level alias covers
   * objects that need runtime access without foot IK (e.g. spring chains).
   */
  readonly runtimeId?: string;
  /**
   * PRD-06 T4.1 spring chains on the actor (`node.animation.springBones.add`).
   * Serializable so the spec stays data-only; wired through the actor
   * extension when `runtimeId`/`footIk.runtimeId` resolves a runtime node.
   */
  readonly springChains?: readonly ModelSpringChainSpec[];
  /**
   * PRD-06 T3.9: foot-IK request for the frozen pose. Serializable so the spec
   * stays data-only; each adapter builds its own ground query from
   * `SceneSpec.terrain` (aura3d binds `footPlanting`, three drives
   * `CCDIKSolver`).
   */
  readonly footIk?: ModelFootIkSpec;
}

/** T4.1 spring chain — bones in chain order; >= 3 names (the middle bones lag). */
export interface ModelSpringChainSpec {
  readonly bones: readonly string[];
  readonly stiffness: number;
  readonly damping: number;
  readonly relativeDamping?: number;
  readonly gravityScale?: number;
  /** Fixed substep rate (Hz) for the constraint integration. */
  readonly substepHz: number;
}

export interface ModelFootIkSpec {
  readonly legs: readonly ModelFootIkLegSpec[];
  /** Pelvis/hips bone — dropped by the deepest required correction. */
  readonly pelvis?: string;
  /**
   * Runtime node id the aura adapter registers on the model node
   * (`.runtime({ id })`) so lane collectors can address `nodes.get(id)` for
   * socket/`ik.add` access. Required whenever foot IK is requested.
   */
  readonly runtimeId: string;
}

export interface ModelFootIkLegSpec {
  readonly side: "left" | "right";
  /** Bone names of the hip (root), knee (mid), and ankle (end) of the leg chain. */
  readonly hip: string;
  readonly knee: string;
  readonly ankle: string;
  /** Joint-to-sole offset for the ankle bone (meters). */
  readonly ankleHeight?: number;
}

export interface ModelObjectSpec extends TransformSpec {
  readonly kind: "model";
  readonly name: string;
  readonly asset: ModelAssetId;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly animation?: ModelAnimationSpec;
}

export interface InstancedObjectSpec {
  readonly kind: "instanced";
  readonly name: string;
  readonly shape: Exclude<PrimitiveShape, "plane">;
  readonly size: Vec3;
  readonly material: MaterialSpec;
  readonly transforms: readonly TransformSpec[];
  /** Per-instance sRGB hex tint, multiplied with a white base color. */
  readonly colors?: readonly string[];
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export interface ParticleObjectSpec {
  readonly kind: "particles";
  readonly name: string;
  readonly count: number;
  readonly seed: number;
  readonly center: Vec3;
  readonly radius: number;
  readonly height: number;
  readonly color: string;
  /** Sprite world size. */
  readonly size: number;
  readonly blending: "additive";
}

export type ObjectSpec = PrimitiveObjectSpec | ModelObjectSpec | InstancedObjectSpec | ParticleObjectSpec;

/**
 * Light intensities use three.js physical (r155+) units, which is also the unit
 * Aura3D's production renderer compares against in its own parity receipts:
 * directional = lux-like irradiance, point/spot = candela, ambient = irradiance scale.
 */
export type LightSpec =
  | { readonly kind: "ambient"; readonly name: string; readonly color: string; readonly intensity: number }
  | {
      readonly kind: "directional";
      readonly name: string;
      readonly color: string;
      readonly intensity: number;
      readonly position: Vec3;
      readonly target: Vec3;
      readonly castShadow: boolean;
    }
  | {
      readonly kind: "point";
      readonly name: string;
      readonly color: string;
      readonly intensity: number;
      readonly position: Vec3;
      /** Cutoff distance in world units, 0 = physically infinite. */
      readonly range: number;
    }
  | {
      readonly kind: "spot";
      readonly name: string;
      readonly color: string;
      readonly intensity: number;
      readonly position: Vec3;
      readonly target: Vec3;
      /** Half-angle radians. */
      readonly angle: number;
      readonly penumbra: number;
      readonly range: number;
      readonly castShadow: boolean;
    };

export type BackgroundSpec =
  | { readonly kind: "color"; readonly color: string }
  | {
      readonly kind: "hdri";
      readonly hdri: HdriAssetId;
      readonly intensity: number;
      /** Solid color an engine must fall back to when it cannot draw an HDRI background. */
      readonly fallbackColor: string;
    };

export interface EnvironmentSpec {
  readonly hdri: HdriAssetId;
  readonly intensity: number;
  /** Y rotation in radians. */
  readonly rotation: number;
}

export interface ShadowSpec {
  readonly mapSize: number;
  readonly type: "pcf-soft";
  /** Half-extent of the directional shadow orthographic box (three.js). */
  readonly directionalExtent: number;
  readonly bias: number;
  readonly normalBias: number;
}

export interface CsmSpec {
  readonly cascades: number;
  readonly maxFar: number;
  readonly mode: "practical";
}

export interface BloomSpec {
  readonly strength: number;
  readonly radius: number;
  readonly threshold: number;
}

export interface FogSpec {
  readonly color: string;
  /** Exponential-squared density. */
  readonly density: number;
}

/** §9.1/§9.3 showcase-tier overrides — only read when referenceProfile === "showcase". */
export interface ShowcaseSpec {
  /** GTAO settings; null/absent disables the pass. */
  readonly ao?: { readonly radius: number; readonly distanceExponent: number } | null;
  readonly aa?: "msaa4+smaa" | "msaa4";
  /** Product-scene contact shadows (depth silhouette + blur, §9.1). */
  readonly contactShadows?: { readonly size: number; readonly blur: number; readonly darkness: number } | null;
  readonly background?: "hdri" | "grounded-skybox" | "color";
  readonly backgroundBlurriness?: number;
  /** Non-HDRI environment stand-ins (§9.3): RoomEnvironment for interiors. */
  readonly environmentStandIn?: "room-environment";
  readonly anisotropy?: "max";
  /** Shadow-map radius applied by the showcase pipeline (ShadowSpec carries size/bias). */
  readonly shadowRadius?: number;
  /** "stand-in" while a §9.3 2k HDRI / kit request is pending; written to ready.json. */
  readonly assetTier?: "stand-in" | "admitted";
}

export interface SceneSpec {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly purpose: string;
  readonly resolution: typeof RESOLUTION;
  readonly camera: CameraSpec;
  readonly background: BackgroundSpec;
  readonly environment?: EnvironmentSpec;
  readonly toneMapping: ToneMappingId;
  readonly exposure: number;
  readonly lights: readonly LightSpec[];
  readonly objects: readonly ObjectSpec[];
  readonly shadows?: ShadowSpec;
  readonly csm?: CsmSpec;
  readonly bloom?: BloomSpec;
  readonly fog?: FogSpec;
  /** Simulation time (seconds) at which the frame is captured. */
  readonly time: number;
  /** Frames rendered after everything is loaded and before READY is published. */
  readonly settleFrames: number;
  // C-30 additions (PR 0a, optional until PRD 12 makes them required)
  readonly owner?: import("./contracts").SceneOwner;
  readonly referenceProfile?: import("./contracts").ReferenceProfile;
  readonly dprs?: readonly (1 | 2)[];
  readonly masks?: readonly import("./contracts").MaskId[];
  readonly brokenControls?: readonly import("./contracts").BrokenControlId[];
  readonly strip?: import("./contracts").StripSpec;
  /** Showcase-tier pipeline overrides (§9.1). Only for referenceProfile "showcase". */
  readonly showcase?: ShowcaseSpec;
  readonly primaryCriterion?: string;
  readonly primaryRegion?: import("./contracts").RegionId;
  readonly qrFlags?: readonly string[];
  /**
   * PRD-06 T3.9: analytic terrain the lane adapters raycast against (foot-IK
   * ground). Geometry that visualizes the terrain stays in `objects`; this
   * block only parameterizes the height query so both engines test the same
   * surface.
   */
  readonly terrain?: import("./terrain").TerrainSpec;
}

export type CapabilityStatus = "supported" | "partial" | "missing" | "not-applicable";

export interface CapabilityEntry {
  readonly feature: string;
  readonly status: CapabilityStatus;
  readonly detail: string;
}

export interface ReadyPayload {
  readonly engine: "aura3d" | "three";
  readonly scene: string;
  readonly engineVersion: string;
  readonly capabilityLog: readonly CapabilityEntry[];
  readonly drawCalls?: number;
  readonly triangles?: number;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly loadMs: number;
  readonly extra?: Readonly<Record<string, unknown>>;
  // C-30 ReadyPayloadV2 (PRD-12 §7.1). Optional at the type level so lane-owned
  // adapters that still emit a V1 payload stay source-compatible; capture's
  // --strict mode fails any payload missing these fields at runtime. Variants
  // the public API cannot express are never captured — they appear in
  // capabilityLog as broken-control:<id> missing.
  readonly variant?: "default" | "aura3d-tuned" | import("./contracts").BrokenControlId;
  readonly dpr?: 1 | 2;
  readonly appliedExposure?: number | null;
  readonly appliedToneMapping?: string | null;
  readonly lightUnits?: "three-physical" | "aura-internal" | "unknown";
  readonly shadows?: import("./contracts").ShadowReport | null;
  readonly fallbackLightsActive?: boolean | null;
  readonly frameTiming?: import("./contracts").FrameTimingSample;
  readonly assetHashes?: Readonly<Record<string, string>>;
  readonly qrFlags?: readonly string[];
}

export * from "./contracts";
