/**
 * VirtualInput - On-screen virtual controls for mobile devices
 *
 * Provides virtual input controls such as on-screen joysticks and buttons for mobile
 * touch interfaces. Useful for games that need touch-based gamepad-like controls.
 * Virtual inputs integrate seamlessly with the input action system.
 *
 * @module input/VirtualInput
 *
 * @example
 * ```typescript
 * const virtualInput = new VirtualInput();
 *
 * // Create virtual joystick
 * const joystick = virtualInput.createJoystick({
 *   position: { x: 100, y: 500 },
 *   radius: 50,
 *   visible: true
 * });
 *
 * // Create virtual button
 * const jumpButton = virtualInput.createButton({
 *   position: { x: 600, y: 500 },
 *   radius: 40,
 *   label: 'Jump'
 * });
 *
 * // In game loop
 * virtualInput.update();
 * const axis = joystick.getValue();
 * if (jumpButton.isPressed()) {
 *   player.jump();
 * }
 * ```
 */

import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = new Logger('VirtualInput');

/**
 * Virtual joystick configuration
 */
export interface VirtualJoystickConfig {
  /**
   * Position on screen (center of joystick)
   */
  position: { x: number; y: number };

  /**
   * Outer radius in pixels
   */
  radius: number;

  /**
   * Inner stick radius (default: radius * 0.4)
   */
  stickRadius?: number;

  /**
   * Whether joystick is visible
   */
  visible?: boolean;

  /**
   * Base color
   */
  baseColor?: string;

  /**
   * Stick color
   */
  stickColor?: string;

  /**
   * Opacity (0-1)
   */
  opacity?: number;

  /**
   * Return to center when released
   */
  returnToCenter?: boolean;

  /**
   * Deadzone threshold (0-1)
   */
  deadzone?: number;
}

/**
 * Virtual button configuration
 */
export interface VirtualButtonConfig {
  /**
   * Position on screen (center of button)
   */
  position: { x: number; y: number };

  /**
   * Button radius in pixels
   */
  radius: number;

  /**
   * Button label
   */
  label?: string;

  /**
   * Whether button is visible
   */
  visible?: boolean;

  /**
   * Button color
   */
  color?: string;

  /**
   * Pressed color
   */
  pressedColor?: string;

  /**
   * Opacity (0-1)
   */
  opacity?: number;
}

/**
 * Virtual joystick control
 */
export class VirtualJoystick {
  /**
   * Joystick configuration
   */
  private config: Required<VirtualJoystickConfig>;

  /**
   * Current stick position (-1 to 1)
   */
  private value: Vector2 = new Vector2(0, 0);

  /**
   * Touch ID currently controlling this joystick
   */
  private touchId: number | null = null;

  /**
   * Whether joystick is currently active
   */
  private active: boolean = false;

  /**
   * Canvas element for rendering
   */
  private canvas: HTMLCanvasElement | null = null;

  /**
   * Canvas rendering context
   */
  private ctx: CanvasRenderingContext2D | null = null;

  /**
   * Creates a new virtual joystick.
   *
   * @param config - Joystick configuration
   *
   * @internal
   */
  constructor(config: VirtualJoystickConfig) {
    this.config = {
      position: config.position,
      radius: config.radius,
      stickRadius: config.stickRadius ?? config.radius * 0.4,
      visible: config.visible ?? true,
      baseColor: config.baseColor ?? 'rgba(255, 255, 255, 0.3)',
      stickColor: config.stickColor ?? 'rgba(255, 255, 255, 0.8)',
      opacity: config.opacity ?? 0.5,
      returnToCenter: config.returnToCenter ?? true,
      deadzone: config.deadzone ?? 0.1
    };
  }

  /**
   * Gets current joystick value.
   *
   * @returns Normalized value (-1 to 1 in each axis)
   *
   * @example
   * ```typescript
   * const axis = joystick.getValue();
   * player.move(axis.x, axis.y);
   * ```
   */
  getValue(): Readonly<Vector2> {
    return this.value;
  }

  /**
   * Checks if joystick is currently active.
   *
   * @returns True if active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Sets joystick visibility.
   *
   * @param visible - Whether joystick should be visible
   */
  setVisible(visible: boolean): void {
    this.config.visible = visible;
  }

  /**
   * Updates joystick state based on touch input.
   *
   * @param touches - Active touch points
   * @internal
   */
  update(touches: Array<{ id: number; position: Vector2 }>): void {
    const center = new Vector2(this.config.position.x, this.config.position.y);

    // Check if any touch is in range
    if (this.touchId === null) {
      for (const touch of touches) {
        const distance = touch.position.distanceTo(center);
        if (distance <= this.config.radius) {
          this.touchId = touch.id;
          this.active = true;
          break;
        }
      }
    }

    // Update stick position based on active touch
    if (this.touchId !== null) {
      const touch = touches.find(t => t.id === this.touchId);

      if (touch) {
        const offset = touch.position.subtract(center);
        const distance = offset.length();

        if (distance > 0) {
          const clamped = Math.min(distance, this.config.radius);
          const normalized = offset.normalize().scale(clamped / this.config.radius);

          // Apply deadzone
          if (normalized.length() < this.config.deadzone) {
            this.value.set(0, 0);
          } else {
            const remapped = normalized.normalize().scale(
              (normalized.length() - this.config.deadzone) / (1 - this.config.deadzone)
            );
            this.value.set(remapped.x, remapped.y);
          }
        }
      } else {
        // Touch ended
        this.touchId = null;
        this.active = false;
        if (this.config.returnToCenter) {
          this.value.set(0, 0);
        }
      }
    }
  }

  /**
   * Renders the joystick to a canvas.
   *
   * @param ctx - Canvas rendering context
   * @internal
   */
  render(ctx: CanvasRenderingContext2D): void {
    if (!this.config.visible) return;

    const center = this.config.position;
    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = this.config.opacity;

    // Draw base
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.config.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.config.baseColor;
    ctx.fill();

    // Draw stick
    const stickPos = this.value.scale(this.config.radius * 0.6);
    ctx.beginPath();
    ctx.arc(
      center.x + stickPos.x,
      center.y + stickPos.y,
      this.config.stickRadius,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = this.config.stickColor;
    ctx.fill();

    ctx.globalAlpha = oldAlpha;
  }
}

/**
 * Virtual button control
 */
export class VirtualButton {
  /**
   * Button configuration
   */
  private config: Required<VirtualButtonConfig>;

  /**
   * Whether button is currently pressed
   */
  private pressed: boolean = false;

  /**
   * Whether button was just pressed this frame
   */
  private justPressed: boolean = false;

  /**
   * Whether button was just released this frame
   */
  private justReleased: boolean = false;

  /**
   * Previous frame pressed state
   */
  private previousPressed: boolean = false;

  /**
   * Touch ID currently pressing this button
   */
  private touchId: number | null = null;

  /**
   * Creates a new virtual button.
   *
   * @param config - Button configuration
   *
   * @internal
   */
  constructor(config: VirtualButtonConfig) {
    this.config = {
      position: config.position,
      radius: config.radius,
      label: config.label ?? '',
      visible: config.visible ?? true,
      color: config.color ?? 'rgba(255, 255, 255, 0.3)',
      pressedColor: config.pressedColor ?? 'rgba(255, 255, 255, 0.6)',
      opacity: config.opacity ?? 0.5
    };
  }

  /**
   * Checks if button is currently pressed.
   *
   * @returns True if pressed
   */
  isPressed(): boolean {
    return this.pressed;
  }

  /**
   * Checks if button was just pressed this frame.
   *
   * @returns True if just pressed
   */
  wasPressed(): boolean {
    return this.justPressed;
  }

  /**
   * Checks if button was just released this frame.
   *
   * @returns True if just released
   */
  wasReleased(): boolean {
    return this.justReleased;
  }

  /**
   * Gets button value (0 or 1).
   *
   * @returns 1 if pressed, 0 if not
   */
  getValue(): number {
    return this.pressed ? 1 : 0;
  }

  /**
   * Sets button visibility.
   *
   * @param visible - Whether button should be visible
   */
  setVisible(visible: boolean): void {
    this.config.visible = visible;
  }

  /**
   * Updates button state based on touch input.
   *
   * @param touches - Active touch points
   * @internal
   */
  update(touches: Array<{ id: number; position: Vector2 }>): void {
    this.previousPressed = this.pressed;
    this.pressed = false;

    const center = new Vector2(this.config.position.x, this.config.position.y);

    // Check if any touch is pressing this button
    if (this.touchId === null) {
      for (const touch of touches) {
        const distance = touch.position.distanceTo(center);
        if (distance <= this.config.radius) {
          this.touchId = touch.id;
          this.pressed = true;
          break;
        }
      }
    } else {
      const touch = touches.find(t => t.id === this.touchId);
      if (touch) {
        const distance = touch.position.distanceTo(center);
        this.pressed = distance <= this.config.radius;
      } else {
        this.touchId = null;
      }
    }

    this.justPressed = this.pressed && !this.previousPressed;
    this.justReleased = !this.pressed && this.previousPressed;
  }

  /**
   * Renders the button to a canvas.
   *
   * @param ctx - Canvas rendering context
   * @internal
   */
  render(ctx: CanvasRenderingContext2D): void {
    if (!this.config.visible) return;

    const center = this.config.position;
    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = this.config.opacity;

    // Draw button
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.config.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.pressed ? this.config.pressedColor : this.config.color;
    ctx.fill();

    // Draw label
    if (this.config.label) {
      ctx.fillStyle = 'white';
      ctx.font = `${this.config.radius * 0.6}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.config.label, center.x, center.y);
    }

    ctx.globalAlpha = oldAlpha;
  }
}

/**
 * Virtual input manager for on-screen controls.
 *
 * @example
 * ```typescript
 * const virtualInput = new VirtualInput();
 * virtualInput.attach(canvas);
 *
 * // Create controls
 * const moveJoystick = virtualInput.createJoystick({
 *   position: { x: 100, y: 500 },
 *   radius: 60
 * });
 *
 * const jumpButton = virtualInput.createButton({
 *   position: { x: 600, y: 500 },
 *   radius: 40,
 *   label: 'A'
 * });
 *
 * // Update and render
 * function loop() {
 *   virtualInput.update();
 *   virtualInput.render();
 *
 *   const move = moveJoystick.getValue();
 *   if (jumpButton.wasPressed()) {
 *     jump();
 *   }
 * }
 * ```
 */
export class VirtualInput {
  /**
   * Virtual joysticks
   */
  private joysticks: VirtualJoystick[] = [];

  /**
   * Virtual buttons
   */
  private buttons: VirtualButton[] = [];

  /**
   * Canvas element
   */
  private canvas: HTMLCanvasElement | null = null;

  /**
   * Canvas rendering context
   */
  private ctx: CanvasRenderingContext2D | null = null;

  /**
   * Whether virtual input is attached
   */
  private attached: boolean = false;

  /**
   * Active touches
   */
  private touches: Array<{ id: number; position: Vector2 }> = [];

  /**
   * Bound event handlers
   */
  private handleTouchStart = this.onTouchStart.bind(this);
  private handleTouchMove = this.onTouchMove.bind(this);
  private handleTouchEnd = this.onTouchEnd.bind(this);
  private handleTouchCancel = this.onTouchCancel.bind(this);

  /**
   * Creates a new virtual input manager.
   */
  constructor() {
    logger.debug('VirtualInput created');
  }

  /**
   * Attaches virtual input to a canvas element.
   *
   * @param canvas - Canvas element for rendering controls
   */
  attach(canvas: HTMLCanvasElement): void {
    if (this.attached) {
      logger.warn('VirtualInput already attached');
      return;
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    if (!this.ctx) {
      logger.error('Failed to get 2D context from canvas');
      return;
    }

    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', this.handleTouchCancel, { passive: false });

    this.attached = true;
    logger.debug('VirtualInput attached');
  }

  /**
   * Detaches virtual input.
   */
  detach(): void {
    if (!this.attached || !this.canvas) {
      return;
    }

    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.handleTouchCancel);

    this.canvas = null;
    this.ctx = null;
    this.attached = false;
    logger.debug('VirtualInput detached');
  }

  /**
   * Creates a virtual joystick.
   *
   * @param config - Joystick configuration
   * @returns The created joystick
   */
  createJoystick(config: VirtualJoystickConfig): VirtualJoystick {
    const joystick = new VirtualJoystick(config);
    this.joysticks.push(joystick);
    return joystick;
  }

  /**
   * Creates a virtual button.
   *
   * @param config - Button configuration
   * @returns The created button
   */
  createButton(config: VirtualButtonConfig): VirtualButton {
    const button = new VirtualButton(config);
    this.buttons.push(button);
    return button;
  }

  /**
   * Removes a virtual joystick.
   *
   * @param joystick - Joystick to remove
   */
  removeJoystick(joystick: VirtualJoystick): void {
    const index = this.joysticks.indexOf(joystick);
    if (index !== -1) {
      this.joysticks.splice(index, 1);
    }
  }

  /**
   * Removes a virtual button.
   *
   * @param button - Button to remove
   */
  removeButton(button: VirtualButton): void {
    const index = this.buttons.indexOf(button);
    if (index !== -1) {
      this.buttons.splice(index, 1);
    }
  }

  /**
   * Updates all virtual controls.
   */
  update(): void {
    for (const joystick of this.joysticks) {
      joystick.update(this.touches);
    }

    for (const button of this.buttons) {
      button.update(this.touches);
    }
  }

  /**
   * Renders all virtual controls.
   */
  render(): void {
    if (!this.ctx) return;

    for (const joystick of this.joysticks) {
      joystick.render(this.ctx);
    }

    for (const button of this.buttons) {
      button.render(this.ctx);
    }
  }

  /**
   * Handles touch start events.
   *
   * @private
   */
  private onTouchStart(event: TouchEvent): void {
    event.preventDefault();

    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      this.touches.push({
        id: touch.identifier,
        position: new Vector2(
          touch.clientX - rect.left,
          touch.clientY - rect.top
        )
      });
    }
  }

  /**
   * Handles touch move events.
   *
   * @private
   */
  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const existing = this.touches.find(t => t.id === touch.identifier);

      if (existing) {
        existing.position.set(
          touch.clientX - rect.left,
          touch.clientY - rect.top
        );
      }
    }
  }

  /**
   * Handles touch end events.
   *
   * @private
   */
  private onTouchEnd(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const index = this.touches.findIndex(t => t.id === touch.identifier);
      if (index !== -1) {
        this.touches.splice(index, 1);
      }
    }
  }

  /**
   * Handles touch cancel events.
   *
   * @private
   */
  private onTouchCancel(event: TouchEvent): void {
    this.onTouchEnd(event);
  }

  /**
   * Disposes virtual input.
   */
  dispose(): void {
    this.detach();
    this.joysticks.length = 0;
    this.buttons.length = 0;
    logger.debug('VirtualInput disposed');
  }
}
