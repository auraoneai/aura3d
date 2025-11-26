/**
 * GamepadMapping - Controller mapping profiles for different gamepad types
 *
 * Provides automatic detection and mapping for Xbox, PlayStation, and generic
 * controllers. Handles vendor-specific button layouts and axis configurations.
 *
 * @module input/gamepad/GamepadMapping
 */

import { GamepadButtons } from './GamepadButtons';
import { GamepadAxes } from './GamepadAxes';
import { Logger } from '../../core/Logger';

const logger = Logger.create('GamepadMapping');

/**
 * Gamepad controller type enumeration.
 */
export enum GamepadType {
  /** Unknown/generic controller */
  Unknown = 'unknown',
  /** Xbox controller (One, Series X/S) */
  Xbox = 'xbox',
  /** PlayStation controller (DualShock 4, DualSense) */
  PlayStation = 'playstation',
  /** Nintendo Switch Pro Controller */
  Switch = 'switch',
  /** Generic standard controller */
  Standard = 'standard'
}

/**
 * Button mapping configuration for a gamepad type.
 */
export interface ButtonMapping {
  /** Maps standard button enum to physical button index */
  buttons: Map<GamepadButtons, number>;
  /** Maps standard axis enum to physical axis index */
  axes: Map<GamepadAxes, number>;
  /** Whether to invert specific axes */
  invertedAxes?: Set<GamepadAxes>;
}

/**
 * Gamepad identification patterns for auto-detection.
 */
interface GamepadPattern {
  /** Gamepad type */
  type: GamepadType;
  /** Regular expression patterns to match gamepad ID */
  patterns: RegExp[];
  /** Display name for this gamepad type */
  name: string;
}

/**
 * Known gamepad patterns for auto-detection.
 */
const GAMEPAD_PATTERNS: GamepadPattern[] = [
  {
    type: GamepadType.Xbox,
    patterns: [
      /xbox/i,
      /xinput/i,
      /x-box/i,
      /045e-/i, // Microsoft vendor ID
      /microsoft.*controller/i
    ],
    name: 'Xbox Controller'
  },
  {
    type: GamepadType.PlayStation,
    patterns: [
      /playstation/i,
      /dualshock/i,
      /dualsense/i,
      /054c-/i, // Sony vendor ID
      /sony.*controller/i,
      /wireless controller/i
    ],
    name: 'PlayStation Controller'
  },
  {
    type: GamepadType.Switch,
    patterns: [
      /switch/i,
      /pro controller/i,
      /joy-con/i,
      /057e-/i // Nintendo vendor ID
    ],
    name: 'Switch Pro Controller'
  }
];

/**
 * Standard mapping for W3C compliant gamepads.
 * This is the default mapping for most modern controllers.
 */
const STANDARD_MAPPING: ButtonMapping = {
  buttons: new Map([
    [GamepadButtons.A, 0],
    [GamepadButtons.B, 1],
    [GamepadButtons.X, 2],
    [GamepadButtons.Y, 3],
    [GamepadButtons.LeftShoulder, 4],
    [GamepadButtons.RightShoulder, 5],
    [GamepadButtons.LeftTrigger, 6],
    [GamepadButtons.RightTrigger, 7],
    [GamepadButtons.Select, 8],
    [GamepadButtons.Start, 9],
    [GamepadButtons.LeftStickButton, 10],
    [GamepadButtons.RightStickButton, 11],
    [GamepadButtons.DPadUp, 12],
    [GamepadButtons.DPadDown, 13],
    [GamepadButtons.DPadLeft, 14],
    [GamepadButtons.DPadRight, 15],
    [GamepadButtons.Home, 16]
  ]),
  axes: new Map([
    [GamepadAxes.LeftStickX, 0],
    [GamepadAxes.LeftStickY, 1],
    [GamepadAxes.RightStickX, 2],
    [GamepadAxes.RightStickY, 3]
  ]),
  invertedAxes: new Set()
};

/**
 * Mappings for different gamepad types.
 */
const GAMEPAD_MAPPINGS: Map<GamepadType, ButtonMapping> = new Map([
  [GamepadType.Standard, STANDARD_MAPPING],
  [GamepadType.Xbox, STANDARD_MAPPING],
  [GamepadType.PlayStation, STANDARD_MAPPING],
  [GamepadType.Switch, STANDARD_MAPPING],
  [GamepadType.Unknown, STANDARD_MAPPING]
]);

/**
 * Detects gamepad type from gamepad ID string.
 *
 * @param gamepadId - Gamepad ID string from browser
 * @returns Detected gamepad type
 *
 * @example
 * ```typescript
 * const type = detectGamepadType('Xbox 360 Controller (XInput STANDARD GAMEPAD)');
 * console.log(type); // GamepadType.Xbox
 * ```
 */
export function detectGamepadType(gamepadId: string): GamepadType {
  for (const pattern of GAMEPAD_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(gamepadId)) {
        logger.debug(`Detected ${pattern.name} from ID: ${gamepadId}`);
        return pattern.type;
      }
    }
  }

  logger.debug(`Unknown gamepad type for ID: ${gamepadId}`);
  return GamepadType.Unknown;
}

/**
 * Gets the button mapping for a gamepad type.
 *
 * @param type - Gamepad type
 * @returns Button mapping configuration
 *
 * @example
 * ```typescript
 * const mapping = getGamepadMapping(GamepadType.Xbox);
 * const aButtonIndex = mapping.buttons.get(GamepadButtons.A);
 * ```
 */
export function getGamepadMapping(type: GamepadType): ButtonMapping {
  return GAMEPAD_MAPPINGS.get(type) || STANDARD_MAPPING;
}

/**
 * Gets the physical button index for a standard button on a specific gamepad type.
 *
 * @param type - Gamepad type
 * @param button - Standard button enum
 * @returns Physical button index or undefined if not mapped
 *
 * @example
 * ```typescript
 * const index = getButtonIndex(GamepadType.Xbox, GamepadButtons.A);
 * console.log(index); // 0
 * ```
 */
export function getButtonIndex(
  type: GamepadType,
  button: GamepadButtons
): number | undefined {
  const mapping = getGamepadMapping(type);
  return mapping.buttons.get(button);
}

/**
 * Gets the physical axis index for a standard axis on a specific gamepad type.
 *
 * @param type - Gamepad type
 * @param axis - Standard axis enum
 * @returns Physical axis index or undefined if not mapped
 *
 * @example
 * ```typescript
 * const index = getAxisIndex(GamepadType.Xbox, GamepadAxes.LeftStickX);
 * console.log(index); // 0
 * ```
 */
export function getAxisIndex(
  type: GamepadType,
  axis: GamepadAxes
): number | undefined {
  const mapping = getGamepadMapping(type);
  return mapping.axes.get(axis);
}

/**
 * Checks if an axis should be inverted for a gamepad type.
 *
 * @param type - Gamepad type
 * @param axis - Axis to check
 * @returns True if the axis should be inverted
 *
 * @example
 * ```typescript
 * if (isAxisInverted(GamepadType.Xbox, GamepadAxes.LeftStickY)) {
 *   value = -value;
 * }
 * ```
 */
export function isAxisInverted(type: GamepadType, axis: GamepadAxes): boolean {
  const mapping = getGamepadMapping(type);
  return mapping.invertedAxes?.has(axis) || false;
}

/**
 * Gets a human-readable name for a gamepad type.
 *
 * @param type - Gamepad type
 * @returns Display name
 *
 * @example
 * ```typescript
 * const name = getGamepadTypeName(GamepadType.Xbox);
 * console.log(name); // "Xbox Controller"
 * ```
 */
export function getGamepadTypeName(type: GamepadType): string {
  const pattern = GAMEPAD_PATTERNS.find(p => p.type === type);
  return pattern?.name || 'Unknown Controller';
}

/**
 * Registers a custom gamepad mapping.
 *
 * @param type - Gamepad type identifier
 * @param mapping - Button mapping configuration
 *
 * @example
 * ```typescript
 * registerGamepadMapping(GamepadType.Unknown, {
 *   buttons: new Map([[GamepadButtons.A, 0]]),
 *   axes: new Map([[GamepadAxes.LeftStickX, 0]]),
 *   invertedAxes: new Set([GamepadAxes.LeftStickY])
 * });
 * ```
 */
export function registerGamepadMapping(
  type: GamepadType,
  mapping: ButtonMapping
): void {
  GAMEPAD_MAPPINGS.set(type, mapping);
  logger.info(`Registered custom mapping for ${type}`);
}

/**
 * Adds a custom gamepad detection pattern.
 *
 * @param type - Gamepad type
 * @param patterns - Regex patterns to match
 * @param name - Display name
 *
 * @example
 * ```typescript
 * addGamepadPattern(
 *   GamepadType.Unknown,
 *   [/custom controller/i],
 *   'Custom Controller'
 * );
 * ```
 */
export function addGamepadPattern(
  type: GamepadType,
  patterns: RegExp[],
  name: string
): void {
  GAMEPAD_PATTERNS.push({ type, patterns, name });
  logger.info(`Added detection pattern for ${name}`);
}

/**
 * Gamepad info with detected type and mapping.
 */
export interface GamepadInfo {
  /** Raw gamepad object */
  gamepad: Gamepad;
  /** Detected gamepad type */
  type: GamepadType;
  /** Display name */
  name: string;
  /** Button mapping */
  mapping: ButtonMapping;
  /** Whether gamepad uses standard mapping */
  isStandard: boolean;
}

/**
 * Analyzes a gamepad and returns detailed information.
 *
 * @param gamepad - Browser gamepad object
 * @returns Gamepad information
 *
 * @example
 * ```typescript
 * const gamepad = navigator.getGamepads()[0];
 * if (gamepad) {
 *   const info = analyzeGamepad(gamepad);
 *   console.log(`Connected: ${info.name}`);
 * }
 * ```
 */
export function analyzeGamepad(gamepad: Gamepad): GamepadInfo {
  const type = detectGamepadType(gamepad.id);
  const mapping = getGamepadMapping(type);
  const isStandard = gamepad.mapping === 'standard';

  return {
    gamepad,
    type,
    name: getGamepadTypeName(type),
    mapping,
    isStandard
  };
}

/**
 * Tests if a gamepad supports vibration/haptics.
 *
 * @param gamepad - Browser gamepad object
 * @returns True if vibration is supported
 *
 * @example
 * ```typescript
 * const gamepad = navigator.getGamepads()[0];
 * if (gamepad && supportsVibration(gamepad)) {
 *   console.log('Haptic feedback available');
 * }
 * ```
 */
export function supportsVibration(gamepad: Gamepad): boolean {
  return gamepad.vibrationActuator !== undefined &&
         gamepad.vibrationActuator !== null;
}

/**
 * Gets the number of buttons on a gamepad.
 *
 * @param gamepad - Browser gamepad object
 * @returns Number of buttons
 *
 * @example
 * ```typescript
 * const buttonCount = getButtonCount(gamepad);
 * console.log(`Gamepad has ${buttonCount} buttons`);
 * ```
 */
export function getButtonCount(gamepad: Gamepad): number {
  return gamepad.buttons.length;
}

/**
 * Gets the number of axes on a gamepad.
 *
 * @param gamepad - Browser gamepad object
 * @returns Number of axes
 *
 * @example
 * ```typescript
 * const axisCount = getAxisCount(gamepad);
 * console.log(`Gamepad has ${axisCount} axes`);
 * ```
 */
export function getAxisCount(gamepad: Gamepad): number {
  return gamepad.axes.length;
}
