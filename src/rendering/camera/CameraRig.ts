/**
 * Camera rig for multi-camera setups including split-screen, picture-in-picture, and VR stereo rendering.
 * @module CameraRig
 */

import { Camera } from './Camera';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Transform } from '../../math/Transform';

/**
 * Eye type for stereo rendering.
 */
export enum StereoEye {
  /**
   * Left eye.
   */
  Left = 'left',

  /**
   * Right eye.
   */
  Right = 'right',

  /**
   * Center (monoscopic).
   */
  Center = 'center',
}

/**
 * Camera configuration for multi-camera rendering.
 */
export interface CameraConfig {
  /**
   * The camera instance.
   */
  camera: Camera;

  /**
   * Viewport x position (normalized 0-1).
   */
  viewportX: number;

  /**
   * Viewport y position (normalized 0-1).
   */
  viewportY: number;

  /**
   * Viewport width (normalized 0-1).
   */
  viewportWidth: number;

  /**
   * Viewport height (normalized 0-1).
   */
  viewportHeight: number;

  /**
   * Render order (lower numbers render first).
   */
  order: number;

  /**
   * Whether this camera is active.
   */
  active: boolean;

  /**
   * Optional eye designation for stereo rendering.
   */
  eye?: StereoEye;
}

/**
 * Camera rig managing multiple cameras for split-screen, PiP, and VR rendering.
 * Provides utilities for stereo rendering and multi-viewport setups.
 *
 * @example
 * ```typescript
 * // Split-screen setup
 * const rig = new CameraRig();
 * const camera1 = new Camera();
 * const camera2 = new Camera();
 *
 * rig.addCamera(camera1, 0, 0, 0.5, 1, 0);     // Left half
 * rig.addCamera(camera2, 0.5, 0, 0.5, 1, 1);   // Right half
 *
 * // Picture-in-picture
 * rig.addCamera(mainCamera, 0, 0, 1, 1, 0);
 * rig.addCamera(pipCamera, 0.7, 0.7, 0.25, 0.25, 1);
 *
 * // VR stereo rendering
 * rig.setupStereo(camera, 0.064); // 64mm IPD
 * const configs = rig.getCameraConfigs();
 * ```
 */
export class CameraRig {
  /**
   * Root transform for the entire rig.
   */
  readonly transform: Transform;

  /**
   * Camera configurations managed by this rig.
   */
  private _cameras: CameraConfig[] = [];

  /**
   * Inter-pupillary distance for stereo rendering (in meters).
   */
  private _ipd: number = 0.064;

  /**
   * Convergence distance for stereo rendering (where eyes converge).
   */
  private _convergence: number = 10;

  /**
   * Whether stereo mode is enabled.
   */
  private _stereoEnabled: boolean = false;

  /**
   * Creates a new camera rig.
   *
   * @example
   * ```typescript
   * const rig = new CameraRig();
   * ```
   */
  constructor() {
    this.transform = new Transform();
  }

  /**
   * Gets all camera configurations.
   * @returns Array of camera configurations
   */
  getCameraConfigs(): readonly CameraConfig[] {
    return this._cameras;
  }

  /**
   * Gets active camera configurations sorted by render order.
   * @returns Array of active camera configurations
   */
  getActiveCameras(): CameraConfig[] {
    return this._cameras
      .filter(config => config.active)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Adds a camera to the rig.
   *
   * @param camera - Camera to add
   * @param viewportX - Viewport x position (0-1)
   * @param viewportY - Viewport y position (0-1)
   * @param viewportWidth - Viewport width (0-1)
   * @param viewportHeight - Viewport height (0-1)
   * @param order - Render order (default: 0)
   * @param active - Whether camera is active (default: true)
   * @returns Camera configuration
   *
   * @example
   * ```typescript
   * const camera = new Camera();
   * rig.addCamera(camera, 0, 0, 1, 1, 0, true);
   * ```
   */
  addCamera(
    camera: Camera,
    viewportX: number,
    viewportY: number,
    viewportWidth: number,
    viewportHeight: number,
    order: number = 0,
    active: boolean = true
  ): CameraConfig {
    const config: CameraConfig = {
      camera,
      viewportX,
      viewportY,
      viewportWidth,
      viewportHeight,
      order,
      active,
    };

    this._cameras.push(config);

    // Parent camera to rig
    camera.transform.setParent(this.transform);

    return config;
  }

  /**
   * Removes a camera from the rig.
   *
   * @param camera - Camera to remove
   * @returns True if camera was removed
   *
   * @example
   * ```typescript
   * rig.removeCamera(camera);
   * ```
   */
  removeCamera(camera: Camera): boolean {
    const index = this._cameras.findIndex(config => config.camera === camera);

    if (index !== -1) {
      this._cameras.splice(index, 1);
      camera.transform.setParent(null);
      return true;
    }

    return false;
  }

  /**
   * Removes all cameras from the rig.
   *
   * @example
   * ```typescript
   * rig.clear();
   * ```
   */
  clear(): void {
    for (const config of this._cameras) {
      config.camera.transform.setParent(null);
    }
    this._cameras = [];
  }

  /**
   * Sets up split-screen configuration with N cameras.
   *
   * @param cameras - Array of cameras
   * @param horizontal - If true, split horizontally; otherwise vertically
   *
   * @example
   * ```typescript
   * const cameras = [camera1, camera2, camera3, camera4];
   * rig.setupSplitScreen(cameras, true); // 4-way horizontal split
   * ```
   */
  setupSplitScreen(cameras: Camera[], horizontal: boolean = true): void {
    this.clear();

    const count = cameras.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      if (horizontal) {
        const width = 1 / count;
        this.addCamera(cameras[i], i * width, 0, width, 1, i);
      } else {
        const height = 1 / count;
        this.addCamera(cameras[i], 0, i * height, 1, height, i);
      }
    }
  }

  /**
   * Sets up picture-in-picture configuration.
   *
   * @param mainCamera - Main full-screen camera
   * @param pipCamera - Picture-in-picture camera
   * @param pipX - PiP x position (0-1)
   * @param pipY - PiP y position (0-1)
   * @param pipWidth - PiP width (0-1)
   * @param pipHeight - PiP height (0-1)
   *
   * @example
   * ```typescript
   * rig.setupPictureInPicture(mainCamera, pipCamera, 0.7, 0.7, 0.25, 0.25);
   * ```
   */
  setupPictureInPicture(
    mainCamera: Camera,
    pipCamera: Camera,
    pipX: number = 0.7,
    pipY: number = 0.7,
    pipWidth: number = 0.25,
    pipHeight: number = 0.25
  ): void {
    this.clear();
    this.addCamera(mainCamera, 0, 0, 1, 1, 0);
    this.addCamera(pipCamera, pipX, pipY, pipWidth, pipHeight, 1);
  }

  /**
   * Sets up stereo rendering for VR/AR.
   * Creates left and right eye cameras with proper eye separation.
   *
   * @param baseCamera - Base camera to derive stereo cameras from
   * @param ipd - Inter-pupillary distance in meters (default: 0.064)
   * @param convergence - Convergence distance (default: 10)
   *
   * @example
   * ```typescript
   * const camera = new Camera();
   * camera.setPerspective(Math.PI / 2, 1, 0.1, 1000);
   * rig.setupStereo(camera, 0.064, 10);
   * ```
   */
  setupStereo(
    baseCamera: Camera,
    ipd: number = 0.064,
    convergence: number = 10
  ): void {
    this.clear();

    this._ipd = ipd;
    this._convergence = convergence;
    this._stereoEnabled = true;

    // Create left eye camera
    const leftCamera = baseCamera.clone();
    const leftConfig = this.addCamera(leftCamera, 0, 0, 0.5, 1, 0);
    leftConfig.eye = StereoEye.Left;

    // Create right eye camera
    const rightCamera = baseCamera.clone();
    const rightConfig = this.addCamera(rightCamera, 0.5, 0, 0.5, 1, 1);
    rightConfig.eye = StereoEye.Right;

    // Apply eye offsets
    this._updateStereoOffsets();
  }

  /**
   * Gets the inter-pupillary distance.
   * @returns IPD in meters
   */
  get ipd(): number {
    return this._ipd;
  }

  /**
   * Sets the inter-pupillary distance for stereo rendering.
   * @param ipd - IPD in meters
   */
  set ipd(ipd: number) {
    this._ipd = ipd;
    if (this._stereoEnabled) {
      this._updateStereoOffsets();
    }
  }

  /**
   * Gets the convergence distance.
   * @returns Convergence distance
   */
  get convergence(): number {
    return this._convergence;
  }

  /**
   * Sets the convergence distance for stereo rendering.
   * @param convergence - Convergence distance
   */
  set convergence(convergence: number) {
    this._convergence = convergence;
    if (this._stereoEnabled) {
      this._updateStereoOffsets();
    }
  }

  /**
   * Gets whether stereo mode is enabled.
   * @returns True if stereo is enabled
   */
  get stereoEnabled(): boolean {
    return this._stereoEnabled;
  }

  /**
   * Updates stereo camera offsets based on IPD and convergence.
   * @private
   */
  private _updateStereoOffsets(): void {
    const halfIPD = this._ipd * 0.5;

    for (const config of this._cameras) {
      if (config.eye === StereoEye.Left) {
        // Left eye offset
        config.camera.transform.position.set(-halfIPD, 0, 0);
      } else if (config.eye === StereoEye.Right) {
        // Right eye offset
        config.camera.transform.position.set(halfIPD, 0, 0);
      }
    }
  }

  /**
   * Updates all camera transforms relative to rig transform.
   * Call this each frame if rig transform changes.
   *
   * @example
   * ```typescript
   * // In render loop
   * rig.transform.position.set(playerPosition);
   * rig.update();
   * ```
   */
  update(): void {
    // Camera transforms are automatically updated through parent-child relationships
    // This method exists for potential future extensions
  }

  /**
   * Gets camera at viewport position.
   *
   * @param normalizedX - Normalized x coordinate (0-1)
   * @param normalizedY - Normalized y coordinate (0-1)
   * @returns Camera at position or null
   *
   * @example
   * ```typescript
   * const mouseX = event.clientX / window.innerWidth;
   * const mouseY = event.clientY / window.innerHeight;
   * const camera = rig.getCameraAtPosition(mouseX, mouseY);
   * ```
   */
  getCameraAtPosition(normalizedX: number, normalizedY: number): Camera | null {
    // Search in reverse order (top cameras first)
    const configs = this.getActiveCameras().reverse();

    for (const config of configs) {
      const { viewportX, viewportY, viewportWidth, viewportHeight } = config;

      if (
        normalizedX >= viewportX &&
        normalizedX <= viewportX + viewportWidth &&
        normalizedY >= viewportY &&
        normalizedY <= viewportY + viewportHeight
      ) {
        return config.camera;
      }
    }

    return null;
  }

  /**
   * Converts screen coordinates to viewport-relative coordinates for a camera.
   *
   * @param camera - Camera to convert for
   * @param screenX - Screen x coordinate (0-1)
   * @param screenY - Screen y coordinate (0-1)
   * @returns Viewport-relative coordinates or null if camera not found
   *
   * @example
   * ```typescript
   * const viewportPos = rig.screenToViewport(camera, 0.5, 0.5);
   * if (viewportPos) {
   *   const ray = camera.screenPointToRay(viewportPos);
   * }
   * ```
   */
  screenToViewport(
    camera: Camera,
    screenX: number,
    screenY: number
  ): { x: number; y: number } | null {
    const config = this._cameras.find(c => c.camera === camera);
    if (!config) return null;

    const { viewportX, viewportY, viewportWidth, viewportHeight } = config;

    // Check if point is within viewport
    if (
      screenX < viewportX ||
      screenX > viewportX + viewportWidth ||
      screenY < viewportY ||
      screenY > viewportY + viewportHeight
    ) {
      return null;
    }

    // Convert to viewport-relative coordinates
    const x = (screenX - viewportX) / viewportWidth;
    const y = (screenY - viewportY) / viewportHeight;

    return { x, y };
  }

  /**
   * Creates a copy of this rig.
   * @returns New rig with cloned cameras
   *
   * @example
   * ```typescript
   * const rig2 = rig.clone();
   * ```
   */
  clone(): CameraRig {
    const rig = new CameraRig();
    rig.transform.copy(this.transform);
    rig._ipd = this._ipd;
    rig._convergence = this._convergence;
    rig._stereoEnabled = this._stereoEnabled;

    for (const config of this._cameras) {
      const camera = config.camera.clone();
      const newConfig = rig.addCamera(
        camera,
        config.viewportX,
        config.viewportY,
        config.viewportWidth,
        config.viewportHeight,
        config.order,
        config.active
      );
      newConfig.eye = config.eye;
    }

    return rig;
  }
}
