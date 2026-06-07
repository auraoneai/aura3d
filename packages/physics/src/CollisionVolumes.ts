import { cloneVec3, validateFiniteVec3, type Bounds, type Vec3 } from "./Shape.js";

export type CombatFacing = -1 | 1;
export type CollisionOwnerId = string | number;
export type CollisionVolumeKind = "hitbox" | "hurtbox" | "pushbox" | "guardbox";

export type CollisionVolumeDescriptor = {
  readonly id?: string;
  readonly ownerId?: CollisionOwnerId;
  readonly offset?: Vec3;
  readonly halfExtents: Vec3;
  readonly enabled?: boolean;
  readonly tags?: readonly string[];
  readonly debug?: boolean | CollisionVolumeDebugOptions;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type CollisionVolumeDebugOptions = {
  readonly enabled?: boolean;
  readonly color?: string;
  readonly opacity?: number;
  readonly label?: string;
};

export type CollisionVolumeDebugMetadata = {
  readonly enabled: boolean;
  readonly visibleInNormalPass: false;
  readonly color: string;
  readonly opacity: number;
  readonly label?: string;
};

export type CollisionVolume = {
  readonly id: string;
  readonly kind: CollisionVolumeKind;
  readonly offset: Vec3;
  readonly halfExtents: Vec3;
  readonly enabled: boolean;
  readonly tags: readonly string[];
  readonly debug: CollisionVolumeDebugMetadata;
  readonly ownerId?: CollisionOwnerId;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type ResolvedCollisionVolume = CollisionVolume & {
  readonly center: Vec3;
  readonly facing: CombatFacing;
  readonly bounds: Bounds;
};

export type CollisionPenetration = {
  readonly normal: Vec3;
  readonly depth: number;
  readonly axis: 0 | 1 | 2;
  readonly overlap: Vec3;
};

export type CollisionVolumeDebugDrawOptions = {
  readonly enabled?: boolean;
};

export type CollisionVolumeDebugDrawDescriptor = {
  readonly id: string;
  readonly kind: CollisionVolumeKind;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
  readonly color: string;
  readonly opacity: number;
  readonly label: string;
};

export function collisionVolume(kind: CollisionVolumeKind, descriptor: CollisionVolumeDescriptor): CollisionVolume {
  validateHalfExtents(descriptor.halfExtents, `${kind} halfExtents`);
  const volume = {
    id: descriptor.id ?? kind,
    kind,
    offset: cloneVec3(descriptor.offset ?? [0, 0, 0]),
    halfExtents: cloneVec3(descriptor.halfExtents),
    enabled: descriptor.enabled ?? true,
    tags: [...(descriptor.tags ?? [])],
    debug: normalizeCollisionVolumeDebug(kind, descriptor.id ?? kind, descriptor.debug),
    ...(descriptor.ownerId === undefined ? {} : { ownerId: descriptor.ownerId }),
    ...(descriptor.metadata === undefined ? {} : { metadata: { ...descriptor.metadata } })
  };
  validateFiniteVec3(volume.offset, `${kind} offset`);
  return volume;
}

export function hitbox(descriptor: CollisionVolumeDescriptor): CollisionVolume {
  return collisionVolume("hitbox", descriptor);
}

export function hurtbox(descriptor: CollisionVolumeDescriptor): CollisionVolume {
  return collisionVolume("hurtbox", descriptor);
}

export function pushbox(descriptor: CollisionVolumeDescriptor): CollisionVolume {
  return collisionVolume("pushbox", descriptor);
}

export function guardbox(descriptor: CollisionVolumeDescriptor): CollisionVolume {
  return collisionVolume("guardbox", descriptor);
}

export const createHitbox = hitbox;
export const createHurtbox = hurtbox;
export const createPushbox = pushbox;
export const createGuardbox = guardbox;
export const createGuardBox = guardbox;

export function cloneCollisionVolume(volume: CollisionVolume): CollisionVolume {
  return {
    id: volume.id,
    kind: volume.kind,
    offset: cloneVec3(volume.offset),
    halfExtents: cloneVec3(volume.halfExtents),
    enabled: volume.enabled,
    tags: [...volume.tags],
    debug: { ...volume.debug },
    ...(volume.ownerId === undefined ? {} : { ownerId: volume.ownerId }),
    ...(volume.metadata === undefined ? {} : { metadata: { ...volume.metadata } })
  };
}

export function withVolumeOwner(volume: CollisionVolume, ownerId: CollisionOwnerId): CollisionVolume {
  return {
    ...cloneCollisionVolume(volume),
    ownerId
  };
}

export function resolveCollisionVolume(volume: CollisionVolume, ownerPosition: Vec3, facing: CombatFacing = 1): ResolvedCollisionVolume {
  validateFiniteVec3(ownerPosition, "volume owner position");
  const resolvedFacing = normalizeFacing(facing);
  const center: Vec3 = [
    ownerPosition[0] + volume.offset[0] * resolvedFacing,
    ownerPosition[1] + volume.offset[1],
    ownerPosition[2] + volume.offset[2]
  ];
  return {
    ...cloneCollisionVolume(volume),
    center,
    facing: resolvedFacing,
    bounds: aabbFromCenter(center, volume.halfExtents)
  };
}

export function collisionVolumeDebugDrawDescriptors(
  volumes: readonly ResolvedCollisionVolume[],
  options: CollisionVolumeDebugDrawOptions = {}
): readonly CollisionVolumeDebugDrawDescriptor[] {
  if (options.enabled !== true) {
    return [];
  }
  return volumes
    .filter((volume) => volume.enabled && volume.debug.enabled)
    .map((volume) => ({
      id: volume.id,
      kind: volume.kind,
      center: cloneVec3(volume.center),
      halfExtents: cloneVec3(volume.halfExtents),
      color: volume.debug.color,
      opacity: volume.debug.opacity,
      label: volume.debug.label ?? `${volume.kind}:${volume.id}`
    }));
}

export function collisionVolumeVisibleInNormalPass(volume: CollisionVolume): false {
  return volume.debug.visibleInNormalPass;
}

export function aabbFromCenter(center: Vec3, halfExtents: Vec3): Bounds {
  validateFiniteVec3(center, "aabb center");
  validateHalfExtents(halfExtents, "aabb halfExtents");
  return {
    min: [center[0] - halfExtents[0], center[1] - halfExtents[1], center[2] - halfExtents[2]],
    max: [center[0] + halfExtents[0], center[1] + halfExtents[1], center[2] + halfExtents[2]]
  };
}

export function boundsCenter(bounds: Bounds): Vec3 {
  validateBounds(bounds, "bounds");
  return [
    (bounds.min[0] + bounds.max[0]) * 0.5,
    (bounds.min[1] + bounds.max[1]) * 0.5,
    (bounds.min[2] + bounds.max[2]) * 0.5
  ];
}

export function boundsHalfExtents(bounds: Bounds): Vec3 {
  validateBounds(bounds, "bounds");
  return [
    (bounds.max[0] - bounds.min[0]) * 0.5,
    (bounds.max[1] - bounds.min[1]) * 0.5,
    (bounds.max[2] - bounds.min[2]) * 0.5
  ];
}

export function overlapsAabb(a: Bounds, b: Bounds): boolean {
  validateBounds(a, "a bounds");
  validateBounds(b, "b bounds");
  return (
    a.min[0] < b.max[0] &&
    a.max[0] > b.min[0] &&
    a.min[1] < b.max[1] &&
    a.max[1] > b.min[1] &&
    a.min[2] < b.max[2] &&
    a.max[2] > b.min[2]
  );
}

export function overlapsVolume(a: ResolvedCollisionVolume, b: ResolvedCollisionVolume): boolean {
  if (!a.enabled || !b.enabled) {
    return false;
  }
  return overlapsAabb(a.bounds, b.bounds);
}

export function aabbPenetration(a: Bounds, b: Bounds): CollisionPenetration | null {
  if (!overlapsAabb(a, b)) {
    return null;
  }
  const overlap: Vec3 = [
    Math.min(a.max[0] - b.min[0], b.max[0] - a.min[0]),
    Math.min(a.max[1] - b.min[1], b.max[1] - a.min[1]),
    Math.min(a.max[2] - b.min[2], b.max[2] - a.min[2])
  ];
  let axis: 0 | 1 | 2 = 0;
  if (overlap[1] < overlap[axis]) {
    axis = 1;
  }
  if (overlap[2] < overlap[axis]) {
    axis = 2;
  }
  const centerA = boundsCenter(a);
  const centerB = boundsCenter(b);
  const normal: [number, number, number] = [0, 0, 0];
  normal[axis] = centerA[axis] <= centerB[axis] ? -1 : 1;
  return {
    normal,
    depth: overlap[axis],
    axis,
    overlap
  };
}

export function volumePairKey(a: CollisionVolume | ResolvedCollisionVolume, b: CollisionVolume | ResolvedCollisionVolume): string {
  const keyA = volumeKey(a);
  const keyB = volumeKey(b);
  return keyA < keyB ? `${keyA}:${keyB}` : `${keyB}:${keyA}`;
}

export function normalizeFacing(value: number): CombatFacing {
  return value < 0 ? -1 : 1;
}

export function validateBounds(bounds: Bounds, name: string): void {
  validateFiniteVec3(bounds.min, `${name} min`);
  validateFiniteVec3(bounds.max, `${name} max`);
  if (bounds.min[0] > bounds.max[0] || bounds.min[1] > bounds.max[1] || bounds.min[2] > bounds.max[2]) {
    throw new Error(`${name} min values must be less than or equal to max values.`);
  }
}

function validateHalfExtents(value: Vec3, name: string): void {
  validateFiniteVec3(value, name);
  if (value[0] <= 0 || value[1] <= 0 || value[2] <= 0) {
    throw new Error(`${name} must contain finite positive values.`);
  }
}

function normalizeCollisionVolumeDebug(
  kind: CollisionVolumeKind,
  id: string,
  debug: boolean | CollisionVolumeDebugOptions | undefined
): CollisionVolumeDebugMetadata {
  const options: CollisionVolumeDebugOptions = typeof debug === "object" && debug !== null ? debug : {};
  return {
    enabled: typeof debug === "boolean" ? debug : options.enabled ?? false,
    visibleInNormalPass: false,
    color: options.color ?? defaultDebugColor(kind),
    opacity: options.opacity ?? 0.28,
    label: options.label ?? `${kind}:${id}`
  };
}

function defaultDebugColor(kind: CollisionVolumeKind): string {
  switch (kind) {
    case "hitbox":
      return "#ef4444";
    case "hurtbox":
      return "#22c55e";
    case "guardbox":
      return "#38bdf8";
    case "pushbox":
      return "#facc15";
  }
}

function volumeKey(volume: CollisionVolume | ResolvedCollisionVolume): string {
  const owner = volume.ownerId === undefined ? "none" : String(volume.ownerId);
  return `${owner}/${volume.kind}/${volume.id}`;
}
