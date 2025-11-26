/**
 * TurntableController - Automatic rotation controller for product visualization
 *
 * @example
 * ```typescript
 * const turntable = new TurntableController(camera, {
 *   autoRotate: true,
 *   speed: 0.5,
 *   direction: 'cw',
 *   pauseOnInteraction: true,
 *   resumeDelay: 2000,
 *   smoothTransition: true
 * });
 *
 * // Update in animation loop
 * turntable.update(deltaTime);
 *
 * // Control rotation
 * turntable.start();
 * turntable.stop();
 * turntable.setSpeed(1.0);
 * ```
 */

import { OrbitCamera } from './OrbitCamera';

export type RotationDirection = 'cw' | 'ccw';

export interface TurntableConfig {
  /** Enable auto-rotation on initialization */
  autoRotate?: boolean;
  /** Rotation speed in radians per second */
  speed?: number;
  /** Rotation direction */
  direction?: RotationDirection;
  /** Pause rotation when user interacts */
  pauseOnInteraction?: boolean;
  /** Time in ms to wait before resuming after interaction */
  resumeDelay?: number;
  /** Enable smooth start/stop transitions */
  smoothTransition?: boolean;
  /** Transition duration in seconds */
  transitionDuration?: number;
  /** Minimum speed threshold (below this is considered stopped) */
  minSpeed?: number;
}

/**
 * TurntableController provides automatic rotation with smooth transitions,
 * pause on interaction, and configurable speed/direction
 */
export class TurntableController {
  private _camera: OrbitCamera;
  private _enabled: boolean;
  private _speed: number;
  private _targetSpeed: number;
  private _direction: number; // 1 for CW, -1 for CCW
  private _pauseOnInteraction: boolean;
  private _resumeDelay: number;
  private _smoothTransition: boolean;
  private _transitionDuration: number;
  private _minSpeed: number;

  // State
  private _isRunning: boolean;
  private _isPaused: boolean;
  private _currentSpeed: number;
  private _resumeTimeout: number | null;
  private _lastInteractionTime: number;

  // Interaction detection
  private _lastAzimuth: number;
  private _lastElevation: number;
  private _lastDistance: number;
  private _interactionThreshold: number;

  constructor(camera: OrbitCamera, config: TurntableConfig = {}) {
    this._camera = camera;
    this._enabled = true;
    this._speed = config.speed ?? Math.PI / 4; // 45 degrees per second
    this._targetSpeed = this._speed;
    this._direction = config.direction === 'ccw' ? -1 : 1;
    this._pauseOnInteraction = config.pauseOnInteraction ?? true;
    this._resumeDelay = config.resumeDelay ?? 2000;
    this._smoothTransition = config.smoothTransition ?? true;
    this._transitionDuration = config.transitionDuration ?? 0.5;
    this._minSpeed = config.minSpeed ?? 0.001;

    // Initialize state
    this._isRunning = config.autoRotate ?? true;
    this._isPaused = false;
    this._currentSpeed = this._isRunning ? this._speed : 0;
    this._resumeTimeout = null;
    this._lastInteractionTime = 0;

    // Initialize interaction detection
    this._lastAzimuth = camera.azimuth;
    this._lastElevation = camera.elevation;
    this._lastDistance = camera.distance;
    this._interactionThreshold = 0.001;

    // Start if auto-rotate enabled
    if (this._isRunning && !this._smoothTransition) {
      this._currentSpeed = this._speed;
    }
  }

  /**
   * Update turntable rotation
   * @param deltaTime - Time elapsed since last update in seconds
   */
  public update(deltaTime: number): void {
    if (!this._enabled) return;

    // Detect user interaction
    if (this._pauseOnInteraction && this._isRunning) {
      this._detectInteraction();
    }

    // Update current speed with smooth transition
    if (this._smoothTransition) {
      this._updateSpeed(deltaTime);
    }

    // Apply rotation
    if (Math.abs(this._currentSpeed) > this._minSpeed) {
      const rotationDelta = this._currentSpeed * this._direction * deltaTime;
      this._camera.rotate(rotationDelta, 0);
    }

    // Update last camera state
    this._lastAzimuth = this._camera.azimuth;
    this._lastElevation = this._camera.elevation;
    this._lastDistance = this._camera.distance;
  }

  /**
   * Start auto-rotation
   */
  public start(): void {
    if (this._isRunning) return;

    this._isRunning = true;
    this._isPaused = false;
    this._targetSpeed = this._speed;

    if (!this._smoothTransition) {
      this._currentSpeed = this._speed;
    }

    this._clearResumeTimeout();
  }

  /**
   * Stop auto-rotation
   */
  public stop(): void {
    if (!this._isRunning) return;

    this._isRunning = false;
    this._isPaused = false;
    this._targetSpeed = 0;

    if (!this._smoothTransition) {
      this._currentSpeed = 0;
    }

    this._clearResumeTimeout();
  }

  /**
   * Pause auto-rotation temporarily
   */
  public pause(): void {
    if (!this._isRunning || this._isPaused) return;

    this._isPaused = true;
    this._targetSpeed = 0;

    if (!this._smoothTransition) {
      this._currentSpeed = 0;
    }
  }

  /**
   * Resume auto-rotation from pause
   */
  public resume(): void {
    if (!this._isRunning || !this._isPaused) return;

    this._isPaused = false;
    this._targetSpeed = this._speed;

    if (!this._smoothTransition) {
      this._currentSpeed = this._speed;
    }

    this._clearResumeTimeout();
  }

  /**
   * Toggle auto-rotation on/off
   */
  public toggle(): void {
    if (this._isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * Set rotation speed
   * @param speed - Speed in radians per second
   */
  public setSpeed(speed: number): void {
    this._speed = Math.abs(speed);
    if (this._isRunning && !this._isPaused) {
      this._targetSpeed = this._speed;
    }
  }

  /**
   * Set rotation direction
   */
  public setDirection(direction: RotationDirection): void {
    this._direction = direction === 'ccw' ? -1 : 1;
  }

  /**
   * Reverse rotation direction
   */
  public reverseDirection(): void {
    this._direction *= -1;
  }

  /**
   * Get current rotation speed
   */
  public get speed(): number {
    return this._speed;
  }

  /**
   * Get current direction
   */
  public get direction(): RotationDirection {
    return this._direction === 1 ? 'cw' : 'ccw';
  }

  /**
   * Check if turntable is running
   */
  public get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Check if turntable is paused
   */
  public get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Enable or disable turntable
   */
  public setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) {
      this._clearResumeTimeout();
    }
  }

  /**
   * Check if turntable is enabled
   */
  public get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Set pause on interaction
   */
  public setPauseOnInteraction(pause: boolean): void {
    this._pauseOnInteraction = pause;
  }

  /**
   * Set resume delay
   */
  public setResumeDelay(delay: number): void {
    this._resumeDelay = delay;
  }

  /**
   * Detect user interaction with camera
   */
  private _detectInteraction(): void {
    const azimuthDelta = Math.abs(this._camera.azimuth - this._lastAzimuth);
    const elevationDelta = Math.abs(this._camera.elevation - this._lastElevation);
    const distanceDelta = Math.abs(this._camera.distance - this._lastDistance);

    // Check if camera changed beyond rotation threshold
    const rotationDelta = this._currentSpeed * this._direction * (1 / 60); // Assume 60 FPS
    const expectedAzimuthDelta = Math.abs(rotationDelta);

    const isInteracting =
      Math.abs(azimuthDelta - expectedAzimuthDelta) > this._interactionThreshold ||
      elevationDelta > this._interactionThreshold ||
      distanceDelta > this._interactionThreshold;

    if (isInteracting) {
      this._onInteraction();
    }
  }

  /**
   * Handle user interaction
   */
  private _onInteraction(): void {
    const now = Date.now();

    // Only pause if enough time has passed since last interaction
    if (now - this._lastInteractionTime < 100) return;

    this._lastInteractionTime = now;

    // Pause rotation
    if (!this._isPaused) {
      this.pause();
    }

    // Clear existing timeout
    this._clearResumeTimeout();

    // Schedule resume
    if (this._resumeDelay > 0) {
      this._resumeTimeout = window.setTimeout(() => {
        this.resume();
        this._resumeTimeout = null;
      }, this._resumeDelay);
    }
  }

  /**
   * Update current speed with smooth transition
   */
  private _updateSpeed(deltaTime: number): void {
    if (Math.abs(this._currentSpeed - this._targetSpeed) < this._minSpeed) {
      this._currentSpeed = this._targetSpeed;
      return;
    }

    // Calculate transition speed
    const transitionSpeed = this._speed / this._transitionDuration;
    const speedDelta = transitionSpeed * deltaTime;

    if (this._currentSpeed < this._targetSpeed) {
      this._currentSpeed = Math.min(this._currentSpeed + speedDelta, this._targetSpeed);
    } else if (this._currentSpeed > this._targetSpeed) {
      this._currentSpeed = Math.max(this._currentSpeed - speedDelta, this._targetSpeed);
    }
  }

  /**
   * Clear resume timeout
   */
  private _clearResumeTimeout(): void {
    if (this._resumeTimeout !== null) {
      clearTimeout(this._resumeTimeout);
      this._resumeTimeout = null;
    }
  }

  /**
   * Dispose turntable and clear timers
   */
  public dispose(): void {
    this._clearResumeTimeout();
    this._enabled = false;
  }
}
