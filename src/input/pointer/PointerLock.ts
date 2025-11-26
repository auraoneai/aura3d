/**
 * PointerLock - Pointer Lock API wrapper
 *
 * Provides a clean wrapper around the Pointer Lock API for FPS-style controls.
 * Handles pointer lock requests, exit, movement tracking, and state management.
 * Includes error handling and cross-browser compatibility.
 *
 * @module input/pointer/PointerLock
 *
 * @example
 * ```typescript
 * const pointerLock = new PointerLock();
 * pointerLock.attach(canvas);
 *
 * // Request pointer lock
 * canvas.addEventListener('click', async () => {
 *   try {
 *     await pointerLock.request();
 *     console.log('Pointer locked');
 *   } catch (error) {
 *     console.error('Failed to lock pointer');
 *   }
 * });
 *
 * // Handle movement
 * pointerLock.on('move', (delta) => {
 *   camera.yaw += delta.x * sensitivity;
 *   camera.pitch += delta.y * sensitivity;
 * });
 *
 * // Exit pointer lock
 * pointerLock.on('unlock', () => {
 *   showMenu();
 * });
 * ```
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';

const logger = new Logger('PointerLock');

/**
 * Pointer lock callback types
 */
export type PointerLockMoveCallback = (delta: Vector2, event: MouseEvent) => void;
export type PointerLockStateCallback = () => void;
export type PointerLockErrorCallback = (error: Error) => void;

/**
 * Pointer lock configuration
 */
export interface PointerLockConfig {
  /**
   * Enable unadjusted movement for raw mouse input
   */
  unadjustedMovement?: boolean;

  /**
   * Auto-exit pointer lock on Escape key
   */
  exitOnEscape?: boolean;
}

/**
 * Pointer Lock API wrapper for FPS-style controls.
 * Provides a clean interface to the Pointer Lock API with event handling.
 *
 * @example
 * ```typescript
 * const pointerLock = new PointerLock({
 *   unadjustedMovement: true,
 *   exitOnEscape: true
 * });
 *
 * pointerLock.attach(canvas);
 *
 * // Request lock on click
 * canvas.addEventListener('click', async () => {
 *   if (!pointerLock.isLocked()) {
 *     await pointerLock.request();
 *   }
 * });
 *
 * // Handle movement
 * pointerLock.on('move', (delta) => {
 *   camera.rotate(delta.x, delta.y);
 * });
 *
 * // Handle state changes
 * pointerLock.on('lock', () => {
 *   console.log('Pointer locked - hide UI');
 * });
 *
 * pointerLock.on('unlock', () => {
 *   console.log('Pointer unlocked - show UI');
 * });
 * ```
 */
export class PointerLock {
  /**
   * Configuration
   */
  private config: Required<PointerLockConfig>;

  /**
   * Whether pointer is currently locked
   */
  private locked: boolean = false;

  /**
   * Target element
   */
  private target: HTMLElement | null = null;

  /**
   * Whether attached to element
   */
  private attached: boolean = false;

  /**
   * Movement delta accumulator
   */
  private movementDelta: Vector2 = new Vector2(0, 0);

  /**
   * Event callbacks
   */
  private eventCallbacks: Map<string, Set<Function>> = new Map();

  /**
   * Bound event handlers
   */
  private handlePointerLockChange = this.onPointerLockChange.bind(this);
  private handlePointerLockError = this.onPointerLockError.bind(this);
  private handleMouseMove = this.onMouseMove.bind(this);
  private handleKeyDown = this.onKeyDown.bind(this);

  /**
   * Creates a new pointer lock wrapper.
   *
   * @param config - Pointer lock configuration
   *
   * @example
   * ```typescript
   * const pointerLock = new PointerLock({
   *   unadjustedMovement: true,
   *   exitOnEscape: true
   * });
   * ```
   */
  constructor(config: PointerLockConfig = {}) {
    this.config = {
      unadjustedMovement: config.unadjustedMovement ?? true,
      exitOnEscape: config.exitOnEscape ?? true
    };

    logger.debug('PointerLock created');
  }

  /**
   * Attaches pointer lock to a target element.
   *
   * @param target - Target element for pointer lock
   *
   * @example
   * ```typescript
   * pointerLock.attach(canvas);
   * ```
   */
  attach(target: HTMLElement): void {
    if (this.attached) {
      logger.warn('PointerLock already attached');
      this.detach();
    }

    this.target = target;

    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    document.addEventListener('mousemove', this.handleMouseMove);

    if (this.config.exitOnEscape) {
      document.addEventListener('keydown', this.handleKeyDown);
    }

    this.attached = true;
    logger.debug('PointerLock attached');
  }

  /**
   * Detaches pointer lock event listeners.
   *
   * @example
   * ```typescript
   * pointerLock.detach();
   * ```
   */
  detach(): void {
    if (!this.attached) {
      return;
    }

    if (this.locked) {
      this.exit();
    }

    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    document.removeEventListener('mousemove', this.handleMouseMove);

    if (this.config.exitOnEscape) {
      document.removeEventListener('keydown', this.handleKeyDown);
    }

    this.target = null;
    this.attached = false;
    logger.debug('PointerLock detached');
  }

  /**
   * Requests pointer lock on the target element.
   *
   * @returns Promise that resolves when pointer is locked
   *
   * @example
   * ```typescript
   * try {
   *   await pointerLock.request();
   *   console.log('Pointer locked');
   * } catch (error) {
   *   console.error('Failed to lock pointer:', error);
   * }
   * ```
   */
  async request(): Promise<void> {
    if (!this.target) {
      throw new Error('PointerLock must be attached before requesting lock');
    }

    if (this.locked) {
      logger.debug('Pointer already locked');
      return;
    }

    try {
      const options: any = {};

      if (this.config.unadjustedMovement) {
        options.unadjustedMovement = true;
      }

      await (this.target.requestPointerLock as any)(options);
      logger.debug('Pointer lock requested');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to request pointer lock:', message);
      this.emit('error', new Error(`Pointer lock request failed: ${message}`));
      throw error;
    }
  }

  /**
   * Exits pointer lock.
   *
   * @example
   * ```typescript
   * pointerLock.exit();
   * ```
   */
  exit(): void {
    if (!this.locked) {
      return;
    }

    document.exitPointerLock();
    logger.debug('Exiting pointer lock');
  }

  /**
   * Checks if pointer is currently locked.
   *
   * @returns True if pointer is locked
   *
   * @example
   * ```typescript
   * if (pointerLock.isLocked()) {
   *   console.log('Pointer is locked');
   * }
   * ```
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Gets the current movement delta.
   *
   * @returns Movement delta vector
   *
   * @example
   * ```typescript
   * const delta = pointerLock.getMovementDelta();
   * camera.rotate(delta.x, delta.y);
   * ```
   */
  getMovementDelta(): Readonly<Vector2> {
    return this.movementDelta;
  }

  /**
   * Resets the movement delta. Call at end of frame.
   *
   * @example
   * ```typescript
   * function update() {
   *   const delta = pointerLock.getMovementDelta();
   *   camera.rotate(delta.x, delta.y);
   *   pointerLock.resetMovementDelta();
   * }
   * ```
   */
  resetMovementDelta(): void {
    this.movementDelta.set(0, 0);
  }

  /**
   * Checks if pointer lock is supported.
   *
   * @returns True if supported
   *
   * @example
   * ```typescript
   * if (PointerLock.isSupported()) {
   *   const pointerLock = new PointerLock();
   * }
   * ```
   */
  static isSupported(): boolean {
    return 'pointerLockElement' in document ||
           'mozPointerLockElement' in document ||
           'webkitPointerLockElement' in document;
  }

  /**
   * Checks if unadjusted movement is supported.
   *
   * @returns True if supported
   *
   * @example
   * ```typescript
   * if (PointerLock.isUnadjustedMovementSupported()) {
   *   console.log('Raw mouse input supported');
   * }
   * ```
   */
  static isUnadjustedMovementSupported(): boolean {
    const testElement = document.createElement('div');
    return 'unadjustedMovement' in (testElement as any);
  }

  /**
   * Adds an event listener.
   *
   * @param event - Event name
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * pointerLock.on('move', (delta) => {
   *   camera.rotate(delta.x, delta.y);
   * });
   *
   * pointerLock.on('lock', () => {
   *   console.log('Locked');
   * });
   *
   * pointerLock.on('unlock', () => {
   *   console.log('Unlocked');
   * });
   * ```
   */
  on(event: 'move', callback: PointerLockMoveCallback): void;
  on(event: 'lock' | 'unlock', callback: PointerLockStateCallback): void;
  on(event: 'error', callback: PointerLockErrorCallback): void;
  on(event: string, callback: Function): void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, new Set());
    }
    this.eventCallbacks.get(event)!.add(callback);
  }

  /**
   * Removes an event listener.
   *
   * @param event - Event name
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * pointerLock.off('move', handleMove);
   * ```
   */
  off(event: string, callback: Function): void {
    this.eventCallbacks.get(event)?.delete(callback);
  }

  /**
   * Handles pointer lock change events.
   *
   * @private
   */
  private onPointerLockChange(): void {
    const pointerLockElement = document.pointerLockElement ||
                               (document as any).mozPointerLockElement ||
                               (document as any).webkitPointerLockElement;

    const wasLocked = this.locked;
    this.locked = pointerLockElement === this.target;

    if (this.locked && !wasLocked) {
      logger.debug('Pointer locked');
      this.emit('lock');
    } else if (!this.locked && wasLocked) {
      logger.debug('Pointer unlocked');
      this.emit('unlock');
    }
  }

  /**
   * Handles pointer lock error events.
   *
   * @private
   */
  private onPointerLockError(): void {
    const error = new Error('Pointer lock error');
    logger.error('Pointer lock error');
    this.locked = false;
    this.emit('error', error);
  }

  /**
   * Handles mouse move events.
   *
   * @param event - Mouse event
   * @private
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.locked) {
      return;
    }

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    this.movementDelta.x += movementX;
    this.movementDelta.y += movementY;

    const delta = new Vector2(movementX, movementY);
    this.emit('move', delta, event);
  }

  /**
   * Handles keydown events.
   *
   * @param event - Keyboard event
   * @private
   */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Escape' && this.locked) {
      this.exit();
    }
  }

  /**
   * Emits an event to all listeners.
   *
   * @param event - Event name
   * @param args - Event arguments
   * @private
   */
  private emit(event: string, ...args: any[]): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
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
   * Disposes the pointer lock wrapper.
   *
   * @example
   * ```typescript
   * pointerLock.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    this.eventCallbacks.clear();
    logger.debug('PointerLock disposed');
  }
}
