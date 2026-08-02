import { type Quat, type Vec3, normalizeVec3 } from "@aura3d/scene";

export interface DecalPlacement {
  readonly id: number;
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly tangent: Vec3;
  readonly size: number;
  readonly color: readonly [number, number, number, number];
}

export interface DecalRaycastInput {
  readonly clientX: number;
  readonly clientY: number;
  readonly canvas: HTMLCanvasElement;
  readonly radius: number;
  readonly center?: Vec3;
  readonly size?: number;
  readonly id?: number;
}

const PALETTE: readonly (readonly [number, number, number, number])[] = [
  [0.95, 0.18, 0.12, 1],
  [0.16, 0.48, 0.95, 1],
  [0.98, 0.73, 0.18, 1],
  [0.17, 0.76, 0.54, 1],
  [0.9, 0.22, 0.72, 1]
];

export function placeDecalFromPointer(input: DecalRaycastInput): DecalPlacement | undefined {
  const rect = input.canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  const ndcX = ((input.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((input.clientY - rect.top) / rect.height) * 2;
  const origin: Vec3 = [0, 0.08, 3.25];
  const direction = normalizeVec3([ndcX * 0.68, ndcY * 0.52 - 0.03, -1]);
  const center = input.center ?? [0, 0.14, 0];
  const hit = raycastSphere(origin, direction, center, input.radius);
  if (!hit) return undefined;
  const id = input.id ?? 0;
  const tangent = stableTangent(hit.normal);
  return {
    id,
    position: [
      hit.position[0] + hit.normal[0] * 0.018,
      hit.position[1] + hit.normal[1] * 0.018,
      hit.position[2] + hit.normal[2] * 0.018
    ],
    normal: hit.normal,
    tangent,
    size: input.size ?? 0.13,
    color: PALETTE[id % PALETTE.length]!
  };
}

export function seededDecals(count = 7): readonly DecalPlacement[] {
  const radius = 0.88;
  const centerY = 0.14;
  const positions: readonly (readonly [number, number])[] = [
    [-0.42, 0.2],
    [0, 0.34],
    [0.42, 0.16],
    [-0.28, -0.18],
    [0.24, -0.12],
    [-0.55, -0.02],
    [0.55, -0.06]
  ];
  return positions.slice(0, Math.max(0, count)).map(([x, y], index) => {
    const z = Math.sqrt(Math.max(0.001, radius * radius - x * x - y * y));
    const normal = normalizeVec3([x, y, z]);
    return {
      id: index,
      position: [normal[0] * radius, centerY + normal[1] * radius, normal[2] * radius],
      normal,
      tangent: stableTangent(normal),
      size: 0.11,
      color: PALETTE[index % PALETTE.length]!
    };
  });
}

export function quatFromYAxisToNormal(normal: Vec3): Quat {
  const from: Vec3 = [0, 1, 0];
  const to = normalizeVec3(normal);
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (dot > 0.9999) return [0, 0, 0, 1];
  if (dot < -0.9999) return [1, 0, 0, 0];
  const cross: Vec3 = [
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0]
  ];
  const w = Math.sqrt((1 + dot) * 2) * 0.5;
  const scale = 1 / (2 * w);
  return [cross[0] * scale, cross[1] * scale, cross[2] * scale, w];
}

interface SphereHit {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
}

function raycastSphere(origin: Vec3, direction: Vec3, center: Vec3, radius: number): SphereHit | undefined {
  const oc: Vec3 = [origin[0] - center[0], origin[1] - center[1], origin[2] - center[2]];
  const b = oc[0] * direction[0] + oc[1] * direction[1] + oc[2] * direction[2];
  const c = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return undefined;
  const distance = -b - Math.sqrt(discriminant);
  if (distance < 0) return undefined;
  const position: Vec3 = [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance
  ];
  return {
    position,
    normal: normalizeVec3([position[0] - center[0], position[1] - center[1], position[2] - center[2]]),
    distance
  };
}

function stableTangent(normal: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(normal[1]) > 0.82 ? [1, 0, 0] : [0, 1, 0];
  return normalizeVec3([
    helper[1] * normal[2] - helper[2] * normal[1],
    helper[2] * normal[0] - helper[0] * normal[2],
    helper[0] * normal[1] - helper[1] * normal[0]
  ]);
}
