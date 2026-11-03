import type { Mat4, Quat, Vec3 } from "./MathTypes.js";
import type { TransformNode } from "./TransformNode.js";

export interface StagedWorldUpdate {
  localMatrix?: Mat4;
  worldMatrix: Mat4;
}

export interface StagedLocalUpdate {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  linearResidual?: Mat4;
  localMatrix: Mat4;
}

export interface TransformNodeAccess {
  stageWorldUpdate(node: TransformNode, parentWorld?: Mat4, force?: boolean): StagedWorldUpdate | undefined;
  commitWorldUpdate(node: TransformNode, staged: StagedWorldUpdate): void;
  stageLocalUpdate(node: TransformNode, matrix: Mat4): StagedLocalUpdate;
  commitLocalUpdate(node: TransformNode, staged: StagedLocalUpdate): void;
  stageDirtyNotification(node: TransformNode): Array<() => void> | undefined;
}

let access: TransformNodeAccess | undefined;

export function installTransformNodeAccess(value: TransformNodeAccess): void {
  access = value;
}

export function getTransformNodeAccess(): TransformNodeAccess {
  if (!access) throw new Error("Transform transaction access is unavailable.");
  return access;
}
