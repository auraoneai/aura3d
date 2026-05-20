import { ValidationError } from "@galileo3d/core";
import { Frustum } from "@galileo3d/math";
import { extractFrustumPlanes, identityMat4, multiplyMat4, toMathMat4, type Mat4, type PlaneTuple } from "./MathTypes.js";
import { SceneNode } from "./SceneNode.js";

export interface CameraViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export abstract class Camera extends SceneNode {
  viewport: CameraViewport = { x: 0, y: 0, width: 1, height: 1 };
  readonly frustumPlanes: PlaneTuple[] = [];
  frustum: Frustum = Frustum.fromMatrix(toMathMat4(identityMat4()));
  projectionMatrix: Mat4;
  viewMatrix: Mat4;
  viewProjectionMatrix: Mat4;

  protected constructor(name: string, id?: string) {
    super({ id, name });
    this.projectionMatrix = identityMat4();
    this.viewMatrix = this.transform.inverseWorldMatrix;
    this.viewProjectionMatrix = multiplyMat4(this.projectionMatrix, this.viewMatrix);
  }

  abstract computeProjectionMatrix(): Mat4;

  updateCameraMatrices(): void {
    updateAncestors(this);
    this.updateWorldTransform();
    this.projectionMatrix = this.computeProjectionMatrix();
    this.viewMatrix = this.transform.inverseWorldMatrix;
    this.viewProjectionMatrix = multiplyMat4(this.projectionMatrix, this.viewMatrix);
    this.frustum = Frustum.fromMatrix(toMathMat4(this.viewProjectionMatrix));
    this.frustumPlanes.splice(0, this.frustumPlanes.length, ...extractFrustumPlanes(this.viewProjectionMatrix));
  }

  setViewport(viewport: CameraViewport): void {
    if (viewport.width <= 0 || viewport.height <= 0) throw new ValidationError("CAMERA_VIEWPORT", "Camera viewport dimensions must be positive.");
    this.viewport = { ...viewport };
  }
}

function updateAncestors(node: SceneNode): void {
  const ancestors: SceneNode[] = [];
  let parent = node.parent;
  while (parent) {
    ancestors.unshift(parent);
    parent = parent.parent;
  }
  for (const ancestor of ancestors) {
    ancestor.transform.updateWorld(ancestor.parent?.transform.worldMatrix);
  }
}
