import { ValidationError } from "@aura3d/core";
import type { ProjectionOptions } from "@aura3d/math";
import { frustumMat4, type Mat4 } from "./MathTypes.js";
import { applyCameraViewOffset, Camera, type CameraViewOffset } from "./Camera.js";

export interface PerspectiveCameraOptions {
  id?: string;
  name?: string;
  fovYRadians?: number;
  aspect?: number;
  near?: number;
  far?: number;
  /** If supplied, the physical focal length takes precedence over fovYRadians. */
  focalLength?: number;
  /** Size of the larger film dimension in millimetres; defaults to 35. */
  filmGauge?: number;
  /** Horizontal lens shift in millimetres. */
  filmOffset?: number;
  depth?: ProjectionOptions;
  viewOffset?: CameraViewOffset;
}

export class PerspectiveCamera extends Camera {
  private authoredFovYRadians: number;
  aspect: number;
  near: number;
  far: number;
  focalLength?: number;
  filmGauge: number;
  filmOffset: number;

  constructor(options: PerspectiveCameraOptions = {}) {
    super(options.name ?? "PerspectiveCamera", options.id, options.depth, options.viewOffset);
    this.authoredFovYRadians = options.fovYRadians ?? Math.PI / 3;
    this.aspect = options.aspect ?? 1;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 1000;
    this.focalLength = options.focalLength;
    this.filmGauge = options.filmGauge ?? 35;
    this.filmOffset = options.filmOffset ?? 0;
    this.updateCameraMatrices();
  }

  protected override getProjectionDetails(): { kind: "perspective"; near: number; far: number } {
    return { kind: "perspective", near: this.near, far: this.far };
  }

  protected override supportsProjectionControls(): boolean { return true; }

  /** A tile is a crop of the full image, whose aspect may differ from its viewport. */
  private projectionAspect(): number {
    // Keep the public authored/resized aspect valid even while a view offset
    // supplies the aspect used to construct the current full-image frustum.
    validateFilm(this.filmGauge, this.filmOffset, this.aspect);
    const aspect = this.viewOffset ? this.viewOffset.fullWidth / this.viewOffset.fullHeight : this.aspect;
    validateFilm(this.filmGauge, this.filmOffset, aspect);
    return aspect;
  }

  /** Assigning an explicit FOV selects it over any previous physical lens. */
  get fovYRadians(): number {
    if (this.focalLength === undefined) return this.authoredFovYRadians;
    validateFocalLength(this.focalLength);
    return 2 * Math.atan(this.getFilmHeight() / (2 * this.focalLength));
  }

  set fovYRadians(value: number) {
    this.authoredFovYRadians = value;
    this.focalLength = undefined;
  }

  /** @internal Preserve the explicit FOV underneath a physical-lens override. */
  getAuthoredFieldOfView(): number {
    return this.authoredFovYRadians;
  }

  computeProjectionMatrix(): Mat4 {
    const aspect = this.projectionAspect();
    const fovYRadians = this.fovYRadians;
    validatePerspectiveProjection(fovYRadians, aspect, this.near, this.far, this.depth.mode);
    const top = this.near * Math.tan(fovYRadians / 2);
    const halfWidth = top * aspect;
    // Lens shift is a fraction of the physical film width, scaled to the
    // width of the near-plane window (equivalently near * offset / focal).
    const shift = 2 * halfWidth * this.filmOffset / this.getFilmWidth();
    const [left, right, bottom, croppedTop] = applyCameraViewOffset(-halfWidth + shift, halfWidth + shift, -top, top, this.viewOffset);
    return frustumMat4(left, right, bottom, croppedTop, this.near, this.far, this.depth);
  }

  /** Film dimensions describe the same physical aperture in landscape and portrait views. */
  getFilmWidth(): number {
    return this.filmGauge * Math.min(this.projectionAspect(), 1);
  }

  getFilmHeight(): number {
    return this.filmGauge / Math.max(this.projectionAspect(), 1);
  }

  getFocalLength(): number {
    validatePerspectiveProjection(this.fovYRadians, this.projectionAspect(), this.near, this.far, this.depth.mode);
    return this.getFilmHeight() / (2 * Math.tan(this.fovYRadians / 2));
  }

  setFocalLength(focalLength: number): void {
    validateFocalLength(focalLength);
    const previous = this.focalLength;
    this.focalLength = focalLength;
    try { this.updateCameraMatrices(); } catch (error) { this.focalLength = previous; throw error; }
  }

  /** Switch back to explicit vertical FOV, disabling the focal-length override. */
  setFieldOfView(fovYRadians: number): void {
    validateFov(fovYRadians);
    const previousFov = this.authoredFovYRadians;
    const previousFocalLength = this.focalLength;
    this.fovYRadians = fovYRadians;
    this.focalLength = undefined;
    try { this.updateCameraMatrices(); } catch (error) { this.authoredFovYRadians = previousFov; this.focalLength = previousFocalLength; throw error; }
  }

  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new ValidationError("CAMERA_RESIZE", "Perspective resize dimensions must be finite and positive.");
    const previous = this.aspect;
    this.aspect = width / height;
    try { this.updateCameraMatrices(); } catch (error) { this.aspect = previous; throw error; }
  }
}

function validateFov(fovYRadians: number): void {
  if (!Number.isFinite(fovYRadians) || fovYRadians <= 0 || fovYRadians >= Math.PI) {
    throw new ValidationError("CAMERA_FOV", "Perspective fovYRadians must be finite and greater than 0 and less than PI.");
  }
}

function validateFocalLength(focalLength: number): void {
  if (!Number.isFinite(focalLength) || focalLength <= 0) throw new ValidationError("CAMERA_FOCAL_LENGTH", "Perspective focal length must be finite and positive.");
}

function validateFilm(filmGauge: number, filmOffset: number, aspect: number): void {
  if (!Number.isFinite(filmGauge) || filmGauge <= 0 || !Number.isFinite(filmOffset)) {
    throw new ValidationError("CAMERA_FILM", "Perspective film gauge must be finite and positive and film offset must be finite.");
  }
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new ValidationError("CAMERA_ASPECT", "Perspective aspect must be finite and positive.");
  }
}

function validatePerspectiveProjection(fovYRadians: number, aspect: number, near: number, far: number, mode: Required<ProjectionOptions>["mode"]): void {
  validateFov(fovYRadians);
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new ValidationError("CAMERA_ASPECT", "Perspective aspect must be finite and positive.");
  }
  if (!Number.isFinite(near) || near <= 0) {
    throw new ValidationError("CAMERA_NEAR", "Perspective near plane must be finite and positive.");
  }
  if ((far !== Infinity && !Number.isFinite(far)) || far <= near || (far === Infinity && mode === "logarithmic")) {
    throw new ValidationError("CAMERA_FAR", "Perspective far plane must be greater than near; logarithmic depth requires a finite far plane.");
  }
}
