/**
 * TouchButton - Virtual button for touch screens
 *
 * Provides on-screen virtual button for mobile game controls with visual
 * feedback and customizable appearance.
 *
 * @module input/touch/TouchButton
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';
import { TouchPoint } from './TouchPoint';

const logger = Logger.create('TouchButton');

/**
 * Button shape types.
 */
export enum ButtonShape {
  Circle = 'circle',
  Rectangle = 'rectangle'
}

/**
 * Touch button configuration.
 */
export interface TouchButtonConfig {
  /** Button position (center for circle, top-left for rectangle) */
  position: Vector2;
  /** Button radius (for circle) or width (for rectangle) */
  size: number;
  /** Button height (for rectangle only) */
  height?: number;
  /** Button shape */
  shape?: ButtonShape;
  /** Button label */
  label?: string;
}

/**
 * Virtual touch button for mobile controls.
 *
 * @example
 * ```typescript
 * const button = new TouchButton({
 *   position: new Vector2(300, 400),
 *   size: 60,
 *   label: 'A'
 * });
 *
 * button.onPressed(() => {
 *   player.jump();
 * });
 *
 * // Feed touch events
 * button.onTouchStart(touchPoint);
 * button.onTouchEnd(touchPoint);
 *
 * // Check state
 * if (button.isPressed()) {
 *   console.log('Button pressed');
 * }
 *
 * // Render button
 * button.render(ctx);
 * ```
 */
export class TouchButton {
  /** Button configuration */
  private config: Required<TouchButtonConfig>;

  /** Whether button is currently pressed */
  private pressed: boolean = false;

  /** Active touch ID */
  private activeTouchId: number | null = null;

  /** Press callbacks */
  private pressCallbacks: Set<() => void> = new Set();

  /** Release callbacks */
  private releaseCallbacks: Set<() => void> = new Set();

  /** Whether button was just pressed this frame */
  private justPressed: boolean = false;

  /** Whether button was just released this frame */
  private justReleased: boolean = false;

  /**
   * Creates a new touch button.
   *
   * @param config - Button configuration
   *
   * @example
   * ```typescript
   * const button = new TouchButton({
   *   position: new Vector2(300, 400),
   *   size: 60,
   *   label: 'Jump'
   * });
   * ```
   */
  constructor(config: TouchButtonConfig) {
    this.config = {
      position: config.position,
      size: config.size,
      height: config.height || config.size,
      shape: config.shape || ButtonShape.Circle,
      label: config.label || ''
    };

    logger.debug('TouchButton created at', this.config.position);
  }

  /**
   * Handles touch start event.
   *
   * @param touch - Touch point
   * @returns True if touch was consumed
   *
   * @example
   * ```typescript
   * if (button.onTouchStart(touch)) {
   *   // Touch consumed by button
   * }
   * ```
   */
  onTouchStart(touch: TouchPoint): boolean {
    if (this.activeTouchId !== null) {
      return false;
    }

    if (!this.containsPoint(touch.position)) {
      return false;
    }

    this.activeTouchId = touch.id;
    this.pressed = true;
    this.justPressed = true;

    // Trigger press callbacks
    for (const callback of this.pressCallbacks) {
      try {
        callback();
      } catch (error) {
        logger.error('Error in press callback', error);
      }
    }

    logger.debug(`TouchButton pressed by touch ${touch.id}`);
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
   * button.onTouchMove(touch);
   * ```
   */
  onTouchMove(touch: TouchPoint): boolean {
    if (touch.id !== this.activeTouchId) {
      return false;
    }

    // Check if touch moved outside button
    const contains = this.containsPoint(touch.position);

    if (this.pressed && !contains) {
      this.pressed = false;
      this.justReleased = true;

      for (const callback of this.releaseCallbacks) {
        try {
          callback();
        } catch (error) {
          logger.error('Error in release callback', error);
        }
      }
    } else if (!this.pressed && contains) {
      this.pressed = true;
      this.justPressed = true;

      for (const callback of this.pressCallbacks) {
        try {
          callback();
        } catch (error) {
          logger.error('Error in press callback', error);
        }
      }
    }

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
   * button.onTouchEnd(touch);
   * ```
   */
  onTouchEnd(touch: TouchPoint): boolean {
    if (touch.id !== this.activeTouchId) {
      return false;
    }

    this.activeTouchId = null;

    if (this.pressed) {
      this.pressed = false;
      this.justReleased = true;

      // Trigger release callbacks
      for (const callback of this.releaseCallbacks) {
        try {
          callback();
        } catch (error) {
          logger.error('Error in release callback', error);
        }
      }
    }

    logger.debug(`TouchButton released`);
    return true;
  }

  /**
   * Checks if a point is inside the button.
   *
   * @param point - Point to check
   * @returns True if point is inside button
   * @private
   */
  private containsPoint(point: Vector2): boolean {
    if (this.config.shape === ButtonShape.Circle) {
      const distance = point.distanceTo(this.config.position);
      return distance <= this.config.size;
    } else {
      // Rectangle
      const x = this.config.position.x;
      const y = this.config.position.y;
      const w = this.config.size;
      const h = this.config.height;

      return point.x >= x && point.x <= x + w &&
             point.y >= y && point.y <= y + h;
    }
  }

  /**
   * Registers a press callback.
   *
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * button.onPressed(() => {
   *   player.jump();
   * });
   * ```
   */
  onPressed(callback: () => void): void {
    this.pressCallbacks.add(callback);
  }

  /**
   * Registers a release callback.
   *
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * button.onReleased(() => {
   *   console.log('Button released');
   * });
   * ```
   */
  onReleased(callback: () => void): void {
    this.releaseCallbacks.add(callback);
  }

  /**
   * Removes a press callback.
   *
   * @param callback - Callback to remove
   *
   * @example
   * ```typescript
   * button.offPressed(jumpHandler);
   * ```
   */
  offPressed(callback: () => void): void {
    this.pressCallbacks.delete(callback);
  }

  /**
   * Removes a release callback.
   *
   * @param callback - Callback to remove
   *
   * @example
   * ```typescript
   * button.offReleased(releaseHandler);
   * ```
   */
  offReleased(callback: () => void): void {
    this.releaseCallbacks.delete(callback);
  }

  /**
   * Checks if button is currently pressed.
   *
   * @returns True if pressed
   *
   * @example
   * ```typescript
   * if (button.isPressed()) {
   *   console.log('Button is down');
   * }
   * ```
   */
  isPressed(): boolean {
    return this.pressed;
  }

  /**
   * Checks if button was just pressed this frame.
   *
   * @returns True if just pressed
   *
   * @example
   * ```typescript
   * if (button.wasJustPressed()) {
   *   player.jump();
   * }
   * ```
   */
  wasJustPressed(): boolean {
    return this.justPressed;
  }

  /**
   * Checks if button was just released this frame.
   *
   * @returns True if just released
   *
   * @example
   * ```typescript
   * if (button.wasJustReleased()) {
   *   console.log('Released');
   * }
   * ```
   */
  wasJustReleased(): boolean {
    return this.justReleased;
  }

  /**
   * Updates button state (clears just-pressed/released flags).
   * Call once per frame.
   *
   * @example
   * ```typescript
   * button.update();
   * ```
   */
  update(): void {
    this.justPressed = false;
    this.justReleased = false;
  }

  /**
   * Gets the button position.
   *
   * @returns Button position
   *
   * @example
   * ```typescript
   * const pos = button.getPosition();
   * ```
   */
  getPosition(): Vector2 {
    return this.config.position.clone();
  }

  /**
   * Gets the button size.
   *
   * @returns Button size
   *
   * @example
   * ```typescript
   * const size = button.getSize();
   * ```
   */
  getSize(): number {
    return this.config.size;
  }

  /**
   * Renders the button (basic visualization).
   *
   * @param ctx - Canvas rendering context
   * @param alpha - Optional opacity (0-1)
   *
   * @example
   * ```typescript
   * button.render(ctx, 0.5);
   * ```
   */
  render(ctx: CanvasRenderingContext2D, alpha: number = 0.3): void {
    ctx.save();
    ctx.globalAlpha = this.pressed ? alpha * 1.5 : alpha;

    if (this.config.shape === ButtonShape.Circle) {
      // Draw circle
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = this.pressed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(
        this.config.position.x,
        this.config.position.y,
        this.config.size,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
    } else {
      // Draw rectangle
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = this.pressed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;

      ctx.fillRect(
        this.config.position.x,
        this.config.position.y,
        this.config.size,
        this.config.height
      );
      ctx.strokeRect(
        this.config.position.x,
        this.config.position.y,
        this.config.size,
        this.config.height
      );
    }

    // Draw label
    if (this.config.label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (this.config.shape === ButtonShape.Circle) {
        ctx.fillText(
          this.config.label,
          this.config.position.x,
          this.config.position.y
        );
      } else {
        ctx.fillText(
          this.config.label,
          this.config.position.x + this.config.size / 2,
          this.config.position.y + this.config.height / 2
        );
      }
    }

    ctx.restore();
  }

  /**
   * Resets the button.
   *
   * @example
   * ```typescript
   * button.reset();
   * ```
   */
  reset(): void {
    this.pressed = false;
    this.activeTouchId = null;
    this.justPressed = false;
    this.justReleased = false;
    logger.debug('TouchButton reset');
  }
}
