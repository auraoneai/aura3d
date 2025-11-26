/**
 * Camera controller implementations for orbit, first-person, and fly modes.
 * Provides smooth damping and input handling integration.
 * @module CameraController
 */

import { Camera } from './Camera';
import { Vector3 } from '../../math/Vector3';
import { Vector2 } from '../../math/Vector2';
import { Quaternion } from '../../math/Quaternion';
import { clamp } from '../../math/MathConstants';

/**
 * Base camera controller interface.
 */
export interface ICameraController {
  /**
   * Updates controller state (called each frame).
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void;

  /**
   * Resets controller to default state.
   */
  reset(): void;

  /**
   * Enables or disables the controller.
   */
  enabled: boolean;
}

/**
 * Orbit camera controller for rotating around a target point.
 * Supports smooth damping, zoom, and pan controls.
 *
 * @example
 * ```typescript
 * const camera = new Camera();
 * const controller = new OrbitCameraController(camera);
 * controller.target = new Vector3(0, 0, 0);
 * controller.distance = 10;
 *
 * // In update loop
 * controller.rotate(mouseDeltaX, mouseDeltaY);
 * controller.zoom(wheelDelta);
 * controller.update(deltaTime);
 * ```
 */
export class OrbitCameraController implements ICameraController {
  /**
   * Camera to control.
   */
  readonly camera: Camera;

  /**
   * Target point to orbit around.
   */
  target: Vector3 = new Vector3(0, 0, 0);

  /**
   * Current distance from target.
   */
  private _distance: number = 10;

  /**
   * Desired distance from target (for smooth damping).
   */
  private _targetDistance: number = 10;

  /**
   * Current azimuth angle (horizontal rotation) in radians.
   */
  private _azimuth: number = 0;

  /**
   * Desired azimuth angle (for smooth damping).
   */
  private _targetAzimuth: number = 0;

  /**
   * Current elevation angle (vertical rotation) in radians.
   */
  private _elevation: number = Math.PI / 4;

  /**
   * Desired elevation angle (for smooth damping).
   */
  private _targetElevation: number = Math.PI / 4;

  /**
   * Current pan offset from target.
   */
  private _panOffset: Vector3 = new Vector3(0, 0, 0);

  /**
   * Desired pan offset (for smooth damping).
   */
  private _targetPanOffset: Vector3 = new Vector3(0, 0, 0);

  /**
   * Whether controller is enabled.
   */
  enabled: boolean = true;

  /**
   * Rotation speed multiplier.
   */
  rotationSpeed: number = 1.0;

  /**
   * Zoom speed multiplier.
   */
  zoomSpeed: number = 1.0;

  /**
   * Pan speed multiplier.
   */
  panSpeed: number = 1.0;

  /**
   * Damping factor (0 = no damping, 1 = instant).
   */
  dampingFactor: number = 0.1;

  /**
   * Minimum distance from target.
   */
  minDistance: number = 1;

  /**
   * Maximum distance from target.
   */
  maxDistance: number = 100;

  /**
   * Minimum elevation angle in radians.
   */
  minElevation: number = 0.1;

  /**
   * Maximum elevation angle in radians.
   */
  maxElevation: number = Math.PI - 0.1;

  /**
   * Whether to enable smooth damping.
   */
  enableDamping: boolean = true;

  /**
   * Creates a new orbit camera controller.
   * @param camera - Camera to control
   */
  constructor(camera: Camera) {
    this.camera = camera;
  }

  /**
   * Gets current distance from target.
   */
  get distance(): number {
    return this._distance;
  }

  /**
   * Sets desired distance from target.
   */
  set distance(value: number) {
    this._targetDistance = clamp(value, this.minDistance, this.maxDistance);
  }

  /**
   * Rotates the camera around the target.
   *
   * @param deltaAzimuth - Horizontal rotation change in radians
   * @param deltaElevation - Vertical rotation change in radians
   *
   * @example
   * ```typescript
   * // Rotate based on mouse delta
   * const sensitivity = 0.005;
   * controller.rotate(mouseDeltaX * sensitivity, mouseDeltaY * sensitivity);
   * ```
   */
  rotate(deltaAzimuth: number, deltaElevation: number): void {
    if (!this.enabled) return;

    this._targetAzimuth += deltaAzimuth * this.rotationSpeed;
    this._targetElevation += deltaElevation * this.rotationSpeed;

    // Wrap azimuth to [0, 2π]
    this._targetAzimuth = this._targetAzimuth % (Math.PI * 2);

    // Clamp elevation to valid range
    this._targetElevation = clamp(
      this._targetElevation,
      this.minElevation,
      this.maxElevation
    );
  }

  /**
   * Zooms the camera (changes distance from target).
   *
   * @param delta - Zoom delta (negative = zoom in, positive = zoom out)
   *
   * @example
   * ```typescript
   * // Zoom based on mouse wheel
   * controller.zoom(wheelDelta * 0.1);
   * ```
   */
  zoom(delta: number): void {
    if (!this.enabled) return;

    this._targetDistance += delta * this.zoomSpeed * this._distance * 0.1;
    this._targetDistance = clamp(
      this._targetDistance,
      this.minDistance,
      this.maxDistance
    );
  }

  /**
   * Pans the camera (moves target in camera's local XY plane).
   *
   * @param deltaX - Horizontal pan delta
   * @param deltaY - Vertical pan delta
   *
   * @example
   * ```typescript
   * // Pan based on middle mouse drag
   * controller.pan(mouseDeltaX * 0.01, mouseDeltaY * 0.01);
   * ```
   */
  pan(deltaX: number, deltaY: number): void {
    if (!this.enabled) return;

    // Calculate pan in camera space
    const camera = this.camera;
    const worldMatrix = camera.transform.worldMatrix;

    // Get right and up vectors from camera
    const right = new Vector3(
      worldMatrix.elements[0],
      worldMatrix.elements[1],
      worldMatrix.elements[2]
    ).normalize();

    const up = new Vector3(
      worldMatrix.elements[4],
      worldMatrix.elements[5],
      worldMatrix.elements[6]
    ).normalize();

    // Calculate pan offset scaled by distance
    const panScale = this._distance * this.panSpeed * 0.001;
    const panOffsetX = right.scale(-deltaX * panScale);
    const panOffsetY = up.scale(deltaY * panScale);

    this._targetPanOffset.addInPlace(panOffsetX);
    this._targetPanOffset.addInPlace(panOffsetY);
  }

  /**
   * Updates camera position and orientation.
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    if (!this.enabled) return;

    // Apply damping if enabled
    if (this.enableDamping) {
      const damping = 1 - Math.pow(1 - this.dampingFactor, deltaTime * 60);

      this._azimuth += (this._targetAzimuth - this._azimuth) * damping;
      this._elevation += (this._targetElevation - this._elevation) * damping;
      this._distance += (this._targetDistance - this._distance) * damping;

      this._panOffset.x += (this._targetPanOffset.x - this._panOffset.x) * damping;
      this._panOffset.y += (this._targetPanOffset.y - this._panOffset.y) * damping;
      this._panOffset.z += (this._targetPanOffset.z - this._panOffset.z) * damping;
    } else {
      this._azimuth = this._targetAzimuth;
      this._elevation = this._targetElevation;
      this._distance = this._targetDistance;
      this._panOffset.copy(this._targetPanOffset);
    }

    // Calculate camera position in spherical coordinates
    const x = this._distance * Math.sin(this._elevation) * Math.cos(this._azimuth);
    const y = this._distance * Math.cos(this._elevation);
    const z = this._distance * Math.sin(this._elevation) * Math.sin(this._azimuth);

    // Apply position with pan offset
    const effectiveTarget = this.target.add(this._panOffset);
    this.camera.transform.position.set(
      effectiveTarget.x + x,
      effectiveTarget.y + y,
      effectiveTarget.z + z
    );

    // Look at target
    this.camera.transform.lookAt(effectiveTarget);
  }

  /**
   * Resets controller to default state.
   */
  reset(): void {
    this._azimuth = 0;
    this._targetAzimuth = 0;
    this._elevation = Math.PI / 4;
    this._targetElevation = Math.PI / 4;
    this._distance = 10;
    this._targetDistance = 10;
    this._panOffset.set(0, 0, 0);
    this._targetPanOffset.set(0, 0, 0);
  }

  /**
   * Sets the azimuth and elevation angles directly.
   * @param azimuth - Horizontal angle in radians
   * @param elevation - Vertical angle in radians
   */
  setAngles(azimuth: number, elevation: number): void {
    this._azimuth = azimuth;
    this._targetAzimuth = azimuth;
    this._elevation = clamp(elevation, this.minElevation, this.maxElevation);
    this._targetElevation = this._elevation;
  }
}

/**
 * First-person camera controller with mouse look and WASD movement.
 * Typical FPS-style camera control.
 *
 * @example
 * ```typescript
 * const camera = new Camera();
 * const controller = new FirstPersonCameraController(camera);
 * controller.movementSpeed = 5;
 * controller.lookSensitivity = 0.002;
 *
 * // In update loop
 * controller.move(inputVector);
 * controller.look(mouseDeltaX, mouseDeltaY);
 * controller.update(deltaTime);
 * ```
 */
export class FirstPersonCameraController implements ICameraController {
  /**
   * Camera to control.
   */
  readonly camera: Camera;

  /**
   * Current yaw angle in radians.
   */
  private _yaw: number = 0;

  /**
   * Current pitch angle in radians.
   */
  private _pitch: number = 0;

  /**
   * Current velocity.
   */
  private _velocity: Vector3 = new Vector3(0, 0, 0);

  /**
   * Target velocity (for damping).
   */
  private _targetVelocity: Vector3 = new Vector3(0, 0, 0);

  /**
   * Whether controller is enabled.
   */
  enabled: boolean = true;

  /**
   * Movement speed in units per second.
   */
  movementSpeed: number = 5;

  /**
   * Look sensitivity (radians per pixel).
   */
  lookSensitivity: number = 0.002;

  /**
   * Movement damping factor.
   */
  movementDamping: number = 0.2;

  /**
   * Minimum pitch angle in radians.
   */
  minPitch: number = -Math.PI / 2 + 0.1;

  /**
   * Maximum pitch angle in radians.
   */
  maxPitch: number = Math.PI / 2 - 0.1;

  /**
   * Whether to enable smooth movement damping.
   */
  enableDamping: boolean = true;

  /**
   * Creates a new first-person camera controller.
   * @param camera - Camera to control
   */
  constructor(camera: Camera) {
    this.camera = camera;
  }

  /**
   * Rotates the camera based on mouse movement.
   *
   * @param deltaX - Horizontal mouse delta
   * @param deltaY - Vertical mouse delta
   *
   * @example
   * ```typescript
   * controller.look(mouseDeltaX, mouseDeltaY);
   * ```
   */
  look(deltaX: number, deltaY: number): void {
    if (!this.enabled) return;

    this._yaw -= deltaX * this.lookSensitivity;
    this._pitch -= deltaY * this.lookSensitivity;

    // Clamp pitch
    this._pitch = clamp(this._pitch, this.minPitch, this.maxPitch);

    // Apply rotation
    const rotation = Quaternion.fromEuler(this._pitch, this._yaw, 0, 'YXZ');
    this.camera.transform.rotation = rotation;
  }

  /**
   * Moves the camera based on input vector.
   * Input is in local space: x = right, y = up, z = forward.
   *
   * @param direction - Movement direction (should be normalized)
   *
   * @example
   * ```typescript
   * // WASD movement
   * const input = new Vector3(
   *   (keyD ? 1 : 0) - (keyA ? 1 : 0),  // Right/Left
   *   0,                                  // Up/Down
   *   (keyW ? 1 : 0) - (keyS ? 1 : 0)   // Forward/Back
   * ).normalize();
   * controller.move(input);
   * ```
   */
  move(direction: Vector3): void {
    if (!this.enabled) return;

    this._targetVelocity = direction.scale(this.movementSpeed);
  }

  /**
   * Updates camera position.
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    if (!this.enabled) return;

    // Apply damping
    if (this.enableDamping) {
      const damping = 1 - Math.pow(1 - this.movementDamping, deltaTime * 60);
      this._velocity.x += (this._targetVelocity.x - this._velocity.x) * damping;
      this._velocity.y += (this._targetVelocity.y - this._velocity.y) * damping;
      this._velocity.z += (this._targetVelocity.z - this._velocity.z) * damping;
    } else {
      this._velocity.copy(this._targetVelocity);
    }

    // Transform velocity to world space
    const worldVelocity = this.camera.transform.transformDirection(this._velocity);

    // Update position
    this.camera.transform.position.addInPlace(
      worldVelocity.scale(deltaTime)
    );
  }

  /**
   * Resets controller to default state.
   */
  reset(): void {
    this._yaw = 0;
    this._pitch = 0;
    this._velocity.set(0, 0, 0);
    this._targetVelocity.set(0, 0, 0);
  }

  /**
   * Sets the look angles directly.
   * @param yaw - Horizontal angle in radians
   * @param pitch - Vertical angle in radians
   */
  setAngles(yaw: number, pitch: number): void {
    this._yaw = yaw;
    this._pitch = clamp(pitch, this.minPitch, this.maxPitch);

    const rotation = Quaternion.fromEuler(this._pitch, this._yaw, 0, 'YXZ');
    this.camera.transform.rotation = rotation;
  }
}

/**
 * Fly camera controller with 6DOF movement (no gravity or collisions).
 * Useful for level editors and free-roam exploration.
 *
 * @example
 * ```typescript
 * const camera = new Camera();
 * const controller = new FlyCameraController(camera);
 * controller.movementSpeed = 10;
 * controller.boostMultiplier = 3;
 *
 * // In update loop
 * controller.move(inputVector);
 * controller.look(mouseDeltaX, mouseDeltaY);
 * controller.setBoost(shiftKeyPressed);
 * controller.update(deltaTime);
 * ```
 */
export class FlyCameraController implements ICameraController {
  /**
   * Camera to control.
   */
  readonly camera: Camera;

  /**
   * Current yaw angle in radians.
   */
  private _yaw: number = 0;

  /**
   * Current pitch angle in radians.
   */
  private _pitch: number = 0;

  /**
   * Current roll angle in radians.
   */
  private _roll: number = 0;

  /**
   * Current velocity.
   */
  private _velocity: Vector3 = new Vector3(0, 0, 0);

  /**
   * Target velocity (for damping).
   */
  private _targetVelocity: Vector3 = new Vector3(0, 0, 0);

  /**
   * Whether boost is active.
   */
  private _isBoosting: boolean = false;

  /**
   * Whether controller is enabled.
   */
  enabled: boolean = true;

  /**
   * Movement speed in units per second.
   */
  movementSpeed: number = 10;

  /**
   * Look sensitivity (radians per pixel).
   */
  lookSensitivity: number = 0.002;

  /**
   * Roll sensitivity (radians per pixel).
   */
  rollSensitivity: number = 0.001;

  /**
   * Movement damping factor.
   */
  movementDamping: number = 0.15;

  /**
   * Speed boost multiplier when boost is active.
   */
  boostMultiplier: number = 3;

  /**
   * Minimum pitch angle in radians.
   */
  minPitch: number = -Math.PI / 2 + 0.01;

  /**
   * Maximum pitch angle in radians.
   */
  maxPitch: number = Math.PI / 2 - 0.01;

  /**
   * Whether to enable smooth movement damping.
   */
  enableDamping: boolean = true;

  /**
   * Whether to enable roll controls.
   */
  enableRoll: boolean = false;

  /**
   * Creates a new fly camera controller.
   * @param camera - Camera to control
   */
  constructor(camera: Camera) {
    this.camera = camera;
  }

  /**
   * Rotates the camera based on mouse movement.
   *
   * @param deltaX - Horizontal mouse delta
   * @param deltaY - Vertical mouse delta
   *
   * @example
   * ```typescript
   * controller.look(mouseDeltaX, mouseDeltaY);
   * ```
   */
  look(deltaX: number, deltaY: number): void {
    if (!this.enabled) return;

    this._yaw -= deltaX * this.lookSensitivity;
    this._pitch -= deltaY * this.lookSensitivity;

    // Clamp pitch
    this._pitch = clamp(this._pitch, this.minPitch, this.maxPitch);

    this._updateRotation();
  }

  /**
   * Rolls the camera (rotates around forward axis).
   *
   * @param delta - Roll delta
   *
   * @example
   * ```typescript
   * // Roll based on Q/E keys
   * controller.roll((keyE ? 1 : 0) - (keyQ ? 1 : 0));
   * ```
   */
  roll(delta: number): void {
    if (!this.enabled || !this.enableRoll) return;

    this._roll += delta * this.rollSensitivity;
    this._updateRotation();
  }

  /**
   * Moves the camera based on input vector.
   * Input is in local space: x = right, y = up, z = forward.
   *
   * @param direction - Movement direction (should be normalized)
   *
   * @example
   * ```typescript
   * const input = new Vector3(
   *   (keyD ? 1 : 0) - (keyA ? 1 : 0),
   *   (keyE ? 1 : 0) - (keyQ ? 1 : 0),
   *   (keyW ? 1 : 0) - (keyS ? 1 : 0)
   * ).normalize();
   * controller.move(input);
   * ```
   */
  move(direction: Vector3): void {
    if (!this.enabled) return;

    const speed = this._isBoosting
      ? this.movementSpeed * this.boostMultiplier
      : this.movementSpeed;

    this._targetVelocity = direction.scale(speed);
  }

  /**
   * Sets boost state.
   *
   * @param boost - Whether boost is active
   *
   * @example
   * ```typescript
   * controller.setBoost(shiftKeyPressed);
   * ```
   */
  setBoost(boost: boolean): void {
    this._isBoosting = boost;
  }

  /**
   * Updates camera position and rotation.
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    if (!this.enabled) return;

    // Apply damping
    if (this.enableDamping) {
      const damping = 1 - Math.pow(1 - this.movementDamping, deltaTime * 60);
      this._velocity.x += (this._targetVelocity.x - this._velocity.x) * damping;
      this._velocity.y += (this._targetVelocity.y - this._velocity.y) * damping;
      this._velocity.z += (this._targetVelocity.z - this._velocity.z) * damping;
    } else {
      this._velocity.copy(this._targetVelocity);
    }

    // Transform velocity to world space
    const worldVelocity = this.camera.transform.transformDirection(this._velocity);

    // Update position
    this.camera.transform.position.addInPlace(
      worldVelocity.scale(deltaTime)
    );
  }

  /**
   * Resets controller to default state.
   */
  reset(): void {
    this._yaw = 0;
    this._pitch = 0;
    this._roll = 0;
    this._velocity.set(0, 0, 0);
    this._targetVelocity.set(0, 0, 0);
    this._isBoosting = false;
    this._updateRotation();
  }

  /**
   * Sets the look angles directly.
   * @param yaw - Horizontal angle in radians
   * @param pitch - Vertical angle in radians
   * @param roll - Roll angle in radians (optional)
   */
  setAngles(yaw: number, pitch: number, roll: number = 0): void {
    this._yaw = yaw;
    this._pitch = clamp(pitch, this.minPitch, this.maxPitch);
    this._roll = roll;
    this._updateRotation();
  }

  /**
   * Updates camera rotation from angles.
   * @private
   */
  private _updateRotation(): void {
    const rotation = Quaternion.fromEuler(
      this._pitch,
      this._yaw,
      this._roll,
      'YXZ'
    );
    this.camera.transform.rotation = rotation;
  }
}
