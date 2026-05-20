import { ValidationError } from "@galileo3d/core";
import { orthographicMat4, type Mat4 } from "./MathTypes.js";
import { Camera } from "./Camera.js";

export interface OrthographicCameraOptions {
  id?: string;
  name?: string;
  left?: number;
  right?: number;
  bottom?: number;
  top?: number;
  near?: number;
  far?: number;
  zoom?: number;
  resizeMode?: OrthographicResizeMode;
}

export type OrthographicResizeMode = "fit-vertical" | "fit-horizontal" | "preserve-frustum";

export class OrthographicCamera extends Camera {
  left: number;
  right: number;
  bottom: number;
  top: number;
  near: number;
  far: number;
  zoom: number;
  resizeMode: OrthographicResizeMode;

  constructor(options: OrthographicCameraOptions = {}) {
    super(options.name ?? "OrthographicCamera", options.id);
    this.left = options.left ?? -1;
    this.right = options.right ?? 1;
    this.bottom = options.bottom ?? -1;
    this.top = options.top ?? 1;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 1000;
    this.zoom = options.zoom ?? 1;
    this.resizeMode = options.resizeMode ?? "fit-vertical";
    this.projectionMatrix = this.computeProjectionMatrix();
  }

  computeProjectionMatrix(): Mat4 {
    if (!(this.zoom > 0)) throw new ValidationError("CAMERA_ZOOM", "Orthographic zoom must be positive.");
    return orthographicMat4(this.left / this.zoom, this.right / this.zoom, this.bottom / this.zoom, this.top / this.zoom, this.near, this.far);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) throw new ValidationError("CAMERA_RESIZE", "Orthographic resize dimensions must be positive.");
    const aspect = width / height;
    const centerX = (this.left + this.right) / 2;
    const centerY = (this.bottom + this.top) / 2;
    const halfWidth = (this.right - this.left) / 2;
    const halfHeight = (this.top - this.bottom) / 2;
    if (this.resizeMode === "fit-horizontal") {
      const resizedHalfHeight = halfWidth / aspect;
      this.bottom = centerY - resizedHalfHeight;
      this.top = centerY + resizedHalfHeight;
    } else if (this.resizeMode === "preserve-frustum") {
      const resizedHalfWidth = Math.max(halfWidth, halfHeight * aspect);
      const resizedHalfHeight = Math.max(halfHeight, halfWidth / aspect);
      this.left = centerX - resizedHalfWidth;
      this.right = centerX + resizedHalfWidth;
      this.bottom = centerY - resizedHalfHeight;
      this.top = centerY + resizedHalfHeight;
    } else {
      const resizedHalfWidth = halfHeight * aspect;
      this.left = centerX - resizedHalfWidth;
      this.right = centerX + resizedHalfWidth;
    }
    this.updateCameraMatrices();
  }
}
