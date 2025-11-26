/**
 * InputManager - Central input coordination and management
 *
 * The InputManager is the main entry point for the input system. It coordinates all input
 * devices (keyboard, mouse, touch, gamepad, virtual), manages input contexts and actions,
 * handles action mapping, and distributes input events. It provides a unified interface
 * for querying input state across all devices.
 *
 * @module input/InputManager
 *
 * @example
 * ```typescript
 * // Initialize input manager
 * const inputManager = new InputManager();
 * inputManager.initialize(canvas);
 *
 * // Create gameplay context
 * const gameplay = inputManager.createContext({
 *   name: 'gameplay',
 *   priority: 0
 * });
 *
 * // Add movement action
 * const moveAction = gameplay.addAction({
 *   name: 'move',
 *   valueType: 'axis2D'
 * });
 * moveAction.addCompositeBinding('2DAxis', {
 *   up: { deviceType: 'keyboard', path: 'W' },
 *   down: { deviceType: 'keyboard', path: 'S' },
 *   left: { deviceType: 'keyboard', path: 'A' },
 *   right: { deviceType: 'keyboard', path: 'D' }
 * });
 *
 * // Add jump action
 * const jumpAction = gameplay.addAction({
 *   name: 'jump',
 *   valueType: 'button'
 * });
 * jumpAction.addBinding({ deviceType: 'keyboard', path: 'Space' });
 * jumpAction.addBinding({ deviceType: 'gamepad', path: 'A' });
 *
 * // Enable context
 * gameplay.enable();
 *
 * // In game loop
 * function update(deltaTime: number) {
 *   inputManager.update(deltaTime);
 *
 *   // Query actions
 *   const move = inputManager.getAction('gameplay', 'move');
 *   if (move?.vector) {
 *     player.move(move.vector.x, move.vector.y);
 *   }
 *
 *   const jump = inputManager.getAction('gameplay', 'jump');
 *   if (jump?.triggered) {
 *     player.jump();
 *   }
 * }
 * ```
 */

import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';
import { EventBus } from '../core/EventBus';
import { Keyboard } from './Keyboard';
import { Mouse } from './Mouse';
import { Touch } from './Touch';
import { Gamepad } from './Gamepad';
import { VirtualInput } from './VirtualInput';
import { InputContext, InputContextConfig } from './InputContext';
import { InputAction } from './InputAction';
import { InputBinding, DeviceType, ModifierKey } from './InputBinding';

const logger = new Logger('InputManager');

/**
 * Input manager configuration
 */
export interface InputManagerConfig {
  /**
   * Enable keyboard input
   */
  keyboard?: boolean;

  /**
   * Enable mouse input
   */
  mouse?: boolean;

  /**
   * Enable touch input
   */
  touch?: boolean;

  /**
   * Enable gamepad input
   */
  gamepad?: boolean;

  /**
   * Enable virtual input
   */
  virtualInput?: boolean;

  /**
   * Gamepad deadzone threshold
   */
  gamepadDeadzone?: number;
}

/**
 * Extended event map for input events
 */
declare module '../core/EventBus' {
  interface EventMap {
    'input:action:triggered': { context: string; action: string; value: number };
    'input:context:enabled': { context: string };
    'input:context:disabled': { context: string };
    'input:device:connected': { deviceType: DeviceType; deviceId: string | number };
    'input:device:disconnected': { deviceType: DeviceType; deviceId: string | number };
  }
}

/**
 * Central input management system.
 * Coordinates all input devices and manages input contexts and actions.
 *
 * @example
 * ```typescript
 * // Create and initialize
 * const inputManager = new InputManager();
 * inputManager.initialize(canvas);
 *
 * // Create contexts
 * const gameplay = inputManager.createContext({ name: 'gameplay' });
 * const menu = inputManager.createContext({
 *   name: 'menu',
 *   priority: 100,
 *   blockLowerPriority: true
 * });
 *
 * // Configure actions
 * const fireAction = gameplay.addAction({
 *   name: 'fire',
 *   valueType: 'button'
 * });
 * fireAction.addBinding({ deviceType: 'keyboard', path: 'Space' });
 * fireAction.addBinding({ deviceType: 'mouse', path: 'LeftButton' });
 * fireAction.addBinding({ deviceType: 'gamepad', path: 'RightTrigger' });
 *
 * // Enable gameplay context
 * gameplay.enable();
 *
 * // Update each frame
 * function gameLoop(deltaTime: number) {
 *   inputManager.update(deltaTime);
 *
 *   // Query actions
 *   if (inputManager.getAction('gameplay', 'fire')?.triggered) {
 *     weapon.fire();
 *   }
 * }
 * ```
 */
export class InputManager {
  /**
   * Keyboard input handler
   */
  private keyboard: Keyboard | null = null;

  /**
   * Mouse input handler
   */
  private mouse: Mouse | null = null;

  /**
   * Touch input handler
   */
  private touch: Touch | null = null;

  /**
   * Gamepad input handler
   */
  private gamepad: Gamepad | null = null;

  /**
   * Virtual input handler
   */
  private virtualInput: VirtualInput | null = null;

  /**
   * Input contexts (name -> context)
   */
  private contexts: Map<string, InputContext> = new Map();

  /**
   * Sorted contexts by priority (highest first)
   */
  private sortedContexts: InputContext[] = [];

  /**
   * Whether input manager is initialized
   */
  private initialized: boolean = false;

  /**
   * Current time in seconds
   */
  private currentTime: number = 0;

  /**
   * Configuration
   */
  private config: Required<InputManagerConfig>;

  /**
   * Creates a new input manager.
   *
   * @param config - Input manager configuration
   *
   * @example
   * ```typescript
   * const inputManager = new InputManager({
   *   keyboard: true,
   *   mouse: true,
   *   touch: true,
   *   gamepad: true,
   *   virtualInput: false,
   *   gamepadDeadzone: 0.15
   * });
   * ```
   */
  constructor(config: InputManagerConfig = {}) {
    this.config = {
      keyboard: config.keyboard ?? true,
      mouse: config.mouse ?? true,
      touch: config.touch ?? true,
      gamepad: config.gamepad ?? true,
      virtualInput: config.virtualInput ?? false,
      gamepadDeadzone: config.gamepadDeadzone ?? 0.15
    };

    logger.debug('InputManager created');
  }

  /**
   * Initializes the input manager with a target element.
   *
   * @param target - Target element (canvas or window)
   * @param virtualCanvas - Optional separate canvas for virtual input
   *
   * @example
   * ```typescript
   * const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
   * inputManager.initialize(canvas);
   * ```
   */
  initialize(target: HTMLElement | Window, virtualCanvas?: HTMLCanvasElement): void {
    if (this.initialized) {
      logger.warn('InputManager already initialized');
      return;
    }

    // Initialize devices
    if (this.config.keyboard) {
      this.keyboard = new Keyboard();
      this.keyboard.attach(target as EventTarget);
      logger.info('Keyboard input enabled');
    }

    if (this.config.mouse && target instanceof HTMLElement) {
      this.mouse = new Mouse();
      this.mouse.attach(target);
      logger.info('Mouse input enabled');
    }

    if (this.config.touch && target instanceof HTMLElement) {
      this.touch = new Touch();
      this.touch.attach(target);
      logger.info('Touch input enabled');
    }

    if (this.config.gamepad) {
      this.gamepad = new Gamepad();
      this.gamepad.attach();
      this.gamepad.setDeadzone(this.config.gamepadDeadzone);
      logger.info('Gamepad input enabled');
    }

    if (this.config.virtualInput && virtualCanvas) {
      this.virtualInput = new VirtualInput();
      this.virtualInput.attach(virtualCanvas);
      logger.info('Virtual input enabled');
    }

    this.initialized = true;
    logger.info('InputManager initialized');
  }

  /**
   * Updates the input manager. Call once per frame.
   *
   * @param deltaTime - Time since last frame in seconds
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime: number) {
   *   inputManager.update(deltaTime);
   *   // ... rest of game logic
   * }
   * ```
   */
  update(deltaTime: number): void {
    if (!this.initialized) {
      return;
    }

    this.currentTime += deltaTime;

    // Update devices
    if (this.keyboard) this.keyboard.update();
    if (this.mouse) this.mouse.update();
    if (this.touch) this.touch.update();
    if (this.gamepad) this.gamepad.update();
    if (this.virtualInput) this.virtualInput.update();

    // Update all actions in all contexts
    for (const context of this.sortedContexts) {
      if (!context.enabled) continue;

      for (const action of context.getAllActions()) {
        action.update(deltaTime, this.currentTime, (binding) =>
          this.getBindingValue(binding)
        );

        // Emit event if action was triggered
        if (action.triggered) {
          EventBus.emit('input:action:triggered', {
            context: context.name,
            action: action.name,
            value: action.value
          });
        }
      }

      // Stop processing if this context blocks lower priority contexts
      if (context.blockLowerPriority) {
        break;
      }
    }
  }

  /**
   * Creates a new input context.
   *
   * @param config - Context configuration
   * @returns The created context
   *
   * @example
   * ```typescript
   * const gameplay = inputManager.createContext({
   *   name: 'gameplay',
   *   priority: 0,
   *   enabled: true
   * });
   * ```
   */
  createContext(config: InputContextConfig): InputContext {
    if (this.contexts.has(config.name)) {
      throw new Error(`Context '${config.name}' already exists`);
    }

    const context = new InputContext(config);
    this.contexts.set(config.name, context);
    this.updateSortedContexts();

    logger.info(`Created input context '${config.name}'`);
    return context;
  }

  /**
   * Removes an input context.
   *
   * @param name - Context name
   * @returns True if context was removed
   *
   * @example
   * ```typescript
   * inputManager.removeContext('gameplay');
   * ```
   */
  removeContext(name: string): boolean {
    const removed = this.contexts.delete(name);
    if (removed) {
      this.updateSortedContexts();
      logger.info(`Removed input context '${name}'`);
    }
    return removed;
  }

  /**
   * Gets an input context by name.
   *
   * @param name - Context name
   * @returns The context or undefined
   *
   * @example
   * ```typescript
   * const gameplay = inputManager.getContext('gameplay');
   * gameplay?.enable();
   * ```
   */
  getContext(name: string): InputContext | undefined {
    return this.contexts.get(name);
  }

  /**
   * Enables an input context.
   *
   * @param name - Context name
   *
   * @example
   * ```typescript
   * inputManager.enableContext('gameplay');
   * ```
   */
  enableContext(name: string): void {
    const context = this.contexts.get(name);
    if (context) {
      context.enable();
      EventBus.emit('input:context:enabled', { context: name });
    }
  }

  /**
   * Disables an input context.
   *
   * @param name - Context name
   *
   * @example
   * ```typescript
   * inputManager.disableContext('gameplay');
   * ```
   */
  disableContext(name: string): void {
    const context = this.contexts.get(name);
    if (context) {
      context.disable();
      EventBus.emit('input:context:disabled', { context: name });
    }
  }

  /**
   * Gets an action from a context.
   *
   * @param contextName - Context name
   * @param actionName - Action name
   * @returns The action or undefined
   *
   * @example
   * ```typescript
   * const jumpAction = inputManager.getAction('gameplay', 'jump');
   * if (jumpAction?.triggered) {
   *   player.jump();
   * }
   * ```
   */
  getAction(contextName: string, actionName: string): InputAction | undefined {
    return this.contexts.get(contextName)?.getAction(actionName);
  }

  /**
   * Gets keyboard input handler.
   *
   * @returns Keyboard handler or null
   *
   * @example
   * ```typescript
   * const keyboard = inputManager.getKeyboard();
   * if (keyboard?.isKeyDown('Escape')) {
   *   showPauseMenu();
   * }
   * ```
   */
  getKeyboard(): Keyboard | null {
    return this.keyboard;
  }

  /**
   * Gets mouse input handler.
   *
   * @returns Mouse handler or null
   *
   * @example
   * ```typescript
   * const mouse = inputManager.getMouse();
   * const mousePos = mouse?.position;
   * ```
   */
  getMouse(): Mouse | null {
    return this.mouse;
  }

  /**
   * Gets touch input handler.
   *
   * @returns Touch handler or null
   *
   * @example
   * ```typescript
   * const touch = inputManager.getTouch();
   * const pinch = touch?.getPinch();
   * ```
   */
  getTouch(): Touch | null {
    return this.touch;
  }

  /**
   * Gets gamepad input handler.
   *
   * @returns Gamepad handler or null
   *
   * @example
   * ```typescript
   * const gamepad = inputManager.getGamepad();
   * if (gamepad?.isConnected(0)) {
   *   // Use gamepad 0
   * }
   * ```
   */
  getGamepad(): Gamepad | null {
    return this.gamepad;
  }

  /**
   * Gets virtual input handler.
   *
   * @returns Virtual input handler or null
   *
   * @example
   * ```typescript
   * const virtualInput = inputManager.getVirtualInput();
   * virtualInput?.render();
   * ```
   */
  getVirtualInput(): VirtualInput | null {
    return this.virtualInput;
  }

  /**
   * Gets the value of a binding from the appropriate device.
   *
   * @param binding - Input binding
   * @returns Binding value (0-1 or -1 to 1)
   *
   * @private
   */
  private getBindingValue(binding: InputBinding): number {
    const modifiers = this.getActiveModifiers();

    if (!binding.matches(binding.deviceType, binding.path, modifiers)) {
      return 0;
    }

    let rawValue = 0;

    switch (binding.deviceType) {
      case 'keyboard':
        rawValue = this.keyboard?.getKeyValue(binding.path) ?? 0;
        break;

      case 'mouse':
        if (binding.path.startsWith('Button')) {
          const buttonIndex = parseInt(binding.path.replace('Button', '')) || 0;
          rawValue = this.mouse?.getButtonValue(buttonIndex) ?? 0;
        } else if (binding.path === 'ScrollWheel') {
          const scroll = this.mouse?.scrollDelta;
          rawValue = scroll ? scroll.y : 0;
        } else if (binding.path === 'DeltaX') {
          rawValue = this.mouse?.delta.x ?? 0;
        } else if (binding.path === 'DeltaY') {
          rawValue = this.mouse?.delta.y ?? 0;
        }
        break;

      case 'gamepad':
        if (this.gamepad) {
          // Try to find first connected gamepad
          const gamepads = this.gamepad.getConnectedGamepads();
          if (gamepads.length > 0) {
            const index = gamepads[0];

            if (binding.path.includes('Stick')) {
              // Axis
              const axisMatch = binding.path.match(/(\w+)Stick\/([XY])/);
              if (axisMatch) {
                const stick = axisMatch[1];
                const axis = axisMatch[2];
                const axisIndex = (stick === 'Left' ? 0 : 2) + (axis === 'Y' ? 1 : 0);
                rawValue = this.gamepad.getAxisValue(index, axisIndex);
              }
            } else if (binding.path.startsWith('Button')) {
              // Button
              const buttonMatch = binding.path.match(/Button(\w+)/);
              if (buttonMatch) {
                const buttonName = buttonMatch[1];
                const buttonIndex = this.getGamepadButtonIndex(buttonName);
                rawValue = this.gamepad.getButtonValue(index, buttonIndex);
              }
            }
          }
        }
        break;

      case 'touch':
        // Touch handling would require more context about which touch
        // For now, just return 0
        break;

      case 'virtual':
        // Virtual input would be handled separately
        break;
    }

    // Process value through binding processors
    return binding.processValue(rawValue, 0.016);
  }

  /**
   * Gets currently active modifier keys.
   *
   * @returns Active modifiers
   * @private
   */
  private getActiveModifiers(): Record<ModifierKey, boolean> {
    return {
      ctrl: this.keyboard?.ctrl ?? false,
      shift: this.keyboard?.shift ?? false,
      alt: this.keyboard?.alt ?? false,
      meta: this.keyboard?.meta ?? false
    };
  }

  /**
   * Gets gamepad button index from name.
   *
   * @param name - Button name
   * @returns Button index
   * @private
   */
  private getGamepadButtonIndex(name: string): number {
    const buttonMap: Record<string, number> = {
      A: 0, B: 1, X: 2, Y: 3,
      LeftShoulder: 4, RightShoulder: 5,
      LeftTrigger: 6, RightTrigger: 7,
      Back: 8, Start: 9,
      LeftStick: 10, RightStick: 11,
      DPadUp: 12, DPadDown: 13, DPadLeft: 14, DPadRight: 15,
      Home: 16
    };
    return buttonMap[name] ?? 0;
  }

  /**
   * Updates sorted contexts list.
   *
   * @private
   */
  private updateSortedContexts(): void {
    this.sortedContexts = Array.from(this.contexts.values()).sort(
      (a, b) => b.priority - a.priority
    );
  }

  /**
   * Resets all input state.
   *
   * @example
   * ```typescript
   * inputManager.reset();
   * ```
   */
  reset(): void {
    this.keyboard?.reset();
    this.mouse?.reset();
    this.touch?.reset();
    this.gamepad?.reset();

    for (const context of this.contexts.values()) {
      context.reset();
    }

    logger.debug('InputManager reset');
  }

  /**
   * Gets all input contexts.
   *
   * @returns Map of context names to contexts
   *
   * @example
   * ```typescript
   * const contexts = inputManager.getContexts();
   * for (const [name, context] of contexts) {
   *   console.log(`Context: ${name}`);
   * }
   * ```
   */
  getContexts(): Map<string, InputContext> {
    return this.contexts;
  }

  /**
   * Disposes the input manager, cleaning up all resources.
   *
   * @example
   * ```typescript
   * inputManager.dispose();
   * ```
   */
  dispose(): void {
    this.keyboard?.dispose();
    this.mouse?.dispose();
    this.touch?.dispose();
    this.gamepad?.dispose();
    this.virtualInput?.dispose();

    this.contexts.clear();
    this.sortedContexts.length = 0;
    this.initialized = false;

    logger.info('InputManager disposed');
  }
}
