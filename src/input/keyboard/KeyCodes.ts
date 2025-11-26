/**
 * KeyCodes - Complete keyboard key code definitions
 *
 * Comprehensive key code constants for all standard keyboard keys using the
 * KeyboardEvent.code standard. Organized by category for easy lookup.
 *
 * @module input/keyboard/KeyCodes
 *
 * @example
 * ```typescript
 * import { KeyCode } from './keyboard';
 *
 * // Use in keyboard checks
 * if (keyboard.isKeyDown(KeyCode.W)) {
 *   player.moveForward();
 * }
 *
 * // Use in bindings
 * action.addBinding({
 *   deviceType: 'keyboard',
 *   path: KeyCode.SPACE
 * });
 * ```
 */

/**
 * Complete key code constants following KeyboardEvent.code standard.
 * Covers all standard keyboard keys including letters, numbers, function keys,
 * navigation, numpad, and special keys.
 */
export const KeyCode = {
  /**
   * Letter keys (A-Z)
   */
  A: 'KeyA',
  B: 'KeyB',
  C: 'KeyC',
  D: 'KeyD',
  E: 'KeyE',
  F: 'KeyF',
  G: 'KeyG',
  H: 'KeyH',
  I: 'KeyI',
  J: 'KeyJ',
  K: 'KeyK',
  L: 'KeyL',
  M: 'KeyM',
  N: 'KeyN',
  O: 'KeyO',
  P: 'KeyP',
  Q: 'KeyQ',
  R: 'KeyR',
  S: 'KeyS',
  T: 'KeyT',
  U: 'KeyU',
  V: 'KeyV',
  W: 'KeyW',
  X: 'KeyX',
  Y: 'KeyY',
  Z: 'KeyZ',

  /**
   * Number keys (0-9) on main keyboard
   */
  DIGIT_0: 'Digit0',
  DIGIT_1: 'Digit1',
  DIGIT_2: 'Digit2',
  DIGIT_3: 'Digit3',
  DIGIT_4: 'Digit4',
  DIGIT_5: 'Digit5',
  DIGIT_6: 'Digit6',
  DIGIT_7: 'Digit7',
  DIGIT_8: 'Digit8',
  DIGIT_9: 'Digit9',

  /**
   * Function keys (F1-F24)
   */
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',
  F13: 'F13',
  F14: 'F14',
  F15: 'F15',
  F16: 'F16',
  F17: 'F17',
  F18: 'F18',
  F19: 'F19',
  F20: 'F20',
  F21: 'F21',
  F22: 'F22',
  F23: 'F23',
  F24: 'F24',

  /**
   * Special keys
   */
  SPACE: 'Space',
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  INSERT: 'Insert',
  CAPS_LOCK: 'CapsLock',
  SCROLL_LOCK: 'ScrollLock',
  NUM_LOCK: 'NumLock',
  PAUSE: 'Pause',
  PRINT_SCREEN: 'PrintScreen',

  /**
   * Arrow keys
   */
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',

  /**
   * Navigation keys
   */
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',

  /**
   * Modifier keys
   */
  SHIFT_LEFT: 'ShiftLeft',
  SHIFT_RIGHT: 'ShiftRight',
  CTRL_LEFT: 'ControlLeft',
  CTRL_RIGHT: 'ControlRight',
  ALT_LEFT: 'AltLeft',
  ALT_RIGHT: 'AltRight',
  META_LEFT: 'MetaLeft',
  META_RIGHT: 'MetaRight',

  /**
   * Numpad keys
   */
  NUMPAD_0: 'Numpad0',
  NUMPAD_1: 'Numpad1',
  NUMPAD_2: 'Numpad2',
  NUMPAD_3: 'Numpad3',
  NUMPAD_4: 'Numpad4',
  NUMPAD_5: 'Numpad5',
  NUMPAD_6: 'Numpad6',
  NUMPAD_7: 'Numpad7',
  NUMPAD_8: 'Numpad8',
  NUMPAD_9: 'Numpad9',
  NUMPAD_ADD: 'NumpadAdd',
  NUMPAD_SUBTRACT: 'NumpadSubtract',
  NUMPAD_MULTIPLY: 'NumpadMultiply',
  NUMPAD_DIVIDE: 'NumpadDivide',
  NUMPAD_DECIMAL: 'NumpadDecimal',
  NUMPAD_ENTER: 'NumpadEnter',
  NUMPAD_EQUAL: 'NumpadEqual',

  /**
   * Punctuation and symbol keys
   */
  MINUS: 'Minus',
  EQUAL: 'Equal',
  BRACKET_LEFT: 'BracketLeft',
  BRACKET_RIGHT: 'BracketRight',
  BACKSLASH: 'Backslash',
  SEMICOLON: 'Semicolon',
  QUOTE: 'Quote',
  COMMA: 'Comma',
  PERIOD: 'Period',
  SLASH: 'Slash',
  BACKQUOTE: 'Backquote',
  INTL_BACKSLASH: 'IntlBackslash',
  INTL_RO: 'IntlRo',
  INTL_YEN: 'IntlYen',

  /**
   * Context menu key
   */
  CONTEXT_MENU: 'ContextMenu'
} as const;

/**
 * Type representing any valid key code
 */
export type KeyCodeValue = typeof KeyCode[keyof typeof KeyCode];

/**
 * Key code categories for filtering and grouping
 */
export const KeyCodeCategory = {
  /**
   * Letter keys (A-Z)
   */
  LETTERS: [
    KeyCode.A, KeyCode.B, KeyCode.C, KeyCode.D, KeyCode.E, KeyCode.F,
    KeyCode.G, KeyCode.H, KeyCode.I, KeyCode.J, KeyCode.K, KeyCode.L,
    KeyCode.M, KeyCode.N, KeyCode.O, KeyCode.P, KeyCode.Q, KeyCode.R,
    KeyCode.S, KeyCode.T, KeyCode.U, KeyCode.V, KeyCode.W, KeyCode.X,
    KeyCode.Y, KeyCode.Z
  ] as const,

  /**
   * Digit keys (0-9)
   */
  DIGITS: [
    KeyCode.DIGIT_0, KeyCode.DIGIT_1, KeyCode.DIGIT_2, KeyCode.DIGIT_3,
    KeyCode.DIGIT_4, KeyCode.DIGIT_5, KeyCode.DIGIT_6, KeyCode.DIGIT_7,
    KeyCode.DIGIT_8, KeyCode.DIGIT_9
  ] as const,

  /**
   * Function keys (F1-F24)
   */
  FUNCTION_KEYS: [
    KeyCode.F1, KeyCode.F2, KeyCode.F3, KeyCode.F4, KeyCode.F5, KeyCode.F6,
    KeyCode.F7, KeyCode.F8, KeyCode.F9, KeyCode.F10, KeyCode.F11, KeyCode.F12,
    KeyCode.F13, KeyCode.F14, KeyCode.F15, KeyCode.F16, KeyCode.F17, KeyCode.F18,
    KeyCode.F19, KeyCode.F20, KeyCode.F21, KeyCode.F22, KeyCode.F23, KeyCode.F24
  ] as const,

  /**
   * Arrow keys
   */
  ARROWS: [
    KeyCode.ARROW_UP, KeyCode.ARROW_DOWN,
    KeyCode.ARROW_LEFT, KeyCode.ARROW_RIGHT
  ] as const,

  /**
   * Modifier keys
   */
  MODIFIERS: [
    KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT,
    KeyCode.CTRL_LEFT, KeyCode.CTRL_RIGHT,
    KeyCode.ALT_LEFT, KeyCode.ALT_RIGHT,
    KeyCode.META_LEFT, KeyCode.META_RIGHT
  ] as const,

  /**
   * Numpad keys
   */
  NUMPAD: [
    KeyCode.NUMPAD_0, KeyCode.NUMPAD_1, KeyCode.NUMPAD_2, KeyCode.NUMPAD_3,
    KeyCode.NUMPAD_4, KeyCode.NUMPAD_5, KeyCode.NUMPAD_6, KeyCode.NUMPAD_7,
    KeyCode.NUMPAD_8, KeyCode.NUMPAD_9, KeyCode.NUMPAD_ADD, KeyCode.NUMPAD_SUBTRACT,
    KeyCode.NUMPAD_MULTIPLY, KeyCode.NUMPAD_DIVIDE, KeyCode.NUMPAD_DECIMAL,
    KeyCode.NUMPAD_ENTER, KeyCode.NUMPAD_EQUAL
  ] as const,

  /**
   * Navigation keys
   */
  NAVIGATION: [
    KeyCode.HOME, KeyCode.END, KeyCode.PAGE_UP, KeyCode.PAGE_DOWN,
    KeyCode.INSERT, KeyCode.DELETE
  ] as const
} as const;

/**
 * Helper function to check if a key code is a letter
 *
 * @param code - Key code to check
 * @returns True if key is a letter
 *
 * @example
 * ```typescript
 * if (isLetterKey('KeyW')) {
 *   console.log('Letter key pressed');
 * }
 * ```
 */
export function isLetterKey(code: string): boolean {
  return code.startsWith('Key') && code.length === 4;
}

/**
 * Helper function to check if a key code is a digit
 *
 * @param code - Key code to check
 * @returns True if key is a digit
 *
 * @example
 * ```typescript
 * if (isDigitKey('Digit5')) {
 *   console.log('Digit key pressed');
 * }
 * ```
 */
export function isDigitKey(code: string): boolean {
  return code.startsWith('Digit') && code.length === 6;
}

/**
 * Helper function to check if a key code is a function key
 *
 * @param code - Key code to check
 * @returns True if key is a function key
 *
 * @example
 * ```typescript
 * if (isFunctionKey('F5')) {
 *   console.log('Function key pressed');
 * }
 * ```
 */
export function isFunctionKey(code: string): boolean {
  return code.startsWith('F') && code.length >= 2 && code.length <= 3;
}

/**
 * Helper function to check if a key code is an arrow key
 *
 * @param code - Key code to check
 * @returns True if key is an arrow key
 *
 * @example
 * ```typescript
 * if (isArrowKey('ArrowUp')) {
 *   console.log('Arrow key pressed');
 * }
 * ```
 */
export function isArrowKey(code: string): boolean {
  return code.startsWith('Arrow');
}

/**
 * Helper function to check if a key code is a modifier key
 *
 * @param code - Key code to check
 * @returns True if key is a modifier
 *
 * @example
 * ```typescript
 * if (isModifierKey('ShiftLeft')) {
 *   console.log('Modifier key pressed');
 * }
 * ```
 */
export function isModifierKey(code: string): boolean {
  return code.startsWith('Shift') ||
         code.startsWith('Control') ||
         code.startsWith('Alt') ||
         code.startsWith('Meta');
}

/**
 * Helper function to check if a key code is a numpad key
 *
 * @param code - Key code to check
 * @returns True if key is a numpad key
 *
 * @example
 * ```typescript
 * if (isNumpadKey('Numpad5')) {
 *   console.log('Numpad key pressed');
 * }
 * ```
 */
export function isNumpadKey(code: string): boolean {
  return code.startsWith('Numpad');
}

/**
 * Gets the display name for a key code
 *
 * @param code - Key code
 * @returns Human-readable name
 *
 * @example
 * ```typescript
 * const name = getKeyDisplayName('KeyW');
 * console.log(name); // "W"
 *
 * const name2 = getKeyDisplayName('ArrowUp');
 * console.log(name2); // "Up Arrow"
 * ```
 */
export function getKeyDisplayName(code: string): string {
  // Special cases
  const specialNames: Record<string, string> = {
    'Space': 'Space',
    'Enter': 'Enter',
    'Escape': 'Esc',
    'Tab': 'Tab',
    'Backspace': 'Backspace',
    'Delete': 'Del',
    'Insert': 'Ins',
    'CapsLock': 'Caps Lock',
    'ScrollLock': 'Scroll Lock',
    'NumLock': 'Num Lock',
    'Pause': 'Pause',
    'PrintScreen': 'Print Screen',
    'ArrowUp': 'Up Arrow',
    'ArrowDown': 'Down Arrow',
    'ArrowLeft': 'Left Arrow',
    'ArrowRight': 'Right Arrow',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'Page Up',
    'PageDown': 'Page Down',
    'ShiftLeft': 'Left Shift',
    'ShiftRight': 'Right Shift',
    'ControlLeft': 'Left Ctrl',
    'ControlRight': 'Right Ctrl',
    'AltLeft': 'Left Alt',
    'AltRight': 'Right Alt',
    'MetaLeft': 'Left Meta',
    'MetaRight': 'Right Meta',
    'ContextMenu': 'Context Menu',
    'Minus': '-',
    'Equal': '=',
    'BracketLeft': '[',
    'BracketRight': ']',
    'Backslash': '\\',
    'Semicolon': ';',
    'Quote': "'",
    'Comma': ',',
    'Period': '.',
    'Slash': '/',
    'Backquote': '`'
  };

  if (specialNames[code]) {
    return specialNames[code];
  }

  // Letter keys (KeyA -> A)
  if (code.startsWith('Key')) {
    return code.substring(3);
  }

  // Digit keys (Digit5 -> 5)
  if (code.startsWith('Digit')) {
    return code.substring(5);
  }

  // Numpad keys (Numpad5 -> Numpad 5)
  if (code.startsWith('Numpad')) {
    const rest = code.substring(6);
    if (rest === 'Add') return 'Numpad +';
    if (rest === 'Subtract') return 'Numpad -';
    if (rest === 'Multiply') return 'Numpad *';
    if (rest === 'Divide') return 'Numpad /';
    if (rest === 'Decimal') return 'Numpad .';
    if (rest === 'Enter') return 'Numpad Enter';
    if (rest === 'Equal') return 'Numpad =';
    return `Numpad ${rest}`;
  }

  // Function keys (already correct)
  if (code.startsWith('F')) {
    return code;
  }

  return code;
}
