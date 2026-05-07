import { ValidationError } from "@galileo3d/core";
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
    return perspectiveMat4(this.fovYRadians, this.aspect, this.near, this.far);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) throw new ValidationError("CAMERA_RESIZE", "Perspective resize dimensions must be positive.");
    this.aspect = width / height;
  }
}
