import type { Command } from "../Command";

export interface TransformLike {
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w?: number };
  scale?: { x: number; y: number; z: number };
}

export interface SceneTransformTargetLike {
  readonly transform: {
    readonly position: [number, number, number];
    readonly rotation: [number, number, number, number];
    readonly scale: [number, number, number];
    setPosition(x: number, y: number, z: number): unknown;
    setRotation(x: number, y: number, z: number, w: number): unknown;
    setScale(x: number, y: number, z: number): unknown;
  };
}

export type TransformTarget = TransformLike | SceneTransformTargetLike;

function cloneTransform(transform: TransformLike): TransformLike {
  return {
    position: { ...transform.position },
    rotation: transform.rotation ? { ...transform.rotation } : undefined,
    scale: transform.scale ? { ...transform.scale } : undefined
  };
}

function readTransform(target: TransformTarget): TransformLike {
  if ("transform" in target) {
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
      }
    };
  }
  return cloneTransform(target);
}

function applyTransform(target: TransformTarget, transform: TransformLike): void {
  if ("transform" in target) {
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
  target.position = { ...transform.position };
  target.rotation = transform.rotation ? { ...transform.rotation } : undefined;
  target.scale = transform.scale ? { ...transform.scale } : undefined;
}

export class TransformCommand implements Command {
  readonly name = "Transform";
  private readonly before: TransformLike;
  private readonly after: TransformLike;

  constructor(
    private readonly target: TransformTarget,
    next: TransformLike,
    before?: TransformLike
  ) {
    this.before = cloneTransform(before ?? readTransform(target));
    this.after = cloneTransform(next);
  }

  execute(): void {
    applyTransform(this.target, this.after);
  }

  undo(): void {
    applyTransform(this.target, this.before);
  }

  canMerge(next: Command): boolean {
    return next instanceof TransformCommand && next.target === this.target;
  }

  merge(next: Command): Command {
    if (!(next instanceof TransformCommand) || next.target !== this.target) {
      throw new Error("TransformCommand can only merge commands for the same target.");
    }
    return new TransformCommand(this.target, next.after, this.before);
  }
}
