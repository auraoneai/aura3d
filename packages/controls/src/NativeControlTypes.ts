export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface ControlPickMetadata {
  readonly id?: string;
  readonly label?: string;
  readonly kind?: string;
  readonly group?: string;
  readonly routeId?: string;
  readonly source?: string;
  readonly targetId?: string;
  readonly selectable?: boolean;
  readonly highlightable?: boolean;
  readonly pickRadius?: number;
  readonly priority?: number;
  readonly payload?: unknown;
  /**
   * Instanced picking: world-space centers of the instances belonging to an
   * `InstancedMesh` (or any multi-part object). Each entry is tested as its
   * own pick sphere; a hit reports the nearest entry via `instanceId` on the
   * result metadata. Entries accept either a `Vector3Like` or an
   * `[x, y, z]` tuple.
   */
  readonly instancePositions?: readonly (Vector3Like | readonly [number, number, number])[];
  /**
   * Skinned picking: number of influencing bones, when known. Informational
   * only — the sphere test runs against the bind-pose position plus radius,
   * so deformation beyond that radius is an explicit non-goal (see
   * `Picking` docs).
   */
  readonly skinnedBoneCount?: number;
  /** Reported on a hit against one entry of `instancePositions`. */
  readonly instanceId?: number;
}

export class ControlVector3 implements Vector3Like {
  constructor(public x = 0, public y = 0, public z = 0) {}

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(value: Vector3Like): this {
    return this.set(value.x, value.y, value.z);
  }

  clone(): ControlVector3 {
    return new ControlVector3(this.x, this.y, this.z);
  }

  add(value: Vector3Like): this {
    this.x += value.x;
    this.y += value.y;
    this.z += value.z;
    return this;
  }

  sub(value: Vector3Like): this {
    this.x -= value.x;
    this.y -= value.y;
    this.z -= value.z;
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  normalize(): this {
    const length = this.length();
    return length > 0 ? this.set(this.x / length, this.y / length, this.z / length) : this;
  }
}

export interface ControlObject3DLike {
  readonly name?: string;
  readonly type?: string;
  readonly children?: readonly ControlObject3DLike[];
  readonly position: Vector3Like;
  readonly rotation?: Vector3Like;
  readonly scale?: Vector3Like;
  readonly visible?: boolean;
  readonly pickRadius?: number;
  readonly pickPriority?: number;
  readonly picking?: ControlPickMetadata;
  readonly userData?: Record<string, unknown>;
  traverse?(callback: (object: ControlObject3DLike) => void): void;
}

export function addVector3(target: Vector3Like | undefined, delta: Vector3Like): void {
  if (!target) return;
  target.x += delta.x;
  target.y += delta.y;
  target.z += delta.z;
}

export function traverseControlObject(root: ControlObject3DLike, callback: (object: ControlObject3DLike) => void): void {
  if (typeof root.traverse === "function") {
    root.traverse(callback);
    return;
  }
  callback(root);
  for (const child of root.children ?? []) traverseControlObject(child, callback);
}
