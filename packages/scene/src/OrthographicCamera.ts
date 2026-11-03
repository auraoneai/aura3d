import { ValidationError } from "@aura3d/core";
import type { ProjectionOptions } from "@aura3d/math";
import { orthographicMat4, type Mat4 } from "./MathTypes.js";
import { applyCameraViewOffset, Camera, type CameraViewOffset } from "./Camera.js";

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
  depth?: ProjectionOptions;
  viewOffset?: CameraViewOffset;
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
    super(options.name ?? "OrthographicCamera", options.id, options.depth, options.viewOffset);
    this.left = options.left ?? -1;
    this.right = options.right ?? 1;
    this.bottom = options.bottom ?? -1;
    this.top = options.top ?? 1;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 1000;
    this.zoom = options.zoom ?? 1;
    this.resizeMode = options.resizeMode ?? "fit-vertical";
    this.updateCameraMatrices();
  }

  protected override getProjectionDetails(): { kind: "orthographic"; near: number; far: number } {
    return { kind: "orthographic", near: this.near, far: this.far };
  }

  protected override supportsProjectionControls(): boolean { return true; }

  computeProjectionMatrix(): Mat4 {
    if (!Number.isFinite(this.zoom) || !(this.zoom > 0)) throw new ValidationError("CAMERA_ZOOM", "Orthographic zoom must be finite and positive.");
    if (![this.left, this.right, this.bottom, this.top].every(Number.isFinite) || this.left === this.right || this.bottom === this.top) {
      throw new ValidationError("CAMERA_FRUSTUM", "Orthographic bounds must be finite and have non-zero width and height.");
    }
    if (!Number.isFinite(this.near) || (this.depth.mode === "logarithmic" && this.near <= 0)) {
      throw new ValidationError("CAMERA_NEAR", "Orthographic near plane must be finite; logarithmic depth requires a positive near plane.");
    }
    if (!Number.isFinite(this.far) || this.far <= this.near) {
      throw new ValidationError("CAMERA_FAR", "Orthographic far plane must be finite and greater than near.");
    }
    const [left, right, bottom, top] = applyCameraViewOffset(this.left / this.zoom, this.right / this.zoom, this.bottom / this.zoom, this.top / this.zoom, this.viewOffset);
    return orthographicMat4(left, right, bottom, top, this.near, this.far, this.depth);
  }

  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new ValidationError("CAMERA_RESIZE", "Orthographic resize dimensions must be finite and positive.");
    const previous = [this.left, this.right, this.bottom, this.top] as const;
    // The stored bounds describe the full frustum; only the final projection
    // is cropped to the tile. Fit those bounds to the full-image aspect.
    const aspect = this.viewOffset ? this.viewOffset.fullWidth / this.viewOffset.fullHeight : width / height;
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
    try { this.updateCameraMatrices(); } catch (error) { [this.left, this.right, this.bottom, this.top] = previous; throw error; }
  }
}
