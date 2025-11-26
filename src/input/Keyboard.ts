/**
 * Keyboard - Keyboard input handling with key states and modifiers
 *
 * Provides low-level keyboard input handling with state tracking for all keys.
 * Supports key down/up/pressed/released states, modifier keys (ctrl, shift, alt, meta),
 * and text input events. Uses the modern KeyboardEvent.code for reliable key detection.
 *
 * @module input/Keyboard
 *
 * @example
 * ```typescript
 * const keyboard = new Keyboard();
 * keyboard.attach(window);
 *
 * // Check if key is currently down
 * if (keyboard.isKeyDown('KeyW')) {
 *   player.moveForward();
 * }
 *
 * // Check if key was just pressed this frame
 * if (keyboard.wasKeyPressed('Space')) {
 *   player.jump();
 * }
 *
 * // Check modifiers
 * if (keyboard.isKeyDown('KeyS') && keyboard.ctrl) {
 *   saveGame();
 * }
 *
 * // Update each frame
 * keyboard.update();
 * ```
 */

import { Logger } from '../core/Logger';

const logger = new Logger('Keyboard');

/**
 * Key state flags
 */
enum KeyState {
  Up = 0,
  Down = 1,
  Pressed = 2,  // Down this frame
  Released = 4  // Up this frame
}

/**
 * Text input event data
 */
export interface TextInputEvent {
  /**
   * The input text
   */
  text: string;

  /**
   * Timestamp when text was input
   */
  timestamp: number;
}

/**
 * Keyboard input handler with comprehensive key state tracking.
 * Handles all standard keyboard keys and modifiers.
 *
 * @example
 * ```typescript
 * // Create and attach keyboard
 * const keyboard = new Keyboard();
 * keyboard.attach(window);
 *
 * // In game loop
 * function update() {
 *   keyboard.update();
 *
 *   // Check movement keys
 *   const moveX = keyboard.isKeyDown('KeyD') ? 1 : keyboard.isKeyDown('KeyA') ? -1 : 0;
 *   const moveY = keyboard.isKeyDown('KeyW') ? 1 : keyboard.isKeyDown('KeyS') ? -1 : 0;
 *   player.move(moveX, moveY);
 *
 *   // Check action keys
 *   if (keyboard.wasKeyPressed('Space')) {
 *     player.jump();
 *   }
 *
 *   if (keyboard.wasKeyPressed('KeyE')) {
 *     player.interact();
 *   }
 * }
 * ```
 */
export class Keyboard {
  /**
   * Current key states (KeyboardEvent.code -> state)
   */
  private keyStates: Map<string, KeyState> = new Map();

  /**
   * Previous frame key states for edge detection
   */
  private previousKeyStates: Map<string, KeyState> = new Map();

  /**
   * Keys that were pressed this frame
   */
  private keysPressed: Set<string> = new Set();

  /**
   * Keys that were released this frame
   */
  private keysReleased: Set<string> = new Set();

  /**
   * Text input buffer
   */
  private textInputBuffer: TextInputEvent[] = [];

  /**
   * Maximum text input buffer size
   */
  private readonly maxTextBufferSize: number = 100;

  /**
   * Whether keyboard is currently attached to window
   */
  private attached: boolean = false;

  /**
   * Target element for event listeners
   */
  private target: EventTarget | null = null;

  /**
   * Bound event handlers for cleanup
   */
  private handleKeyDown = this.onKeyDown.bind(this);
  private handleKeyUp = this.onKeyUp.bind(this);
  private handleKeyPress = this.onKeyPress.bind(this);
  private handleBlur = this.onBlur.bind(this);

  /**
   * Creates a new keyboard input handler.
   *
   * @example
   * ```typescript
   * const keyboard = new Keyboard();
   * ```
   */
  constructor() {
    logger.debug('Keyboard input handler created');
  }

  /**
   * Attaches keyboard event listeners to a target element.
   *
   * @param target - Target element (typically window)
   *
   * @example
   * ```typescript
   * keyboard.attach(window);
   * ```
   */
  attach(target: EventTarget): void {
    if (this.attached) {
      logger.warn('Keyboard already attached, detaching first');
      this.detach();
    }

    this.target = target;
    target.addEventListener('keydown', this.handleKeyDown as EventListener);
    target.addEventListener('keyup', this.handleKeyUp as EventListener);
    target.addEventListener('keypress', this.handleKeyPress as EventListener);

    // Handle window blur to reset state
    if (target === window || (target as any) === window) {
      window.addEventListener('blur', this.handleBlur);
    }

    this.attached = true;
    logger.debug('Keyboard attached to target');
  }

  /**
   * Detaches keyboard event listeners.
   *
   * @example
   * ```typescript
   * keyboard.detach();
   * ```
   */
  detach(): void {
    if (!this.attached || !this.target) {
      return;
    }

    this.target.removeEventListener('keydown', this.handleKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.handleKeyUp as EventListener);
    this.target.removeEventListener('keypress', this.handleKeyPress as EventListener);

    if (this.target === window || (this.target as any) === window) {
      window.removeEventListener('blur', this.handleBlur);
    }

    this.target = null;
    this.attached = false;
    this.reset();
    logger.debug('Keyboard detached');
  }

  /**
   * Updates keyboard state. Call once per frame after processing input.
   *
   * @example
   * ```typescript
   * // At end of frame
   * keyboard.update();
   * ```
   */
  update(): void {
    // Clear pressed/released sets
    this.keysPressed.clear();
    this.keysReleased.clear();

    // Copy current states to previous
    this.previousKeyStates.clear();
    for (const [key, state] of this.keyStates) {
      this.previousKeyStates.set(key, state);
    }
  }

  /**
   * Checks if a key is currently down.
   *
   * @param code - KeyboardEvent.code (e.g., 'KeyW', 'Space', 'ArrowUp')
   * @returns True if key is down
   *
   * @example
   * ```typescript
   * if (keyboard.isKeyDown('KeyW')) {
   *   player.moveForward();
   * }
   * ```
   */
  isKeyDown(code: string): boolean {
    const state = this.keyStates.get(code);
    return state === KeyState.Down || state === KeyState.Pressed;
  }

  /**
   * Checks if a key is currently up.
   *
   * @param code - KeyboardEvent.code
   * @returns True if key is up
   *
   * @example
   * ```typescript
   * if (keyboard.isKeyUp('Space')) {
   *   console.log('Space key is not pressed');
   * }
   * ```
   */
  isKeyUp(code: string): boolean {
    return !this.isKeyDown(code);
  }

  /**
   * Checks if a key was pressed this frame (transitioning from up to down).
   *
   * @param code - KeyboardEvent.code
   * @returns True if key was just pressed
   *
   * @example
   * ```typescript
   * if (keyboard.wasKeyPressed('Space')) {
   *   player.jump();
   * }
   * ```
   */
  wasKeyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  /**
   * Checks if a key was released this frame (transitioning from down to up).
   *
   * @param code - KeyboardEvent.code
   * @returns True if key was just released
   *
   * @example
   * ```typescript
   * if (keyboard.wasKeyReleased('Space')) {
   *   console.log('Jump button released');
   * }
   * ```
   */
  wasKeyReleased(code: string): boolean {
    return this.keysReleased.has(code);
  }

  /**
   * Gets the current state of a key as a value (0 or 1).
   *
   * @param code - KeyboardEvent.code
   * @returns 1 if key is down, 0 if up
   *
   * @example
   * ```typescript
   * const forward = keyboard.getKeyValue('KeyW');
   * const back = keyboard.getKeyValue('KeyS');
   * const moveZ = forward - back;
   * ```
   */
  getKeyValue(code: string): number {
    return this.isKeyDown(code) ? 1 : 0;
  }

  /**
   * Checks if Ctrl key is currently down.
   */
  get ctrl(): boolean {
    return this.isKeyDown('ControlLeft') || this.isKeyDown('ControlRight');
  }

  /**
   * Checks if Shift key is currently down.
   */
  get shift(): boolean {
    return this.isKeyDown('ShiftLeft') || this.isKeyDown('ShiftRight');
  }

  /**
   * Checks if Alt key is currently down.
   */
  get alt(): boolean {
    return this.isKeyDown('AltLeft') || this.isKeyDown('AltRight');
  }

  /**
   * Checks if Meta key (Cmd/Win) is currently down.
   */
  get meta(): boolean {
    return this.isKeyDown('MetaLeft') || this.isKeyDown('MetaRight');
  }

  /**
   * Gets all currently pressed keys.
   *
   * @returns Array of key codes
   *
   * @example
   * ```typescript
   * const pressedKeys = keyboard.getPressedKeys();
   * console.log('Pressed:', pressedKeys.join(', '));
   * ```
   */
  getPressedKeys(): string[] {
    const pressed: string[] = [];
    for (const [code, state] of this.keyStates) {
      if (state === KeyState.Down || state === KeyState.Pressed) {
        pressed.push(code);
      }
    }
    return pressed;
  }

  /**
   * Gets all text input events since last frame.
   *
   * @returns Array of text input events
   *
   * @example
   * ```typescript
   * const textEvents = keyboard.getTextInput();
   * for (const event of textEvents) {
   *   console.log('Text input:', event.text);
   * }
   * ```
   */
  getTextInput(): TextInputEvent[] {
    const events = this.textInputBuffer.slice();
    this.textInputBuffer.length = 0;
    return events;
  }

  /**
   * Clears text input buffer.
   *
   * @example
   * ```typescript
   * keyboard.clearTextInput();
   * ```
   */
  clearTextInput(): void {
    this.textInputBuffer.length = 0;
  }

  /**
   * Resets all keyboard state.
   *
   * @example
   * ```typescript
   * keyboard.reset();
   * ```
   */
  reset(): void {
    this.keyStates.clear();
    this.previousKeyStates.clear();
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.textInputBuffer.length = 0;
    logger.debug('Keyboard state reset');
  }

  /**
   * Handles keydown events.
   *
   * @param event - Keyboard event
   * @private
   */
  private onKeyDown(event: KeyboardEvent): void {
    const code = event.code;
    if (!code) return;

    const wasDown = this.isKeyDown(code);

    if (!wasDown) {
      this.keyStates.set(code, KeyState.Pressed);
      this.keysPressed.add(code);
    } else {
      this.keyStates.set(code, KeyState.Down);
    }

    // Prevent default for game keys (optional, can be configured)
    if (this.shouldPreventDefault(code, event)) {
      event.preventDefault();
    }
  }

  /**
   * Handles keyup events.
   *
   * @param event - Keyboard event
   * @private
   */
  private onKeyUp(event: KeyboardEvent): void {
    const code = event.code;
    if (!code) return;

    const wasDown = this.isKeyDown(code);

    this.keyStates.set(code, KeyState.Up);

    if (wasDown) {
      this.keysReleased.add(code);
    }
  }

  /**
   * Handles keypress events for text input.
   *
   * @param event - Keyboard event
   * @private
   */
  private onKeyPress(event: KeyboardEvent): void {
    const char = event.key;
    if (!char || char.length !== 1) return;

    // Add to text input buffer
    if (this.textInputBuffer.length < this.maxTextBufferSize) {
      this.textInputBuffer.push({
        text: char,
        timestamp: performance.now()
      });
    }
  }

  /**
   * Handles window blur to reset state.
   *
   * @private
   */
  private onBlur(): void {
    // Reset all keys when window loses focus
    logger.debug('Window blur, resetting keyboard state');
    this.reset();
  }

  /**
   * Determines if default behavior should be prevented for a key.
   *
   * @param code - Key code
   * @param event - Keyboard event
   * @returns True if default should be prevented
   * @private
   */
  private shouldPreventDefault(code: string, event: KeyboardEvent): boolean {
    // Prevent default for arrow keys (scrolling)
    if (code.startsWith('Arrow')) {
      return true;
    }

    // Prevent default for space (scrolling)
    if (code === 'Space') {
      return true;
    }

    // Don't prevent default for F keys or browser shortcuts
    if (code.startsWith('F')) {
      return false;
    }

    // Don't prevent Ctrl/Cmd shortcuts
    if (event.ctrlKey || event.metaKey) {
      return false;
    }

    return false;
  }

  /**
   * Checks if keyboard is attached.
   *
   * @returns True if attached
   *
   * @example
   * ```typescript
   * if (!keyboard.isAttached()) {
   *   keyboard.attach(window);
   * }
   * ```
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Disposes the keyboard handler, detaching all listeners.
   *
   * @example
   * ```typescript
   * keyboard.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    logger.debug('Keyboard disposed');
  }
}

/**
 * Common key code constants for convenience.
 *
 * @example
 * ```typescript
 * import { Keyboard, KeyCodes } from './input';
 *
 * if (keyboard.isKeyDown(KeyCodes.SPACE)) {
 *   player.jump();
 * }
 * ```
 */
export const KeyCodes = {
  // Letters
  A: 'KeyA', B: 'KeyB', C: 'KeyC', D: 'KeyD', E: 'KeyE', F: 'KeyF',
  G: 'KeyG', H: 'KeyH', I: 'KeyI', J: 'KeyJ', K: 'KeyK', L: 'KeyL',
  M: 'KeyM', N: 'KeyN', O: 'KeyO', P: 'KeyP', Q: 'KeyQ', R: 'KeyR',
  S: 'KeyS', T: 'KeyT', U: 'KeyU', V: 'KeyV', W: 'KeyW', X: 'KeyX',
  Y: 'KeyY', Z: 'KeyZ',

  // Numbers
  DIGIT_0: 'Digit0', DIGIT_1: 'Digit1', DIGIT_2: 'Digit2', DIGIT_3: 'Digit3',
  DIGIT_4: 'Digit4', DIGIT_5: 'Digit5', DIGIT_6: 'Digit6', DIGIT_7: 'Digit7',
  DIGIT_8: 'Digit8', DIGIT_9: 'Digit9',

  // Function keys
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',

  // Special keys
  SPACE: 'Space',
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',

  // Arrow keys
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',

  // Modifiers
  SHIFT_LEFT: 'ShiftLeft',
  SHIFT_RIGHT: 'ShiftRight',
  CTRL_LEFT: 'ControlLeft',
  CTRL_RIGHT: 'ControlRight',
  ALT_LEFT: 'AltLeft',
  ALT_RIGHT: 'AltRight',
  META_LEFT: 'MetaLeft',
  META_RIGHT: 'MetaRight',

  // Other
  CAPS_LOCK: 'CapsLock',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
  INSERT: 'Insert'
} as const;
