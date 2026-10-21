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

import type { AuraPrimitiveNode, AuraSceneNode, AuraVec3 } from "./nodes/types.js";
import { placedBounds, type PlacedBounds } from "./SpatialAnchoring.js";
import { eulerToQuaternion } from "./sceneGraph.js";

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
  /**
   * threejs-parity L7/SG-10: the node's layer mask (three's `Object3D.layers`).
   * `raycast` filters targets against `options.layers` when both are set.
   */
  readonly layers?: number;
}

/**
 * Reduce declarative scene nodes to query targets.
 *
 * Only nodes with a resolvable position and scale participate. A model's bounds are its
 * node scale, which is a conservative approximation: the caller is told so by
 * {@link SceneQueryTarget}'s documentation rather than discovering it from a wrong result.
 */
export function sceneQueryTargets(nodes: readonly AuraSceneNode[], options: { readonly recursive?: boolean } = {}): readonly SceneQueryTarget[] {
  const targets: SceneQueryTarget[] = [];
  const visit = (node: AuraSceneNode): void => {
    if (node.kind === "group") {
      // Opt-in descent (three's `intersectObjects(objects, recursive)`); the
      // historical default stays flat for callers that already flattened.
      if (options.recursive === true) {
        for (const child of node.children) visit(child);
      }
      return;
    }
    if (node.kind !== "primitive" && node.kind !== "model") return;
    const positioned = node as AuraPrimitiveNode;
    const position = positioned.position;
    if (!position) return;
    const scale = positioned.scale;
    const size: AuraVec3 = scale === undefined
      ? [1, 1, 1]
      : typeof scale === "number"
        ? [scale, scale, scale]
        : [scale[0], scale[1], scale[2]];
    targets.push({
      nodeName: (node as { name?: string }).name,
      layers: positioned.layers,
      // Primitive nodes are centred on their position, so the placed bounds' floor is half
      // a height below it.
      bounds: placedBounds({
        position: [position[0], position[1] - size[1] / 2, position[2]],
        size,
        floorY: position[1] - size[1] / 2
      })
    });
  };
  for (const node of nodes) visit(node);
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
}

/**
 * Public three.js-style raycast (SR-03): cast a world ray — or an NDC point
 * through a camera — against scene query targets. Returns every hit nearest
 * first (`firstHitOnly` truncates to the closest, three's `intersectObject`).
 *
 * Targets are AABBs (see {@link SceneQueryTarget}); routes needing exact mesh
 * intersection go through `raycastPhysicsWorld`.
 */
export function raycast(
  input: SceneRaycastInput,
  options: SceneRaycastOptions = {}
): readonly SceneQueryHit[] {
  const ray = "ndc" in input ? rayFromCameraNdc(input.camera, input.ndc) : input;
  if (!ray) return [];
  const targets = normalizeRaycastTargets(options);
  const mask = options.layers;
  const filtered = mask === undefined
    ? targets
    : targets.filter((target) => ((target.layers ?? 1) & mask) !== 0);
  const near = options.near ?? 0;
  const far = options.far ?? ray.maxDistance ?? Number.POSITIVE_INFINITY;
  const hits = raycastSceneTargetsAll(filtered, {
    origin: ray.origin,
    direction: ray.direction,
    maxDistance: far
  }).filter((hit) => hit.distance >= near);
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
    const near = unprojectPoint(inv, ndc[0], ndc[1], -1);
    const far = unprojectPoint(inv, ndc[0], ndc[1], 1);
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
