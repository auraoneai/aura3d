import { Gizmo, type GizmoDrag } from "./Gizmo";
import { TransformCommand, type TransformLike } from "./commands/TransformCommand";

export class RotateGizmo extends Gizmo {
  async drag(input: GizmoDrag): Promise<void> {
    if (!this.target) return;
    const current = readTransform(this.target);
    const next = clone(current);
    next.rotation ??= { x: 0, y: 0, z: 0, w: 1 };
    const delta = this.snapRotationDelta(input.delta);
    if (input.axis === "x") next.rotation.x += delta;
    if (input.axis === "y") next.rotation.y += delta;
    if (input.axis === "z" || input.axis === "uniform") next.rotation.z += delta;
    await this.history.execute(new TransformCommand(this.target, next));
  }
}

function readTransform(target: NonNullable<RotateGizmo["target"]>): TransformLike {
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
