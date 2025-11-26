/**
 * OrbitCamera - Spherical coordinate camera control system for product visualization
 *
 * @example
 * ```typescript
 * const camera = new OrbitCamera({
 *   target: new Vector3(0, 0, 0),
 *   distance: 5,
 *   minDistance: 2,
 *   maxDistance: 10,
 *   azimuthLimits: [-Math.PI, Math.PI],
 *   elevationLimits: [0, Math.PI / 2],
 *   damping: 0.05
 * });
 *
 * // Update in animation loop
 * camera.update(deltaTime);
 *
 * // Reset to default view
 * camera.reset();
 * ```
 */

import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Matrix4 } from '../../math/Matrix4';

export interface OrbitCameraConfig {
  /** Target point the camera orbits around */
  target?: Vector3;
  /** Initial distance from target */
  distance?: number;
  /** Minimum zoom distance */
  minDistance?: number;
  /** Maximum zoom distance */
  maxDistance?: number;
  /** Initial azimuth angle in radians */
  azimuth?: number;
  /** Initial elevation angle in radians */
  elevation?: number;
  /** Azimuth limits [min, max] in radians */
  azimuthLimits?: [number, number];
  /** Elevation limits [min, max] in radians */
  elevationLimits?: [number, number];
  /** Damping factor for smooth motion (0-1) */
  damping?: number;
  /** Enable touch input */
  enableTouch?: boolean;
  /** Enable mouse input */
  enableMouse?: boolean;
  /** Rotation speed multiplier */
  rotationSpeed?: number;
  /** Zoom speed multiplier */
  zoomSpeed?: number;
  /** DOM element to attach event listeners to */
  domElement?: HTMLElement;
}

export interface CameraState {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  viewMatrix: Matrix4;
}

/**
 * OrbitCamera provides smooth spherical coordinate camera control
 * with touch and mouse input support, damping, and configurable limits
 */
export class OrbitCamera {
  // Configuration
  public target: Vector3;
  public minDistance: number;
  public maxDistance: number;
  public azimuthLimits: [number, number];
  public elevationLimits: [number, number];
  public damping: number;
  public rotationSpeed: number;
  public zoomSpeed: number;

  // Current state
  private _distance: number;
  private _azimuth: number;
  private _elevation: number;

  // Target state (for damping)
  private _targetDistance: number;
  private _targetAzimuth: number;
  private _targetElevation: number;

  // Default state (for reset)
  private _defaultDistance: number;
  private _defaultAzimuth: number;
  private _defaultElevation: number;
  private _defaultTarget: Vector3;

  // Computed state
  private _position: Vector3;
  private _up: Vector3;
  private _viewMatrix: Matrix4;
  private _dirty: boolean;

  // Input state
  private _isPointerDown: boolean;
  private _lastPointerX: number;
  private _lastPointerY: number;
  private _pointerCount: number;
  private _lastPinchDistance: number;

  private _domElement: HTMLElement | null;
  private _enableTouch: boolean;
  private _enableMouse: boolean;
  private _enabled: boolean;

  // Event handlers (bound to this)
  private _boundHandlers: {
    mouseDown: (e: MouseEvent) => void;
    mouseMove: (e: MouseEvent) => void;
    mouseUp: (e: MouseEvent) => void;
    wheel: (e: WheelEvent) => void;
    touchStart: (e: TouchEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchEnd: (e: TouchEvent) => void;
    contextMenu: (e: Event) => void;
  };

  constructor(config: OrbitCameraConfig = {}) {
    // Initialize configuration
    this.target = config.target?.clone() || new Vector3(0, 0, 0);
    this.minDistance = config.minDistance ?? 1;
    this.maxDistance = config.maxDistance ?? 100;
    this.azimuthLimits = config.azimuthLimits || [-Infinity, Infinity];
    this.elevationLimits = config.elevationLimits || [0.01, Math.PI - 0.01];
    this.damping = config.damping ?? 0.05;
    this.rotationSpeed = config.rotationSpeed ?? 1.0;
    this.zoomSpeed = config.zoomSpeed ?? 1.0;

    // Initialize state
    this._distance = config.distance ?? 5;
    this._azimuth = config.azimuth ?? 0;
    this._elevation = config.elevation ?? Math.PI / 4;

    this._targetDistance = this._distance;
    this._targetAzimuth = this._azimuth;
    this._targetElevation = this._elevation;

    // Store defaults
    this._defaultDistance = this._distance;
    this._defaultAzimuth = this._azimuth;
    this._defaultElevation = this._elevation;
    this._defaultTarget = this.target.clone();

    // Initialize computed state
    this._position = new Vector3();
    this._up = new Vector3(0, 1, 0);
    this._viewMatrix = new Matrix4();
    this._dirty = true;

    // Initialize input state
    this._isPointerDown = false;
    this._lastPointerX = 0;
    this._lastPointerY = 0;
    this._pointerCount = 0;
    this._lastPinchDistance = 0;

    this._domElement = null;
    this._enableTouch = config.enableTouch ?? true;
    this._enableMouse = config.enableMouse ?? true;
    this._enabled = true;

    // Bind event handlers
    this._boundHandlers = {
      mouseDown: this._onMouseDown.bind(this),
      mouseMove: this._onMouseMove.bind(this),
      mouseUp: this._onMouseUp.bind(this),
      wheel: this._onWheel.bind(this),
      touchStart: this._onTouchStart.bind(this),
      touchMove: this._onTouchMove.bind(this),
      touchEnd: this._onTouchEnd.bind(this),
      contextMenu: this._onContextMenu.bind(this)
    };

    // Attach to DOM element if provided
    if (config.domElement) {
      this.attach(config.domElement);
    }
  }

  /**
   * Attach camera controls to a DOM element
   */
  public attach(element: HTMLElement): void {
    this.detach();
    this._domElement = element;

    if (this._enableMouse) {
      element.addEventListener('mousedown', this._boundHandlers.mouseDown);
      element.addEventListener('wheel', this._boundHandlers.wheel, { passive: false });
      element.addEventListener('contextmenu', this._boundHandlers.contextMenu);
    }

    if (this._enableTouch) {
      element.addEventListener('touchstart', this._boundHandlers.touchStart, { passive: false });
      element.addEventListener('touchmove', this._boundHandlers.touchMove, { passive: false });
      element.addEventListener('touchend', this._boundHandlers.touchEnd);
    }
  }

  /**
   * Detach camera controls from DOM element
   */
  public detach(): void {
    if (!this._domElement) return;

    const element = this._domElement;
    element.removeEventListener('mousedown', this._boundHandlers.mouseDown);
    element.removeEventListener('wheel', this._boundHandlers.wheel);
    element.removeEventListener('contextmenu', this._boundHandlers.contextMenu);
    element.removeEventListener('touchstart', this._boundHandlers.touchStart);
    element.removeEventListener('touchmove', this._boundHandlers.touchMove);
    element.removeEventListener('touchend', this._boundHandlers.touchEnd);

    this._domElement = null;
  }

  /**
   * Update camera state with damping
   * @param deltaTime - Time elapsed since last update in seconds
   */
  public update(deltaTime: number): void {
    if (!this._enabled) return;

    // Apply damping
    const dampingFactor = 1 - Math.pow(1 - this.damping, deltaTime * 60);

    this._distance += (this._targetDistance - this._distance) * dampingFactor;
    this._azimuth += (this._targetAzimuth - this._azimuth) * dampingFactor;
    this._elevation += (this._targetElevation - this._elevation) * dampingFactor;

    // Check if camera changed
    const epsilon = 0.0001;
    if (
      Math.abs(this._targetDistance - this._distance) > epsilon ||
      Math.abs(this._targetAzimuth - this._azimuth) > epsilon ||
      Math.abs(this._targetElevation - this._elevation) > epsilon
    ) {
      this._dirty = true;
    }

    // Update position if needed
    if (this._dirty) {
      this._updatePosition();
      this._dirty = false;
    }
  }

  /**
   * Reset camera to default view
   * @param animate - Whether to animate the reset
   */
  public reset(animate: boolean = true): void {
    if (animate) {
      this._targetDistance = this._defaultDistance;
      this._targetAzimuth = this._defaultAzimuth;
      this._targetElevation = this._defaultElevation;
      this.target.copy(this._defaultTarget);
    } else {
      this._distance = this._defaultDistance;
      this._azimuth = this._defaultAzimuth;
      this._elevation = this._defaultElevation;
      this._targetDistance = this._defaultDistance;
      this._targetAzimuth = this._defaultAzimuth;
      this._targetElevation = this._defaultElevation;
      this.target.copy(this._defaultTarget);
      this._dirty = true;
    }
  }

  /**
   * Rotate camera by delta angles
   * @param deltaAzimuth - Change in azimuth angle
   * @param deltaElevation - Change in elevation angle
   */
  public rotate(deltaAzimuth: number, deltaElevation: number): void {
    this._targetAzimuth = this._clampAzimuth(this._targetAzimuth + deltaAzimuth);
    this._targetElevation = this._clampElevation(this._targetElevation + deltaElevation);
    this._dirty = true;
  }

  /**
   * Zoom camera by delta distance
   * @param delta - Change in distance
   */
  public zoom(delta: number): void {
    this._targetDistance = this._clampDistance(this._targetDistance + delta);
    this._dirty = true;
  }

  /**
   * Set camera distance
   */
  public setDistance(distance: number): void {
    this._targetDistance = this._clampDistance(distance);
    this._dirty = true;
  }

  /**
   * Set camera angles
   */
  public setAngles(azimuth: number, elevation: number): void {
    this._targetAzimuth = this._clampAzimuth(azimuth);
    this._targetElevation = this._clampElevation(elevation);
    this._dirty = true;
  }

  /**
   * Set focal point
   */
  public setTarget(target: Vector3): void {
    this.target.copy(target);
    this._dirty = true;
  }

  /**
   * Get current camera position
   */
  public get position(): Vector3 {
    return this._position.clone();
  }

  /**
   * Get current camera state
   */
  public getState(): CameraState {
    return {
      position: this._position.clone(),
      target: this.target.clone(),
      up: this._up.clone(),
      viewMatrix: this._viewMatrix.clone()
    };
  }

  /**
   * Get view matrix
   */
  public get viewMatrix(): Matrix4 {
    return this._viewMatrix;
  }

  /**
   * Get current distance
   */
  public get distance(): number {
    return this._distance;
  }

  /**
   * Get current azimuth
   */
  public get azimuth(): number {
    return this._azimuth;
  }

  /**
   * Get current elevation
   */
  public get elevation(): number {
    return this._elevation;
  }

  /**
   * Enable or disable camera controls
   */
  public setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Check if camera is enabled
   */
  public get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Update camera position from spherical coordinates
   */
  private _updatePosition(): void {
    // Convert spherical to cartesian
    const sinElevation = Math.sin(this._elevation);
    const cosElevation = Math.cos(this._elevation);
    const sinAzimuth = Math.sin(this._azimuth);
    const cosAzimuth = Math.cos(this._azimuth);

    this._position.set(
      this.target.x + this._distance * sinElevation * sinAzimuth,
      this.target.y + this._distance * cosElevation,
      this.target.z + this._distance * sinElevation * cosAzimuth
    );

    // Update view matrix
    this._viewMatrix.lookAt(this._position, this.target, this._up);
  }

  /**
   * Clamp distance to limits
   */
  private _clampDistance(distance: number): number {
    return Math.max(this.minDistance, Math.min(this.maxDistance, distance));
  }

  /**
   * Clamp azimuth to limits
   */
  private _clampAzimuth(azimuth: number): number {
    if (this.azimuthLimits[0] === -Infinity && this.azimuthLimits[1] === Infinity) {
      return azimuth;
    }
    return Math.max(this.azimuthLimits[0], Math.min(this.azimuthLimits[1], azimuth));
  }

  /**
   * Clamp elevation to limits
   */
  private _clampElevation(elevation: number): number {
    return Math.max(this.elevationLimits[0], Math.min(this.elevationLimits[1], elevation));
  }

  /**
   * Mouse down handler
   */
  private _onMouseDown(event: MouseEvent): void {
    if (!this._enabled) return;

    this._isPointerDown = true;
    this._lastPointerX = event.clientX;
    this._lastPointerY = event.clientY;

    document.addEventListener('mousemove', this._boundHandlers.mouseMove);
    document.addEventListener('mouseup', this._boundHandlers.mouseUp);

    event.preventDefault();
  }

  /**
   * Mouse move handler
   */
  private _onMouseMove(event: MouseEvent): void {
    if (!this._enabled || !this._isPointerDown) return;

    const deltaX = event.clientX - this._lastPointerX;
    const deltaY = event.clientY - this._lastPointerY;

    this._lastPointerX = event.clientX;
    this._lastPointerY = event.clientY;

    // Rotate camera
    const rotationScale = this.rotationSpeed * 0.005;
    this.rotate(deltaX * rotationScale, -deltaY * rotationScale);

    event.preventDefault();
  }

  /**
   * Mouse up handler
   */
  private _onMouseUp(event: MouseEvent): void {
    this._isPointerDown = false;

    document.removeEventListener('mousemove', this._boundHandlers.mouseMove);
    document.removeEventListener('mouseup', this._boundHandlers.mouseUp);

    event.preventDefault();
  }

  /**
   * Mouse wheel handler
   */
  private _onWheel(event: WheelEvent): void {
    if (!this._enabled) return;

    const delta = event.deltaY * this.zoomSpeed * 0.001 * this._distance;
    this.zoom(delta);

    event.preventDefault();
  }

  /**
   * Touch start handler
   */
  private _onTouchStart(event: TouchEvent): void {
    if (!this._enabled) return;

    this._pointerCount = event.touches.length;

    if (this._pointerCount === 1) {
      this._lastPointerX = event.touches[0].clientX;
      this._lastPointerY = event.touches[0].clientY;
    } else if (this._pointerCount === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      this._lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
    }

    event.preventDefault();
  }

  /**
   * Touch move handler
   */
  private _onTouchMove(event: TouchEvent): void {
    if (!this._enabled) return;

    if (event.touches.length === 1 && this._pointerCount === 1) {
      // Single finger rotate
      const deltaX = event.touches[0].clientX - this._lastPointerX;
      const deltaY = event.touches[0].clientY - this._lastPointerY;

      this._lastPointerX = event.touches[0].clientX;
      this._lastPointerY = event.touches[0].clientY;

      const rotationScale = this.rotationSpeed * 0.005;
      this.rotate(deltaX * rotationScale, -deltaY * rotationScale);
    } else if (event.touches.length === 2) {
      // Two finger pinch zoom
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (this._lastPinchDistance > 0) {
        const delta = (this._lastPinchDistance - distance) * this.zoomSpeed * 0.01;
        this.zoom(delta);
      }

      this._lastPinchDistance = distance;
    }

    event.preventDefault();
  }

  /**
   * Touch end handler
   */
  private _onTouchEnd(event: TouchEvent): void {
    this._pointerCount = event.touches.length;
    if (this._pointerCount === 0) {
      this._lastPinchDistance = 0;
    }
  }

  /**
   * Context menu handler
   */
  private _onContextMenu(event: Event): void {
    event.preventDefault();
  }

  /**
   * Dispose camera and remove event listeners
   */
  public dispose(): void {
    this.detach();
  }
}
