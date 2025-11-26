/**
 * GamepadDevice - Wrapper for individual gamepad with state tracking
 *
 * Provides high-level interface for a single gamepad with button/axis state,
 * dead zone handling, vibration support, and connection management.
 *
 * @module input/gamepad/GamepadDevice
 */

import { Vector2 } from '../../math/Vector2';
import { Logger } from '../../core/Logger';
import { GamepadButtons } from './GamepadButtons';
import { GamepadAxes, DeadZoneConfig, DEFAULT_DEAD_ZONE_CONFIG, applyDeadZone } from './GamepadAxes';
import { GamepadType, detectGamepadType, getGamepadMapping, ButtonMapping, analyzeGamepad } from './GamepadMapping';

const logger = Logger.create('GamepadDevice');

/**
 * Button state for a single frame.
 */
interface ButtonState {
  /** Whether button is currently pressed */
  pressed: boolean;
  /** Button pressure/value (0-1) */
  value: number;
  /** Whether button was just pressed this frame */
  justPressed: boolean;
  /** Whether button was just released this frame */
  justReleased: boolean;
}

/**
 * Gamepad device wrapper with state management.
 *
 * @example
 * ```typescript
 * const device = new GamepadDevice(0);
 *
 * // In game loop
 * device.update();
 *
 * if (device.isButtonPressed(GamepadButtons.A)) {
 *   player.jump();
 * }
 *
 * const leftStick = device.getLeftStick();
 * player.move(leftStick.x, leftStick.y);
 *
 * // Trigger vibration
 * await device.vibrate(0.5, 0.5, 200);
 * ```
 */
export class GamepadDevice {
  /** Gamepad index (0-3) */
  private readonly index: number;

  /** Current gamepad state */
  private gamepad: Gamepad | null = null;

  /** Detected gamepad type */
  private type: GamepadType = GamepadType.Unknown;

  /** Button mapping for this gamepad */
  private mapping: ButtonMapping;

  /** Current button states */
  private buttons: Map<GamepadButtons, ButtonState> = new Map();

  /** Previous button states for edge detection */
  private previousButtons: Map<GamepadButtons, ButtonState> = new Map();

  /** Current axis values */
  private axes: Map<GamepadAxes, number> = new Map();

  /** Dead zone configuration */
  private deadZoneConfig: DeadZoneConfig;

  /** Whether gamepad is connected */
  private connected: boolean = false;

  /** Gamepad ID string */
  private id: string = '';

  /** Timestamp of last update */
  private lastTimestamp: number = 0;

  /** Button mapping for this gamepad (currently unused but reserved for future use) */
  private _unusedMapping: ButtonMapping;

  /**
   * Creates a new gamepad device wrapper.
   *
   * @param index - Gamepad index (0-3)
   * @param deadZoneConfig - Optional dead zone configuration
   *
   * @example
   * ```typescript
   * const gamepad = new GamepadDevice(0);
   * ```
   */
  constructor(index: number, deadZoneConfig: DeadZoneConfig = DEFAULT_DEAD_ZONE_CONFIG) {
    this.index = index;
    this.deadZoneConfig = deadZoneConfig;
    this.mapping = getGamepadMapping(GamepadType.Unknown);
    this._unusedMapping = this.mapping;

    // Initialize button states
    for (let i = 0; i <= 19; i++) {
      this.buttons.set(i as GamepadButtons, {
        pressed: false,
        value: 0,
        justPressed: false,
        justReleased: false
      });
    }

    logger.debug(`GamepadDevice created for index ${index}`);
  }

  /**
   * Updates gamepad state from browser API. Call once per frame.
   *
   * @example
   * ```typescript
   * gamepad.update();
   * ```
   */
  update(): void {
    // Get current gamepad state from browser
    const gamepads = navigator.getGamepads();
    this.gamepad = gamepads[this.index] ?? null;

    if (!this.gamepad || !this.gamepad.connected) {
      if (this.connected) {
        this.handleDisconnect();
      }
      return;
    }

    // Handle connection
    if (!this.connected) {
      this.handleConnect();
    }

    // Skip if no new data
    if (this.gamepad.timestamp === this.lastTimestamp) {
      return;
    }

    this.lastTimestamp = this.gamepad.timestamp;

    // Update button states
    this.updateButtons();

    // Update axis states
    this.updateAxes();
  }

  /**
   * Checks if gamepad is connected.
   *
   * @returns True if connected
   *
   * @example
   * ```typescript
   * if (gamepad.isConnected()) {
   *   console.log('Gamepad ready');
   * }
   * ```
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Gets the gamepad index.
   *
   * @returns Gamepad index (0-3)
   *
   * @example
   * ```typescript
   * const index = gamepad.getIndex();
   * ```
   */
  getIndex(): number {
    return this.index;
  }

  /**
   * Gets the gamepad ID string.
   *
   * @returns Gamepad ID
   *
   * @example
   * ```typescript
   * const id = gamepad.getId();
   * console.log('Connected:', id);
   * ```
   */
  getId(): string {
    return this.id;
  }

  /**
   * Gets the detected gamepad type.
   *
   * @returns Gamepad type
   *
   * @example
   * ```typescript
   * const type = gamepad.getType();
   * if (type === GamepadType.Xbox) {
   *   // Show Xbox button prompts
   * }
   * ```
   */
  getType(): GamepadType {
    return this.type;
  }

  /**
   * Checks if a button is currently pressed.
   *
   * @param button - Button to check
   * @returns True if pressed
   *
   * @example
   * ```typescript
   * if (gamepad.isButtonPressed(GamepadButtons.A)) {
   *   player.jump();
   * }
   * ```
   */
  isButtonPressed(button: GamepadButtons): boolean {
    return this.buttons.get(button)?.pressed || false;
  }

  /**
   * Checks if a button was just pressed this frame.
   *
   * @param button - Button to check
   * @returns True if just pressed
   *
   * @example
   * ```typescript
   * if (gamepad.wasButtonJustPressed(GamepadButtons.A)) {
   *   player.jump();
   * }
   * ```
   */
  wasButtonJustPressed(button: GamepadButtons): boolean {
    return this.buttons.get(button)?.justPressed || false;
  }

  /**
   * Checks if a button was just released this frame.
   *
   * @param button - Button to check
   * @returns True if just released
   *
   * @example
   * ```typescript
   * if (gamepad.wasButtonJustReleased(GamepadButtons.A)) {
   *   console.log('Jump button released');
   * }
   * ```
   */
  wasButtonJustReleased(button: GamepadButtons): boolean {
    return this.buttons.get(button)?.justReleased || false;
  }

  /**
   * Gets button pressure value (0-1).
   *
   * @param button - Button to check
   * @returns Button value (0-1)
   *
   * @example
   * ```typescript
   * const trigger = gamepad.getButtonValue(GamepadButtons.RightTrigger);
   * car.accelerate(trigger);
   * ```
   */
  getButtonValue(button: GamepadButtons): number {
    return this.buttons.get(button)?.value || 0;
  }

  /**
   * Gets raw axis value without dead zone.
   *
   * @param axis - Axis to read
   * @returns Axis value (-1 to 1)
   *
   * @example
   * ```typescript
   * const rawX = gamepad.getRawAxis(GamepadAxes.LeftStickX);
   * ```
   */
  getRawAxis(axis: GamepadAxes): number {
    return this.axes.get(axis) || 0;
  }

  /**
   * Gets axis value with dead zone applied.
   *
   * @param axis - Axis to read
   * @returns Axis value (-1 to 1) with dead zone
   *
   * @example
   * ```typescript
   * const x = gamepad.getAxis(GamepadAxes.LeftStickX);
   * ```
   */
  getAxis(axis: GamepadAxes): number {
    const rawX = this.getRawAxis(GamepadAxes.LeftStickX);
    const rawY = this.getRawAxis(GamepadAxes.LeftStickY);
    const processed = applyDeadZone(rawX, rawY, this.deadZoneConfig);

    if (axis === GamepadAxes.LeftStickX || axis === GamepadAxes.RightStickX) {
      return axis === GamepadAxes.LeftStickX ? processed.x :
             this.getProcessedStick(false).x;
    } else {
      return axis === GamepadAxes.LeftStickY ? processed.y :
             this.getProcessedStick(false).y;
    }
  }

  /**
   * Gets left stick as Vector2 with dead zone applied.
   *
   * @returns Left stick vector
   *
   * @example
   * ```typescript
   * const stick = gamepad.getLeftStick();
   * player.move(stick.x, stick.y);
   * ```
   */
  getLeftStick(): Vector2 {
    return this.getProcessedStick(true);
  }

  /**
   * Gets right stick as Vector2 with dead zone applied.
   *
   * @returns Right stick vector
   *
   * @example
   * ```typescript
   * const stick = gamepad.getRightStick();
   * camera.rotate(stick.x, stick.y);
   * ```
   */
  getRightStick(): Vector2 {
    return this.getProcessedStick(false);
  }

  /**
   * Gets processed stick values with dead zone.
   *
   * @param leftStick - True for left stick, false for right
   * @returns Processed stick vector
   * @private
   */
  private getProcessedStick(leftStick: boolean): Vector2 {
    const xAxis = leftStick ? GamepadAxes.LeftStickX : GamepadAxes.RightStickX;
    const yAxis = leftStick ? GamepadAxes.LeftStickY : GamepadAxes.RightStickY;

    const rawX = this.getRawAxis(xAxis);
    const rawY = this.getRawAxis(yAxis);

    return applyDeadZone(rawX, rawY, this.deadZoneConfig);
  }

  /**
   * Sets dead zone configuration.
   *
   * @param config - Dead zone configuration
   *
   * @example
   * ```typescript
   * gamepad.setDeadZoneConfig({
   *   mode: DeadZoneMode.ScaledRadial,
   *   threshold: 0.2
   * });
   * ```
   */
  setDeadZoneConfig(config: DeadZoneConfig): void {
    this.deadZoneConfig = config;
    logger.debug(`Dead zone updated for gamepad ${this.index}`, config);
  }

  /**
   * Gets current dead zone configuration.
   *
   * @returns Dead zone configuration
   *
   * @example
   * ```typescript
   * const config = gamepad.getDeadZoneConfig();
   * ```
   */
  getDeadZoneConfig(): DeadZoneConfig {
    return this.deadZoneConfig;
  }

  /**
   * Triggers vibration on the gamepad.
   *
   * @param weakMagnitude - Weak motor magnitude (0-1)
   * @param strongMagnitude - Strong motor magnitude (0-1)
   * @param duration - Duration in milliseconds
   * @returns Promise that resolves when vibration completes
   *
   * @example
   * ```typescript
   * // Light rumble
   * await gamepad.vibrate(0.3, 0.3, 200);
   *
   * // Strong impact
   * await gamepad.vibrate(1, 1, 100);
   * ```
   */
  async vibrate(weakMagnitude: number, strongMagnitude: number, duration: number): Promise<void> {
    if (!this.gamepad || !this.gamepad.vibrationActuator) {
      logger.warn(`Gamepad ${this.index} does not support vibration`);
      return;
    }

    try {
      await this.gamepad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        weakMagnitude: Math.max(0, Math.min(1, weakMagnitude)),
        strongMagnitude: Math.max(0, Math.min(1, strongMagnitude))
      });
    } catch (error) {
      logger.error(`Failed to trigger vibration on gamepad ${this.index}`, error);
    }
  }

  /**
   * Stops vibration on the gamepad.
   *
   * @example
   * ```typescript
   * gamepad.stopVibration();
   * ```
   */
  async stopVibration(): Promise<void> {
    if (!this.gamepad || !this.gamepad.vibrationActuator) {
      return;
    }

    try {
      await this.gamepad.vibrationActuator.reset();
    } catch (error) {
      logger.error(`Failed to stop vibration on gamepad ${this.index}`, error);
    }
  }

  /**
   * Checks if gamepad supports vibration.
   *
   * @returns True if vibration is supported
   *
   * @example
   * ```typescript
   * if (gamepad.supportsVibration()) {
   *   gamepad.vibrate(0.5, 0.5, 200);
   * }
   * ```
   */
  supportsVibration(): boolean {
    return this.gamepad?.vibrationActuator !== undefined &&
           this.gamepad?.vibrationActuator !== null;
  }

  /**
   * Handles gamepad connection.
   * @private
   */
  private handleConnect(): void {
    if (!this.gamepad) return;

    this.connected = true;
    this.id = this.gamepad.id;
    this.type = detectGamepadType(this.id);
    this.mapping = getGamepadMapping(this.type);

    const info = analyzeGamepad(this.gamepad);
    logger.info(`Gamepad ${this.index} connected: ${info.name}`, {
      type: this.type,
      buttons: this.gamepad.buttons.length,
      axes: this.gamepad.axes.length,
      vibration: this.supportsVibration()
    });
  }

  /**
   * Handles gamepad disconnection.
   * @private
   */
  private handleDisconnect(): void {
    this.connected = false;
    logger.info(`Gamepad ${this.index} disconnected: ${this.id}`);

    // Reset state
    this.buttons.clear();
    this.previousButtons.clear();
    this.axes.clear();
    this.gamepad = null;
  }

  /**
   * Updates button states from current gamepad.
   * @private
   */
  private updateButtons(): void {
    if (!this.gamepad) return;

    // Save previous states
    this.previousButtons.clear();
    for (const [button, state] of this.buttons) {
      this.previousButtons.set(button, { ...state });
    }

    // Update current states
    for (let i = 0; i < this.gamepad.buttons.length && i <= 19; i++) {
      const button = i as GamepadButtons;
      const gamepadButton = this.gamepad.buttons[i];
      if (!gamepadButton) continue;

      const prevState = this.previousButtons.get(button);

      this.buttons.set(button, {
        pressed: gamepadButton.pressed,
        value: gamepadButton.value,
        justPressed: gamepadButton.pressed && !(prevState?.pressed ?? false),
        justReleased: !gamepadButton.pressed && (prevState?.pressed ?? false)
      });
    }
  }

  /**
   * Updates axis states from current gamepad.
   * @private
   */
  private updateAxes(): void {
    if (!this.gamepad) return;

    for (let i = 0; i < this.gamepad.axes.length && i <= 3; i++) {
      const axisValue = this.gamepad.axes[i];
      if (axisValue !== undefined) {
        this.axes.set(i as GamepadAxes, axisValue);
      }
    }
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
    this.buttons.clear();
    this.previousButtons.clear();
    this.axes.clear();
    this.connected = false;
    this.gamepad = null;
    logger.debug(`GamepadDevice ${this.index} reset`);
  }
}
