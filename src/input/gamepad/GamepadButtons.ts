/**
 * GamepadButtons - Standard gamepad button definitions and mappings
 *
 * Provides comprehensive button definitions for standard gamepad layouts
 * including Xbox, PlayStation, and generic controllers. Follows the W3C
 * Gamepad API standard mapping specification.
 *
 * @module input/gamepad/GamepadButtons
 */

/**
 * Standard gamepad button indices based on W3C Gamepad API specification.
 * Compatible with Xbox, PlayStation, and most modern controllers.
 *
 * @example
 * ```typescript
 * if (gamepad.isButtonPressed(GamepadButtons.A)) {
 *   player.jump();
 * }
 * ```
 */
export enum GamepadButtons {
  /** Bottom face button - Xbox A, PlayStation Cross */
  A = 0,
  /** Right face button - Xbox B, PlayStation Circle */
  B = 1,
  /** Left face button - Xbox X, PlayStation Square */
  X = 2,
  /** Top face button - Xbox Y, PlayStation Triangle */
  Y = 3,
  /** Left bumper/shoulder button */
  LeftShoulder = 4,
  /** Right bumper/shoulder button */
  RightShoulder = 5,
  /** Left trigger (digital or analog) */
  LeftTrigger = 6,
  /** Right trigger (digital or analog) */
  RightTrigger = 7,
  /** Select/Back/Share button */
  Select = 8,
  /** Start/Options/Menu button */
  Start = 9,
  /** Left stick click/press */
  LeftStickButton = 10,
  /** Right stick click/press */
  RightStickButton = 11,
  /** D-Pad up */
  DPadUp = 12,
  /** D-Pad down */
  DPadDown = 13,
  /** D-Pad left */
  DPadLeft = 14,
  /** D-Pad right */
  DPadRight = 15,
  /** Home/Guide/PS button */
  Home = 16,
  /** Extra button (varies by controller) */
  Extra1 = 17,
  /** Extra button (varies by controller) */
  Extra2 = 18,
  /** Extra button (varies by controller) */
  Extra3 = 19
}

/**
 * Button group classifications for easy filtering.
 *
 * @example
 * ```typescript
 * const faceButtons = GamepadButtonGroups.Face;
 * for (const button of faceButtons) {
 *   if (gamepad.isButtonPressed(button)) {
 *     console.log('Face button pressed:', button);
 *   }
 * }
 * ```
 */
export const GamepadButtonGroups = {
  /** Face buttons (A, B, X, Y) */
  Face: [
    GamepadButtons.A,
    GamepadButtons.B,
    GamepadButtons.X,
    GamepadButtons.Y
  ] as const,

  /** Shoulder buttons (bumpers) */
  Shoulders: [
    GamepadButtons.LeftShoulder,
    GamepadButtons.RightShoulder
  ] as const,

  /** Trigger buttons */
  Triggers: [
    GamepadButtons.LeftTrigger,
    GamepadButtons.RightTrigger
  ] as const,

  /** D-Pad buttons */
  DPad: [
    GamepadButtons.DPadUp,
    GamepadButtons.DPadDown,
    GamepadButtons.DPadLeft,
    GamepadButtons.DPadRight
  ] as const,

  /** Stick buttons (clicks) */
  Sticks: [
    GamepadButtons.LeftStickButton,
    GamepadButtons.RightStickButton
  ] as const,

  /** System buttons */
  System: [
    GamepadButtons.Select,
    GamepadButtons.Start,
    GamepadButtons.Home
  ] as const
} as const;

/**
 * Human-readable button names for UI display.
 *
 * @example
 * ```typescript
 * const buttonName = GamepadButtonNames[GamepadButtons.A];
 * console.log(`Press ${buttonName} to jump`);
 * ```
 */
export const GamepadButtonNames: Record<GamepadButtons, string> = {
  [GamepadButtons.A]: 'A',
  [GamepadButtons.B]: 'B',
  [GamepadButtons.X]: 'X',
  [GamepadButtons.Y]: 'Y',
  [GamepadButtons.LeftShoulder]: 'LB',
  [GamepadButtons.RightShoulder]: 'RB',
  [GamepadButtons.LeftTrigger]: 'LT',
  [GamepadButtons.RightTrigger]: 'RT',
  [GamepadButtons.Select]: 'Select',
  [GamepadButtons.Start]: 'Start',
  [GamepadButtons.LeftStickButton]: 'L3',
  [GamepadButtons.RightStickButton]: 'R3',
  [GamepadButtons.DPadUp]: 'D-Pad Up',
  [GamepadButtons.DPadDown]: 'D-Pad Down',
  [GamepadButtons.DPadLeft]: 'D-Pad Left',
  [GamepadButtons.DPadRight]: 'D-Pad Right',
  [GamepadButtons.Home]: 'Home',
  [GamepadButtons.Extra1]: 'Extra 1',
  [GamepadButtons.Extra2]: 'Extra 2',
  [GamepadButtons.Extra3]: 'Extra 3'
};

/**
 * PlayStation controller button names.
 *
 * @example
 * ```typescript
 * const psName = PlayStationButtonNames[GamepadButtons.A];
 * console.log(`Press ${psName} to jump`); // "Press Cross to jump"
 * ```
 */
export const PlayStationButtonNames: Record<GamepadButtons, string> = {
  [GamepadButtons.A]: 'Cross',
  [GamepadButtons.B]: 'Circle',
  [GamepadButtons.X]: 'Square',
  [GamepadButtons.Y]: 'Triangle',
  [GamepadButtons.LeftShoulder]: 'L1',
  [GamepadButtons.RightShoulder]: 'R1',
  [GamepadButtons.LeftTrigger]: 'L2',
  [GamepadButtons.RightTrigger]: 'R2',
  [GamepadButtons.Select]: 'Share',
  [GamepadButtons.Start]: 'Options',
  [GamepadButtons.LeftStickButton]: 'L3',
  [GamepadButtons.RightStickButton]: 'R3',
  [GamepadButtons.DPadUp]: 'D-Pad Up',
  [GamepadButtons.DPadDown]: 'D-Pad Down',
  [GamepadButtons.DPadLeft]: 'D-Pad Left',
  [GamepadButtons.DPadRight]: 'D-Pad Right',
  [GamepadButtons.Home]: 'PS',
  [GamepadButtons.Extra1]: 'TouchPad',
  [GamepadButtons.Extra2]: 'Extra 2',
  [GamepadButtons.Extra3]: 'Extra 3'
};

/**
 * Checks if a button index is a valid gamepad button.
 *
 * @param button - Button index to validate
 * @returns True if the button index is valid
 *
 * @example
 * ```typescript
 * if (isValidButton(5)) {
 *   console.log('Valid button');
 * }
 * ```
 */
export function isValidButton(button: number): button is GamepadButtons {
  return button >= 0 && button <= 19 && Number.isInteger(button);
}

/**
 * Checks if a button is a face button (A, B, X, Y).
 *
 * @param button - Button to check
 * @returns True if the button is a face button
 *
 * @example
 * ```typescript
 * if (isFaceButton(GamepadButtons.A)) {
 *   console.log('Face button pressed');
 * }
 * ```
 */
export function isFaceButton(button: GamepadButtons): boolean {
  return GamepadButtonGroups.Face.includes(button as any);
}

/**
 * Checks if a button is a shoulder button.
 *
 * @param button - Button to check
 * @returns True if the button is a shoulder button
 *
 * @example
 * ```typescript
 * if (isShoulderButton(GamepadButtons.LeftShoulder)) {
 *   console.log('Shoulder button pressed');
 * }
 * ```
 */
export function isShoulderButton(button: GamepadButtons): boolean {
  return GamepadButtonGroups.Shoulders.includes(button as any);
}

/**
 * Checks if a button is a trigger button.
 *
 * @param button - Button to check
 * @returns True if the button is a trigger button
 *
 * @example
 * ```typescript
 * if (isTriggerButton(GamepadButtons.RightTrigger)) {
 *   console.log('Trigger button pressed');
 * }
 * ```
 */
export function isTriggerButton(button: GamepadButtons): boolean {
  return GamepadButtonGroups.Triggers.includes(button as any);
}

/**
 * Checks if a button is a D-Pad button.
 *
 * @param button - Button to check
 * @returns True if the button is a D-Pad button
 *
 * @example
 * ```typescript
 * if (isDPadButton(GamepadButtons.DPadUp)) {
 *   console.log('D-Pad button pressed');
 * }
 * ```
 */
export function isDPadButton(button: GamepadButtons): boolean {
  return GamepadButtonGroups.DPad.includes(button as any);
}
