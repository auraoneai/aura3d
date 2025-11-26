/**
 * @module Rendering/Core
 * @description
 * Per-view rendering data for G3D 5.0 engine.
 * Contains camera matrices, frustum, and viewport information.
 */

import { Matrix4 } from '../math/Matrix4';
import { Vector3 } from '../math/Vector3';
import { Vector2 } from '../math/Vector2';
import { Frustum } from '../math/Frustum';
import { Camera } from './camera/Camera';
import { Rect } from '../math/Rect';

/**
 * Viewport descriptor.
 */
export interface Viewport {
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Per-view rendering data containing camera matrices and frustum.
 * Used by render passes to access view-specific information.
 *
 * @example
 * ```typescript
 * // Create from camera
 * const viewData = ViewData.fromCamera(camera, viewportWidth, viewportHeight);
 *
 * // Access matrices
 * const vp = viewData.viewProjectionMatrix;
 * const invVP = viewData.inverseViewProjectionMatrix;
 *
 * // Frustum culling
 * if (viewData.frustum.intersectsBox(objectBounds)) {
 *   // Object is visible
 * }
 *
 * // TAA jitter
 * const jitter = viewData.jitter;
 * applyJitterToProjection(jitter.x, jitter.y);
 * ```
 */
export class ViewData {
  /**
   * View matrix (world to camera space).
   */
  readonly viewMatrix: Matrix4;

  /**
   * Projection matrix (camera to clip space).
   */
  readonly projectionMatrix: Matrix4;

  /**
   * Combined view-projection matrix.
   */
  readonly viewProjectionMatrix: Matrix4;

  /**
   * Inverse view matrix (camera to world space).
   */
  readonly inverseViewMatrix: Matrix4;

  /**
   * Inverse projection matrix.
   */
  readonly inverseProjectionMatrix: Matrix4;

  /**
   * Inverse view-projection matrix.
   */
  readonly inverseViewProjectionMatrix: Matrix4;

  /**
   * Previous frame's view matrix (for motion vectors).
   */
  readonly previousViewMatrix: Matrix4;

  /**
   * Previous frame's projection matrix (for motion vectors).
   */
  readonly previousProjectionMatrix: Matrix4;

  /**
   * Previous frame's view-projection matrix.
   */
  readonly previousViewProjectionMatrix: Matrix4;

  /**
   * Camera position in world space.
   */
  readonly cameraPosition: Vector3;

  /**
   * Camera forward direction (normalized).
   */
  readonly cameraDirection: Vector3;

  /**
   * Camera up direction (normalized).
   */
  readonly cameraUp: Vector3;

  /**
   * Camera right direction (normalized).
   */
  readonly cameraRight: Vector3;

  /**
   * Near clipping plane distance.
   */
  readonly near: number;

  /**
   * Far clipping plane distance.
   */
  readonly far: number;

  /**
   * Vertical field of view in radians (for perspective cameras).
   */
  readonly fov: number;

  /**
   * Aspect ratio (width / height).
   */
  readonly aspect: number;

  /**
   * TAA jitter X offset in normalized device coordinates.
   */
  readonly jitterX: number;

  /**
   * TAA jitter Y offset in normalized device coordinates.
   */
  readonly jitterY: number;

  /**
   * View frustum for culling.
   */
  readonly frustum: Frustum;

  /**
   * Viewport rectangle.
   */
  readonly viewport: Viewport;

  /**
   * Whether this is an orthographic projection.
   */
  readonly isOrthographic: boolean;

  /**
   * Creates a new ViewData instance.
   *
   * @param params - View data parameters
   *
   * @example
   * ```typescript
   * const viewData = new ViewData({
   *   viewMatrix: view,
   *   projectionMatrix: proj,
   *   cameraPosition: new Vector3(0, 5, 10),
   *   near: 0.1,
   *   far: 1000,
   *   viewport: { x: 0, y: 0, width: 1920, height: 1080 },
   * });
   * ```
   */
  constructor(params: {
    viewMatrix: Matrix4;
    projectionMatrix: Matrix4;
    inverseViewMatrix?: Matrix4 | null;
    inverseProjectionMatrix?: Matrix4 | null;
    previousViewMatrix?: Matrix4;
    previousProjectionMatrix?: Matrix4;
    cameraPosition: Vector3;
    cameraDirection: Vector3;
    cameraUp?: Vector3;
    cameraRight?: Vector3;
    near: number;
    far: number;
    fov?: number;
    aspect?: number;
    jitterX?: number;
    jitterY?: number;
    viewport: Viewport;
    isOrthographic?: boolean;
  }) {
    this.viewMatrix = params.viewMatrix.clone();
    this.projectionMatrix = params.projectionMatrix.clone();
    this.cameraPosition = params.cameraPosition.clone();
    this.cameraDirection = params.cameraDirection.clone().normalize();
    this.near = params.near;
    this.far = params.far;
    this.viewport = { ...params.viewport };
    this.isOrthographic = params.isOrthographic ?? false;

    // Calculate combined matrix
    this.viewProjectionMatrix = this.projectionMatrix.multiply(this.viewMatrix);

    // Inverse matrices
    this.inverseViewMatrix =
      params.inverseViewMatrix?.clone() ?? this.viewMatrix.invert() ?? new Matrix4();
    this.inverseProjectionMatrix =
      params.inverseProjectionMatrix?.clone() ?? this.projectionMatrix.invert() ?? new Matrix4();
    this.inverseViewProjectionMatrix =
      this.viewProjectionMatrix.invert() ?? new Matrix4();

    // Previous frame matrices
    this.previousViewMatrix = params.previousViewMatrix?.clone() ?? this.viewMatrix.clone();
    this.previousProjectionMatrix =
      params.previousProjectionMatrix?.clone() ?? this.projectionMatrix.clone();
    this.previousViewProjectionMatrix = this.previousProjectionMatrix.multiply(
      this.previousViewMatrix
    );

    // Camera vectors
    this.cameraUp = params.cameraUp?.clone() ?? Vector3.up();
    this.cameraRight = params.cameraRight?.clone() ?? this.cameraDirection.cross(this.cameraUp).normalize();

    // FOV and aspect
    this.fov = params.fov ?? Math.PI / 4;
    this.aspect = params.aspect ?? this.viewport.width / this.viewport.height;

    // Jitter
    this.jitterX = params.jitterX ?? 0;
    this.jitterY = params.jitterY ?? 0;

    // Create frustum
    this.frustum = new Frustum();
    this.frustum.setFromProjectionMatrix(this.viewProjectionMatrix);
  }

  /**
   * Creates ViewData from a Camera instance.
   *
   * @param camera - Camera to extract data from
   * @param viewportWidth - Viewport width in pixels
   * @param viewportHeight - Viewport height in pixels
   * @param viewportX - Viewport X offset (default: 0)
   * @param viewportY - Viewport Y offset (default: 0)
   * @returns New ViewData instance
   *
   * @example
   * ```typescript
   * const viewData = ViewData.fromCamera(camera, 1920, 1080);
   * ```
   */
  static fromCamera(
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number,
    viewportX: number = 0,
    viewportY: number = 0
  ): ViewData {
    const transform = camera.transform;
    const worldMatrix = transform.worldMatrix;

    // Extract camera vectors from world matrix
    const e = worldMatrix.elements;

    // Right vector (first column)
    const cameraRight = new Vector3(e[0], e[1], e[2]);

    // Up vector (second column)
    const cameraUp = new Vector3(e[4], e[5], e[6]);

    // Forward vector (negative third column for right-handed)
    const cameraDirection = new Vector3(-e[8], -e[9], -e[10]);

    // Get jitter offset
    const jitter = camera.jitterOffset;

    return new ViewData({
      viewMatrix: camera.viewMatrix,
      projectionMatrix: camera.projectionMatrix,
      inverseViewMatrix: camera.inverseViewMatrix,
      inverseProjectionMatrix: camera.inverseProjectionMatrix,
      previousViewMatrix: camera.previousViewMatrix,
      previousProjectionMatrix: camera.previousProjectionMatrix,
      cameraPosition: transform.worldPosition,
      cameraDirection,
      cameraUp,
      cameraRight,
      near: camera.near,
      far: camera.far,
      fov: camera.fov,
      aspect: camera.aspect,
      jitterX: jitter.x,
      jitterY: jitter.y,
      viewport: {
        x: viewportX,
        y: viewportY,
        width: viewportWidth,
        height: viewportHeight,
      },
      isOrthographic: camera.projectionType === 0, // ProjectionType.Perspective = 0
    });
  }

  /**
   * Gets the jitter offset as a Vector2.
   * @returns Jitter offset
   */
  get jitter(): Vector2 {
    return new Vector2(this.jitterX, this.jitterY);
  }

  /**
   * Converts a world-space point to screen coordinates.
   * Returns null if the point is behind the camera.
   *
   * @param worldPoint - Point in world space
   * @returns Screen coordinates (x, y in [0, 1], z = depth) or null
   *
   * @example
   * ```typescript
   * const screenPos = viewData.worldToScreen(worldPoint);
   * if (screenPos) {
   *   console.log(`Screen: (${screenPos.x}, ${screenPos.y})`);
   * }
   * ```
   */
  worldToScreen(worldPoint: Vector3): Vector3 | null {
    const vp = this.viewProjectionMatrix;
    const e = vp.elements;

    // Transform to clip space
    const clipX = worldPoint.x * e[0] + worldPoint.y * e[4] + worldPoint.z * e[8] + e[12];
    const clipY = worldPoint.x * e[1] + worldPoint.y * e[5] + worldPoint.z * e[9] + e[13];
    const clipZ = worldPoint.x * e[2] + worldPoint.y * e[6] + worldPoint.z * e[10] + e[14];
    const clipW = worldPoint.x * e[3] + worldPoint.y * e[7] + worldPoint.z * e[11] + e[15];

    // Check if behind camera
    if (clipW <= 0) {
      return null;
    }

    // Perspective divide to NDC
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;
    const ndcZ = clipZ / clipW;

    // Convert NDC to screen coordinates [0, 1]
    const screenX = (ndcX + 1) * 0.5;
    const screenY = (-ndcY + 1) * 0.5; // Flip Y
    const screenZ = (ndcZ + 1) * 0.5; // Map to [0, 1]

    return new Vector3(screenX, screenY, screenZ);
  }

  /**
   * Converts screen coordinates to a world-space point at a given depth.
   *
   * @param screenPoint - Screen coordinates (x, y in [0, 1], z = depth)
   * @returns World-space point
   *
   * @example
   * ```typescript
   * const worldPos = viewData.screenToWorld(new Vector3(0.5, 0.5, 0.5));
   * ```
   */
  screenToWorld(screenPoint: Vector3): Vector3 {
    // Convert screen to NDC
    const ndcX = screenPoint.x * 2 - 1;
    const ndcY = -(screenPoint.y * 2 - 1); // Flip Y
    const ndcZ = screenPoint.z * 2 - 1;

    const invVP = this.inverseViewProjectionMatrix;
    const e = invVP.elements;

    // Transform from clip to world
    const worldX = ndcX * e[0] + ndcY * e[4] + ndcZ * e[8] + e[12];
    const worldY = ndcX * e[1] + ndcY * e[5] + ndcZ * e[9] + e[13];
    const worldZ = ndcX * e[2] + ndcY * e[6] + ndcZ * e[10] + e[14];
    const worldW = ndcX * e[3] + ndcY * e[7] + ndcZ * e[11] + e[15];

    return new Vector3(worldX / worldW, worldY / worldW, worldZ / worldW);
  }

  /**
   * Creates a copy of this ViewData.
   * @returns New ViewData instance
   */
  clone(): ViewData {
    return new ViewData({
      viewMatrix: this.viewMatrix,
      projectionMatrix: this.projectionMatrix,
      inverseViewMatrix: this.inverseViewMatrix,
      inverseProjectionMatrix: this.inverseProjectionMatrix,
      previousViewMatrix: this.previousViewMatrix,
      previousProjectionMatrix: this.previousProjectionMatrix,
      cameraPosition: this.cameraPosition,
      cameraDirection: this.cameraDirection,
      cameraUp: this.cameraUp,
      cameraRight: this.cameraRight,
      near: this.near,
      far: this.far,
      fov: this.fov,
      aspect: this.aspect,
      jitterX: this.jitterX,
      jitterY: this.jitterY,
      viewport: this.viewport,
      isOrthographic: this.isOrthographic,
    });
  }
}
