/**
 * PRD-01 lane scene specification types (PRD-01 §17.3, CONTRACTS.md C-30).
 *
 * Lane-owned (`scenes/prdNN/`): the engine-agnostic description of the six lane
 * scenes. Both adapters (`aura3d/scenes/prd01`, `three/scenes/prd01`) consume the
 * same spec object so the only variable between a capture pair is the engine.
 */

export type Vec3 = readonly [number, number, number];

/** Normalized rect (0..1) over the 1280x720 stage, used for masks/regions. */
export interface Prd01Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Prd01Region {
  readonly id: string;
  readonly description: string;
  readonly rect: Prd01Rect;
}

export type Prd01SceneKind =
  | "hierarchy"
  | "tonemap-ramp"
  | "blend-modes"
  | "specular-aa"
  | "primitive-catalog"
  | "draw-throughput";

export interface Prd01CameraSpec {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
}

export interface Prd01LightSpec {
  readonly kind: "ambient" | "directional";
  readonly intensity: number;
  readonly color: string;
  readonly position?: Vec3;
  /**
   * When set the light orbits `orbitCenter` with the given radius/period — the
   * specular-aa scene's "rapid azimuthal light motion".
   */
  readonly orbitCenter?: Vec3;
  readonly orbitRadius?: number;
  readonly orbitPeriodSeconds?: number;
}

export type Prd01BlendMode = "normal" | "additive" | "multiply" | "screen" | "overlay";

export type Prd01ShapeName = "box" | "sphere" | "plane" | "cylinder" | "capsule" | "torus";

export interface Prd01MaterialSpec {
  readonly color: string;
  readonly metalness?: number;
  readonly roughness?: number;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
  readonly blend?: Prd01BlendMode;
}

export interface Prd01Transform {
  readonly position?: Vec3;
  readonly rotation?: Vec3;
  readonly scale?: number | Vec3;
}

/** A primitive plus nested children — the hierarchy scene's recursive group. */
export interface Prd01ShapeNode extends Prd01Transform {
  readonly id: string;
  readonly shape: Prd01ShapeName;
  readonly material: Prd01MaterialSpec;
  readonly size?: number | Vec3;
  readonly children?: readonly Prd01ShapeNode[];
}

export interface Prd01HierarchyContent {
  readonly kind: "hierarchy";
  readonly groups: readonly { readonly id: string; readonly transform: Prd01Transform; readonly children: readonly Prd01ShapeNode[] }[];
}

export interface Prd01TonemapContent {
  readonly kind: "tonemap-ramp";
  /** Linear emissive multipliers (2^-4 .. 2^7). */
  readonly emissiveStops: readonly number[];
  /** 18% grey reflectance swatch (linear). */
  readonly greyLevel: number;
  /** Capture grid: operator x exposure variants. */
  readonly operators: readonly ("aces" | "agx" | "neutral")[];
  readonly exposures: readonly number[];
}

export interface Prd01BlendContent {
  readonly kind: "blend-modes";
  readonly modes: readonly Prd01BlendMode[];
  readonly backColor: string;
  readonly frontColor: string;
  readonly frontOpacity: number;
}

export interface Prd01SpecularContent {
  readonly kind: "specular-aa";
  readonly sphereCount: number;
  readonly metalness: number;
  readonly roughness: number;
}

export interface Prd01CatalogContent {
  readonly kind: "primitive-catalog";
  readonly shapes: readonly Prd01ShapeName[];
}

export interface Prd01ThroughputContent {
  readonly kind: "draw-throughput";
  readonly uniqueMaterials: { readonly rows: number; readonly cols: number };
  readonly instanced: { readonly shape: Prd01ShapeName; readonly count: number; readonly cols: number; readonly spacing: number };
  /**
   * Skinned humans are declared by the PRD but need rigged assets; adapters
   * report mounted vs requested honestly in their capability payloads.
   */
  readonly skinned: { readonly requested: number };
}

export type Prd01SceneContent =
  | Prd01HierarchyContent
  | Prd01TonemapContent
  | Prd01BlendContent
  | Prd01SpecularContent
  | Prd01CatalogContent
  | Prd01ThroughputContent;

export type Prd01MetricName = "mask-iou" | "delta-e" | "mad" | "temporal-sigma" | "throughput";

export interface Prd01MetricPlan {
  readonly name: Prd01MetricName;
  /** Pairwise threshold text from PRD-01 §17.3, recorded verbatim for the report. */
  readonly target: string;
  /** Regions the metric evaluates (subset of `masks` when unspecified). */
  readonly regions: readonly Prd01Region[];
}

export interface Prd01LaneSceneSpec {
  readonly kind: Prd01SceneKind;
  readonly owner: "prd01";
  readonly description: string;
  readonly referenceProfile: "contract";
  readonly qrFlags: readonly ["core"];
  readonly primaryCriterion: string;
  readonly masks: readonly Prd01Region[];
  readonly camera: Prd01CameraSpec;
  readonly background: string;
  readonly lights: readonly Prd01LightSpec[];
  /**
   * `animated` scenes keep running after ready (specular-aa's moving light) so
   * capture strips photograph live motion; others settle to a fixed frame.
   */
  readonly animated?: boolean;
  readonly content: Prd01SceneContent;
  readonly metric: Prd01MetricPlan;
}
