import type { Ray } from "@galileo3d/math";
import type { SceneNode } from "@galileo3d/scene";

type Tuple3 = readonly [number, number, number];

export interface EditorPickTarget {
  readonly id: string;
  readonly node: SceneNode;
  readonly bounds: {
    readonly min: Tuple3;
    readonly max: Tuple3;
  };
}

export interface EditorPickHit {
  readonly target: EditorPickTarget;
  readonly distance: number;
}

export interface EditorPickingColorId {
  readonly targetId: string;
  readonly encodedId: number;
  readonly color: readonly [number, number, number, number];
}

export interface EditorPickingEvidenceSnapshot {
  readonly source: "origin-master-gpu-picking-adapted";
  readonly registeredTargetCount: number;
  readonly width: number;
  readonly height: number;
  readonly needsUpdate: boolean;
  readonly idCapacity: number;
  readonly sampleColorId: EditorPickingColorId | null;
  readonly decodedSampleTargetId: string | null;
  readonly colorIds: readonly EditorPickingColorId[];
  readonly evidence: {
    readonly colorIdEncoding: boolean;
    readonly colorIdDecoding: boolean;
    readonly framebufferResizeBoundary: boolean;
    readonly raycastFallback: boolean;
  };
  readonly blockedClaims: readonly string[];
}

export class PickingService {
  private readonly targets = new Map<string, EditorPickTarget>();
  private width = 1024;
  private height = 768;
  private needsUpdate = true;

  setTargets(targets: readonly EditorPickTarget[]): void {
    this.targets.clear();
    for (const target of targets) {
      this.targets.set(target.id, target);
    }
    this.needsUpdate = true;
  }

  addTarget(target: EditorPickTarget): void {
    this.targets.set(target.id, target);
    this.needsUpdate = true;
  }

  removeTarget(id: string): void {
    this.targets.delete(id);
    this.needsUpdate = true;
  }

  pick(ray: Ray): EditorPickHit | undefined {
    const hit = [...this.targets.values()]
      .map((target) => ({ target, distance: intersectBounds(ray, target.bounds) }))
      .filter((hit): hit is EditorPickHit => hit.distance !== undefined)
      .sort((a, b) => a.distance - b.distance)[0];
    this.needsUpdate = false;
    return hit;
  }

  resizePickingBuffer(width: number, height: number): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError("Picking buffer dimensions must be positive integers.");
    }
    this.width = width;
    this.height = height;
    this.needsUpdate = true;
  }

  invalidatePickingBuffer(): void {
    this.needsUpdate = true;
  }

  colorIdForTarget(targetId: string): EditorPickingColorId | undefined {
    const ids = this.colorIds();
    return ids.find((entry) => entry.targetId === targetId);
  }

  targetIdFromColor(color: readonly [number, number, number] | readonly [number, number, number, number]): string | undefined {
    const encodedId = PickingService.colorToId(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0);
    const entry = this.colorIds().find((candidate) => candidate.encodedId === encodedId);
    return entry?.targetId;
  }

  snapshot(): EditorPickingEvidenceSnapshot {
    const colorIds = this.colorIds();
    const sampleColorId = colorIds[0] ?? null;
    const decodedSampleTargetId = sampleColorId ? this.targetIdFromColor(sampleColorId.color) ?? null : null;
    return {
      source: "origin-master-gpu-picking-adapted",
      registeredTargetCount: this.targets.size,
      width: this.width,
      height: this.height,
      needsUpdate: this.needsUpdate,
      idCapacity: 0xffffff,
      sampleColorId,
      decodedSampleTargetId,
      colorIds,
      evidence: {
        colorIdEncoding: colorIds.every((entry) => entry.color[3] === 255 && entry.encodedId >= 1),
        colorIdDecoding: sampleColorId !== null && decodedSampleTargetId === sampleColorId.targetId,
        framebufferResizeBoundary: this.width > 0 && this.height > 0,
        raycastFallback: true
      },
      blockedClaims: [
        "production GPU framebuffer picking pass",
        "depth-buffer world-position reconstruction",
        "GPU picking performance parity with Unity Scene View",
        "GPU picking performance parity with Unreal Editor viewport"
      ]
    };
  }

  static idToColor(id: number): readonly [number, number, number, number] {
    if (!Number.isInteger(id) || id < 1 || id > 0xffffff) {
      throw new RangeError("Picking color id must be an integer in the 1..16777215 range.");
    }
    return [id & 0xff, (id >> 8) & 0xff, (id >> 16) & 0xff, 255];
  }

  static colorToId(red: number, green: number, blue: number): number {
    return (red & 0xff) | ((green & 0xff) << 8) | ((blue & 0xff) << 16);
  }

  private colorIds(): readonly EditorPickingColorId[] {
    return [...this.targets.keys()].map((targetId, index) => {
      const encodedId = index + 1;
      return { targetId, encodedId, color: PickingService.idToColor(encodedId) };
    });
  }
}

function intersectBounds(ray: Ray, bounds: EditorPickTarget["bounds"]): number | undefined {
  let tmin = Number.NEGATIVE_INFINITY;
  let tmax = Number.POSITIVE_INFINITY;

  for (const axis of [0, 1, 2] as const) {
    const origin = axis === 0 ? ray.origin.x : axis === 1 ? ray.origin.y : ray.origin.z;
    const direction = axis === 0 ? ray.direction.x : axis === 1 ? ray.direction.y : ray.direction.z;
    const min = bounds.min[axis];
    const max = bounds.max[axis];
    if (Math.abs(direction) < 1e-8) {
      if (origin < min || origin > max) return undefined;
      continue;
    }
    const invD = 1 / direction;
    let near = (min - origin) * invD;
    let far = (max - origin) * invD;
    if (near > far) [near, far] = [far, near];
    tmin = Math.max(tmin, near);
    tmax = Math.min(tmax, far);
    if (tmin > tmax) return undefined;
  }

  const distance = tmin >= 0 ? tmin : tmax;
  return distance >= 0 ? distance : undefined;
}
