/**
 * TouchJoystick - Virtual joystick for touch screens
 *
 * Provides on-screen virtual joystick for mobile game controls with configurable
 * appearance, dead zone, and return-to-center behavior.
 *
 * @module input/touch/TouchJoystick
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';
import { TouchPoint } from './TouchPoint';

const logger = Logger.create('TouchJoystick');

/**
 * Touch joystick configuration.
 */
export interface TouchJoystickConfig {
  /** Center position in screen coordinates */
  position: Vector2;
  /** Outer radius in pixels */
  radius: number;
  /** Inner stick radius in pixels */
  stickRadius?: number;
  /** Dead zone radius (0-1) */
  deadZone?: number;
  /** Whether joystick returns to center when released */
  returnToCenter?: boolean;
  /** Whether joystick is fixed or follows first touch */
  fixed?: boolean;
  /** Maximum displacement from center */
  maxDistance?: number;
}

/**
 * Virtual touch joystick for mobile controls.
 *
 * @example
 * ```typescript
 * const joystick = new TouchJoystick({
 *   position: new Vector2(100, 400),
 *   radius: 80,
 *   deadZone: 0.2
 * });
 *
 * // Feed touch events
 * joystick.onTouchStart(touchPoint);
 * joystick.onTouchMove(touchPoint);
 * joystick.onTouchEnd(touchPoint);
 *
 * // Read joystick value
 * const value = joystick.getValue();
 * player.move(value.x, value.y);
 *
 * // Render joystick
 * joystick.render(ctx);
 * ```
 */
export class TouchJoystick {
  /** Joystick configuration */
  private config: Required<TouchJoystickConfig>;

  /** Current center position */
  private center: Vector2;

  /** Initial center position */
  private initialCenter: Vector2;

  /** Current stick position */
  private stickPosition: Vector2;

  /** Active touch ID */
  private activeTouchId: number | null = null;

  /** Whether joystick is active */
  private active: boolean = false;

  /** Current value (-1 to 1 in both axes) */
  private value: Vector2 = new Vector2(0, 0);

  /**
   * Creates a new touch joystick.
   *
   * @param config - Joystick configuration
   *
   * @example
   * ```typescript
   * const joystick = new TouchJoystick({
   *   position: new Vector2(100, 400),
   *   radius: 80
   * });
   * ```
   */
  constructor(config: TouchJoystickConfig) {
    this.config = {
      position: config.position,
      radius: config.radius,
      stickRadius: config.stickRadius || config.radius * 0.4,
      deadZone: config.deadZone || 0.15,
      returnToCenter: config.returnToCenter !== false,
      fixed: config.fixed !== false,
      maxDistance: config.maxDistance || config.radius * 0.8
    };

    this.center = this.config.position.clone();
    this.initialCenter = this.config.position.clone();
    this.stickPosition = this.center.clone();

    logger.debug('TouchJoystick created at', this.center);
  }

  /**
   * Handles touch start event.
   *
   * @param touch - Touch point
   * @returns True if touch was consumed
   *
   * @example
   * ```typescript
   * if (joystick.onTouchStart(touch)) {
   *   // Touch consumed by joystick
   * }
   * ```
   */
  onTouchStart(touch: TouchPoint): boolean {
    if (this.activeTouchId !== null) {
      return false;
    }

    // Check if touch is within joystick area
    const distance = touch.position.distanceTo(this.center);
    if (distance > this.config.radius) {
      return false;
    }

    this.activeTouchId = touch.id;
    this.active = true;

    // For non-fixed joystick, move center to touch point
    if (!this.config.fixed) {
      this.center.copy(touch.position);
    }

    this.updateStickPosition(touch.position);
    logger.debug(`TouchJoystick activated by touch ${touch.id}`);

    return true;
  }

  /**
   * Handles touch move event.
   *
   * @param touch - Touch point
   * @returns True if touch was consumed
   *
   * @example
   * ```typescript
   * joystick.onTouchMove(touch);
   * ```
   */
  onTouchMove(touch: TouchPoint): boolean {
    if (touch.id !== this.activeTouchId) {
      return false;
    }

    this.updateStickPosition(touch.position);
    return true;
  }

  /**
   * Handles touch end event.
   *
   * @param touch - Touch point
   * @returns True if touch was consumed
   *
   * @example
   * ```typescript
   * joystick.onTouchEnd(touch);
   * ```
   */
  onTouchEnd(touch: TouchPoint): boolean {
    if (touch.id !== this.activeTouchId) {
      return false;
    }

    this.activeTouchId = null;
    this.active = false;

    if (this.config.returnToCenter) {
      this.stickPosition.copy(this.center);
      this.value.set(0, 0);
    }

    // Return center to initial position for non-fixed joystick
    if (!this.config.fixed) {
      this.center.copy(this.initialCenter);
    }

    logger.debug(`TouchJoystick deactivated`);
    return true;
  }

  /**
   * Updates stick position from touch position.
   * @private
   */
  private updateStickPosition(touchPosition: Vector2): void {
    const offset = touchPosition.subtract(this.center);
    const distance = offset.length();

    if (distance === 0) {
      this.stickPosition.copy(this.center);
      this.value.set(0, 0);
      return;
    }

    // Clamp to max distance
    const clampedDistance = Math.min(distance, this.config.maxDistance);
    const direction = offset.normalize();

    this.stickPosition = this.center.add(direction.scale(clampedDistance));

    // Calculate value with dead zone
    const normalizedDistance = clampedDistance / this.config.maxDistance;

    if (normalizedDistance < this.config.deadZone) {
      this.value.set(0, 0);
    } else {
      // Remap from [deadZone, 1] to [0, 1]
      const remapped = (normalizedDistance - this.config.deadZone) /
                       (1 - this.config.deadZone);
      this.value = direction.scale(Math.min(1, remapped));
    }
  }

  /**
   * Gets the current joystick value.
   *
   * @returns Joystick value (-1 to 1 in both axes)
   *
   * @example
   * ```typescript
   * const value = joystick.getValue();
   * player.move(value.x, value.y);
   * ```
   */
  getValue(): Vector2 {
    return this.value.clone();
  }

  /**
   * Gets the X axis value.
   *
   * @returns X value (-1 to 1)
   *
   * @example
   * ```typescript
   * const x = joystick.getX();
   * ```
   */
  getX(): number {
    return this.value.x;
  }

  /**
   * Gets the Y axis value.
   *
   * @returns Y value (-1 to 1)
   *
   * @example
   * ```typescript
   * const y = joystick.getY();
   * ```
   */
  getY(): number {
    return this.value.y;
  }

  /**
   * Checks if joystick is currently active.
   *
   * @returns True if active
   *
   * @example
   * ```typescript
   * if (joystick.isActive()) {
   *   console.log('Joystick in use');
   * }
   * ```
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Gets the joystick center position.
   *
   * @returns Center position
   *
   * @example
   * ```typescript
   * const center = joystick.getCenter();
   * ```
   */
  getCenter(): Vector2 {
    return this.center.clone();
  }

  /**
   * Gets the stick position.
   *
   * @returns Stick position
   *
   * @example
   * ```typescript
   * const stick = joystick.getStickPosition();
   * ```
   */
  getStickPosition(): Vector2 {
    return this.stickPosition.clone();
  }

  /**
   * Gets the joystick radius.
   *
   * @returns Radius in pixels
   *
   * @example
   * ```typescript
   * const radius = joystick.getRadius();
   * ```
   */
  getRadius(): number {
    return this.config.radius;
  }

  /**
   * Renders the joystick (basic visualization).
   *
   * @param ctx - Canvas rendering context
   * @param alpha - Optional opacity (0-1)
   *
   * @example
   * ```typescript
   * joystick.render(ctx, 0.5);
   * ```
   */
  render(ctx: CanvasRenderingContext2D, alpha: number = 0.3): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    // Draw outer circle
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this.config.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw stick
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(
      this.stickPosition.x,
      this.stickPosition.y,
      this.config.stickRadius,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
  }

  /**
   * Resets the joystick.
   *
   * @example
   * ```typescript
   * joystick.reset();
   * ```
   */
  reset(): void {
    this.activeTouchId = null;
    this.active = false;
    this.center.copy(this.initialCenter);
    this.stickPosition.copy(this.center);
    this.value.set(0, 0);
    logger.debug('TouchJoystick reset');
  }
}
