import { ValidationError } from "@aura3d/core";
import { perspectiveMat4, type Mat4 } from "./MathTypes.js";
import { Camera } from "./Camera.js";

export interface PerspectiveCameraOptions {
  id?: string;
  name?: string;
  fovYRadians?: number;
  aspect?: number;
  near?: number;
  far?: number;
}

export class PerspectiveCamera extends Camera {
  fovYRadians: number;
  aspect: number;
  near: number;
  far: number;

  constructor(options: PerspectiveCameraOptions = {}) {
    super(options.name ?? "PerspectiveCamera", options.id);
    this.fovYRadians = options.fovYRadians ?? Math.PI / 3;
    this.aspect = options.aspect ?? 1;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 1000;
    this.projectionMatrix = this.computeProjectionMatrix();
  }

  computeProjectionMatrix(): Mat4 {
    validatePerspectiveProjection(this.fovYRadians, this.aspect, this.near, this.far);
    return perspectiveMat4(this.fovYRadians, this.aspect, this.near, this.far);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) throw new ValidationError("CAMERA_RESIZE", "Perspective resize dimensions must be positive.");
    this.aspect = width / height;
    this.updateCameraMatrices();
  }
}

function validatePerspectiveProjection(fovYRadians: number, aspect: number, near: number, far: number): void {
  if (!Number.isFinite(fovYRadians) || fovYRadians <= 0 || fovYRadians >= Math.PI) {
    throw new ValidationError("CAMERA_FOV", "Perspective fovYRadians must be finite and greater than 0 and less than PI.");
  }
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new ValidationError("CAMERA_ASPECT", "Perspective aspect must be finite and positive.");
  }
  if (!Number.isFinite(near) || near <= 0) {
    throw new ValidationError("CAMERA_NEAR", "Perspective near plane must be finite and positive.");
  }
  if (!Number.isFinite(far) || far <= near) {
    throw new ValidationError("CAMERA_FAR", "Perspective far plane must be finite and greater than near.");
  }
}
