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
  /** Clip-local sample time in seconds; the pose is frozen here. */
  readonly time: number;
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
  readonly primaryCriterion?: string;
  readonly primaryRegion?: import("./contracts").RegionId;
  readonly qrFlags?: readonly string[];
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
