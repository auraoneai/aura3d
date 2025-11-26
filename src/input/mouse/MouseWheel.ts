/**
 * MouseWheel - Mouse wheel handling with smooth scrolling support
 *
 * Provides comprehensive mouse wheel input handling with smooth scrolling,
 * momentum, delta accumulation, and normalized scroll values. Supports both
 * vertical and horizontal scrolling.
 *
 * @module input/mouse/MouseWheel
 *
 * @example
 * ```typescript
 * const wheel = new MouseWheel();
 * wheel.attach(canvas);
 *
 * // In game loop
 * wheel.update(deltaTime);
 *
 * // Get scroll delta
 * const scroll = wheel.getDelta();
 * camera.zoom += scroll.y * 0.1;
 *
 * // Check if scrolling
 * if (wheel.isScrolling()) {
 *   console.log('User is scrolling');
 * }
 * ```
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';

const logger = new Logger('MouseWheel');

/**
 * Scroll mode detection based on WheelEvent.deltaMode
 */
export enum ScrollMode {
  /**
   * Delta in pixels
   */
  Pixel = 0,

  /**
   * Delta in lines
   */
  Line = 1,

  /**
   * Delta in pages
   */
  Page = 2
}

/**
 * Mouse wheel configuration
 */
export interface MouseWheelConfig {
  /**
   * Smooth scrolling enabled
   */
  smoothing?: boolean;

  /**
   * Smoothing factor (0-1, higher = slower)
   */
  smoothingFactor?: number;

  /**
   * Enable momentum scrolling
   */
  momentum?: boolean;

  /**
   * Momentum decay factor (0-1, higher = longer momentum)
   */
  momentumDecay?: number;

  /**
   * Pixels per line for line-based scrolling
   */
  pixelsPerLine?: number;

  /**
   * Pixels per page for page-based scrolling
   */
  pixelsPerPage?: number;

  /**
   * Invert scroll direction
   */
  invertY?: boolean;

  /**
   * Invert horizontal scroll direction
   */
  invertX?: boolean;
}

/**
 * Mouse wheel input handler with smooth scrolling and momentum.
 *
 * @example
 * ```typescript
 * const wheel = new MouseWheel({
 *   smoothing: true,
 *   smoothingFactor: 0.2,
 *   momentum: true,
 *   momentumDecay: 0.95
 * });
 *
 * wheel.attach(canvas);
 *
 * function update(deltaTime: number) {
 *   wheel.update(deltaTime);
 *
 *   const delta = wheel.getDelta();
 *   if (delta.y !== 0) {
 *     camera.zoom += delta.y * zoomSpeed;
 *   }
 *
 *   const smooth = wheel.getSmoothedDelta();
 *   scrollableContent.offset += smooth.y;
 * }
 * ```
 */
export class MouseWheel {
  /**
   * Configuration
   */
  private config: Required<MouseWheelConfig>;

  /**
   * Raw scroll delta this frame
   */
  private rawDelta: Vector2 = new Vector2(0, 0);

  /**
   * Smoothed scroll delta
   */
  private smoothedDelta: Vector2 = new Vector2(0, 0);

  /**
   * Current momentum velocity
   */
  private momentum: Vector2 = new Vector2(0, 0);

  /**
   * Accumulated scroll delta
   */
  private accumulated: Vector2 = new Vector2(0, 0);

  /**
   * Whether wheel is currently scrolling
   */
  private scrolling: boolean = false;

  /**
   * Time since last scroll event
   */
  private timeSinceScroll: number = 0;

  /**
   * Timeout to stop scrolling detection
   */
  private scrollTimeout: number = 100;

  /**
   * Whether attached to element
   */
  private attached: boolean = false;

  /**
   * Target element
   */
  private target: HTMLElement | null = null;

  /**
   * Bound event handler
   */
  private handleWheel = this.onWheel.bind(this);

  /**
   * Creates a new mouse wheel handler.
   *
   * @param config - Wheel configuration
   *
   * @example
   * ```typescript
   * const wheel = new MouseWheel({
   *   smoothing: true,
   *   momentum: true
   * });
   * ```
   */
  constructor(config: MouseWheelConfig = {}) {
    this.config = {
      smoothing: config.smoothing ?? true,
      smoothingFactor: config.smoothingFactor ?? 0.2,
      momentum: config.momentum ?? false,
      momentumDecay: config.momentumDecay ?? 0.95,
      pixelsPerLine: config.pixelsPerLine ?? 16,
      pixelsPerPage: config.pixelsPerPage ?? 800,
      invertY: config.invertY ?? false,
      invertX: config.invertX ?? false
    };

    logger.debug('MouseWheel created');
  }

  /**
   * Attaches wheel event listener to target element.
   *
   * @param target - Target element
   *
   * @example
   * ```typescript
   * wheel.attach(canvas);
   * ```
   */
  attach(target: HTMLElement): void {
    if (this.attached) {
      logger.warn('MouseWheel already attached');
      this.detach();
    }

    this.target = target;
    target.addEventListener('wheel', this.handleWheel, { passive: false });

    this.attached = true;
    logger.debug('MouseWheel attached');
  }

  /**
   * Detaches wheel event listener.
   *
   * @example
   * ```typescript
   * wheel.detach();
   * ```
   */
  detach(): void {
    if (!this.attached || !this.target) {
      return;
    }

    this.target.removeEventListener('wheel', this.handleWheel);

    this.target = null;
    this.attached = false;
    this.reset();
    logger.debug('MouseWheel detached');
  }

  /**
   * Updates wheel state. Call once per frame.
   *
   * @param deltaTime - Time since last frame in seconds
   *
   * @example
   * ```typescript
   * function update(deltaTime: number) {
   *   wheel.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    const deltaMs = deltaTime * 1000;

    this.timeSinceScroll += deltaMs;

    if (this.timeSinceScroll > this.scrollTimeout) {
      this.scrolling = false;
      this.rawDelta.set(0, 0);
    }

    if (this.config.smoothing) {
      const smoothing = this.config.smoothingFactor;
      this.smoothedDelta.x += (this.rawDelta.x - this.smoothedDelta.x) * smoothing;
      this.smoothedDelta.y += (this.rawDelta.y - this.smoothedDelta.y) * smoothing;
    } else {
      this.smoothedDelta.set(this.rawDelta.x, this.rawDelta.y);
    }

    if (this.config.momentum) {
      this.momentum.scale(this.config.momentumDecay);

      if (Math.abs(this.momentum.x) < 0.01) this.momentum.x = 0;
      if (Math.abs(this.momentum.y) < 0.01) this.momentum.y = 0;
    } else {
      this.momentum.set(0, 0);
    }
  }

  /**
   * Marks the end of the current frame. Clears raw delta.
   *
   * @example
   * ```typescript
   * function update(deltaTime: number) {
   *   wheel.update(deltaTime);
   *   // ... game logic
   *   wheel.endFrame();
   * }
   * ```
   */
  endFrame(): void {
    this.rawDelta.set(0, 0);
  }

  /**
   * Gets the raw scroll delta for this frame.
   *
   * @returns Scroll delta in pixels
   *
   * @example
   * ```typescript
   * const delta = wheel.getDelta();
   * camera.zoom += delta.y * 0.1;
   * ```
   */
  getDelta(): Readonly<Vector2> {
    return this.rawDelta;
  }

  /**
   * Gets the smoothed scroll delta.
   *
   * @returns Smoothed delta in pixels
   *
   * @example
   * ```typescript
   * const smooth = wheel.getSmoothedDelta();
   * scrollY += smooth.y;
   * ```
   */
  getSmoothedDelta(): Readonly<Vector2> {
    return this.smoothedDelta;
  }

  /**
   * Gets the current momentum velocity.
   *
   * @returns Momentum vector
   *
   * @example
   * ```typescript
   * const momentum = wheel.getMomentum();
   * if (momentum.lengthSquared() > 0) {
   *   console.log('Momentum scrolling active');
   * }
   * ```
   */
  getMomentum(): Readonly<Vector2> {
    return this.momentum;
  }

  /**
   * Gets the combined delta (raw + momentum).
   *
   * @returns Combined delta
   *
   * @example
   * ```typescript
   * const total = wheel.getTotalDelta();
   * scrollPosition += total.y;
   * ```
   */
  getTotalDelta(): Vector2 {
    return new Vector2(
      this.rawDelta.x + this.momentum.x,
      this.rawDelta.y + this.momentum.y
    );
  }

  /**
   * Gets the accumulated scroll delta.
   *
   * @returns Accumulated delta
   *
   * @example
   * ```typescript
   * const accumulated = wheel.getAccumulated();
   * console.log(`Total scroll: ${accumulated.y}px`);
   * ```
   */
  getAccumulated(): Readonly<Vector2> {
    return this.accumulated;
  }

  /**
   * Resets accumulated scroll delta.
   *
   * @example
   * ```typescript
   * wheel.resetAccumulated();
   * ```
   */
  resetAccumulated(): void {
    this.accumulated.set(0, 0);
  }

  /**
   * Checks if currently scrolling.
   *
   * @returns True if scrolling
   *
   * @example
   * ```typescript
   * if (wheel.isScrolling()) {
   *   console.log('User is scrolling');
   * }
   * ```
   */
  isScrolling(): boolean {
    return this.scrolling;
  }

  /**
   * Gets vertical scroll delta.
   *
   * @returns Y delta
   *
   * @example
   * ```typescript
   * const scrollY = wheel.getScrollY();
   * ```
   */
  getScrollY(): number {
    return this.rawDelta.y;
  }

  /**
   * Gets horizontal scroll delta.
   *
   * @returns X delta
   *
   * @example
   * ```typescript
   * const scrollX = wheel.getScrollX();
   * ```
   */
  getScrollX(): number {
    return this.rawDelta.x;
  }

  /**
   * Gets smoothing configuration.
   *
   * @returns Configuration object
   */
  getConfig(): Readonly<Required<MouseWheelConfig>> {
    return this.config;
  }

  /**
   * Updates smoothing configuration.
   *
   * @param config - Partial configuration
   *
   * @example
   * ```typescript
   * wheel.setConfig({
   *   smoothing: true,
   *   smoothingFactor: 0.3
   * });
   * ```
   */
  setConfig(config: Partial<MouseWheelConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Resets all wheel state.
   *
   * @example
   * ```typescript
   * wheel.reset();
   * ```
   */
  reset(): void {
    this.rawDelta.set(0, 0);
    this.smoothedDelta.set(0, 0);
    this.momentum.set(0, 0);
    this.accumulated.set(0, 0);
    this.scrolling = false;
    this.timeSinceScroll = 0;
    logger.debug('MouseWheel reset');
  }

  /**
   * Handles wheel events.
   *
   * @param event - Wheel event
   * @private
   */
  private onWheel(event: WheelEvent): void {
    event.preventDefault();

    let deltaX = event.deltaX;
    let deltaY = event.deltaY;

    switch (event.deltaMode) {
      case ScrollMode.Line:
        deltaX *= this.config.pixelsPerLine;
        deltaY *= this.config.pixelsPerLine;
        break;

      case ScrollMode.Page:
        deltaX *= this.config.pixelsPerPage;
        deltaY *= this.config.pixelsPerPage;
        break;

      case ScrollMode.Pixel:
      default:
        break;
    }

    if (this.config.invertX) deltaX = -deltaX;
    if (this.config.invertY) deltaY = -deltaY;

    this.rawDelta.x = deltaX;
    this.rawDelta.y = deltaY;

    this.accumulated.x += deltaX;
    this.accumulated.y += deltaY;

    if (this.config.momentum) {
      this.momentum.x += deltaX * 0.1;
      this.momentum.y += deltaY * 0.1;
    }

    this.scrolling = true;
    this.timeSinceScroll = 0;
  }

  /**
   * Checks if attached.
   *
   * @returns True if attached
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Disposes the mouse wheel handler.
   *
   * @example
   * ```typescript
   * wheel.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    logger.debug('MouseWheel disposed');
  }
}
