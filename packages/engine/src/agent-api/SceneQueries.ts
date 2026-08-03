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
 * The pure paths are dependency-free and unit-testable; the physics-backed path adapts a
 * `PhysicsWorld` when a route has one.
 */

import type { AuraPrimitiveNode, AuraSceneNode, AuraVec3 } from "./index.js";
import { placedBounds, type PlacedBounds } from "./SpatialAnchoring.js";

export interface SceneRay {
  readonly origin: AuraVec3;
  /** Direction; normalized internally, so a caller may pass any non-zero vector. */
  readonly direction: AuraVec3;
  readonly maxDistance?: number | undefined;
}

export interface SceneQueryHit {
  /** Name of the node that was hit, when the target carries one. */
  readonly nodeName: string | undefined;
  readonly point: AuraVec3;
  readonly normal: AuraVec3;
  readonly distance: number;
}

/**
 * Axis-aligned box a query can test against.
 *
 * Scene nodes are reduced to these, which is exact for boxes and planes and a conservative
 * bound for spheres, cylinders and models. Stated rather than implied: a route needing
 * exact mesh intersection must use a physics world with real colliders.
 */
export interface SceneQueryTarget {
  readonly nodeName: string | undefined;
  readonly bounds: PlacedBounds;
}

/**
 * Reduce declarative scene nodes to query targets.
 *
 * Only nodes with a resolvable position and scale participate. A model's bounds are its
 * node scale, which is a conservative approximation: the caller is told so by
 * {@link SceneQueryTarget}'s documentation rather than discovering it from a wrong result.
 */
export function sceneQueryTargets(nodes: readonly AuraSceneNode[]): readonly SceneQueryTarget[] {
  const targets: SceneQueryTarget[] = [];
  for (const node of nodes) {
    if (node.kind !== "primitive" && node.kind !== "model") continue;
    const positioned = node as AuraPrimitiveNode;
    const position = positioned.position;
    if (!position) continue;
    const scale = positioned.scale;
    const size: AuraVec3 = scale === undefined
      ? [1, 1, 1]
      : typeof scale === "number"
        ? [scale, scale, scale]
        : [scale[0], scale[1], scale[2]];
    targets.push({
      nodeName: (node as { name?: string }).name,
      // Primitive nodes are centred on their position, so the placed bounds' floor is half
      // a height below it.
      bounds: placedBounds({
        position: [position[0], position[1] - size[1] / 2, position[2]],
        size,
        floorY: position[1] - size[1] / 2
      })
    });
  }
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
  if (direction === undefined) return [];
  const maxDistance = ray.maxDistance ?? Number.POSITIVE_INFINITY;
  const hits: SceneQueryHit[] = [];
  for (const target of targets) {
    const hit = intersectAabb(ray.origin, direction, target.bounds, maxDistance);
    if (!hit) continue;
    hits.push({ nodeName: target.nodeName, point: hit.point, normal: hit.normal, distance: hit.distance });
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
  const inflated = targets.map((target) => ({
    nodeName: target.nodeName,
    bounds: inflateBounds(target.bounds, Math.max(0, radius))
  }));
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
