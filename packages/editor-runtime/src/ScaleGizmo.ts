import { Gizmo, type GizmoDrag } from "./Gizmo";
import { TransformCommand, type TransformLike } from "./commands/TransformCommand";

export class ScaleGizmo extends Gizmo {
  async drag(input: GizmoDrag): Promise<void> {
    if (!this.target) return;
    const current = readTransform(this.target);
    const next = clone(current);
    next.scale ??= { x: 1, y: 1, z: 1 };
    const amount = Math.max(0.001, 1 + input.delta);
    if (input.axis === "x") next.scale.x *= amount;
    if (input.axis === "y") next.scale.y *= amount;
    if (input.axis === "z") next.scale.z *= amount;
    if (input.axis === "uniform") {
      next.scale.x *= amount;
      next.scale.y *= amount;
      next.scale.z *= amount;
    }
    await this.history.execute(new TransformCommand(this.target, next));
  }
}

function readTransform(target: NonNullable<ScaleGizmo["target"]>): TransformLike {
  if ("transform" in target) {
    return {
      position: { x: target.transform.position[0], y: target.transform.position[1], z: target.transform.position[2] },
      rotation: { x: target.transform.rotation[0], y: target.transform.rotation[1], z: target.transform.rotation[2], w: target.transform.rotation[3] },
      scale: { x: target.transform.scale[0], y: target.transform.scale[1], z: target.transform.scale[2] }
    };
  }
  return clone(target);
}

function clone(transform: TransformLike): TransformLike {
  return {
    position: { ...transform.position },
    rotation: transform.rotation ? { ...transform.rotation } : undefined,
    scale: transform.scale ? { ...transform.scale } : undefined
  };
}
