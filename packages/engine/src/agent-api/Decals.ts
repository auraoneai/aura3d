/**
 * Root gameplay-decals builder (PART C4).
 *
 * The projection geometry is package-level and real
 * (`createProjectedDecalGeometry` / `createRaycastProjectedDecalGeometry` in
 * `@aura3d/rendering`): clipped, normal-offset, UV-mapped triangles. This
 * module is the missing public root surface: `decals.project({ texture, size,
 * fade })` shapes those projections into ordinary root scene nodes so a
 * `createAuraApp` route can author bullet holes, scorch marks, and spray tags
 * without deep-importing the renderer.
 *
 * How a root decal survives the frame:
 * - Geometry carries a normal offset (default 0.012 world units) baked into
 *   the projected vertices, so the decal surface sits provably off its target.
 * - The material is transparent (opacity < 1), which the root production
 *   bridge already maps to blend-on, depthWrite-off, cull-none render state.
 * - The descriptor records the intended polygon offset ({ factor: -2,
 *   units: -2 }) alongside the fade envelope. Root has no native
 *   polygon-offset/depth-fade sampler yet, so grazing-angle z-fighting is
 *   defeated the portable way: the angle fade drives opacity to zero before
 *   the view goes edge-on (see `resolveDecalFadeOpacity`), exactly where
 *   coplanar flicker would appear.
 *
 * Deferred-decal budget note: root renders decals forward as transparent
 * geometry — one draw call per decal. There is no deferred decal pass at
 * root; `AURA_DECAL_MAX_DECALS` (32) is the authoring budget and
 * `decals.telemetry()` reports the live count against it. Exceeding the
 * budget never drops decals silently: telemetry flags `overBudget` and the
 * route decides (fade far decals, recycle, or accept the cost).
 */

import {
  createProjectedDecalGeometry,
  createRaycastProjectedDecalGeometry,
  type ProjectedDecalBox,
  type ProjectedDecalRaycastOptions,
  type ProjectedDecalTriangleMesh
} from "@aura3d/rendering";
import { AuraNodeBuilder } from "./index.js";
import type {
  AuraAssetRef,
  AuraColor,
  AuraMaterialSpec,
  AuraPrimitiveNode,
  AuraSceneNode,
  AuraVec3
} from "./index.js";
import { defineAuraCustomGeometry } from "./RootGeometry.js";

/** Root authoring budget: forward-rendered transparent decals, one draw each. */
export const AURA_DECAL_MAX_DECALS = 32;

/**
 * Deferred-decal budget note, kept next to the constant so routes quote the
 * same sentence as telemetry. Root has no deferred decal pass; decals are
 * forward transparent geometry until one lands.
 */
export const AURA_DECAL_BUDGET_NOTE =
  "Root decals render forward as transparent geometry (one draw call per decal); " +
  `author at most ${AURA_DECAL_MAX_DECALS} live decals per route. A deferred decal pass is roadmap, ` +
  "not a root feature — telemetry flags over-budget scenes instead of dropping decals.";

export interface AuraDecalFadeOptions {
  /** Incidence degrees where the angle fade begins (head-on = 0). Default 55. */
  readonly angleStart?: number;
  /** Incidence degrees where the decal is fully faded (grazing = 90). Default 80. */
  readonly angleEnd?: number;
  /** Distance where the depth fade begins. Default 0 (no near fade). */
  readonly near?: number;
  /** Distance where the decal is fully faded. Default Infinity (no depth fade). */
  readonly far?: number;
}

export interface AuraDecalPolygonOffset {
  readonly factor: number;
  readonly units: number;
}

export interface AuraDecalProjectOptions {
  /** Typed texture asset for the decal albedo. Optional: falls back to `color`. */
  readonly texture?: AuraAssetRef<"texture">;
  /** Flat decal color (linearized by the bridge). Default "#f5f5f5". */
  readonly color?: AuraColor;
  /** World-space width, or [width, height]. Must be positive. */
  readonly size: number | readonly [number, number];
  /** Angle + depth fade envelope. Defaults fade 55°→80°, no depth fade. */
  readonly fade?: AuraDecalFadeOptions;
  /** Base opacity before fading. Default 0.85. Must be in (0, 1). */
  readonly opacity?: number;
  /** World position of the decal center. Default [0, 0, 0]. */
  readonly position?: AuraVec3;
  /** Euler rotation radians applied to the quad. Default [0, 0, 0]. */
  readonly rotation?: AuraVec3;
  /** Surface normal the decal faces; used for fade evaluation. Default [0, 0, 1]. */
  readonly normal?: AuraVec3;
  /** Intended polygon offset, recorded on the descriptor. Default { factor: -2, units: -2 }. */
  readonly polygonOffset?: AuraDecalPolygonOffset;
  /** World units the decal floats off its surface. Default 0.012. */
  readonly normalOffset?: number;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly name?: string;
}

export interface AuraDecalDescriptor {
  readonly size: readonly [number, number];
  readonly baseOpacity: number;
  readonly fade: Required<Pick<AuraDecalFadeOptions, "angleStart" | "angleEnd" | "near">> & {
    readonly far: number;
  };
  readonly polygonOffset: AuraDecalPolygonOffset;
  readonly normalOffset: number;
  readonly normal: AuraVec3;
  readonly textureUrl?: string;
}

/** A root decal node: an ordinary primitive plus its recorded decal descriptor. */
export interface AuraDecalNode extends AuraPrimitiveNode {
  readonly decal: AuraDecalDescriptor;
}

export interface AuraDecalProjectOntoMeshOptions extends Omit<AuraDecalProjectOptions, "position" | "rotation" | "normal" | "size"> {
  /** Source mesh to clip the projection against (positions + normals + indices). */
  readonly mesh: ProjectedDecalTriangleMesh;
  /** Ray from above the surface toward it; the hit orients the projector. */
  readonly ray: { readonly origin: AuraVec3; readonly direction: AuraVec3 };
  /** World-space projector footprint [width, height, depth]. Depth default 0.18. */
  readonly size: number | readonly [number, number] | readonly [number, number, number];
  readonly maxDistance?: number;
  readonly includeBackfaces?: boolean;
  readonly upHint?: AuraVec3;
  readonly shape?: "box" | "ellipse";
  readonly ellipseSegments?: number;
}

export interface AuraDecalFadeSample {
  readonly normal: AuraVec3;
  readonly cameraPosition: AuraVec3;
  readonly decalPosition: AuraVec3;
  readonly distance?: number;
  readonly fade?: AuraDecalFadeOptions;
  readonly baseOpacity?: number;
}

export interface AuraDecalBudgetTelemetry {
  readonly kind: "aura-decal-budget";
  readonly decalCount: number;
  readonly maxDecals: number;
  readonly overBudget: boolean;
  readonly estimatedDrawCalls: number;
  readonly note: string;
  readonly allPolygonOffset: boolean;
  readonly angleFadeDecals: number;
  readonly depthFadeDecals: number;
  /** Largest live decal count observed via `decals.telemetry()` this session. */
  readonly maxObservedDecals: number;
}

const DEFAULT_FADE = { angleStart: 55, angleEnd: 80, near: 0, far: Number.POSITIVE_INFINITY } as const;
const DEFAULT_POLYGON_OFFSET: AuraDecalPolygonOffset = { factor: -2, units: -2 };
const DEFAULT_NORMAL_OFFSET = 0.012;
const DEFAULT_OPACITY = 0.85;

let maxObservedDecals = 0;

function isFiniteVec3(value: readonly number[], label: string): asserts value is AuraVec3 {
  if (value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new Error(`Aura3D decal ${label} must be a finite vec3.`);
  }
}

function resolveSize(size: AuraDecalProjectOptions["size"]): readonly [number, number] {
  const pair = typeof size === "number" ? [size, size] : [...size];
  if (pair.length !== 2 || pair.some((component) => !Number.isFinite(component) || component <= 0)) {
    throw new Error("Aura3D decal size must be a positive number or [width, height] pair.");
  }
  return [pair[0]!, pair[1]!];
}

function resolveProjectorSize(size: AuraDecalProjectOntoMeshOptions["size"]): readonly [number, number, number] {
  const triple = typeof size === "number" ? [size, size, 0.18] : size.length === 2 ? [size[0], size[1], 0.18] : [...size];
  if (triple.length !== 3 || triple.some((component) => !Number.isFinite(component) || component <= 0)) {
    throw new Error("Aura3D decal projector size must be positive ([width, height] or [width, height, depth]).");
  }
  return [triple[0]!, triple[1]!, triple[2]!];
}

function resolveOpacity(opacity: number | undefined): number {
  const value = opacity ?? DEFAULT_OPACITY;
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new Error("Aura3D decal opacity must be in the open interval (0, 1) so the bridge submits transparent depth-safe state.");
  }
  return value;
}

function resolveFade(fade: AuraDecalFadeOptions | undefined): AuraDecalDescriptor["fade"] {
  const angleStart = fade?.angleStart ?? DEFAULT_FADE.angleStart;
  const angleEnd = fade?.angleEnd ?? DEFAULT_FADE.angleEnd;
  const near = fade?.near ?? DEFAULT_FADE.near;
  const far = fade?.far ?? DEFAULT_FADE.far;
  if (!Number.isFinite(angleStart) || !Number.isFinite(angleEnd) || angleStart < 0 || angleEnd <= angleStart || angleEnd > 90) {
    throw new Error("Aura3D decal fade requires 0 <= angleStart < angleEnd <= 90 degrees.");
  }
  if (!Number.isFinite(near) || near < 0) {
    throw new Error("Aura3D decal fade near must be finite and non-negative.");
  }
  if (!(far > near)) {
    throw new Error("Aura3D decal fade far must be greater than near.");
  }
  return { angleStart, angleEnd, near, far };
}

function resolveNormal(normal: AuraVec3 | undefined): AuraVec3 {
  const value = normal ?? [0, 0, 1];
  isFiniteVec3(value, "normal");
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) throw new Error("Aura3D decal normal must be non-zero.");
  return [value[0] / length, value[1] / length, value[2] / length];
}

function resolvePolygonOffset(offset: AuraDecalPolygonOffset | undefined): AuraDecalPolygonOffset {
  const value = offset ?? DEFAULT_POLYGON_OFFSET;
  if (!Number.isFinite(value.factor) || !Number.isFinite(value.units)) {
    throw new Error("Aura3D decal polygonOffset factor and units must be finite.");
  }
  return { factor: value.factor, units: value.units };
}

function resolveNormalOffset(offset: number | undefined): number {
  const value = offset ?? DEFAULT_NORMAL_OFFSET;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Aura3D decal normalOffset must be finite and non-negative.");
  }
  return value;
}

function decalMaterial(
  options: Pick<AuraDecalProjectOptions, "texture" | "color" | "roughness" | "metallic">,
  opacity: number,
): AuraMaterialSpec {
  return {
    ...(options.texture ? { texture: options.texture } : {}),
    ...(options.color ? { color: options.color } : { color: "#f5f5f5" as AuraColor }),
    opacity,
    roughness: options.roughness ?? 0.5,
    metallic: options.metallic ?? 0,
  };
}

/**
 * Author a free-floating root decal quad. Transparent, depth-write-off by
 * bridge convention (opacity < 1), normal-offset intent recorded on the
 * descriptor for the projected path.
 */
export function projectDecal(options: AuraDecalProjectOptions): AuraNodeBuilder<AuraDecalNode> {
  const size = resolveSize(options.size);
  const baseOpacity = resolveOpacity(options.opacity);
  const fade = resolveFade(options.fade);
  const normal = resolveNormal(options.normal);
  const polygonOffset = resolvePolygonOffset(options.polygonOffset);
  const normalOffset = resolveNormalOffset(options.normalOffset);
  if (options.position) isFiniteVec3(options.position, "position");
  if (options.rotation) isFiniteVec3(options.rotation, "rotation");
  const textureUrl = options.texture?.url;
  // The root plane primitive spans XZ ±0.5 facing +Y, so world size maps to
  // scale directly; the descriptor keeps the authored size for telemetry.
  const builder = new AuraNodeBuilder({
    kind: "primitive",
    primitive: "plane",
    name: options.name ?? "aura decal",
    position: options.position,
    rotation: options.rotation,
    scale: [size[0], 1, size[1]] as const,
    material: decalMaterial(options, baseOpacity),
    castShadow: false,
    receiveShadow: false,
    decal: {
      size,
      baseOpacity,
      fade,
      polygonOffset,
      normalOffset,
      normal,
      ...(textureUrl ? { textureUrl } : {}),
    },
  });
  return builder;
}

/**
 * Project a decal onto a source mesh through the real package-level
 * projector and return it as a root `custom` primitive node. The clipped
 * geometry (with baked normal offset + UVs) becomes the node's custom
 * geometry spec; the descriptor matches `projectDecal`.
 */
export function projectDecalOntoMesh(options: AuraDecalProjectOntoMeshOptions): AuraNodeBuilder<AuraDecalNode> {
  const size = resolveProjectorSize(options.size);
  const baseOpacity = resolveOpacity(options.opacity);
  const fade = resolveFade(options.fade);
  const polygonOffset = resolvePolygonOffset(options.polygonOffset);
  const normalOffset = resolveNormalOffset(options.normalOffset);
  isFiniteVec3(options.ray.origin, "ray origin");
  isFiniteVec3(options.ray.direction, "ray direction");
  if (options.upHint) isFiniteVec3(options.upHint, "upHint");
  const raycastOptions: ProjectedDecalRaycastOptions = {
    size,
    normalOffset,
    ...(options.maxDistance === undefined ? {} : { maxDistance: options.maxDistance }),
    ...(options.includeBackfaces === undefined ? {} : { includeBackfaces: options.includeBackfaces }),
    ...(options.upHint === undefined ? {} : { upHint: options.upHint }),
    ...(options.shape === undefined ? {} : { shape: options.shape }),
    ...(options.ellipseSegments === undefined ? {} : { ellipseSegments: options.ellipseSegments }),
  };
  const projected = createRaycastProjectedDecalGeometry(options.mesh, options.ray, raycastOptions);
  const vertexCount = projected.geometry.vertexBuffer.vertexCount;
  const positions: AuraVec3[] = [];
  const normals: AuraVec3[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const position = projected.geometry.vertexBuffer.getAttribute(index, "position");
    const normal = projected.geometry.vertexBuffer.getAttribute(index, "normal");
    positions.push([position[0]!, position[1]!, position[2]!]);
    normals.push([normal[0]!, normal[1]!, normal[2]!]);
  }
  const geometry = defineAuraCustomGeometry({
    positions,
    normals,
    indices: projected.geometry.indexBuffer ? Array.from(projected.geometry.indexBuffer.data) : [],
  });
  const textureUrl = options.texture?.url;
  return new AuraNodeBuilder({
    kind: "primitive",
    primitive: "custom",
    geometry,
    name: options.name ?? "aura projected decal",
    material: decalMaterial(options, baseOpacity),
    castShadow: false,
    receiveShadow: false,
    decal: {
      size: [size[0], size[1]],
      baseOpacity,
      fade,
      polygonOffset,
      normalOffset,
      normal: [...projected.hit.normal] as AuraVec3,
      ...(textureUrl ? { textureUrl } : {}),
    },
  });
}

/** Box-projected variant for callers that already solved placement (no raycast). */
export function projectDecalIntoBox(
  mesh: ProjectedDecalTriangleMesh,
  box: ProjectedDecalBox,
  options: Omit<AuraDecalProjectOptions, "position" | "rotation" | "normal" | "size"> & {
    readonly size?: number | readonly [number, number];
  } = {},
): AuraNodeBuilder<AuraDecalNode> {
  const baseOpacity = resolveOpacity(options.opacity);
  const fade = resolveFade(options.fade);
  const polygonOffset = resolvePolygonOffset(options.polygonOffset);
  const normalOffset = resolveNormalOffset(options.normalOffset);
  const projected = createProjectedDecalGeometry(mesh, {
    ...box,
    normalOffset: box.normalOffset ?? normalOffset,
  });
  const vertexCount = projected.geometry.vertexBuffer.vertexCount;
  const positions: AuraVec3[] = [];
  const normals: AuraVec3[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const position = projected.geometry.vertexBuffer.getAttribute(index, "position");
    const normal = projected.geometry.vertexBuffer.getAttribute(index, "normal");
    positions.push([position[0]!, position[1]!, position[2]!]);
    normals.push([normal[0]!, normal[1]!, normal[2]!]);
  }
  const geometry = defineAuraCustomGeometry({
    positions,
    normals,
    indices: projected.geometry.indexBuffer ? Array.from(projected.geometry.indexBuffer.data) : [],
  });
  const textureUrl = options.texture?.url;
  return new AuraNodeBuilder({
    kind: "primitive",
    primitive: "custom",
    geometry,
    name: options.name ?? "aura projected decal",
    material: decalMaterial(options, baseOpacity),
    castShadow: false,
    receiveShadow: false,
    decal: {
      size: [box.size[0], box.size[1]],
      baseOpacity,
      fade,
      polygonOffset,
      normalOffset: box.normalOffset ?? normalOffset,
      normal: box.basis ? [...box.basis.normal] as AuraVec3 : [0, 0, 1],
      ...(textureUrl ? { textureUrl } : {}),
    },
  });
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluate the decal fade envelope for one camera sample. Head-on and near
 * is `baseOpacity`; past `angleEnd` incidence or `far` distance is 0. Pure
 * and unit-tested; the browser proof probes this against live pixels.
 */
export function resolveDecalFadeOpacity(sample: AuraDecalFadeSample): number {
  const fade = resolveFade(sample.fade);
  const baseOpacity = sample.baseOpacity ?? DEFAULT_OPACITY;
  if (!Number.isFinite(baseOpacity) || baseOpacity < 0 || baseOpacity > 1) {
    throw new Error("Aura3D decal fade baseOpacity must be in [0, 1].");
  }
  isFiniteVec3(sample.normal, "fade normal");
  isFiniteVec3(sample.cameraPosition, "fade cameraPosition");
  isFiniteVec3(sample.decalPosition, "fade decalPosition");
  const toCamera: AuraVec3 = [
    sample.cameraPosition[0] - sample.decalPosition[0],
    sample.cameraPosition[1] - sample.decalPosition[1],
    sample.cameraPosition[2] - sample.decalPosition[2],
  ];
  const distance = sample.distance ?? Math.hypot(toCamera[0], toCamera[1], toCamera[2]);
  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error("Aura3D decal fade distance must be finite and non-negative.");
  }
  if (distance <= 1e-8) return baseOpacity;
  const normalLength = Math.hypot(sample.normal[0], sample.normal[1], sample.normal[2]);
  if (normalLength <= 1e-8) throw new Error("Aura3D decal fade normal must be non-zero.");
  const alignment = Math.max(0, Math.min(1,
    (sample.normal[0] * toCamera[0] + sample.normal[1] * toCamera[1] + sample.normal[2] * toCamera[2]) /
    (normalLength * distance),
  ));
  const incidenceDegrees = Math.acos(alignment) * (180 / Math.PI);
  const angleOpacity = 1 - smoothstep(fade.angleStart, fade.angleEnd, incidenceDegrees);
  const depthOpacity = fade.far === Number.POSITIVE_INFINITY
    ? 1
    : 1 - smoothstep(fade.near, fade.far, distance);
  return Math.max(0, Math.min(1, baseOpacity * angleOpacity * depthOpacity));
}

function isDecalNode(node: AuraSceneNode): node is AuraDecalNode {
  return node.kind === "primitive" && "decal" in node && typeof (node as { decal?: unknown }).decal === "object";
}

/**
 * Max-decal telemetry over a flattened scene (or any node list). Counts
 * decal nodes, compares against `AURA_DECAL_MAX_DECALS`, and records the
 * session max. Never throws on foreign nodes.
 */
export function collectDecalBudgetTelemetry(
  nodes: readonly AuraSceneNode[],
  maxDecals = AURA_DECAL_MAX_DECALS,
): AuraDecalBudgetTelemetry {
  if (!Number.isInteger(maxDecals) || maxDecals <= 0) {
    throw new Error("Aura3D decal telemetry maxDecals must be a positive integer.");
  }
  const decals = nodes.filter(isDecalNode);
  const decalCount = decals.length;
  maxObservedDecals = Math.max(maxObservedDecals, decalCount);
  return {
    kind: "aura-decal-budget",
    decalCount,
    maxDecals,
    overBudget: decalCount > maxDecals,
    estimatedDrawCalls: decalCount,
    note: AURA_DECAL_BUDGET_NOTE,
    allPolygonOffset: decals.every((node) => Number.isFinite(node.decal.polygonOffset.factor) && Number.isFinite(node.decal.polygonOffset.units)),
    angleFadeDecals: decals.filter((node) => node.decal.fade.angleEnd < 90).length,
    depthFadeDecals: decals.filter((node) => node.decal.fade.far < Number.POSITIVE_INFINITY).length,
    maxObservedDecals,
  };
}

/** Reset the session max-observed counter (tests only). */
export function resetDecalTelemetry(): void {
  maxObservedDecals = 0;
}

export const decals = {
  project: projectDecal,
  projectOntoMesh: projectDecalOntoMesh,
  projectIntoBox: projectDecalIntoBox,
  resolveFadeOpacity: resolveDecalFadeOpacity,
  telemetry: collectDecalBudgetTelemetry,
  resetTelemetry: resetDecalTelemetry,
  maxDecals: AURA_DECAL_MAX_DECALS,
  budgetNote: AURA_DECAL_BUDGET_NOTE,
} as const;
