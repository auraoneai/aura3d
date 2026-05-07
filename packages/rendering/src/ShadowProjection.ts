import { type Bounds3 } from "./Geometry";

export type Vec3Tuple = readonly [number, number, number];

export interface ShadowProjectionOptions {
  readonly casterBounds: Bounds3;
  readonly lightDirection: Vec3Tuple;
  readonly receiverPlaneY?: number;
}

export interface ShadowProjection {
  readonly points: readonly Vec3Tuple[];
  readonly bounds: Bounds3;
}

const epsilon = 1e-6;

export class ShadowProjectionBuilder {
  projectBounds(options: ShadowProjectionOptions): ShadowProjection {
    const receiverPlaneY = options.receiverPlaneY ?? 0;
    const direction = normalize(options.lightDirection);
    if (Math.abs(direction[1]) < epsilon) {
      throw new Error("Shadow projection requires a light direction that intersects the receiver plane.");
    }

    const projected = corners(options.casterBounds)
      .map((point) => projectPointToPlane(point, direction, receiverPlaneY))
      .filter((point) => isFiniteVec3(point));
    if (projected.length === 0) {
      throw new Error("Shadow projection produced no finite points.");
    }

    const hull2d = convexHull(projected.map((point) => [point[0], point[2]] as const));
    const points = hull2d.map(([x, z]) => [x, receiverPlaneY, z] as const);
    return {
      points,
      bounds: boundsFromPoints(points)
    };
  }
}

function projectPointToPlane(point: Vec3Tuple, direction: Vec3Tuple, receiverPlaneY: number): Vec3Tuple {
  const t = (receiverPlaneY - point[1]) / direction[1];
  return [point[0] + direction[0] * t, receiverPlaneY, point[2] + direction[2] * t];
}

function corners(bounds: Bounds3): readonly Vec3Tuple[] {
  const min = bounds.min;
  const max = bounds.max;
  return [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]]
  ];
}

function boundsFromPoints(points: readonly Vec3Tuple[]): Bounds3 {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const point of points) {
    min[0] = Math.min(min[0], point[0]);
    min[1] = Math.min(min[1], point[1]);
    min[2] = Math.min(min[2], point[2]);
    max[0] = Math.max(max[0], point[0]);
    max[1] = Math.max(max[1], point[1]);
    max[2] = Math.max(max[2], point[2]);
  }
  return { min, max };
}

function convexHull(points: readonly (readonly [number, number])[]): readonly (readonly [number, number])[] {
  const sorted = [...new Map(points.map((point) => [`${point[0]},${point[1]}`, point] as const)).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );
  if (sorted.length <= 1) {
    return sorted;
  }
  const lower: (readonly [number, number])[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: (readonly [number, number])[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function cross(origin: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
}

function normalize(value: Vec3Tuple): Vec3Tuple {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= epsilon) {
    throw new Error("Shadow projection light direction cannot be zero.");
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function isFiniteVec3(value: Vec3Tuple): boolean {
  return Number.isFinite(value[0]) && Number.isFinite(value[1]) && Number.isFinite(value[2]);
}
