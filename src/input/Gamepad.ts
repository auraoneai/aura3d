/**
 * Gamepad - Gamepad/controller input with button and axis mapping
 *
 * Provides comprehensive gamepad input handling with support for multiple controllers,
 * button and axis mapping, deadzone handling, rumble/vibration, and hot-plug detection.
 * Uses the Gamepad API with support for standard gamepad layouts.
 *
 * @module input/Gamepad
 *
 * @example
 * ```typescript
 * const gamepad = new Gamepad();
 * gamepad.attach();
 *
 * // Check if any gamepad is connected
 * if (gamepad.isConnected(0)) {
 *   // Get button state
 *   if (gamepad.isButtonDown(0, GamepadButton.A)) {
 *     player.jump();
 *   }
 *
 *   // Get axis value
 *   const leftX = gamepad.getAxisValue(0, GamepadAxis.LeftStickX);
 *   const leftY = gamepad.getAxisValue(0, GamepadAxis.LeftStickY);
 *   player.move(leftX, leftY);
 *
 *   // Trigger rumble
 *   gamepad.rumble(0, 0.5, 0.5, 200);
 * }
 *
 * // Update each frame
 * gamepad.update();
 * ```
 */

import { Logger } from '../core/Logger';

const logger = new Logger('Gamepad');

/**
 * Standard gamepad button indices
 */
export enum GamepadButton {
  A = 0,           // Bottom face button (Xbox A, PS Cross)
  B = 1,           // Right face button (Xbox B, PS Circle)
  X = 2,           // Left face button (Xbox X, PS Square)
  Y = 3,           // Top face button (Xbox Y, PS Triangle)
  LeftShoulder = 4,
  RightShoulder = 5,
  LeftTrigger = 6,
  RightTrigger = 7,
  Back = 8,        // Select/Back button
  Start = 9,       // Start/Options button
  LeftStick = 10,  // Left stick button
  RightStick = 11, // Right stick button
  DPadUp = 12,
  DPadDown = 13,
  DPadLeft = 14,
  DPadRight = 15,
  Home = 16        // Xbox/PS button
}

/**
 * Standard gamepad axis indices
 */
export enum GamepadAxis {
  LeftStickX = 0,
  LeftStickY = 1,
  RightStickX = 2,
  RightStickY = 3
}

/**
 * Button state
 */
interface ButtonState {
  pressed: boolean;
  value: number;
  justPressed: boolean;
  justReleased: boolean;
}

/**
 * Gamepad state
 */
interface GamepadState {
  id: string;
  index: number;
  connected: boolean;
  buttons: Map<number, ButtonState>;
  axes: Map<number, number>;
  timestamp: number;
}

/**
 * Gamepad input handler with multi-controller support.
 *
 * @example
 * ```typescript
 * // Create and attach gamepad
 * const gamepad = new Gamepad();
 * gamepad.attach();
 *
 * // Configure deadzone
 * gamepad.setDeadzone(0.15);
 *
 * // In game loop
 * function update() {
 *   gamepad.update();
 *
 *   // Check all connected gamepads
 *   for (let i = 0; i < 4; i++) {
 *     if (gamepad.isConnected(i)) {
 *       // Movement
 *       const moveX = gamepad.getAxisValue(i, GamepadAxis.LeftStickX);
 *       const moveY = gamepad.getAxisValue(i, GamepadAxis.LeftStickY);
 *       players[i].move(moveX, moveY);
 *
 *       // Actions
 *       if (gamepad.wasButtonPressed(i, GamepadButton.A)) {
 *         players[i].jump();
 *       }
 *
 *       if (gamepad.isButtonDown(i, GamepadButton.RightTrigger)) {
 *         players[i].shoot();
 *       }
 *     }
 *   }
 * }
 * ```
 */
export class Gamepad {
  /**
   * Connected gamepad states (index -> state)
   */
  private gamepads: Map<number, GamepadState> = new Map();

  /**
   * Previous frame gamepad states
   */
  private previousGamepads: Map<number, GamepadState> = new Map();

  /**
   * Whether gamepad handler is attached
   */
  private attached: boolean = false;

  /**
   * Deadzone threshold for axes (0-1)
   */
  private deadzone: number = 0.1;

  /**
   * Bound event handlers for cleanup
   */
  private handleGamepadConnected = this.onGamepadConnected.bind(this);
  private handleGamepadDisconnected = this.onGamepadDisconnected.bind(this);

  /**
   * Creates a new gamepad input handler.
   *
   * @example
   * ```typescript
   * const gamepad = new Gamepad();
   * ```
   */
  constructor() {
    logger.debug('Gamepad input handler created');
  }

  /**
   * Attaches gamepad event listeners.
   *
   * @example
   * ```typescript
   * gamepad.attach();
   * ```
   */
  attach(): void {
    if (this.attached) {
      logger.warn('Gamepad already attached');
      return;
    }

    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);

    // Poll for already connected gamepads
    this.pollGamepads();

    this.attached = true;
    logger.debug('Gamepad attached');
  }

  /**
   * Detaches gamepad event listeners.
   *
   * @example
   * ```typescript
   * gamepad.detach();
   * ```
   */
  detach(): void {
    if (!this.attached) {
      return;
    }

    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);

    this.attached = false;
    this.reset();
    logger.debug('Gamepad detached');
  }

  /**
   * Updates gamepad state. Call once per frame.
   *
   * @example
   * ```typescript
   * // At end of frame
   * gamepad.update();
   * ```
   */
  update(): void {
    // Save previous state
    this.previousGamepads.clear();
    for (const [index, state] of this.gamepads) {
      this.previousGamepads.set(index, this.cloneGamepadState(state));
    }

    // Poll current gamepad state
    this.pollGamepads();

    // Update button edge detection
    for (const [index, state] of this.gamepads) {
      const prevState = this.previousGamepads.get(index);

      for (const [buttonIndex, buttonState] of state.buttons) {
        const prevButton = prevState?.buttons.get(buttonIndex);
        buttonState.justPressed = buttonState.pressed && !(prevButton?.pressed ?? false);
        buttonState.justReleased = !buttonState.pressed && (prevButton?.pressed ?? false);
      }
    }
  }

  /**
   * Checks if a gamepad is connected.
   *
   * @param index - Gamepad index (0-3)
   * @returns True if gamepad is connected
   *
   * @example
   * ```typescript
   * if (gamepad.isConnected(0)) {
   *   console.log('Player 1 controller connected');
   * }
   * ```
   */
  isConnected(index: number): boolean {
    return this.gamepads.has(index) && this.gamepads.get(index)!.connected;
  }

  /**
   * Gets the ID string of a connected gamepad.
   *
   * @param index - Gamepad index
   * @returns Gamepad ID or null
   *
   * @example
   * ```typescript
   * const id = gamepad.getGamepadId(0);
   * console.log('Controller:', id);
   * ```
   */
  getGamepadId(index: number): string | null {
    const state = this.gamepads.get(index);
    return state?.connected ? state.id : null;
  }

  /**
   * Checks if a button is currently down.
   *
   * @param index - Gamepad index
   * @param button - Button index
   * @returns True if button is down
   *
   * @example
   * ```typescript
   * if (gamepad.isButtonDown(0, GamepadButton.A)) {
   *   player.jump();
   * }
   * ```
   */
  isButtonDown(index: number, button: number): boolean {
    const state = this.gamepads.get(index);
    return state?.buttons.get(button)?.pressed ?? false;
  }

  /**
   * Checks if a button was pressed this frame.
   *
   * @param index - Gamepad index
   * @param button - Button index
   * @returns True if button was just pressed
   *
   * @example
   * ```typescript
   * if (gamepad.wasButtonPressed(0, GamepadButton.A)) {
   *   player.jump();
   * }
   * ```
   */
  wasButtonPressed(index: number, button: number): boolean {
    const state = this.gamepads.get(index);
    return state?.buttons.get(button)?.justPressed ?? false;
  }

  /**
   * Checks if a button was released this frame.
   *
   * @param index - Gamepad index
   * @param button - Button index
   * @returns True if button was just released
   *
   * @example
   * ```typescript
   * if (gamepad.wasButtonReleased(0, GamepadButton.A)) {
   *   console.log('Jump button released');
   * }
   * ```
   */
  wasButtonReleased(index: number, button: number): boolean {
    const state = this.gamepads.get(index);
    return state?.buttons.get(button)?.justReleased ?? false;
  }

  /**
   * Gets button value (0-1 for analog buttons).
   *
   * @param index - Gamepad index
   * @param button - Button index
   * @returns Button value (0-1)
   *
   * @example
   * ```typescript
   * const trigger = gamepad.getButtonValue(0, GamepadButton.RightTrigger);
   * car.accelerate(trigger);
   * ```
   */
  getButtonValue(index: number, button: number): number {
    const state = this.gamepads.get(index);
    return state?.buttons.get(button)?.value ?? 0;
  }

  /**
   * Gets axis value with deadzone applied.
   *
   * @param index - Gamepad index
   * @param axis - Axis index
   * @returns Axis value (-1 to 1)
   *
   * @example
   * ```typescript
   * const leftX = gamepad.getAxisValue(0, GamepadAxis.LeftStickX);
   * const leftY = gamepad.getAxisValue(0, GamepadAxis.LeftStickY);
   * player.move(leftX, leftY);
   * ```
   */
  getAxisValue(index: number, axis: number): number {
    const state = this.gamepads.get(index);
    const value = state?.axes.get(axis) ?? 0;
    return this.applyDeadzone(value);
  }

  /**
   * Gets raw axis value without deadzone.
   *
   * @param index - Gamepad index
   * @param axis - Axis index
   * @returns Raw axis value (-1 to 1)
   *
   * @example
   * ```typescript
   * const rawValue = gamepad.getRawAxisValue(0, GamepadAxis.LeftStickX);
   * ```
   */
  getRawAxisValue(index: number, axis: number): number {
    const state = this.gamepads.get(index);
    return state?.axes.get(axis) ?? 0;
  }

  /**
   * Sets deadzone threshold for axes.
   *
   * @param threshold - Deadzone threshold (0-1)
   *
   * @example
   * ```typescript
   * gamepad.setDeadzone(0.15);
   * ```
   */
  setDeadzone(threshold: number): void {
    this.deadzone = Math.max(0, Math.min(1, threshold));
    logger.debug(`Deadzone set to ${this.deadzone}`);
  }

  /**
   * Gets current deadzone threshold.
   *
   * @returns Deadzone threshold
   *
   * @example
   * ```typescript
   * const dz = gamepad.getDeadzone();
   * ```
   */
  getDeadzone(): number {
    return this.deadzone;
  }

  /**
   * Triggers rumble/vibration on a gamepad.
   *
   * @param index - Gamepad index
   * @param weakMagnitude - Weak motor magnitude (0-1)
   * @param strongMagnitude - Strong motor magnitude (0-1)
   * @param duration - Duration in milliseconds
   * @returns Promise that resolves when rumble completes
   *
   * @example
   * ```typescript
   * // Light rumble for 200ms
   * await gamepad.rumble(0, 0.3, 0.3, 200);
   *
   * // Strong rumble for impact
   * await gamepad.rumble(0, 0.8, 1.0, 100);
   * ```
   */
  async rumble(index: number, weakMagnitude: number, strongMagnitude: number, duration: number): Promise<void> {
    const rawGamepad = navigator.getGamepads()[index];

    if (!rawGamepad || !rawGamepad.vibrationActuator) {
      logger.warn(`Gamepad ${index} does not support vibration`);
      return;
    }

    try {
      await rawGamepad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        weakMagnitude: Math.max(0, Math.min(1, weakMagnitude)),
        strongMagnitude: Math.max(0, Math.min(1, strongMagnitude))
      });
    } catch (error) {
      logger.error(`Failed to trigger rumble on gamepad ${index}:`, error);
    }
  }

  /**
   * Stops rumble/vibration on a gamepad.
   *
   * @param index - Gamepad index
   *
   * @example
   * ```typescript
   * gamepad.stopRumble(0);
   * ```
   */
  async stopRumble(index: number): Promise<void> {
    const rawGamepad = navigator.getGamepads()[index];

    if (!rawGamepad || !rawGamepad.vibrationActuator) {
      return;
    }

    try {
      await rawGamepad.vibrationActuator.reset();
    } catch (error) {
      logger.error(`Failed to stop rumble on gamepad ${index}:`, error);
    }
  }

  /**
   * Gets all connected gamepad indices.
   *
   * @returns Array of connected gamepad indices
   *
   * @example
   * ```typescript
   * const connected = gamepad.getConnectedGamepads();
   * console.log(`${connected.length} gamepads connected`);
   * ```
   */
  getConnectedGamepads(): number[] {
    const indices: number[] = [];
    for (const [index, state] of this.gamepads) {
      if (state.connected) {
        indices.push(index);
      }
    }
    return indices;
  }

  /**
   * Resets all gamepad state.
   *
   * @example
   * ```typescript
   * gamepad.reset();
   * ```
   */
  reset(): void {
    this.gamepads.clear();
    this.previousGamepads.clear();
    logger.debug('Gamepad state reset');
  }

  /**
   * Polls current gamepad state from browser API.
   *
   * @private
   */
  private pollGamepads(): void {
    const rawGamepads = navigator.getGamepads();

    for (let i = 0; i < rawGamepads.length; i++) {
      const rawGamepad = rawGamepads[i];

      if (rawGamepad) {
        this.updateGamepadState(rawGamepad);
      }
    }
  }

  /**
   * Updates state for a specific gamepad.
   *
   * @param rawGamepad - Browser gamepad object
   * @private
   */
  private updateGamepadState(rawGamepad: globalThis.Gamepad): void {
    let state = this.gamepads.get(rawGamepad.index);

    if (!state) {
      state = {
        id: rawGamepad.id,
        index: rawGamepad.index,
        connected: true,
        buttons: new Map(),
        axes: new Map(),
        timestamp: rawGamepad.timestamp
      };
      this.gamepads.set(rawGamepad.index, state);
    }

    state.connected = rawGamepad.connected;
    state.timestamp = rawGamepad.timestamp;

    // Update buttons
    for (let i = 0; i < rawGamepad.buttons.length; i++) {
      const button = rawGamepad.buttons[i];
      const prevButton = state.buttons.get(i);

      state.buttons.set(i, {
        pressed: button.pressed,
        value: button.value,
        justPressed: prevButton ? button.pressed && !prevButton.pressed : false,
        justReleased: prevButton ? !button.pressed && prevButton.pressed : false
      });
    }

    // Update axes
    for (let i = 0; i < rawGamepad.axes.length; i++) {
      state.axes.set(i, rawGamepad.axes[i]);
    }
  }

  /**
   * Applies deadzone to an axis value.
   *
   * @param value - Raw axis value
   * @returns Value with deadzone applied
   * @private
   */
  private applyDeadzone(value: number): number {
    if (Math.abs(value) < this.deadzone) {
      return 0;
    }

    // Remap from (deadzone, 1) to (0, 1)
    const sign = Math.sign(value);
    const abs = Math.abs(value);
    return sign * ((abs - this.deadzone) / (1 - this.deadzone));
  }

  /**
   * Clones a gamepad state.
   *
   * @param state - State to clone
   * @returns Cloned state
   * @private
   */
  private cloneGamepadState(state: GamepadState): GamepadState {
    return {
      id: state.id,
      index: state.index,
      connected: state.connected,
      buttons: new Map(state.buttons),
      axes: new Map(state.axes),
      timestamp: state.timestamp
    };
  }

  /**
   * Handles gamepad connected events.
   *
   * @param event - Gamepad event
   * @private
   */
  private onGamepadConnected(event: GamepadEvent): void {
    logger.info(`Gamepad connected: ${event.gamepad.id} at index ${event.gamepad.index}`);
    this.updateGamepadState(event.gamepad);
  }

  /**
   * Handles gamepad disconnected events.
   *
   * @param event - Gamepad event
   * @private
   */
  private onGamepadDisconnected(event: GamepadEvent): void {
    logger.info(`Gamepad disconnected: ${event.gamepad.id} at index ${event.gamepad.index}`);
    const state = this.gamepads.get(event.gamepad.index);
    if (state) {
      state.connected = false;
    }
  }

  /**
   * Checks if gamepad is attached.
   *
   * @returns True if attached
   *
   * @example
   * ```typescript
   * if (!gamepad.isAttached()) {
   *   gamepad.attach();
   * }
   * ```
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Disposes the gamepad handler, detaching all listeners.
   *
   * @example
   * ```typescript
   * gamepad.dispose();
   * ```
   */
  dispose(): void {
    this.detach();
    logger.debug('Gamepad disposed');
  }
}
