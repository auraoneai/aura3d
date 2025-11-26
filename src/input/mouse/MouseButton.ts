/**
 * MouseButton - Mouse button definitions and utilities
 *
 * Comprehensive mouse button definitions including standard buttons (left, right, middle)
 * and extra buttons (back, forward, and additional buttons).
 *
 * @module input/mouse/MouseButton
 *
 * @example
 * ```typescript
 * import { MouseButton, getButtonName } from './mouse';
 *
 * // Check button state
 * if (mouse.isButtonDown(MouseButton.Left)) {
 *   handleLeftClick();
 * }
 *
 * // Get button name
 * const name = getButtonName(MouseButton.Right);
 * console.log(name); // "Right"
 * ```
 */

/**
 * Standard mouse button indices following the DOM specification.
 * These match the MouseEvent.button property values.
 */
export enum MouseButton {
  /**
   * Left mouse button (primary)
   */
  Left = 0,

  /**
   * Middle mouse button (wheel button)
   */
  Middle = 1,

  /**
   * Right mouse button (secondary/context menu)
   */
  Right = 2,

  /**
   * Browser back button (4th button)
   */
  Back = 3,

  /**
   * Browser forward button (5th button)
   */
  Forward = 4,

  /**
   * Extra button 6
   */
  Extra6 = 5,

  /**
   * Extra button 7
   */
  Extra7 = 6,

  /**
   * Extra button 8
   */
  Extra8 = 7,

  /**
   * Extra button 9
   */
  Extra9 = 8
}

/**
 * Mouse button names for display
 */
export const MouseButtonName: Record<MouseButton, string> = {
  [MouseButton.Left]: 'Left',
  [MouseButton.Middle]: 'Middle',
  [MouseButton.Right]: 'Right',
  [MouseButton.Back]: 'Back',
  [MouseButton.Forward]: 'Forward',
  [MouseButton.Extra6]: 'Extra 6',
  [MouseButton.Extra7]: 'Extra 7',
  [MouseButton.Extra8]: 'Extra 8',
  [MouseButton.Extra9]: 'Extra 9'
};

/**
 * Gets the name of a mouse button.
 *
 * @param button - Button index
 * @returns Button name
 *
 * @example
 * ```typescript
 * const name = getButtonName(MouseButton.Right);
 * console.log(name); // "Right"
 * ```
 */
export function getButtonName(button: MouseButton): string {
  return MouseButtonName[button] || `Button ${button}`;
}

/**
 * Checks if a button index is a standard button (0-2).
 *
 * @param button - Button index
 * @returns True if standard button
 *
 * @example
 * ```typescript
 * if (isStandardButton(button)) {
 *   console.log('Standard mouse button');
 * }
 * ```
 */
export function isStandardButton(button: number): boolean {
  return button >= MouseButton.Left && button <= MouseButton.Right;
}

/**
 * Checks if a button index is an extra button (3+).
 *
 * @param button - Button index
 * @returns True if extra button
 *
 * @example
 * ```typescript
 * if (isExtraButton(button)) {
 *   console.log('Extra mouse button');
 * }
 * ```
 */
export function isExtraButton(button: number): boolean {
  return button >= MouseButton.Back;
}

/**
 * Gets the button index from a button name.
 *
 * @param name - Button name
 * @returns Button index or -1 if not found
 *
 * @example
 * ```typescript
 * const button = getButtonFromName('Right');
 * console.log(button); // 2
 * ```
 */
export function getButtonFromName(name: string): number {
  const normalized = name.toLowerCase().trim();

  switch (normalized) {
    case 'left':
    case 'primary':
      return MouseButton.Left;

    case 'middle':
    case 'wheel':
      return MouseButton.Middle;

    case 'right':
    case 'secondary':
    case 'context':
      return MouseButton.Right;

    case 'back':
    case 'button4':
      return MouseButton.Back;

    case 'forward':
    case 'button5':
      return MouseButton.Forward;

    case 'extra6':
    case 'button6':
      return MouseButton.Extra6;

    case 'extra7':
    case 'button7':
      return MouseButton.Extra7;

    case 'extra8':
    case 'button8':
      return MouseButton.Extra8;

    case 'extra9':
    case 'button9':
      return MouseButton.Extra9;

    default:
      return -1;
  }
}

/**
 * Mouse button state tracking interface
 */
export interface MouseButtonState {
  /**
   * Whether button is currently down
   */
  down: boolean;

  /**
   * Whether button was just pressed this frame
   */
  justPressed: boolean;

  /**
   * Whether button was just released this frame
   */
  justReleased: boolean;

  /**
   * Time when button was pressed (ms)
   */
  pressedTime: number;

  /**
   * Time when button was released (ms)
   */
  releasedTime: number;

  /**
   * Duration button has been held (ms)
   */
  holdDuration: number;

  /**
   * Number of clicks in sequence
   */
  clickCount: number;

  /**
   * Time of last click
   */
  lastClickTime: number;
}

/**
 * Creates a new default button state.
 *
 * @returns Default button state
 *
 * @example
 * ```typescript
 * const state = createButtonState();
 * ```
 */
export function createButtonState(): MouseButtonState {
  return {
    down: false,
    justPressed: false,
    justReleased: false,
    pressedTime: 0,
    releasedTime: 0,
    holdDuration: 0,
    clickCount: 0,
    lastClickTime: 0
  };
}

/**
 * Maximum time between clicks to count as double/triple click (ms)
 */
export const DOUBLE_CLICK_TIME = 300;

/**
 * Checks if clicks constitute a double click.
 *
 * @param state - Button state
 * @param currentTime - Current time in milliseconds
 * @returns True if double click
 *
 * @example
 * ```typescript
 * if (isDoubleClick(buttonState, performance.now())) {
 *   console.log('Double click detected');
 * }
 * ```
 */
export function isDoubleClick(state: MouseButtonState, currentTime: number): boolean {
  return state.clickCount === 2 &&
         (currentTime - state.lastClickTime) < DOUBLE_CLICK_TIME;
}

/**
 * Checks if clicks constitute a triple click.
 *
 * @param state - Button state
 * @param currentTime - Current time in milliseconds
 * @returns True if triple click
 *
 * @example
 * ```typescript
 * if (isTripleClick(buttonState, performance.now())) {
 *   console.log('Triple click detected');
 * }
 * ```
 */
export function isTripleClick(state: MouseButtonState, currentTime: number): boolean {
  return state.clickCount === 3 &&
         (currentTime - state.lastClickTime) < DOUBLE_CLICK_TIME;
}
