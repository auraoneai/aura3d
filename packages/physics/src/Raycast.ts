import { addVec3, dotVec3, scaleVec3, subVec3, type Vec3 } from "./Shape.js";
import type { Collider } from "./Collider.js";
import type { RigidBody } from "./RigidBody.js";

export type RaycastOptions = {
  readonly maxDistance?: number;
  readonly mask?: number;
  readonly includeSensors?: boolean;
  readonly includeBackfaces?: boolean;
};

export type RaycastHit = {
  readonly colliderId: number;
  readonly bodyId: number;
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
};

export type SphereCastHit = RaycastHit & {
  readonly castCenter: Vec3;
  readonly castRadius: number;
};

export function raycastCollider(origin: Vec3, direction: Vec3, collider: Collider, body: RigidBody, options: RaycastOptions = {}): RaycastHit | undefined {
  const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
  if (collider.sensor && options.includeSensors !== true) {
    return undefined;
  }
  if (options.mask !== undefined && (collider.filter.layer & options.mask) === 0) {
    return undefined;
  }
  switch (collider.shape.kind) {
    case "sphere":
      return raycastSphere(origin, direction, body.position, collider.shape.radius, collider, maxDistance);
    case "box":
    case "capsule":
      return raycastAabb(origin, direction, collider.bounds(body.position), collider, body.id, maxDistance);
    case "plane":
      return raycastPlane(origin, direction, collider.shape.normal, collider.shape.constant, collider, body.id, maxDistance);
    case "mesh":
      return raycastMesh(origin, direction, collider, body, maxDistance, options.includeBackfaces === true);
  }
}

export function sphereCastCollider(origin: Vec3, radius: number, direction: Vec3, collider: Collider, body: RigidBody, options: RaycastOptions = {}): SphereCastHit | undefined {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("sphereCast radius must be a finite positive number.");
  }
  const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
  if (collider.sensor && options.includeSensors !== true) {
    return undefined;
  }
  if (options.mask !== undefined && (collider.filter.layer & options.mask) === 0) {
    return undefined;
  }
  switch (collider.shape.kind) {
    case "sphere":
      return sphereCastSphere(origin, radius, direction, body.position, collider.shape.radius, collider, maxDistance);
    case "box":
    case "capsule": {
      const bounds = collider.bounds(body.position);
      const expanded = {
        min: [bounds.min[0] - radius, bounds.min[1] - radius, bounds.min[2] - radius] as Vec3,
        max: [bounds.max[0] + radius, bounds.max[1] + radius, bounds.max[2] + radius] as Vec3
      };
      const hit = raycastAabb(origin, direction, expanded, collider, body.id, maxDistance);
      return hit ? toSphereCastHit(hit, origin, direction, radius) : undefined;
    }
    case "plane":
      return sphereCastPlane(origin, radius, direction, collider.shape.normal, collider.shape.constant, body.position, collider, body.id, maxDistance);
    case "mesh": {
      const hit = raycastMesh(origin, direction, collider, body, maxDistance, options.includeBackfaces === true);
      return hit ? toSphereCastHit(hit, origin, direction, radius) : undefined;
    }
  }
}

function raycastSphere(origin: Vec3, direction: Vec3, center: Vec3, radius: number, collider: Collider, maxDistance: number): RaycastHit | undefined {
  const oc = subVec3(origin, center);
  const b = dotVec3(oc, direction);
  const c = dotVec3(oc, oc) - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) {
    return undefined;
  }
  const sqrt = Math.sqrt(discriminant);
  const insideDistance = c <= 0 ? 0 : undefined;
  const distance = insideDistance ?? -b - sqrt;
  if (distance < 0 || distance > maxDistance) {
    return undefined;
  }
  const point = [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance] as Vec3;
  const normal = c <= 0 ? scaleVec3(direction, -1) : scaleVec3(subVec3(point, center), 1 / radius);
  return { colliderId: collider.id, bodyId: collider.bodyId, point, normal, distance };
}

function sphereCastSphere(origin: Vec3, castRadius: number, direction: Vec3, center: Vec3, targetRadius: number, collider: Collider, maxDistance: number): SphereCastHit | undefined {
  const expandedRadius = castRadius + targetRadius;
  const expandedHit = raycastSphere(origin, direction, center, expandedRadius, collider, maxDistance);
  if (!expandedHit) {
    return undefined;
  }
  const castCenter = pointAlongRay(origin, direction, expandedHit.distance);
  const normal = expandedHit.distance === 0
    ? scaleVec3(direction, -1)
    : stableVec3(scaleVec3(subVec3(castCenter, center), 1 / Math.max(1e-9, Math.hypot(castCenter[0] - center[0], castCenter[1] - center[1], castCenter[2] - center[2]))));
  return {
    colliderId: collider.id,
    bodyId: collider.bodyId,
    point: stableVec3(subVec3(castCenter, scaleVec3(normal, castRadius))),
    normal,
    distance: expandedHit.distance,
    castCenter,
    castRadius
  };
}

function raycastAabb(origin: Vec3, direction: Vec3, bounds: { readonly min: Vec3; readonly max: Vec3 }, collider: Collider, bodyId: number, maxDistance: number): RaycastHit | undefined {
  let tmin = 0;
  let tmax = maxDistance;
  let axis = 0;
  let sign = -1;
  const originInside = pointInsideAabb(origin, bounds);
  for (let i = 0; i < 3; i += 1) {
    const ray = direction[i]!;
    if (Math.abs(ray) < 1e-9) {
      if (origin[i]! < bounds.min[i]! || origin[i]! > bounds.max[i]!) {
        return undefined;
      }
      continue;
    }
    const inv = 1 / ray;
    let t1 = (bounds.min[i]! - origin[i]!) * inv;
    let t2 = (bounds.max[i]! - origin[i]!) * inv;
    let localSign = -Math.sign(ray);
    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
      localSign = Math.sign(ray);
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = localSign;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) {
      return undefined;
    }
  }
  const point = [origin[0] + direction[0] * tmin, origin[1] + direction[1] * tmin, origin[2] + direction[2] * tmin] as Vec3;
  const normal: [number, number, number] = [0, 0, 0];
  if (originInside && tmin === 0) {
    normal[dominantAxis(direction)] = -Math.sign(direction[dominantAxis(direction)] || 1);
  } else {
    normal[axis] = sign;
  }
  return { colliderId: collider.id, bodyId, point, normal, distance: tmin };
}

function raycastPlane(origin: Vec3, direction: Vec3, normal: Vec3, constant: number, collider: Collider, bodyId: number, maxDistance: number): RaycastHit | undefined {
  const denom = dotVec3(normal, direction);
  if (Math.abs(denom) < 1e-9) {
    return undefined;
  }
  const distance = -(dotVec3(normal, origin) + constant) / denom;
  if (distance < 0 || distance > maxDistance) {
    return undefined;
  }
  const point = [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance] as Vec3;
  return { colliderId: collider.id, bodyId, point, normal, distance };
}

function sphereCastPlane(origin: Vec3, radius: number, direction: Vec3, normal: Vec3, constant: number, planePosition: Vec3, collider: Collider, bodyId: number, maxDistance: number): SphereCastHit | undefined {
  const signedDistance = dotVec3(normal, origin) + constant + dotVec3(normal, planePosition);
  if (signedDistance <= radius) {
    const castCenter = origin;
    return {
      colliderId: collider.id,
      bodyId,
      point: stableVec3(subVec3(castCenter, scaleVec3(normal, radius))),
      normal,
      distance: 0,
      castCenter,
      castRadius: radius
    };
  }
  const denom = dotVec3(normal, direction);
  if (denom >= -1e-9) {
    return undefined;
  }
  const distance = (radius - signedDistance) / denom;
  if (distance < 0 || distance > maxDistance) {
    return undefined;
  }
  const castCenter = pointAlongRay(origin, direction, distance);
  return {
    colliderId: collider.id,
    bodyId,
    point: stableVec3(subVec3(castCenter, scaleVec3(normal, radius))),
    normal,
    distance,
    castCenter,
    castRadius: radius
  };
}

function raycastMesh(origin: Vec3, direction: Vec3, collider: Collider, body: RigidBody, maxDistance: number, includeBackfaces: boolean): RaycastHit | undefined {
  if (collider.shape.kind !== "mesh") {
    return undefined;
  }
  let closest: RaycastHit | undefined;
  const { vertices, indices } = collider.shape;
  for (let index = 0; index < indices.length; index += 3) {
    const a = addVec3(body.position, vertices[indices[index]!]!);
    const b = addVec3(body.position, vertices[indices[index + 1]!]!);
    const c = addVec3(body.position, vertices[indices[index + 2]!]!);
    const hit = raycastTriangle(origin, direction, a, b, c, collider, body.id, maxDistance, includeBackfaces);
    if (hit && (!closest || hit.distance < closest.distance)) {
      closest = hit;
    }
  }
  return closest;
}

function raycastTriangle(
  origin: Vec3,
  direction: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  collider: Collider,
  bodyId: number,
  maxDistance: number,
  includeBackfaces: boolean
): RaycastHit | undefined {
  const edge1 = subVec3(b, a);
  const edge2 = subVec3(c, a);
  const p = crossVec3(direction, edge2);
  const det = dotVec3(edge1, p);
  if (includeBackfaces ? Math.abs(det) < 1e-9 : det < 1e-9) {
    return undefined;
  }
  const invDet = 1 / det;
  const t = subVec3(origin, a);
  const u = dotVec3(t, p) * invDet;
  if (u < 0 || u > 1) {
    return undefined;
  }
  const q = crossVec3(t, edge1);
  const v = dotVec3(direction, q) * invDet;
  if (v < 0 || u + v > 1) {
    return undefined;
  }
  const distance = dotVec3(edge2, q) * invDet;
  if (distance < 0 || distance > maxDistance) {
    return undefined;
  }
  const normal = normalizeForRay(crossVec3(edge1, edge2), direction);
  const point = [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance] as Vec3;
  return { colliderId: collider.id, bodyId, point, normal, distance };
}

function crossVec3(a: Vec3, b: Vec3): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalizeForRay(normal: Vec3, direction: Vec3): Vec3 {
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  const normalized = length <= 1e-9 ? [0, 1, 0] as Vec3 : stableVec3(scaleVec3(normal, 1 / length));
  return dotVec3(normalized, direction) > 0 ? stableVec3(scaleVec3(normalized, -1)) : normalized;
}

function pointAlongRay(origin: Vec3, direction: Vec3, distance: number): Vec3 {
  return [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance
  ];
}

function pointInsideAabb(point: Vec3, bounds: { readonly min: Vec3; readonly max: Vec3 }): boolean {
  return point[0] >= bounds.min[0] && point[0] <= bounds.max[0] &&
    point[1] >= bounds.min[1] && point[1] <= bounds.max[1] &&
    point[2] >= bounds.min[2] && point[2] <= bounds.max[2];
}

function dominantAxis(direction: Vec3): 0 | 1 | 2 {
  const ax = Math.abs(direction[0]);
  const ay = Math.abs(direction[1]);
  const az = Math.abs(direction[2]);
  if (ay >= ax && ay >= az) return 1;
  if (az >= ax && az >= ay) return 2;
  return 0;
}

function toSphereCastHit(hit: RaycastHit, origin: Vec3, direction: Vec3, radius: number): SphereCastHit {
  const castCenter = pointAlongRay(origin, direction, hit.distance);
  return {
    ...hit,
    point: stableVec3(subVec3(castCenter, scaleVec3(hit.normal, radius))),
    castCenter,
    castRadius: radius
  };
}

function stableVec3(value: Vec3): Vec3 {
  return value.map((component) => Object.is(component, -0) ? 0 : component) as unknown as Vec3;
}
