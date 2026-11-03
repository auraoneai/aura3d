/**
 * Reusable scene queries: raycasts, shape casts and ground probes.
 *
 * ## Why this exists
 *
 * The physics audit (`tests/reports/aura3d-physics-audit.json`) classified raycasts, shape
 * casts, penetration resolution, friction, restitution, constraints and continuous
 * collision detection as **unused**: implemented in `@aura3d/physics`, covered by its own
 * suites, and unreachable from the public agent API. A route needing to answer "what is
 * under this point" therefore had two options -- reach into a package's internals, or write
 * the query by hand. Both are the same defect class as the hardcoded contact planes this
 * remediation removed.
 *
 * `PhysicsWorld` already implements `raycast`, `raycastAll`, `sphereCast` and
 * `sphereCastAll`. This module is the public surface over them, plus the pure
 * scene-geometry queries a route usually actually wants: a downward ground probe, and a
 * query against declarative scene nodes rather than a constructed physics world.
 *
 * The scene paths need no initialized physics world or solver; static triangle
 * queries can reuse the solverless mesh BVH. The physics-backed path adapts a
 * `PhysicsWorld` when a route has one.
 */

import type { AuraPrimitiveNode, AuraRuntimeNodeHandle, AuraSceneNode, AuraVec3 } from "./nodes/types.js";
import type { PlacedBounds } from "./SpatialAnchoring.js";
import { eulerToQuaternion, identityMat4Into, localMatrixOf, multiplyMat4Into } from "./sceneGraph.js";
import { normalizeGeometryAttributes } from "./RootGeometry.js";
import { hasPositionQueryCertificate } from "./compiler/customMaterial.js";
import { createProductionPrimitiveGeometry, productionPrimitiveCullMode, resolveProductionPrimitiveScalars } from "./compiler/primitives.js";
import { sourceSceneNodeOf, worldTransformOf } from "./compiler/sceneGraph.js";
import { batchedStateForNode } from "./nodes/batchedState.js";
import { runtimeNodeQueryState } from "./app/runtimeNodes.js";
import { forgetSceneQueryTree, sceneQueryTriangleCandidates } from "./SceneQueryBVH.js";
import { MaterialInstance, type Geometry, type RenderItem } from "@aura3d/rendering";

export interface SceneRay {
  readonly origin: AuraVec3;
  /** Direction; normalized internally, so a caller may pass any non-zero vector. */
  readonly direction: AuraVec3;
  readonly maxDistance?: number | undefined;
}

export interface SceneQueryHit {
  /** Name of the node that was hit, when the target carries one. */
  readonly nodeName: string | undefined;
  readonly nodeId?: string;
  readonly point: AuraVec3;
  readonly normal: AuraVec3;
  readonly distance: number;
  readonly uv?: readonly [number, number];
  readonly faceIndex?: number;
  readonly instanceId?: number;
  /** Identifies the batch whose member was hit. */
  readonly batchId?: string;
  /**
   * Never-reused lifetime identity of the member, scoped to its originating
   * batch state. Equal to the addInstance index until that index is recycled;
   * pass the hit itself (not this number) to lifetime-check a mutation.
   */
  readonly batchMemberId?: string | number;
  /** Opaque state identity for lifetime-checked mutation; not serializable. */
  readonly batchStateToken?: object;
  /** Public instance index (addInstance return) at query time; may be reused later. */
  readonly batchMemberSlot?: number;
  readonly barycentric?: readonly [number, number, number];
}

/** Stable code for a mesh-mode target whose vertex program the CPU cannot reproduce. */
export const SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED = "SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED" as const;

/**
 * A mesh-mode target that was excluded because the GPU positions come from a
 * vertex program the CPU query cannot reproduce (an uncertified custom or
 * portable shader, a shader-displaced or wind-animated item, or a custom
 * program combined with skinning, draw hooks, MVP overrides, instance-rate
 * streams or a geometry matrix). Only position-certified compiled custom
 * programs are queried exactly.
 */
export interface SceneQueryExclusion {
  readonly code: typeof SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED;
  readonly nodeName: string | undefined;
  readonly nodeId?: string;
  readonly reason: string;
}

/** Thrown by mesh-mode `raycast` when `unsupported: "error"` meets an excluded target. */
export class SceneQueryError extends RangeError {
  readonly code: SceneQueryExclusion["code"];
  readonly exclusion: SceneQueryExclusion;
  constructor(exclusion: SceneQueryExclusion) {
    super(`${exclusion.code}: ${exclusion.nodeName ?? exclusion.nodeId ?? "target"} cannot be queried exactly (${exclusion.reason}).`);
    this.name = "SceneQueryError";
    this.code = exclusion.code;
    this.exclusion = exclusion;
  }
}

// raycast is synchronous; the active sink receives exclusions for that call only.
let activeExclusionSink: ((exclusion: SceneQueryExclusion) => void) | undefined;

function excludeVertexProgram(nodeName: string | undefined, nodeId: string | undefined, reason: string): [] {
  activeExclusionSink?.({ code: SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED, nodeName, ...(nodeId === undefined ? {} : { nodeId }), reason });
  return [];
}

/**
 * Axis-aligned box a query can test against.
 *
 * Scene nodes are reduced to these, which is exact for boxes and planes and a conservative
 * bound for spheres, cylinders and models. Use `raycast` in mesh mode when actual
 * submitted triangles are required.
 */
export interface SceneQueryTarget {
  readonly nodeName: string | undefined;
  readonly bounds: PlacedBounds;
  /**
   * threejs-parity L7/SG-10: the node's layer mask (three's `Object3D.layers`).
   * `raycast` filters targets against `options.layers` when both are set.
   */
  readonly layers?: number;
  /** Internal source retained for exact mesh queries. */
  readonly node?: AuraSceneNode;
  readonly worldMatrix?: Float32Array;
}

function batchStateForQuery(node: Extract<AuraSceneNode, { kind: "batched" }>) {
  const source = sourceSceneNodeOf(node);
  return batchedStateForNode(source?.kind === "batched" ? source : node);
}

function batchBounds(node: Extract<AuraSceneNode, { kind: "batched" }>, world: Float32Array): PlacedBounds | undefined {
  const batch = batchStateForQuery(node);
  if (batch.disposed || !isAffineMatrix(world)) return undefined;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const slot of batch.liveSlots()) {
    const geometry = batch.geometries[batch.geometryIdAt(slot)];
    if (!geometry) continue;
    try {
      // The public matrix array and borrowed geometries can change without a
      // batch-version write; do not reuse the batch's cached local union here.
      geometry.vertexBuffer.readBytes(0, 0);
      const member = batch.matrices.slice(slot * 16, slot * 16 + 16);
      if (!isAffineMatrix(member)) continue;
      const bounds = transformedBounds(geometry.bounds.min, geometry.bounds.max, combine(world, member));
      if (![...bounds.min, ...bounds.max].every(Number.isFinite)) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, bounds.min[axis]!);
        max[axis] = Math.max(max[axis]!, bounds.max[axis]!);
      }
    } catch (error) {
      if (error instanceof Error && /disposed/i.test(error.message)) continue;
      throw error;
    }
  }
  if (!Number.isFinite(min[0])) return undefined;
  return { min, max, center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], floorY: min[1] };
}

/**
 * Reduce declarative scene nodes to query targets.
 *
 * Missing transforms use their defaults, including a position at the origin.
 * Model bounds use the node's transformed unit box and are approximate.
 */
export function sceneQueryTargets(nodes: readonly AuraSceneNode[], options: { readonly recursive?: boolean } = {}): readonly SceneQueryTarget[] {
  const targets: SceneQueryTarget[] = [];
  const visit = (node: AuraSceneNode, parent: Float32Array): void => {
    if ("visible" in node && node.visible === false) return;
    const local = worldTransformOf(node)?.matrix ?? localMatrixOf(node as import("./nodes/types.js").AuraTransformSpec, new Float32Array(16));
    const world = new Float32Array(16);
    multiplyMat4Into(world, parent, local);
    if (node.kind === "group") {
      // Opt-in descent (three's `intersectObjects(objects, recursive)`); the
      // historical default stays flat for callers that already flattened.
      if (options.recursive === true) {
        for (const child of node.children) visit(child, world);
      }
      return;
    }
    if (node.kind !== "primitive" && node.kind !== "model" && node.kind !== "batched") return;
    if (node.kind === "batched") {
      const bounds = batchBounds(node, world);
      if (bounds) targets.push({ nodeName: node.name, layers: node.layers, bounds, node, worldMatrix: world });
      return;
    }
    const size = node.kind === "primitive" ? primitiveSize(node) : [1, 1, 1] as const;
    const matrix = withScale(world, size);
    let min: AuraVec3 = [-0.5, -0.5, -0.5];
    let max: AuraVec3 = [0.5, 0.5, 0.5];
    if (node.kind === "primitive" && node.geometry) {
      const positions = normalizeGeometryAttributes(node.geometry).positions;
      [min, max] = positionsBounds(positions);
    }
    targets.push({
      nodeName: node.name,
      layers: node.layers,
      bounds: transformedBounds(min, max, matrix),
      node, worldMatrix: world
    });
  };
  for (const node of nodes) visit(node, identityMat4Into(new Float32Array(16)));
  return targets;
}

/**
 * Cast a ray against query targets, returning the nearest hit.
 *
 * Slab-method AABB intersection: exact for axis-aligned boxes and correct for the
 * conservative bounds of other node kinds.
 */
export function raycastSceneTargets(
  targets: readonly SceneQueryTarget[],
  ray: SceneRay
): SceneQueryHit | undefined {
  return raycastSceneTargetsAll(targets, ray)[0];
}

/** Every hit along a ray, nearest first. */
export function raycastSceneTargetsAll(
  targets: readonly SceneQueryTarget[],
  ray: SceneRay
): readonly SceneQueryHit[] {
  const direction = normalize(ray.direction);
  if (direction === undefined || !ray.origin.every(Number.isFinite)) return [];
  const maxDistance = ray.maxDistance ?? Number.POSITIVE_INFINITY;
  const hits: SceneQueryHit[] = [];
  for (const target of targets) {
    // A target may have been captured before its batch was disposed.
    const bounds = target.node?.kind === "batched" && target.worldMatrix
      ? batchBounds(target.node, target.worldMatrix)
      : target.node?.kind === "batched" && batchStateForQuery(target.node).disposed ? undefined : target.bounds;
    if (!bounds) continue;
    const hit = intersectAabb(ray.origin, direction, bounds, maxDistance);
    if (!hit) continue;
    hits.push({ nodeName: target.nodeName, ...(target.node && "runtime" in target.node && target.node.runtime?.id ? { nodeId: target.node.runtime.id } : {}), point: hit.point, normal: hit.normal, distance: hit.distance });
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

/**
 * Downward ground probe.
 *
 * The query a route asks most often, and the one that was previously answered by a frozen
 * constant. Returns the surface height under a point, or `undefined` when nothing is below
 * it -- which is a meaningful answer, not a reason to substitute zero.
 */
export function groundProbe(
  targets: readonly SceneQueryTarget[],
  x: number,
  z: number,
  options: { readonly fromHeight?: number | undefined; readonly maxDistance?: number | undefined } = {}
): { readonly height: number; readonly normal: AuraVec3; readonly nodeName: string | undefined } | undefined {
  const fromHeight = options.fromHeight ?? 1e4;
  const hit = raycastSceneTargets(targets, {
    origin: [x, fromHeight, z],
    direction: [0, -1, 0],
    maxDistance: options.maxDistance ?? Number.POSITIVE_INFINITY
  });
  if (!hit) return undefined;
  return { height: hit.point[1], normal: hit.normal, nodeName: hit.nodeName };
}

/**
 * Sphere cast against query targets.
 *
 * Implemented by inflating each target's bounds by the sphere radius, which is the standard
 * conservative reduction of a sphere sweep to a ray test. Corners are therefore treated as
 * rounded by radius rather than exactly; that over-reports contact slightly near an edge and
 * never under-reports, which is the safe direction for a clearance query.
 */
export function sphereCastSceneTargets(
  targets: readonly SceneQueryTarget[],
  ray: SceneRay,
  radius: number
): SceneQueryHit | undefined {
  const inflated = targets.flatMap((target) => {
    const bounds = target.node?.kind === "batched" && target.worldMatrix
      ? batchBounds(target.node, target.worldMatrix)
      : target.node?.kind === "batched" && batchStateForQuery(target.node).disposed ? undefined : target.bounds;
    return bounds ? [{ nodeName: target.nodeName, bounds: inflateBounds(bounds, Math.max(0, radius)) }] : [];
  });
  return raycastSceneTargets(inflated, ray);
}

/**
 * Structural shape of the physics world's query surface.
 *
 * Structural rather than a concrete import so this module does not force `@aura3d/physics`
 * into every consumer's graph, and so a test can supply a fake.
 */
export interface PhysicsQueryWorld {
  raycast(origin: AuraVec3, direction: AuraVec3, options?: { readonly maxDistance?: number; readonly mask?: number }): {
    readonly point: readonly [number, number, number];
    readonly normal: readonly [number, number, number];
    readonly distance: number;
    readonly colliderId: number;
    readonly bodyId: number;
  } | undefined;
  sphereCast?(origin: AuraVec3, radius: number, direction: AuraVec3, options?: { readonly maxDistance?: number }): {
    readonly point: readonly [number, number, number];
    readonly normal: readonly [number, number, number];
    readonly distance: number;
  } | undefined;
}

/**
 * Public raycast against a physics world.
 *
 * The adapter that makes `PhysicsWorld.raycast` reachable without a route importing
 * `@aura3d/physics` directly. Returns the same {@link SceneQueryHit} shape as the pure
 * paths, so a route can move between them without changing its call sites.
 */
export function raycastPhysicsWorld(world: PhysicsQueryWorld, ray: SceneRay): SceneQueryHit | undefined {
  const direction = normalize(ray.direction);
  if (direction === undefined) return undefined;
  const hit = world.raycast(ray.origin, direction, ray.maxDistance === undefined ? {} : { maxDistance: ray.maxDistance });
  if (!hit) return undefined;
  return {
    // A physics hit identifies a collider by id; the caller maps that to a name if it needs one.
    nodeName: `collider-${hit.colliderId}`,
    point: [hit.point[0], hit.point[1], hit.point[2]],
    normal: [hit.normal[0], hit.normal[1], hit.normal[2]],
    distance: hit.distance
  };
}

/** Public sphere cast against a physics world, when the world supports one. */
export function sphereCastPhysicsWorld(world: PhysicsQueryWorld, ray: SceneRay, radius: number): SceneQueryHit | undefined {
  if (!world.sphereCast) return undefined;
  const direction = normalize(ray.direction);
  if (direction === undefined) return undefined;
  const hit = world.sphereCast(ray.origin, radius, direction, ray.maxDistance === undefined ? {} : { maxDistance: ray.maxDistance });
  if (!hit) return undefined;
  return {
    nodeName: undefined,
    point: [hit.point[0], hit.point[1], hit.point[2]],
    normal: [hit.normal[0], hit.normal[1], hit.normal[2]],
    distance: hit.distance
  };
}

function inflateBounds(bounds: PlacedBounds, amount: number): PlacedBounds {
  return {
    min: [bounds.min[0] - amount, bounds.min[1] - amount, bounds.min[2] - amount],
    max: [bounds.max[0] + amount, bounds.max[1] + amount, bounds.max[2] + amount],
    center: bounds.center,
    size: [bounds.size[0] + amount * 2, bounds.size[1] + amount * 2, bounds.size[2] + amount * 2],
    floorY: bounds.floorY - amount
  };
}

/** Slab-method ray/AABB intersection. Returns the entry point and its face normal. */
function intersectAabb(
  origin: AuraVec3,
  direction: AuraVec3,
  bounds: PlacedBounds,
  maxDistance: number
): { readonly point: AuraVec3; readonly normal: AuraVec3; readonly distance: number } | undefined {
  let tMin = 0;
  let tMax = maxDistance;
  let hitAxis = 0;
  let hitSign = 1;
  const min = bounds.min;
  const max = bounds.max;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = origin[axis]!;
    const d = direction[axis]!;
    if (Math.abs(d) < 1e-12) {
      // Ray is parallel to this slab: it must already be inside it.
      if (o < min[axis]! || o > max[axis]!) return undefined;
      continue;
    }
    const inverse = 1 / d;
    let near = (min[axis]! - o) * inverse;
    let far = (max[axis]! - o) * inverse;
    let sign = -1;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
      sign = 1;
    }
    if (near > tMin) {
      tMin = near;
      hitAxis = axis;
      hitSign = sign;
    }
    if (far < tMax) tMax = far;
    if (tMin > tMax) return undefined;
  }
  if (tMin > maxDistance) return undefined;
  const normal: AuraVec3 = [0, 0, 0] as unknown as AuraVec3;
  const mutable = normal as unknown as number[];
  mutable[hitAxis] = hitSign;
  return {
    point: [
      origin[0] + direction[0] * tMin,
      origin[1] + direction[1] * tMin,
      origin[2] + direction[2] * tMin
    ],
    normal,
    distance: tMin
  };
}

function normalize(vector: AuraVec3): AuraVec3 | undefined {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!(length > 0) || !Number.isFinite(length)) return undefined;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

// ── SR-03 (threejs-parity L7): public `raycast` ─────────────────────────────

/**
 * Camera input for the screen-space raycast form. Mirrors what
 * `Raycaster.setFromCamera` needs: either a ready view-projection matrix, or a
 * pose (`position` + `target`/`rotation`/`quaternion`) with projection terms
 * (`fov`+`aspect` for perspective, `orthographicSize` for ortho).
 */
export interface SceneRaycastCamera {
  readonly position?: AuraVec3;
  readonly target?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly quaternion?: import("../contracts/sceneGraph.js").AuraQuat;
  readonly up?: AuraVec3;
  /** Vertical field of view in degrees (perspective). */
  readonly fov?: number;
  readonly aspect?: number;
  readonly near?: number;
  readonly far?: number;
  /** Half-height of the orthographic frustum, in world units. */
  readonly orthographicSize?: number;
  readonly viewMatrix?: Float32Array | readonly number[];
  readonly projectionMatrix?: Float32Array | readonly number[];
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
  /**
   * Depth convention of a supplied projection. A reversed matrix maps the
   * near plane to NDC z = +1; logarithmic depth uses a standard matrix.
   * Defaults to standard (as returned by `app.viewProjection`).
   */
  readonly depth?: { readonly mode?: "standard" | "reversed" | "logarithmic" };
}

/** `raycast` ray input: a world ray, or a camera + NDC position (three's `setFromCamera`). */
export type SceneRaycastInput =
  | { readonly origin: AuraVec3; readonly direction: AuraVec3; readonly maxDistance?: number }
  | { readonly camera: SceneRaycastCamera; readonly ndc: readonly [number, number] };

export interface SceneRaycastOptions {
  /** Prebuilt targets, or raw scene nodes (normalized via `sceneQueryTargets`). */
  readonly targets?: readonly (SceneQueryTarget | AuraSceneNode)[];
  /** Scene nodes to query (equivalent to passing them via `targets`). */
  readonly nodes?: readonly AuraSceneNode[];
  /** Mounted handles carry current geometry, instances and animation data. */
  readonly handles?: readonly AuraRuntimeNodeHandle[];
  /** Bounds preserves the historical approximate behavior; mesh tests actual triangles. */
  readonly mode?: "bounds" | "mesh";
  /** Return only the nearest hit (three's `intersectObject` semantics). */
  readonly firstHitOnly?: boolean;
  /** Descend into group children (three's `intersectObjects` recursive flag). Default true. */
  readonly recursive?: boolean;
  /** Layer mask — only targets on intersecting layers participate (three's `Raycaster.layers`). */
  readonly layers?: number;
  /** Minimum hit distance (three's `Raycaster.near`). */
  readonly near?: number;
  /** Maximum hit distance (three's `Raycaster.far`). */
  readonly far?: number;
  /**
   * Mesh mode only: what to do with a target whose vertex program cannot be
   * reproduced on the CPU (code `SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED`).
   * `"skip"` (default) omits it, `"error"` throws a {@link SceneQueryError}
   * before any hit is returned, and a callback receives each exclusion while
   * the target is skipped.
   */
  readonly unsupported?: "skip" | "error" | ((exclusion: SceneQueryExclusion) => void);
}

/**
 * Public three.js-style raycast (SR-03): cast a world ray — or an NDC point
 * through a camera — against scene query targets. Returns every hit nearest
 * first (`firstHitOnly` truncates to the closest, three's `intersectObject`).
 *
 * Bounds mode uses AABBs (see {@link SceneQueryTarget}). Mesh mode intersects
 * triangles and uses published render items for mounted models and primitives.
 */
export function raycast(
  input: SceneRaycastInput,
  options: SceneRaycastOptions = {}
): readonly SceneQueryHit[] {
  const ray = "ndc" in input ? rayFromCameraNdc(input.camera, input.ndc) : input;
  if (!ray) return [];
  if (options.mode !== undefined && options.mode !== "bounds" && options.mode !== "mesh") throw new RangeError("SCENE_QUERY_INVALID_OPTION: mode must be bounds or mesh.");
  const unsupported = options.unsupported ?? "skip";
  if (unsupported !== "skip" && unsupported !== "error" && typeof unsupported !== "function") {
    throw new RangeError("SCENE_QUERY_INVALID_OPTION: unsupported must be skip, error or a callback.");
  }
  const previousSink = activeExclusionSink;
  activeExclusionSink = unsupported === "skip" ? undefined
    : unsupported === "error" ? (exclusion) => { throw new SceneQueryError(exclusion); }
    : unsupported;
  try {
    return raycastWithOptions(ray, options);
  } finally {
    activeExclusionSink = previousSink;
  }
}

function raycastWithOptions(ray: SceneRay, options: SceneRaycastOptions): readonly SceneQueryHit[] {
  const near = options.near ?? 0;
  const far = Math.min(options.far ?? Number.POSITIVE_INFINITY, ray.maxDistance ?? Number.POSITIVE_INFINITY);
  if (!Number.isFinite(near) || near < 0) throw new RangeError("SCENE_QUERY_INVALID_OPTION: near must be finite and non-negative.");
  if (!(Number.isFinite(far) || far === Number.POSITIVE_INFINITY) || far < near) throw new RangeError("SCENE_QUERY_INVALID_OPTION: far must be at least near.");
  const direction = normalize(ray.direction);
  if (!direction || !ray.origin.every(Number.isFinite)) return [];
  const targets = normalizeRaycastTargets(options);
  const mask = options.layers;
  const filtered = mask === undefined
    ? targets
    : targets.filter((target) => ((target.layers ?? 1) & mask) !== 0);
  const hits: SceneQueryHit[] = options.mode === "mesh"
    ? filtered.flatMap((target) => target.node && target.worldMatrix
      ? queryNodeMesh(target.node, target.worldMatrix, ray.origin, direction, near, far)
      : [])
    : [...raycastSceneTargetsAll(filtered, { origin: ray.origin, direction, maxDistance: far }).filter((hit) => hit.distance >= near)];
  for (const handle of options.handles ?? []) {
    const state = runtimeNodeQueryState(handle);
    if (!state) continue;
    const itemLayers = options.mode === "mesh" && (state.node.kind === "model" || state.node.kind === "primitive") && state.renderItems !== undefined;
    if (!itemLayers && mask !== undefined && ((state.node.layers ?? 1) & mask) === 0) continue;
    if (state.node.kind === "batched" && batchStateForQuery(state.node).disposed) continue;
    if (options.mode === "mesh") {
      hits.push(...queryNodeMesh(state.node, state.worldMatrix, ray.origin, direction, near, far, handle, mask));
    } else {
      const bounds = state.node.kind === "batched" ? batchBounds(state.node, state.worldMatrix) : handle.bounds();
      if (!bounds) continue;
      const target: SceneQueryTarget = { nodeName: handle.name, bounds: { ...bounds, floorY: bounds.min[1] } };
      const hit = raycastSceneTargets([target], { origin: ray.origin, direction, maxDistance: far });
      if (hit && hit.distance >= near) hits.push({ ...hit, nodeId: handle.id });
    }
  }
  // ECMAScript stable sorting preserves traversal/face order for equal distances.
  hits.sort((a, b) => a.distance - b.distance);
  return options.firstHitOnly ? hits.slice(0, 1) : hits;
}

/** Convenience nearest-hit form of {@link raycast} (three's `intersectObject`). */
export function raycastFirst(
  input: SceneRaycastInput,
  options: SceneRaycastOptions = {}
): SceneQueryHit | undefined {
  return raycast(input, { ...options, firstHitOnly: true })[0];
}

function normalizeRaycastTargets(options: SceneRaycastOptions): readonly SceneQueryTarget[] {
  const targets: SceneQueryTarget[] = [];
  const nodeBucket: AuraSceneNode[] = [];
  for (const entry of options.targets ?? []) {
    if ("bounds" in entry) targets.push(entry);
    else nodeBucket.push(entry);
  }
  if (options.nodes) nodeBucket.push(...options.nodes);
  if (nodeBucket.length > 0) {
    targets.push(...sceneQueryTargets(nodeBucket, { recursive: options.recursive !== false }));
  }
  return targets;
}

function primitiveSize(node: AuraPrimitiveNode): AuraVec3 {
  const size = node.size ?? 1;
  return typeof size === "number" ? [size, size, size] : size;
}

function withScale(matrix: Float32Array, size: AuraVec3): Float32Array {
  const out = matrix.slice();
  for (let col = 0; col < 3; col += 1) for (let row = 0; row < 4; row += 1) out[col * 4 + row] *= size[col]!;
  return out;
}

function positionsBounds(positions: Float32Array): readonly [AuraVec3, AuraVec3] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis]!, positions[i + axis]!);
    max[axis] = Math.max(max[axis]!, positions[i + axis]!);
  }
  return [min, max];
}

function transformPoint(matrix: ArrayLike<number>, point: AuraVec3): AuraVec3 {
  return [
    matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
    matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
    matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!
  ];
}

function transformedBounds(min: AuraVec3, max: AuraVec3, matrix: Float32Array): PlacedBounds {
  const low: [number, number, number] = [Infinity, Infinity, Infinity];
  const high: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let bits = 0; bits < 8; bits += 1) {
    const point = transformPoint(matrix, [bits & 1 ? max[0] : min[0], bits & 2 ? max[1] : min[1], bits & 4 ? max[2] : min[2]]);
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis]!, point[axis]!);
      high[axis] = Math.max(high[axis]!, point[axis]!);
    }
  }
  return { min: low, max: high, center: [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2], size: [high[0] - low[0], high[1] - low[1], high[2] - low[2]], floorY: low[1] };
}

function combine(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  multiplyMat4Into(out, a, b);
  return out;
}

function queryNodeMesh(node: AuraSceneNode, world: Float32Array, origin: AuraVec3, direction: AuraVec3, near: number, far: number, handle?: AuraRuntimeNodeHandle, layerMask?: number): SceneQueryHit[] {
  const state = handle ? runtimeNodeQueryState(handle) : undefined;
  const nodeId = handle?.id ?? ("runtime" in node ? node.runtime?.id : undefined);
  if (!isAffineMatrix(world)) return [];
  if ((node.kind === "model" || node.kind === "primitive") && state?.renderItems !== undefined) {
    // An empty published list means this frame submitted nothing. Only an
    // absent snapshot permits a primitive's pre-frame declarative fallback.
    return state.renderItems.flatMap((item) => layerMask === undefined || (((item.layerMask ?? node.layers ?? 1) & layerMask) !== 0)
      ? intersectRenderItem(item, node.name, nodeId, origin, direction, near, far) : []);
  }
  // Before a submitted material exists there is no compiler-issued proof:
  // authored custom programs, including batched ones, remain unqueryable.
  if ((node.kind === "primitive" || node.kind === "batched") && (node.material?.kind === "custom" || node.material?.custom)) {
    return excludeVertexProgram(node.name, nodeId, "authored custom program has no submitted position certificate");
  }
  if (node.kind === "model") {
    // A model with no loaded and submitted geometry is not a mesh hit.
    return [];
  }
  if (node.kind === "batched") {
    const batch = batchStateForQuery(node);
    if (batch.disposed) return [];
    const hits: SceneQueryHit[] = [];
    const materialNode: AuraPrimitiveNode = { kind: "primitive", primitive: "box", material: node.material };
    const side = productionPrimitiveCullMode(materialNode, resolveProductionPrimitiveScalars(materialNode).opacity) === "none" ? "double" : "front";
    for (const slot of batch.liveSlots()) {
      const geometry = batch.geometries[batch.geometryIdAt(slot)];
      if (!geometry) continue;
      const batchMemberId = batch.queryMemberIdAt(slot);
      if (!batch.instanced && batchMemberId === undefined) continue;
      const matrix = combine(world, batch.matrices.slice(slot * 16, slot * 16 + 16));
      hits.push(...intersectGeometry(geometry, matrix, origin, direction, near, far, {
        nodeName: node.name, nodeId, side: sideForMatrix(side, matrix),
        ...(batch.instanced ? { instanceId: slot } : {
          batchId: batch.id, batchMemberId, batchStateToken: batch.memberReferenceToken, batchMemberSlot: slot
        })
      }));
    }
    return hits;
  }
  if (node.kind !== "primitive") return [];
  const geometrySpec = state?.geometry ?? node.geometry;
  const currentNode = geometrySpec ? { ...node, geometry: geometrySpec, primitive: "custom" as const } : node;
  const geometry = createProductionPrimitiveGeometry(currentNode);
  try {
    const weights = state?.morphTargets ?? {};
    const morph = geometrySpec?.morphTargets?.map((target) => ({ positions: target.positions }));
    const morphWeights = geometrySpec?.morphTargets?.map((target, index) => {
      const key = target.name ?? String(index);
      return Object.hasOwn(weights, key) ? weights[key]! : 0;
    });
    const side = productionPrimitiveCullMode(node, resolveProductionPrimitiveScalars(node).opacity) === "none" ? "double" : "front";
    const hits: SceneQueryHit[] = [];
    const dense = state?.instanceMatrices;
    if (dense !== undefined || node.instances !== undefined) {
      const count = dense ? dense.length / 16 : node.instances!.length;
      for (let index = 0; index < count; index += 1) {
        const local = dense ? dense.slice(index * 16, index * 16 + 16) : localMatrixOf(node.instances![index]!, new Float32Array(16));
        const matrix = withScale(combine(world, local), primitiveSize(node));
        hits.push(...intersectGeometry(geometry, matrix, origin, direction, near, far, { nodeName: node.name, nodeId, side: sideForMatrix(side, matrix), instanceId: index, morph, morphWeights, temporary: true }));
      }
    } else {
      const matrix = withScale(world, primitiveSize(node));
      hits.push(...intersectGeometry(geometry, matrix, origin, direction, near, far, { nodeName: node.name, nodeId, side: sideForMatrix(side, matrix), morph, morphWeights, temporary: true }));
    }
    return hits;
  } finally {
    geometry.dispose();
  }
}

type QuerySide = "front" | "back" | "double";

/** The forward renderer flips culling for a reflected model/instance matrix. */
function sideForMatrix(side: QuerySide, matrix: Float32Array): QuerySide {
  if (side === "double") return side;
  return hasNegativeHandedness(matrix) ? (side === "front" ? "back" : "front") : side;
}

function hasNegativeHandedness(matrix: Float32Array): boolean {
  const determinant = matrix[0]! * (matrix[5]! * matrix[10]! - matrix[9]! * matrix[6]!)
    - matrix[4]! * (matrix[1]! * matrix[10]! - matrix[9]! * matrix[2]!)
    + matrix[8]! * (matrix[1]! * matrix[6]! - matrix[5]! * matrix[2]!);
  return Number.isFinite(determinant) && determinant < -1e-8;
}

function isAffineMatrix(matrix: ArrayLike<number> | null | undefined): boolean {
  if (!matrix || matrix.length !== 16 || matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) return false;
  for (let i = 0; i < 16; i += 1) if (!Number.isFinite(matrix[i])) return false;
  return true;
}

function queryMatrix(value: Float32Array | readonly number[] | undefined): Float32Array | undefined {
  if (value === undefined) return identityMat4Into(new Float32Array(16));
  if (!isAffineMatrix(value)) return undefined;
  const matrix = value instanceof Float32Array ? value : Float32Array.from(value);
  return isAffineMatrix(matrix) ? matrix : undefined;
}

interface QueryMeshOptions {
  readonly nodeName?: string;
  readonly nodeId?: string;
  readonly side: QuerySide;
  readonly instanceId?: number;
  readonly batchId?: string;
  readonly batchMemberId?: string | number;
  readonly batchStateToken?: object;
  readonly batchMemberSlot?: number;
  readonly drawRange?: { readonly start: number; readonly count: number };
  readonly morph?: readonly { readonly positions?: ArrayLike<number> | readonly (readonly [number, number, number])[] }[];
  readonly morphWeights?: readonly number[];
  readonly skinning?: RenderItem["skinning"];
  /** Declarative primitive fallback owns and disposes this geometry per query. */
  readonly temporary?: boolean;
}

function intersectRenderItem(item: RenderItem, nodeName: string | undefined, nodeId: string | undefined, origin: AuraVec3, direction: AuraVec3, near: number, far: number): SceneQueryHit[] {
  const material = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
  if (material && (material.disposed || !material.renderState)) return [];
  const customShader = material && ("sources" in material || "shaderAuthoredSource" in material
    || (typeof material.shaderKey === "string" && material.shaderKey.startsWith("aura3d/portable/")));
  // Only the actual submitted adapter material can prove its vertex program;
  // an instance can override frame uniforms independently of the base material.
  if (customShader && (item.material !== material || !hasPositionQueryCertificate(material))) {
    return excludeVertexProgram(nodeName, nodeId, "custom program is not position-certified");
  }
  if (item.instanceAttributes?.length || item.label?.startsWith("prd10.wind:")) {
    return excludeVertexProgram(nodeName, nodeId, "vertex program displaces positions");
  }
  if (customShader && (item.skinning || item.onBeforeRender || item.modelViewProjectionMatrix !== undefined
    || (item.instanceTransforms && item.geometry.vertexBuffer.format.streams.some((stream) => stream.stepMode === "instance")))) {
    return excludeVertexProgram(nodeName, nodeId, "custom program combined with skinning, draw hooks, MVP override or instance-rate streams");
  }
  let cullMode: "none" | "front" | "back" | undefined;
  if (customShader && material) {
    const cull = Object.getOwnPropertyDescriptor(material.renderState, "cullMode");
    if (!cull || !("value" in cull) || !["none", "front", "back"].includes(cull.value)) {
      return excludeVertexProgram(nodeName, nodeId, "custom program has no fixed cull mode");
    }
    cullMode = cull.value;
  } else cullMode = material?.renderState.cullMode;
  const side: QuerySide = cullMode === "none" ? "double" : cullMode === "front" ? "back" : "front";
  const model = queryMatrix(item.modelMatrix);
  const geometryMatrix = queryMatrix(item.geometryMatrix);
  if (!model || !geometryMatrix) return [];
  // The certified program reads model/MVP, not u_geometryMatrix. Do not apply
  // an unrepresented geometry transform or pretend it was applied by the GPU.
  if (customShader && geometryMatrix.some((value, index) => value !== (index % 5 === 0 ? 1 : 0))) {
    return excludeVertexProgram(nodeName, nodeId, "custom program ignores the geometry matrix");
  }
  const finish = (hits: SceneQueryHit[]): SceneQueryHit[] => {
    if (!customShader || !material) return hits;
    try {
      // Geometry readers may be user-overridden and can mutate a program or
      // render state during the scan. Do not publish a hit from a stale proof.
      if (item.material !== material || !hasPositionQueryCertificate(material)) return [];
      const cull = Object.getOwnPropertyDescriptor(material.renderState, "cullMode");
      return cull && "value" in cull && cull.value === cullMode ? hits : [];
    } catch {
      return [];
    }
  };
  const base = { nodeName, nodeId, drawRange: item.drawRange, morph: item.morphTargets, morphWeights: item.morphWeights, skinning: item.skinning };
  if (item.instanceTransforms !== undefined || item.instanceCount !== undefined) {
    const hits: SceneQueryHit[] = [];
    if (item.instanceTransforms !== undefined && item.instanceTransforms.length % 16 !== 0) return [];
    const count = item.instanceTransforms ? item.instanceTransforms.length / 16 : item.instanceCount!;
    if (!Number.isSafeInteger(count) || count < 0 || (item.instanceCount !== undefined && item.instanceCount !== count)) return [];
    for (let index = 0; index < count; index += 1) {
      const local = identityMat4Into(new Float32Array(16));
      if (item.instanceTransforms) for (let i = 0; i < 16; i += 1) local[i] = item.instanceTransforms[index * 16 + i]!;
      if (!isAffineMatrix(local)) return [];
      const instanceModel = combine(model, local);
      const matrix = combine(instanceModel, geometryMatrix);
      hits.push(...intersectGeometry(item.geometry, matrix, origin, direction, near, far, { ...base, side: sideForMatrix(side, matrix), instanceId: index }));
    }
    return finish(hits);
  }
  const matrix = combine(model, geometryMatrix);
  return finish(intersectGeometry(item.geometry, matrix, origin, direction, near, far, { ...base, side: sideForMatrix(side, matrix) }));
}

/** Read the values presented to a floating-point shader attribute. */
function queryVertexAttribute(geometry: Geometry, index: number, semantic: "position" | "uv" | "joints" | "joints1" | "weights" | "weights1", instanceId = 0): readonly number[] {
  const buffer = geometry.getAttributeBuffer(semantic);
  const stream = buffer.format.streams.find((candidate) => candidate.slot === buffer.bufferSlot)!;
  const record = stream.stepMode === "instance" ? Math.floor(instanceId / stream.divisor) : index;
  return buffer.getDecodedAttribute(record, semantic);
}

function intersectGeometry(geometry: Geometry, matrix: Float32Array, origin: AuraVec3, direction: AuraVec3, near: number, far: number, options: QueryMeshOptions): SceneQueryHit[] {
  try {
    return intersectReadableGeometry(geometry, matrix, origin, direction, near, far, options);
  } catch (error) {
    // Retired resources and malformed stream lengths are not queryable. Do not
    // turn unrelated programming errors into apparent geometric misses.
    if (error instanceof Error && /disposed|out of (?:range|bounds)|no vertex buffer|does not match/i.test(error.message)) {
      forgetSceneQueryTree(geometry);
      return [];
    }
    throw error;
  }
}

function intersectReadableGeometry(geometry: Geometry, matrix: Float32Array, origin: AuraVec3, direction: AuraVec3, near: number, far: number, options: QueryMeshOptions): SceneQueryHit[] {
  if (!isAffineMatrix(matrix)) return [];
  if (geometry.topology !== "triangles" || !geometry.vertexBuffer.format.hasAttribute("position")) return [];
  const vertices = geometry.vertexBuffer;
  if (vertices.format.getAttribute("position").components < 3) return [];
  geometry.indexBuffer?.assertReadable();
  const indices = geometry.indexBuffer?.data;
  const count = indices?.length ?? vertices.vertexCount;
  const validRange = (range: QueryMeshOptions["drawRange"]): boolean => range === undefined ||
    (Number.isSafeInteger(range.start) && range.start >= 0 && (range.count === Infinity || (Number.isSafeInteger(range.count) && range.count >= 0)));
  if (!validRange(geometry.drawRange) || !validRange(options.drawRange)) return [];
  if ((options.morph === undefined) !== (options.morphWeights === undefined) || (options.morph && options.morph.length !== options.morphWeights!.length)) return [];
  if (options.morph?.some((target, index) => {
    const weight = options.morphWeights![index]!;
    if (!target) return true;
    const values = target.positions;
    if (!Number.isFinite(weight)) return true;
    if (!values || weight === 0) return false;
    const tuple = Array.isArray(values[0]);
    if (values.length !== vertices.vertexCount * (tuple ? 1 : 3)) return true;
    for (let i = 0; i < vertices.vertexCount; i += 1) {
      const point = tuple ? values[i] as readonly number[] : [values[i * 3], values[i * 3 + 1], values[i * 3 + 2]];
      if (!point || point.length !== 3 || !point.every(Number.isFinite)) return true;
    }
    return false;
  })) return [];
  if (options.skinning) {
    const skin = options.skinning;
    const names = skin.extraInfluences ? ["joints", "weights", "joints1", "weights1"] as const : ["joints", "weights"] as const;
    if (!Number.isSafeInteger(skin.jointCount) || skin.jointCount <= 0 || !(skin.matrices instanceof Float32Array) || skin.matrices.length < skin.jointCount * 16 ||
      names.some((name) => !vertices.format.hasAttribute(name) || vertices.format.getAttribute(name).components !== 4)) return [];
    for (let joint = 0; joint < skin.jointCount; joint += 1) {
      if (!isAffineMatrix(skin.matrices.subarray(joint * 16, joint * 16 + 16))) return [];
    }
  }
  // The renderer intersects an item's draw range with the geometry's own
  // range; an item override does not make hidden geometry triangles visible.
  const geometryStart = Math.max(0, geometry.drawRange?.start ?? 0);
  const geometryEnd = geometry.drawRange
    ? Math.min(count, geometryStart + Math.max(0, geometry.drawRange.count))
    : count;
  const start = Math.max(geometryStart, options.drawRange?.start ?? 0);
  const end = Math.min(geometryEnd, options.drawRange ? options.drawRange.start + options.drawRange.count : count);
  // The cached tree only rejects impossible static triangles; all accepted
  // triangles still use the same world-space sidedness, UV and hit calculation.
  // Live deformation and temporary geometries retain the original full scan.
  const candidates = !options.temporary && !options.skinning && !options.morph?.length
    ? sceneQueryTriangleCandidates(geometry, matrix, origin, direction, start, end)
    : undefined;
  const hitList: SceneQueryHit[] = [];
  const vertex = (index: number): AuraVec3 | undefined => {
    const p = queryVertexAttribute(geometry, index, "position", options.instanceId);
    let x = p[0]!, y = p[1]!, z = p[2]!;
    options.morph?.forEach((target, targetIndex) => {
      const values = target.positions;
      const weight = options.morphWeights?.[targetIndex] ?? 0;
      if (!values || !weight) return;
      const first = values[index];
      if (Array.isArray(first)) { x += first[0]! * weight; y += first[1]! * weight; z += first[2]! * weight; }
      else { const flat = values as ArrayLike<number>; x += (flat[index * 3] ?? 0) * weight; y += (flat[index * 3 + 1] ?? 0) * weight; z += (flat[index * 3 + 2] ?? 0) * weight; }
    });
    if (options.skinning && vertices.format.hasAttribute("joints") && vertices.format.hasAttribute("weights")) {
      let sx = 0, sy = 0, sz = 0, totalWeight = 0, valid = true;
      const apply = (jointName: "joints" | "joints1", weightName: "weights" | "weights1") => {
        if (!vertices.format.hasAttribute(jointName) || !vertices.format.hasAttribute(weightName)) return;
        const joints = queryVertexAttribute(geometry, index, jointName, options.instanceId), weights = queryVertexAttribute(geometry, index, weightName, options.instanceId);
        for (let i = 0; i < weights.length; i += 1) {
          const weight = weights[i] ?? 0, joint = joints[i] ?? 0;
          if (!weight) continue;
          if (!Number.isFinite(weight) || !Number.isInteger(joint) || joint < 0 || joint >= options.skinning!.jointCount) { valid = false; continue; }
          const point = transformPoint(options.skinning!.matrices.subarray(joint * 16, joint * 16 + 16), [x, y, z]);
          sx += point[0] * weight; sy += point[1] * weight; sz += point[2] * weight;
          totalWeight += weight;
        }
      };
      apply("joints", "weights");
      if (options.skinning.extraInfluences) apply("joints1", "weights1");
      if (!valid || !Number.isFinite(totalWeight) || Math.abs(totalWeight) < 1e-12) return undefined;
      // The shader blends homogeneous matrices; after perspective division,
      // a non-unit weight sum divides the blended xyz by the same sum.
      x = sx / totalWeight; y = sy / totalWeight; z = sz / totalWeight;
    }
    const result = transformPoint(matrix, [x, y, z]);
    return result.every(Number.isFinite) ? result : undefined;
  };
  for (let index = 0; ; index += 1) {
    const offset = candidates ? candidates[index] : start + index * 3;
    if (offset === undefined || offset + 2 >= end) break;
    const a = indices?.[offset] ?? offset, b = indices?.[offset + 1] ?? offset + 1, c = indices?.[offset + 2] ?? offset + 2;
    if (a >= vertices.vertexCount || b >= vertices.vertexCount || c >= vertices.vertexCount) continue;
    const pa = vertex(a), pb = vertex(b), pc = vertex(c);
    if (!pa || !pb || !pc) continue;
    const edge1: AuraVec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const edge2: AuraVec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const geometricNormal = cross(edge1, edge2);
    const orientation = hasNegativeHandedness(matrix) ? -1 : 1;
    const normal = normalize([geometricNormal[0] * orientation, geometricNormal[1] * orientation, geometricNormal[2] * orientation]);
    if (!normal) continue;
    const pvec = cross(direction, edge2);
    const determinant = edge1[0] * pvec[0] + edge1[1] * pvec[1] + edge1[2] * pvec[2];
    if (Math.abs(determinant) < 1e-12 || (options.side === "front" && determinant <= 0) || (options.side === "back" && determinant >= 0)) continue;
    const inverse = 1 / determinant;
    const tvec: AuraVec3 = [origin[0] - pa[0], origin[1] - pa[1], origin[2] - pa[2]];
    const u = (tvec[0] * pvec[0] + tvec[1] * pvec[1] + tvec[2] * pvec[2]) * inverse;
    if (u < 0 || u > 1) continue;
    const qvec = cross(tvec, edge1);
    const v = (direction[0] * qvec[0] + direction[1] * qvec[1] + direction[2] * qvec[2]) * inverse;
    if (v < 0 || u + v > 1) continue;
    const distance = (edge2[0] * qvec[0] + edge2[1] * qvec[1] + edge2[2] * qvec[2]) * inverse;
    if (!Number.isFinite(distance) || distance < near || distance > far) continue;
    const w = 1 - u - v;
    let uv: readonly [number, number] | undefined;
    if (vertices.format.hasAttribute("uv") && vertices.format.getAttribute("uv").components >= 2) {
      const ua = queryVertexAttribute(geometry, a, "uv", options.instanceId), ub = queryVertexAttribute(geometry, b, "uv", options.instanceId), uc = queryVertexAttribute(geometry, c, "uv", options.instanceId);
      uv = [ua[0]! * w + ub[0]! * u + uc[0]! * v, ua[1]! * w + ub[1]! * u + uc[1]! * v];
      if (!uv.every(Number.isFinite)) continue;
    }
    hitList.push({ nodeName: options.nodeName, ...(options.nodeId === undefined ? {} : { nodeId: options.nodeId }),
      distance, point: [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance],
      normal, faceIndex: Math.floor(offset / 3), barycentric: [w, u, v], ...(uv ? { uv } : {}),
      ...(options.instanceId === undefined ? {} : { instanceId: options.instanceId }),
      ...(options.batchId === undefined ? {} : { batchId: options.batchId }),
      ...(options.batchMemberId === undefined ? {} : { batchMemberId: options.batchMemberId }),
      ...(options.batchStateToken === undefined ? {} : { batchStateToken: options.batchStateToken }),
      ...(options.batchMemberSlot === undefined ? {} : { batchMemberSlot: options.batchMemberSlot }) });
  }
  return hitList;
}

/**
 * three's `Raycaster.setFromCamera`: NDC `(x, y)` in [-1, 1] becomes a world
 * ray. With a view-projection matrix the ray is unprojected exactly; a pose +
 * `fov`/`aspect` (or `orthographicSize`) is reduced analytically.
 */
function rayFromCameraNdc(camera: SceneRaycastCamera, ndc: readonly [number, number]): SceneRay | undefined {
  const vp = toFloat32Array(camera.viewProjectionMatrix)
    ?? multiplyMat4(
      toFloat32Array(camera.projectionMatrix),
      toFloat32Array(camera.viewMatrix)
    );
  if (vp) {
    const inv = invertMat4(vp);
    if (!inv) return undefined;
    const nearZ = camera.depth?.mode === "reversed" ? 1 : -1;
    const near = unprojectPoint(inv, ndc[0], ndc[1], nearZ);
    const far = unprojectPoint(inv, ndc[0], ndc[1], -nearZ);
    if (!near || !far) return undefined;
    const direction = normalize([far[0] - near[0], far[1] - near[1], far[2] - near[2]]);
    return direction ? { origin: near, direction } : undefined;
  }
  const position = camera.position;
  if (!position) return undefined;
  const forward = cameraForward(camera);
  if (!forward) return undefined;
  const up = normalize(camera.up ?? [0, 1, 0]) ?? [0, 1, 0];
  const right = normalize(cross(forward, up)) ?? [1, 0, 0];
  const upOnCamera = cross(right, forward);
  if (camera.orthographicSize !== undefined) {
    const aspect = camera.aspect ?? 1;
    const halfH = camera.orthographicSize;
    const halfW = halfH * aspect;
    return {
      origin: [
        position[0] + right[0] * ndc[0] * halfW + upOnCamera[0] * ndc[1] * halfH,
        position[1] + right[1] * ndc[0] * halfW + upOnCamera[1] * ndc[1] * halfH,
        position[2] + right[2] * ndc[0] * halfW + upOnCamera[2] * ndc[1] * halfH
      ],
      direction: forward
    };
  }
  const aspect = camera.aspect ?? 1;
  const tanHalf = Math.tan((camera.fov ?? 50) * Math.PI / 360);
  const direction = normalize([
    forward[0] + right[0] * ndc[0] * tanHalf * aspect + upOnCamera[0] * ndc[1] * tanHalf,
    forward[1] + right[1] * ndc[0] * tanHalf * aspect + upOnCamera[1] * ndc[1] * tanHalf,
    forward[2] + right[2] * ndc[0] * tanHalf * aspect + upOnCamera[2] * ndc[1] * tanHalf
  ]);
  return direction ? { origin: [...position] as AuraVec3, direction } : undefined;
}

function cameraForward(camera: SceneRaycastCamera): AuraVec3 | undefined {
  if (camera.target && camera.position) {
    return normalize([
      camera.target[0] - camera.position[0],
      camera.target[1] - camera.position[1],
      camera.target[2] - camera.position[2]
    ]);
  }
  // Quaternion (or euler, converted through the engine's own convention)
  // rotates three's -Z forward: forward = -(third column of R(q)).
  const q = camera.quaternion ?? (camera.rotation ? eulerToQuaternion(camera.rotation) : undefined);
  if (q) {
    const [qx, qy, qz, qw] = q;
    return normalize([
      -2 * (qx * qz + qw * qy),
      -2 * (qy * qz - qw * qx),
      2 * (qx * qx + qy * qy) - 1
    ]);
  }
  return [0, 0, -1];
}

function cross(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function toFloat32Array(value: Float32Array | readonly number[] | undefined): Float32Array | undefined {
  if (!value || value.length !== 16) return undefined;
  return value instanceof Float32Array ? value : Float32Array.from(value);
}

function multiplyMat4(a: Float32Array | undefined, b: Float32Array | undefined): Float32Array | undefined {
  if (!a || !b) return undefined;
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] =
        a[r]! * b[c * 4]! +
        a[4 + r]! * b[c * 4 + 1]! +
        a[8 + r]! * b[c * 4 + 2]! +
        a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

function invertMat4(m: Float32Array): Float32Array | undefined {
  const inv = new Float32Array(16);
  const m00 = m[0]!, m01 = m[1]!, m02 = m[2]!, m03 = m[3]!;
  const m10 = m[4]!, m11 = m[5]!, m12 = m[6]!, m13 = m[7]!;
  const m20 = m[8]!, m21 = m[9]!, m22 = m[10]!, m23 = m[11]!;
  const m30 = m[12]!, m31 = m[13]!, m32 = m[14]!, m33 = m[15]!;
  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return undefined;
  det = 1.0 / det;
  inv[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
  inv[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det;
  inv[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
  inv[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det;
  inv[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det;
  inv[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
  inv[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det;
  inv[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
  inv[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
  inv[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det;
  inv[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
  inv[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
  inv[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
  inv[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
  inv[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
  inv[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
  return inv;
}

function unprojectPoint(inv: Float32Array, x: number, y: number, z: number): AuraVec3 | undefined {
  const px = inv[0]! * x + inv[4]! * y + inv[8]! * z + inv[12]!;
  const py = inv[1]! * x + inv[5]! * y + inv[9]! * z + inv[13]!;
  const pz = inv[2]! * x + inv[6]! * y + inv[10]! * z + inv[14]!;
  const pw = inv[3]! * x + inv[7]! * y + inv[11]! * z + inv[15]!;
  if (!pw || !Number.isFinite(pw)) return undefined;
  return [px / pw, py / pw, pz / pw];
}
