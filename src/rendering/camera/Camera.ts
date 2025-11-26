/**
 * Camera class for perspective and orthographic projections with frustum culling.
 * Supports jitter for TAA, previous frame matrices for motion vectors, and ray casting.
 * @module Camera
 */

import { Matrix4 } from '../../math/Matrix4';
import { Vector3 } from '../../math/Vector3';
import { Vector2 } from '../../math/Vector2';
import { Frustum } from '../../math/Frustum';
import { Ray } from '../../math/Ray';
import { Transform } from '../../math/Transform';
import { EPSILON } from '../../math/MathConstants';

/**
 * Camera projection type enumeration.
 */
export enum ProjectionType {
  /**
   * Perspective projection with field of view.
   */
  Perspective = 'perspective',

  /**
   * Orthographic projection with fixed dimensions.
   */
  Orthographic = 'orthographic',
}

/**
 * Halton sequence generator for TAA jitter patterns.
 * Provides low-discrepancy quasi-random sequences.
 */
class HaltonSequence {
  private index: number = 0;

  /**
   * Generates next value in Halton sequence for given base.
   * @param base - Prime number base (typically 2 or 3)
   * @returns Value between 0 and 1
   */
  private halton(base: number): number {
    let f = 1;
    let r = 0;
    let i = this.index;

    while (i > 0) {
      f = f / base;
      r = r + f * (i % base);
      i = Math.floor(i / base);
    }

    return r;
  }

  /**
   * Gets next 2D jitter offset using bases 2 and 3.
   * @returns Jitter offset in range [-0.5, 0.5] for each axis
   */
  next(): Vector2 {
    const x = this.halton(2) - 0.5;
    const y = this.halton(3) - 0.5;
    this.index++;
    return new Vector2(x, y);
  }

  /**
   * Resets sequence to start.
   */
  reset(): void {
    this.index = 0;
  }

  /**
   * Sets current index in sequence.
   * @param index - New index value
   */
  setIndex(index: number): void {
    this.index = index;
  }
}

/**
 * Camera class providing projection, view, and frustum management.
 * Supports both perspective and orthographic projections with automatic frustum updates.
 *
 * @example
 * ```typescript
 * // Create perspective camera
 * const camera = new Camera();
 * camera.setPerspective(Math.PI / 4, 16 / 9, 0.1, 1000);
 * camera.transform.position.set(0, 5, 10);
 * camera.transform.lookAt(new Vector3(0, 0, 0));
 *
 * // Create orthographic camera
 * const orthoCamera = new Camera();
 * orthoCamera.setOrthographic(-10, 10, -10, 10, 0.1, 100);
 *
 * // Screen-to-world ray casting
 * const ray = camera.screenPointToRay(new Vector2(0.5, 0.5));
 *
 * // World-to-screen projection
 * const screenPos = camera.worldToScreenPoint(new Vector3(0, 0, -5));
 *
 * // Frustum culling
 * const box = { min: new Vector3(-1, -1, -1), max: new Vector3(1, 1, 1) };
 * if (camera.frustum.intersectsBox(box)) {
 *   console.log('Box is visible');
 * }
 *
 * // TAA jitter
 * camera.enableJitter(true);
 * camera.updateJitter();
 * const jitteredMatrix = camera.projectionMatrix;
 * ```
 */
export class Camera {
  /**
   * Transform defining camera position and orientation.
   */
  readonly transform: Transform;

  /**
   * Projection type (perspective or orthographic).
   */
  private _projectionType: ProjectionType = ProjectionType.Perspective;

  /**
   * Vertical field of view in radians (for perspective).
   */
  private _fov: number = Math.PI / 4;

  /**
   * Aspect ratio (width / height).
   */
  private _aspect: number = 16 / 9;

  /**
   * Near clipping plane distance.
   */
  private _near: number = 0.1;

  /**
   * Far clipping plane distance.
   */
  private _far: number = 1000;

  /**
   * Left plane for orthographic projection.
   */
  private _left: number = -10;

  /**
   * Right plane for orthographic projection.
   */
  private _right: number = 10;

  /**
   * Bottom plane for orthographic projection.
   */
  private _bottom: number = -10;

  /**
   * Top plane for orthographic projection.
   */
  private _top: number = 10;

  /**
   * Projection matrix.
   */
  private _projectionMatrix: Matrix4;

  /**
   * View matrix (inverse of transform's world matrix).
   */
  private _viewMatrix: Matrix4;

  /**
   * Combined view-projection matrix.
   */
  private _viewProjectionMatrix: Matrix4;

  /**
   * Inverse projection matrix.
   */
  private _inverseProjectionMatrix: Matrix4 | null = null;

  /**
   * Inverse view matrix.
   */
  private _inverseViewMatrix: Matrix4 | null = null;

  /**
   * Inverse view-projection matrix.
   */
  private _inverseViewProjectionMatrix: Matrix4 | null = null;

  /**
   * Previous frame's view matrix (for motion vectors).
   */
  private _previousViewMatrix: Matrix4;

  /**
   * Previous frame's projection matrix (for motion vectors).
   */
  private _previousProjectionMatrix: Matrix4;

  /**
   * Previous frame's view-projection matrix (for motion vectors).
   */
  private _previousViewProjectionMatrix: Matrix4;

  /**
   * View frustum for culling tests.
   */
  readonly frustum: Frustum;

  /**
   * Whether projection matrix needs recalculation.
   */
  private _projectionDirty: boolean = true;

  /**
   * Whether view matrix needs recalculation.
   */
  private _viewDirty: boolean = true;

  /**
   * Whether jitter is enabled for TAA.
   */
  private _jitterEnabled: boolean = false;

  /**
   * Current jitter offset in normalized device coordinates.
   */
  private _jitterOffset: Vector2 = new Vector2(0, 0);

  /**
   * Halton sequence generator for jitter patterns.
   */
  private _haltonSequence: HaltonSequence = new HaltonSequence();

  /**
   * Zoom factor for orthographic cameras (1 = default).
   */
  private _zoom: number = 1;

  /**
   * Creates a new Camera instance.
   *
   * @example
   * ```typescript
   * const camera = new Camera();
   * camera.setPerspective(Math.PI / 4, 16 / 9, 0.1, 1000);
   * ```
   */
  constructor() {
    this.transform = new Transform();
    this._projectionMatrix = new Matrix4();
    this._viewMatrix = new Matrix4();
    this._viewProjectionMatrix = new Matrix4();
    this._previousViewMatrix = new Matrix4();
    this._previousProjectionMatrix = new Matrix4();
    this._previousViewProjectionMatrix = new Matrix4();
    this.frustum = new Frustum();

    // Mark transform changes as requiring view matrix update
    this.transform.onChange = () => {
      this._viewDirty = true;
    };
  }

  /**
   * Sets the camera position.
   * @param position - New position
   * @returns this for chaining
   */
  setPosition(position: Vector3): this {
    this.transform.position.copy(position);
    this._viewDirty = true;
    return this;
  }

  /**
   * Gets the camera position.
   * @returns Current position
   */
  getPosition(): Vector3 {
    return this.transform.position.clone();
  }

  /**
   * Makes the camera look at a target point.
   * @param target - Target position to look at
   * @param up - Up vector (default: Vector3.up())
   * @returns this for chaining
   */
  lookAt(target: Vector3, up: Vector3 = Vector3.up()): this {
    this.transform.lookAt(target, up);
    this._viewDirty = true;
    return this;
  }

  /**
   * Gets the projection type.
   * @returns Current projection type
   */
  get projectionType(): ProjectionType {
    return this._projectionType;
  }

  /**
   * Gets the field of view in radians.
   * @returns Field of view
   */
  get fov(): number {
    return this._fov;
  }

  /**
   * Gets the aspect ratio.
   * @returns Aspect ratio (width / height)
   */
  get aspect(): number {
    return this._aspect;
  }

  /**
   * Gets the near clipping plane distance.
   * @returns Near plane distance
   */
  get near(): number {
    return this._near;
  }

  /**
   * Gets the far clipping plane distance.
   * @returns Far plane distance
   */
  get far(): number {
    return this._far;
  }

  /**
   * Gets the zoom factor for orthographic cameras.
   * @returns Zoom factor
   */
  get zoom(): number {
    return this._zoom;
  }

  /**
   * Sets the zoom factor for orthographic cameras.
   * @param zoom - New zoom factor (must be > 0)
   */
  set zoom(zoom: number) {
    if (zoom <= 0) {
      console.warn('Camera: Zoom must be positive, clamping to 0.001');
      zoom = 0.001;
    }
    this._zoom = zoom;
    this._projectionDirty = true;
  }

  /**
   * Sets up perspective projection.
   *
   * @param fov - Vertical field of view in radians
   * @param aspect - Aspect ratio (width / height)
   * @param near - Near clipping plane distance
   * @param far - Far clipping plane distance
   *
   * @example
   * ```typescript
   * camera.setPerspective(Math.PI / 4, 16 / 9, 0.1, 1000);
   * ```
   */
  setPerspective(fov: number, aspect: number, near: number, far: number): void {
    this._projectionType = ProjectionType.Perspective;
    this._fov = fov;
    this._aspect = aspect;
    this._near = near;
    this._far = far;
    this._projectionDirty = true;
    this._invalidateInverseMatrices();
  }

  /**
   * Sets up orthographic projection.
   *
   * @param left - Left clipping plane
   * @param right - Right clipping plane
   * @param bottom - Bottom clipping plane
   * @param top - Top clipping plane
   * @param near - Near clipping plane distance
   * @param far - Far clipping plane distance
   *
   * @example
   * ```typescript
   * camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);
   * ```
   */
  setOrthographic(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number
  ): void {
    this._projectionType = ProjectionType.Orthographic;
    this._left = left;
    this._right = right;
    this._bottom = bottom;
    this._top = top;
    this._near = near;
    this._far = far;
    this._projectionDirty = true;
    this._invalidateInverseMatrices();
  }

  /**
   * Updates aspect ratio (useful for window resize).
   *
   * @param aspect - New aspect ratio
   *
   * @example
   * ```typescript
   * window.addEventListener('resize', () => {
   *   const aspect = window.innerWidth / window.innerHeight;
   *   camera.setAspect(aspect);
   * });
   * ```
   */
  setAspect(aspect: number): void {
    this._aspect = aspect;
    if (this._projectionType === ProjectionType.Perspective) {
      this._projectionDirty = true;
      this._invalidateInverseMatrices();
    }
  }

  /**
   * Gets the projection matrix, recalculating if dirty.
   * @returns Projection matrix
   */
  get projectionMatrix(): Matrix4 {
    if (this._projectionDirty) {
      this._updateProjectionMatrix();
    }
    return this._projectionMatrix;
  }

  /**
   * Gets the view matrix, recalculating if dirty.
   * @returns View matrix
   */
  get viewMatrix(): Matrix4 {
    if (this._viewDirty) {
      this._updateViewMatrix();
    }
    return this._viewMatrix;
  }

  /**
   * Gets the combined view-projection matrix.
   * @returns View-projection matrix
   */
  get viewProjectionMatrix(): Matrix4 {
    if (this._projectionDirty || this._viewDirty) {
      this._updateViewProjectionMatrix();
    }
    return this._viewProjectionMatrix;
  }

  /**
   * Gets the inverse projection matrix.
   * @returns Inverse projection matrix or null if singular
   */
  get inverseProjectionMatrix(): Matrix4 | null {
    if (this._projectionDirty || !this._inverseProjectionMatrix) {
      this._updateProjectionMatrix();
      this._inverseProjectionMatrix = this._projectionMatrix.invert();
    }
    return this._inverseProjectionMatrix;
  }

  /**
   * Gets the inverse view matrix.
   * @returns Inverse view matrix or null if singular
   */
  get inverseViewMatrix(): Matrix4 | null {
    if (this._viewDirty || !this._inverseViewMatrix) {
      this._updateViewMatrix();
      this._inverseViewMatrix = this._viewMatrix.invert();
    }
    return this._inverseViewMatrix;
  }

  /**
   * Gets the inverse view-projection matrix.
   * @returns Inverse view-projection matrix or null if singular
   */
  get inverseViewProjectionMatrix(): Matrix4 | null {
    if (this._projectionDirty || this._viewDirty || !this._inverseViewProjectionMatrix) {
      this._updateViewProjectionMatrix();
      this._inverseViewProjectionMatrix = this._viewProjectionMatrix.invert();
    }
    return this._inverseViewProjectionMatrix;
  }

  /**
   * Gets the previous frame's view matrix.
   * @returns Previous view matrix
   */
  get previousViewMatrix(): Matrix4 {
    return this._previousViewMatrix;
  }

  /**
   * Gets the previous frame's projection matrix.
   * @returns Previous projection matrix
   */
  get previousProjectionMatrix(): Matrix4 {
    return this._previousProjectionMatrix;
  }

  /**
   * Gets the previous frame's view-projection matrix.
   * @returns Previous view-projection matrix
   */
  get previousViewProjectionMatrix(): Matrix4 {
    return this._previousViewProjectionMatrix;
  }

  /**
   * Enables or disables jitter for temporal anti-aliasing.
   *
   * @param enabled - Whether to enable jitter
   *
   * @example
   * ```typescript
   * camera.enableJitter(true);
   * ```
   */
  enableJitter(enabled: boolean): void {
    this._jitterEnabled = enabled;
    if (!enabled) {
      this._jitterOffset.set(0, 0);
      this._projectionDirty = true;
    }
  }

  /**
   * Updates jitter offset for next frame (typically called once per frame).
   * Uses Halton sequence for low-discrepancy sampling.
   *
   * @example
   * ```typescript
   * // In render loop
   * camera.updateJitter();
   * renderer.render(scene, camera);
   * ```
   */
  updateJitter(): void {
    if (this._jitterEnabled) {
      this._jitterOffset = this._haltonSequence.next();
      this._projectionDirty = true;
    }
  }

  /**
   * Resets jitter sequence to start.
   *
   * @example
   * ```typescript
   * camera.resetJitter();
   * ```
   */
  resetJitter(): void {
    this._haltonSequence.reset();
    this._jitterOffset.set(0, 0);
    this._projectionDirty = true;
  }

  /**
   * Gets the current jitter offset in normalized device coordinates.
   * @returns Jitter offset
   */
  get jitterOffset(): Vector2 {
    return this._jitterOffset.clone();
  }

  /**
   * Converts a screen point to a world-space ray.
   * Screen coordinates are normalized: (0, 0) = top-left, (1, 1) = bottom-right.
   *
   * @param screenPoint - Normalized screen coordinates
   * @returns Ray from camera through screen point
   *
   * @example
   * ```typescript
   * // Get ray through center of screen
   * const ray = camera.screenPointToRay(new Vector2(0.5, 0.5));
   *
   * // Mouse picking
   * const mouseX = event.clientX / window.innerWidth;
   * const mouseY = event.clientY / window.innerHeight;
   * const pickRay = camera.screenPointToRay(new Vector2(mouseX, mouseY));
   * ```
   */
  screenPointToRay(screenPoint: Vector2): Ray {
    // Convert screen coordinates to NDC (-1 to 1)
    const ndcX = screenPoint.x * 2 - 1;
    const ndcY = -(screenPoint.y * 2 - 1); // Flip Y

    const invVP = this.inverseViewProjectionMatrix;
    if (!invVP) {
      console.warn('Camera: Cannot compute inverse view-projection matrix');
      return new Ray(this.transform.worldPosition, Vector3.forward());
    }

    // Create points in NDC space (near and far plane)
    const nearPoint = this._transformPoint(invVP, ndcX, ndcY, -1);
    const farPoint = this._transformPoint(invVP, ndcX, ndcY, 1);

    const origin = this._projectionType === ProjectionType.Perspective ? nearPoint : nearPoint;
    const direction = farPoint.sub(nearPoint).normalize();

    return new Ray(origin, direction);
  }

  /**
   * Converts a world-space point to screen coordinates.
   * Returns normalized coordinates: (0, 0) = top-left, (1, 1) = bottom-right.
   * The z component indicates depth (0 = near, 1 = far).
   *
   * @param worldPoint - Point in world space
   * @returns Screen coordinates with depth, or null if behind camera
   *
   * @example
   * ```typescript
   * const worldPos = new Vector3(0, 0, -5);
   * const screenPos = camera.worldToScreenPoint(worldPos);
   * if (screenPos) {
   *   console.log(`Screen: (${screenPos.x}, ${screenPos.y}), Depth: ${screenPos.z}`);
   * }
   * ```
   */
  worldToScreenPoint(worldPoint: Vector3): Vector3 | null {
    const vp = this.viewProjectionMatrix;
    const e = vp.elements;

    // Transform to clip space
    const clipX = worldPoint.x * e[0]! + worldPoint.y * e[4]! + worldPoint.z * e[8]! + e[12]!;
    const clipY = worldPoint.x * e[1]! + worldPoint.y * e[5]! + worldPoint.z * e[9]! + e[13]!;
    const clipZ = worldPoint.x * e[2]! + worldPoint.y * e[6]! + worldPoint.z * e[10]! + e[14]!;
    const clipW = worldPoint.x * e[3]! + worldPoint.y * e[7]! + worldPoint.z * e[11]! + e[15]!;

    // Check if behind camera
    if (clipW <= 0) {
      return null;
    }

    // Perspective divide to NDC
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;
    const ndcZ = clipZ / clipW;

    // Convert NDC to screen coordinates
    const screenX = (ndcX + 1) * 0.5;
    const screenY = (-ndcY + 1) * 0.5; // Flip Y
    const screenZ = (ndcZ + 1) * 0.5; // Map to [0, 1]

    return new Vector3(screenX, screenY, screenZ);
  }

  /**
   * Converts a world-space point to normalized device coordinates.
   * Returns coordinates in range [-1, 1] for x and y, and depth-dependent for z.
   *
   * @param worldPoint - Point in world space
   * @returns NDC coordinates, or null if behind camera
   *
   * @example
   * ```typescript
   * const worldPos = new Vector3(0, 0, -5);
   * const ndcPos = camera.worldToNDC(worldPos);
   * if (ndcPos) {
   *   console.log(`NDC: (${ndcPos.x}, ${ndcPos.y}, ${ndcPos.z})`);
   * }
   * ```
   */
  worldToNDC(worldPoint: Vector3): Vector3 | null {
    const vp = this.viewProjectionMatrix;
    const e = vp.elements;

    const clipX = worldPoint.x * e[0]! + worldPoint.y * e[4]! + worldPoint.z * e[8]! + e[12]!;
    const clipY = worldPoint.x * e[1]! + worldPoint.y * e[5]! + worldPoint.z * e[9]! + e[13]!;
    const clipZ = worldPoint.x * e[2]! + worldPoint.y * e[6]! + worldPoint.z * e[10]! + e[14]!;
    const clipW = worldPoint.x * e[3]! + worldPoint.y * e[7]! + worldPoint.z * e[11]! + e[15]!;

    if (clipW <= 0) {
      return null;
    }

    return new Vector3(clipX / clipW, clipY / clipW, clipZ / clipW);
  }

  /**
   * Updates matrices for next frame and stores current as previous.
   * Call this at the end of each frame for motion vector support.
   *
   * @example
   * ```typescript
   * // In render loop
   * renderer.render(scene, camera);
   * camera.updateMatrices();
   * ```
   */
  updateMatrices(): void {
    // Update current matrices
    const view = this.viewMatrix;
    const proj = this.projectionMatrix;
    const viewProj = this.viewProjectionMatrix;

    // Store as previous
    this._previousViewMatrix.copy(view);
    this._previousProjectionMatrix.copy(proj);
    this._previousViewProjectionMatrix.copy(viewProj);
  }

  /**
   * Updates the projection matrix based on current settings.
   * Applies jitter if enabled.
   * @private
   */
  private _updateProjectionMatrix(): void {
    if (this._projectionType === ProjectionType.Perspective) {
      this._projectionMatrix.perspective(this._fov, this._aspect, this._near, this._far);
    } else {
      const zoom = this._zoom;
      this._projectionMatrix.orthographic(
        this._left / zoom,
        this._right / zoom,
        this._bottom / zoom,
        this._top / zoom,
        this._near,
        this._far
      );
    }

    // Apply jitter if enabled
    if (this._jitterEnabled && (Math.abs(this._jitterOffset.x) > EPSILON || Math.abs(this._jitterOffset.y) > EPSILON)) {
      const e = this._projectionMatrix.elements;
      e[8]! += this._jitterOffset.x * 2 / this._aspect; // Adjust for aspect ratio
      e[9]! += this._jitterOffset.y * 2;
    }

    this._projectionDirty = false;
    this._invalidateInverseMatrices();
  }

  /**
   * Updates the view matrix from transform's world matrix.
   * @private
   */
  private _updateViewMatrix(): void {
    const worldMatrix = this.transform.worldMatrix;
    const invWorld = worldMatrix.invert();

    if (invWorld) {
      this._viewMatrix.copy(invWorld);
    } else {
      console.warn('Camera: Cannot invert world matrix, using identity');
      this._viewMatrix.identity();
    }

    this._viewDirty = false;
    this._invalidateInverseMatrices();
  }

  /**
   * Updates the combined view-projection matrix and frustum.
   * @private
   */
  private _updateViewProjectionMatrix(): void {
    const proj = this.projectionMatrix;
    const view = this.viewMatrix;

    this._viewProjectionMatrix = proj.multiply(view);

    // Update frustum planes
    this.frustum.setFromProjectionMatrix(this._viewProjectionMatrix);

    this._invalidateInverseMatrices();
  }

  /**
   * Invalidates cached inverse matrices.
   * @private
   */
  private _invalidateInverseMatrices(): void {
    this._inverseProjectionMatrix = null;
    this._inverseViewMatrix = null;
    this._inverseViewProjectionMatrix = null;
  }

  /**
   * Transforms a point using a matrix and homogeneous coordinates.
   * @private
   */
  private _transformPoint(matrix: Matrix4, x: number, y: number, z: number): Vector3 {
    const e = matrix.elements;

    const outX = x * e[0]! + y * e[4]! + z * e[8]! + e[12]!;
    const outY = x * e[1]! + y * e[5]! + z * e[9]! + e[13]!;
    const outZ = x * e[2]! + y * e[6]! + z * e[10]! + e[14]!;
    const outW = x * e[3]! + y * e[7]! + z * e[11]! + e[15]!;

    return new Vector3(outX / outW, outY / outW, outZ / outW);
  }

  /**
   * Creates a copy of this camera.
   * @returns New camera with same settings
   *
   * @example
   * ```typescript
   * const camera2 = camera.clone();
   * ```
   */
  clone(): Camera {
    const camera = new Camera();

    if (this._projectionType === ProjectionType.Perspective) {
      camera.setPerspective(this._fov, this._aspect, this._near, this._far);
    } else {
      camera.setOrthographic(
        this._left,
        this._right,
        this._bottom,
        this._top,
        this._near,
        this._far
      );
    }

    camera.transform.copy(this.transform);
    camera._zoom = this._zoom;
    camera._jitterEnabled = this._jitterEnabled;

    return camera;
  }
}
