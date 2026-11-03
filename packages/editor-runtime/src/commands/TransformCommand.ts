import type { Command } from "../Command";

export interface TransformLike {
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w?: number };
  scale?: { x: number; y: number; z: number };
  pivot?: { x: number; y: number; z: number };
}

export interface SceneTransformTargetLike {
  readonly transform: {
    readonly position: [number, number, number];
    readonly rotation: [number, number, number, number];
    readonly scale: [number, number, number];
    readonly pivot?: readonly [number, number, number];
    setPosition(x: number, y: number, z: number): unknown;
    setRotation(x: number, y: number, z: number, w: number): unknown;
    setScale(x: number, y: number, z: number): unknown;
    setPivot?(x: number, y: number, z: number): unknown;
  };
}

export type TransformTarget = TransformLike | SceneTransformTargetLike;

function cloneTransform(transform: TransformLike): TransformLike {
  return {
    position: { ...transform.position },
    rotation: transform.rotation ? { ...transform.rotation } : undefined,
    scale: transform.scale ? { ...transform.scale } : undefined,
    ...(transform.pivot === undefined ? {} : { pivot: { ...transform.pivot } })
  };
}

function readTransform(target: TransformTarget): TransformLike {
  if ("transform" in target) {
    const pivot = target.transform.pivot;
    if (pivot !== undefined && (!Array.isArray(pivot) || pivot.length !== 3 || !Array.from(pivot).every(Number.isFinite))) {
      throw new Error("Transform pivot must contain three finite numbers.");
    }
    return {
      position: {
        x: target.transform.position[0],
        y: target.transform.position[1],
        z: target.transform.position[2]
      },
      rotation: {
        x: target.transform.rotation[0],
        y: target.transform.rotation[1],
        z: target.transform.rotation[2],
        w: target.transform.rotation[3]
      },
      scale: {
        x: target.transform.scale[0],
        y: target.transform.scale[1],
        z: target.transform.scale[2]
      },
      ...(pivot === undefined ? {} : { pivot: { x: pivot[0], y: pivot[1], z: pivot[2] } })
    };
  }
  return cloneTransform(target);
}

function assertPivot(pivot: unknown): asserts pivot is NonNullable<TransformLike["pivot"]> {
  if (!pivot || typeof pivot !== "object" ||
      !["x", "y", "z"].every((axis) => Number.isFinite((pivot as Record<string, unknown>)[axis]))) {
    throw new Error("Transform pivot must contain three finite numbers.");
  }
}

function applyTransform(target: TransformTarget, transform: TransformLike, writePivot: boolean): void {
  if ("transform" in target) {
    if (writePivot) {
      assertPivot(transform.pivot);
      if (typeof target.transform.setPivot !== "function") {
        throw new Error("Transform target does not support pivot editing.");
      }
      target.transform.setPivot(transform.pivot.x, transform.pivot.y, transform.pivot.z);
    }
    target.transform.setPosition(transform.position.x, transform.position.y, transform.position.z);
    if (transform.rotation) {
      target.transform.setRotation(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w ?? 1
      );
    }
    if (transform.scale) {
      target.transform.setScale(transform.scale.x, transform.scale.y, transform.scale.z);
    }
    return;
  }
  if (writePivot) {
    if (transform.pivot === undefined) delete target.pivot;
    else {
      assertPivot(transform.pivot);
      target.pivot = { ...transform.pivot };
    }
  }
  target.position = { ...transform.position };
  target.rotation = transform.rotation ? { ...transform.rotation } : undefined;
  target.scale = transform.scale ? { ...transform.scale } : undefined;
}

export class TransformCommand implements Command {
  readonly name = "Transform";
  private readonly before: TransformLike;
  private readonly after: TransformLike;
  private readonly writesPivot: boolean;

  constructor(
    private readonly target: TransformTarget,
    next: TransformLike,
    before?: TransformLike
  ) {
    this.writesPivot = next.pivot !== undefined;
    if (this.writesPivot) {
      assertPivot(next.pivot);
      if ("transform" in target && (target.transform.pivot === undefined || typeof target.transform.setPivot !== "function")) {
        throw new Error("Transform target does not support pivot editing.");
      }
    }
    const current = readTransform(target);
    const previous = before ?? current;
    // Scene pivots cannot be removed; an explicitly supplied partial snapshot
    // still needs the original pivot for undo.
    const undo = this.writesPivot && "transform" in target && previous.pivot === undefined
      ? { ...previous, pivot: current.pivot }
      : previous;
    if (this.writesPivot && undo.pivot !== undefined) assertPivot(undo.pivot);
    this.before = cloneTransform(undo);
    this.after = cloneTransform(next);
  }

  execute(): void {
    applyTransform(this.target, this.after, this.writesPivot);
  }

  undo(): void {
    applyTransform(this.target, this.before, this.writesPivot);
  }

  canMerge(next: Command): boolean {
    return next instanceof TransformCommand && next.target === this.target;
  }

  merge(next: Command): Command {
    if (!(next instanceof TransformCommand) || next.target !== this.target) {
      throw new Error("TransformCommand can only merge commands for the same target.");
    }
    // A later TRS-only edit must not erase a pivot edit when history coalesces.
    const after = this.writesPivot && !next.writesPivot
      ? { ...next.after, pivot: this.after.pivot }
      : next.after;
    return new TransformCommand(this.target, after, this.before);
  }
}
