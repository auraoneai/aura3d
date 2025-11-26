/**
 * KeyboardLayouts - Keyboard layout support for different locales
 *
 * Provides keyboard layout mapping support for QWERTY, AZERTY, QWERTZ, and other
 * international layouts. Allows translation between physical key codes and logical
 * keys based on the user's keyboard layout.
 *
 * @module input/keyboard/KeyboardLayouts
 *
 * @example
 * ```typescript
 * import { KeyboardLayout, getLayoutForLocale } from './keyboard';
 *
 * // Detect user's layout
 * const layout = getLayoutForLocale(navigator.language);
 *
 * // Get logical key for physical key
 * const logicalKey = layout.getLogicalKey('KeyZ');
 * console.log(logicalKey); // 'Z' on QWERTY, 'W' on AZERTY
 * ```
 */

import { KeyCode } from './KeyCodes';

/**
 * Keyboard layout type
 */
export type KeyboardLayoutType = 'QWERTY' | 'AZERTY' | 'QWERTZ' | 'DVORAK' | 'COLEMAK';

/**
 * Key mapping from physical key code to logical character
 */
export interface KeyMapping {
  [keyCode: string]: string;
}

/**
 * Keyboard layout configuration
 */
export interface KeyboardLayoutConfig {
  /**
   * Layout name
   */
  name: string;

  /**
   * Layout type
   */
  type: KeyboardLayoutType;

  /**
   * Locale codes this layout is used for
   */
  locales: string[];

  /**
   * Key mappings (physical key -> logical key)
   */
  mappings: KeyMapping;
}

/**
 * Represents a keyboard layout configuration.
 * Maps physical key codes to logical characters based on layout.
 *
 * @example
 * ```typescript
 * const azerty = new KeyboardLayout({
 *   name: 'French AZERTY',
 *   type: 'AZERTY',
 *   locales: ['fr', 'fr-FR'],
 *   mappings: {
 *     'KeyQ': 'A',
 *     'KeyW': 'Z',
 *     // ...
 *   }
 * });
 *
 * const logical = azerty.getLogicalKey('KeyW');
 * console.log(logical); // 'Z'
 * ```
 */
export class KeyboardLayout {
  /**
   * Layout name
   */
  readonly name: string;

  /**
   * Layout type
   */
  readonly type: KeyboardLayoutType;

  /**
   * Locale codes
   */
  readonly locales: string[];

  /**
   * Key mappings
   */
  private mappings: KeyMapping;

  /**
   * Reverse mappings (logical key -> physical key)
   */
  private reverseMappings: Map<string, string[]> = new Map();

  /**
   * Creates a new keyboard layout.
   *
   * @param config - Layout configuration
   */
  constructor(config: KeyboardLayoutConfig) {
    this.name = config.name;
    this.type = config.type;
    this.locales = config.locales;
    this.mappings = config.mappings;

    this.buildReverseMappings();
  }

  /**
   * Gets the logical key for a physical key code.
   *
   * @param keyCode - Physical key code
   * @returns Logical key character
   *
   * @example
   * ```typescript
   * const logical = layout.getLogicalKey('KeyW');
   * console.log(logical); // 'W' on QWERTY, 'Z' on AZERTY
   * ```
   */
  getLogicalKey(keyCode: string): string {
    return this.mappings[keyCode] || this.getDefaultLogicalKey(keyCode);
  }

  /**
   * Gets the physical key codes for a logical key.
   *
   * @param logicalKey - Logical key character
   * @returns Array of physical key codes
   *
   * @example
   * ```typescript
   * const physicalKeys = layout.getPhysicalKeys('W');
   * console.log(physicalKeys); // ['KeyW'] on QWERTY, ['KeyZ'] on AZERTY
   * ```
   */
  getPhysicalKeys(logicalKey: string): string[] {
    return this.reverseMappings.get(logicalKey.toUpperCase()) || [];
  }

  /**
   * Checks if layout supports a locale.
   *
   * @param locale - Locale code
   * @returns True if supported
   *
   * @example
   * ```typescript
   * if (layout.supportsLocale('fr-FR')) {
   *   console.log('French locale supported');
   * }
   * ```
   */
  supportsLocale(locale: string): boolean {
    const lowerLocale = locale.toLowerCase();
    return this.locales.some(l =>
      lowerLocale === l.toLowerCase() ||
      lowerLocale.startsWith(l.toLowerCase() + '-')
    );
  }

  /**
   * Builds reverse mappings for faster lookup.
   *
   * @private
   */
  private buildReverseMappings(): void {
    this.reverseMappings.clear();

    for (const [physicalKey, logicalKey] of Object.entries(this.mappings)) {
      const upper = logicalKey.toUpperCase();
      if (!this.reverseMappings.has(upper)) {
        this.reverseMappings.set(upper, []);
      }
      this.reverseMappings.get(upper)!.push(physicalKey);
    }
  }

  /**
   * Gets default logical key from physical key code.
   *
   * @param keyCode - Physical key code
   * @returns Default logical key
   *
   * @private
   */
  private getDefaultLogicalKey(keyCode: string): string {
    if (keyCode.startsWith('Key')) {
      return keyCode.substring(3);
    }
    if (keyCode.startsWith('Digit')) {
      return keyCode.substring(5);
    }
    return keyCode;
  }
}

/**
 * Standard QWERTY layout (US English)
 */
export const QWERTY_LAYOUT = new KeyboardLayout({
  name: 'QWERTY',
  type: 'QWERTY',
  locales: ['en', 'en-US', 'en-GB'],
  mappings: {
    // Letters (standard QWERTY)
    'KeyQ': 'Q', 'KeyW': 'W', 'KeyE': 'E', 'KeyR': 'R', 'KeyT': 'T',
    'KeyY': 'Y', 'KeyU': 'U', 'KeyI': 'I', 'KeyO': 'O', 'KeyP': 'P',
    'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D', 'KeyF': 'F', 'KeyG': 'G',
    'KeyH': 'H', 'KeyJ': 'J', 'KeyK': 'K', 'KeyL': 'L',
    'KeyZ': 'Z', 'KeyX': 'X', 'KeyC': 'C', 'KeyV': 'V', 'KeyB': 'B',
    'KeyN': 'N', 'KeyM': 'M',

    // Numbers
    'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
    'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0',

    // Symbols
    'Minus': '-', 'Equal': '=', 'BracketLeft': '[', 'BracketRight': ']',
    'Backslash': '\\', 'Semicolon': ';', 'Quote': "'", 'Comma': ',',
    'Period': '.', 'Slash': '/', 'Backquote': '`'
  }
});

/**
 * AZERTY layout (French)
 */
export const AZERTY_LAYOUT = new KeyboardLayout({
  name: 'AZERTY',
  type: 'AZERTY',
  locales: ['fr', 'fr-FR', 'fr-BE'],
  mappings: {
    // Letters (AZERTY arrangement)
    'KeyQ': 'A', 'KeyW': 'Z', 'KeyE': 'E', 'KeyR': 'R', 'KeyT': 'T',
    'KeyY': 'Y', 'KeyU': 'U', 'KeyI': 'I', 'KeyO': 'O', 'KeyP': 'P',
    'KeyA': 'Q', 'KeyS': 'S', 'KeyD': 'D', 'KeyF': 'F', 'KeyG': 'G',
    'KeyH': 'H', 'KeyJ': 'J', 'KeyK': 'K', 'KeyL': 'L',
    'KeyZ': 'W', 'KeyX': 'X', 'KeyC': 'C', 'KeyV': 'V', 'KeyB': 'B',
    'KeyN': 'N', 'KeyM': 'M',

    // Numbers (shifted on AZERTY)
    'Digit1': '&', 'Digit2': 'é', 'Digit3': '"', 'Digit4': "'", 'Digit5': '(',
    'Digit6': '-', 'Digit7': 'è', 'Digit8': '_', 'Digit9': 'ç', 'Digit0': 'à',

    // Symbols
    'Minus': ')', 'Equal': '=', 'BracketLeft': '^', 'BracketRight': '$',
    'Semicolon': 'M', 'Quote': 'ù', 'Comma': ',', 'Period': ';',
    'Slash': ':', 'Backquote': '²'
  }
});

/**
 * QWERTZ layout (German)
 */
export const QWERTZ_LAYOUT = new KeyboardLayout({
  name: 'QWERTZ',
  type: 'QWERTZ',
  locales: ['de', 'de-DE', 'de-AT', 'de-CH'],
  mappings: {
    // Letters (QWERTZ - Y and Z swapped)
    'KeyQ': 'Q', 'KeyW': 'W', 'KeyE': 'E', 'KeyR': 'R', 'KeyT': 'T',
    'KeyY': 'Z', 'KeyU': 'U', 'KeyI': 'I', 'KeyO': 'O', 'KeyP': 'P',
    'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D', 'KeyF': 'F', 'KeyG': 'G',
    'KeyH': 'H', 'KeyJ': 'J', 'KeyK': 'K', 'KeyL': 'L',
    'KeyZ': 'Y', 'KeyX': 'X', 'KeyC': 'C', 'KeyV': 'V', 'KeyB': 'B',
    'KeyN': 'N', 'KeyM': 'M',

    // Numbers
    'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
    'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0',

    // Symbols
    'Minus': 'ß', 'Equal': '´', 'BracketLeft': 'ü', 'BracketRight': '+',
    'Semicolon': 'ö', 'Quote': 'ä', 'Comma': ',', 'Period': '.',
    'Slash': '-', 'Backquote': '^'
  }
});

/**
 * Dvorak layout
 */
export const DVORAK_LAYOUT = new KeyboardLayout({
  name: 'Dvorak',
  type: 'DVORAK',
  locales: ['en-dvorak'],
  mappings: {
    // Letters (Dvorak arrangement)
    'KeyQ': "'", 'KeyW': ',', 'KeyE': '.', 'KeyR': 'P', 'KeyT': 'Y',
    'KeyY': 'F', 'KeyU': 'G', 'KeyI': 'C', 'KeyO': 'R', 'KeyP': 'L',
    'KeyA': 'A', 'KeyS': 'O', 'KeyD': 'E', 'KeyF': 'U', 'KeyG': 'I',
    'KeyH': 'D', 'KeyJ': 'H', 'KeyK': 'T', 'KeyL': 'N', 'Semicolon': 'S',
    'KeyZ': ';', 'KeyX': 'Q', 'KeyC': 'J', 'KeyV': 'K', 'KeyB': 'X',
    'KeyN': 'B', 'KeyM': 'M', 'Comma': 'W', 'Period': 'V', 'Slash': 'Z',

    // Numbers (same as QWERTY)
    'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
    'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0',

    // Symbols
    'Minus': '[', 'Equal': ']', 'BracketLeft': '/', 'BracketRight': '=',
    'Backslash': '\\', 'Quote': '-', 'Backquote': '`'
  }
});

/**
 * Colemak layout
 */
export const COLEMAK_LAYOUT = new KeyboardLayout({
  name: 'Colemak',
  type: 'COLEMAK',
  locales: ['en-colemak'],
  mappings: {
    // Letters (Colemak arrangement)
    'KeyQ': 'Q', 'KeyW': 'W', 'KeyE': 'F', 'KeyR': 'P', 'KeyT': 'G',
    'KeyY': 'J', 'KeyU': 'L', 'KeyI': 'U', 'KeyO': 'Y', 'KeyP': ';',
    'KeyA': 'A', 'KeyS': 'R', 'KeyD': 'S', 'KeyF': 'T', 'KeyG': 'D',
    'KeyH': 'H', 'KeyJ': 'N', 'KeyK': 'E', 'KeyL': 'I', 'Semicolon': 'O',
    'KeyZ': 'Z', 'KeyX': 'X', 'KeyC': 'C', 'KeyV': 'V', 'KeyB': 'B',
    'KeyN': 'K', 'KeyM': 'M',

    // Numbers (same as QWERTY)
    'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
    'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0',

    // Symbols
    'Minus': '-', 'Equal': '=', 'BracketLeft': '[', 'BracketRight': ']',
    'Backslash': '\\', 'Quote': "'", 'Comma': ',', 'Period': '.',
    'Slash': '/', 'Backquote': '`'
  }
});

/**
 * Registry of all available layouts
 */
export const KEYBOARD_LAYOUTS: ReadonlyArray<KeyboardLayout> = [
  QWERTY_LAYOUT,
  AZERTY_LAYOUT,
  QWERTZ_LAYOUT,
  DVORAK_LAYOUT,
  COLEMAK_LAYOUT
];

/**
 * Gets keyboard layout for a locale.
 *
 * @param locale - Locale code (e.g., 'en-US', 'fr-FR')
 * @returns Matching layout or QWERTY as fallback
 *
 * @example
 * ```typescript
 * const layout = getLayoutForLocale('fr-FR');
 * console.log(layout.type); // 'AZERTY'
 *
 * const layout2 = getLayoutForLocale(navigator.language);
 * ```
 */
export function getLayoutForLocale(locale: string): KeyboardLayout {
  for (const layout of KEYBOARD_LAYOUTS) {
    if (layout.supportsLocale(locale)) {
      return layout;
    }
  }
  return QWERTY_LAYOUT;
}

/**
 * Gets keyboard layout by type.
 *
 * @param type - Layout type
 * @returns Matching layout or undefined
 *
 * @example
 * ```typescript
 * const azerty = getLayoutByType('AZERTY');
 * if (azerty) {
 *   console.log('AZERTY layout found');
 * }
 * ```
 */
export function getLayoutByType(type: KeyboardLayoutType): KeyboardLayout | undefined {
  return KEYBOARD_LAYOUTS.find(layout => layout.type === type);
}

/**
 * Detects the likely keyboard layout based on browser locale.
 *
 * @returns Detected layout
 *
 * @example
 * ```typescript
 * const layout = detectLayout();
 * console.log(`Detected layout: ${layout.name}`);
 * ```
 */
export function detectLayout(): KeyboardLayout {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return getLayoutForLocale(navigator.language);
  }
  return QWERTY_LAYOUT;
}
