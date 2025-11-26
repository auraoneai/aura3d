/**
 * @module Input
 * @description
 * Comprehensive input system for the G3D engine.
 *
 * This module provides a complete input handling solution supporting multiple input devices
 * and abstraction layers:
 *
 * **Input Devices:**
 * - Keyboard: Full keyboard input with key states and modifiers
 * - Mouse: Button states, position tracking, scroll, and pointer lock
 * - Touch: Multi-touch handling with gesture recognition (tap, swipe, pinch, rotate)
 * - Gamepad: Controller support with button/axis mapping and vibration
 * - VirtualInput: On-screen controls for mobile devices (virtual joysticks and buttons)
 *
 * **Action System:**
 * - InputAction: Abstract actions that can be triggered by multiple bindings
 * - InputBinding: Maps device controls to actions with modifiers and processors
 * - InputContext: Groups related actions with priority and enable/disable support
 *
 * **Management:**
 * - InputManager: Central coordinator for all input devices and contexts
 * - InputSystem: ECS integration with input recording/playback support
 *
 * **Key Features:**
 * - Cross-platform support (desktop, mobile, gamepad)
 * - Low-latency input handling
 * - Action-based input abstraction
 * - Context switching for different game states
 * - Gesture recognition for touch
 * - Input recording and playback for replays
 * - Hot-plug gamepad detection
 * - Deadzone and processor support
 *
 * @example
 * ```typescript
 * import { InputSystem, InputManager } from './input';
 *
 * // Create input system for ECS
 * const inputSystem = new InputSystem(canvas, {
 *   keyboard: true,
 *   mouse: true,
 *   touch: true,
 *   gamepad: true
 * });
 * world.addSystem(inputSystem);
 *
 * // Configure input contexts
 * const inputManager = inputSystem.getInputManager();
 *
 * // Gameplay context
 * const gameplay = inputManager.createContext({
 *   name: 'gameplay',
 *   priority: 0
 * });
 *
 * // Movement action (2D axis)
 * const moveAction = gameplay.addAction({
 *   name: 'move',
 *   valueType: 'axis2D'
 * });
 *
 * // WASD composite binding
 * moveAction.addCompositeBinding('2DAxis', {
 *   up: { deviceType: 'keyboard', path: 'W' },
 *   down: { deviceType: 'keyboard', path: 'S' },
 *   left: { deviceType: 'keyboard', path: 'A' },
 *   right: { deviceType: 'keyboard', path: 'D' }
 * });
 *
 * // Gamepad left stick binding
 * moveAction.addBinding({
 *   deviceType: 'gamepad',
 *   path: 'LeftStick/X',
 *   processors: [{ type: 'deadzone', threshold: 0.2 }]
 * });
 *
 * // Jump action (button)
 * const jumpAction = gameplay.addAction({
 *   name: 'jump',
 *   valueType: 'button'
 * });
 * jumpAction.addBinding({ deviceType: 'keyboard', path: 'Space' });
 * jumpAction.addBinding({ deviceType: 'gamepad', path: 'ButtonA' });
 *
 * // Enable context
 * gameplay.enable();
 *
 * // Use in game logic
 * function updatePlayer() {
 *   const move = inputManager.getAction('gameplay', 'move');
 *   if (move?.vector) {
 *     player.velocity.set(move.vector.x, move.vector.y);
 *   }
 *
 *   const jump = inputManager.getAction('gameplay', 'jump');
 *   if (jump?.wasPressed) {
 *     player.jump();
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Direct device access (low-level)
 * import { Keyboard, Mouse, Gamepad } from './input';
 *
 * const keyboard = new Keyboard();
 * keyboard.attach(window);
 *
 * const mouse = new Mouse();
 * mouse.attach(canvas);
 *
 * const gamepad = new Gamepad();
 * gamepad.attach();
 *
 * // In game loop
 * function update() {
 *   keyboard.update();
 *   mouse.update();
 *   gamepad.update();
 *
 *   // Check keyboard
 *   if (keyboard.wasKeyPressed('Space')) {
 *     player.jump();
 *   }
 *
 *   // Check mouse
 *   if (mouse.wasButtonPressed(0)) {
 *     shoot();
 *   }
 *
 *   // Check gamepad
 *   if (gamepad.isConnected(0)) {
 *     const leftX = gamepad.getAxisValue(0, 0);
 *     const leftY = gamepad.getAxisValue(0, 1);
 *     player.move(leftX, leftY);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Touch and gestures
 * import { Touch } from './input';
 *
 * const touch = new Touch();
 * touch.attach(canvas);
 *
 * function update() {
 *   touch.update();
 *
 *   // Check tap
 *   if (touch.wasTapped()) {
 *     const pos = touch.getTapPosition();
 *     handleTap(pos);
 *   }
 *
 *   // Check swipe
 *   const swipe = touch.getSwipe();
 *   if (swipe && swipe.velocity > 500) {
 *     handleSwipe(swipe.direction);
 *   }
 *
 *   // Check pinch zoom
 *   const pinch = touch.getPinch();
 *   if (pinch) {
 *     camera.zoom *= pinch.scale;
 *   }
 *
 *   // Check rotation
 *   const rotate = touch.getRotate();
 *   if (rotate) {
 *     object.rotation += rotate.delta;
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Virtual input for mobile
 * import { VirtualInput } from './input';
 *
 * const virtualInput = new VirtualInput();
 * virtualInput.attach(canvas);
 *
 * // Create virtual joystick
 * const joystick = virtualInput.createJoystick({
 *   position: { x: 100, y: 500 },
 *   radius: 60,
 *   visible: true
 * });
 *
 * // Create virtual buttons
 * const jumpButton = virtualInput.createButton({
 *   position: { x: 600, y: 500 },
 *   radius: 40,
 *   label: 'A'
 * });
 *
 * function update() {
 *   virtualInput.update();
 *   virtualInput.render();
 *
 *   const axis = joystick.getValue();
 *   player.move(axis.x, axis.y);
 *
 *   if (jumpButton.wasPressed()) {
 *     player.jump();
 *   }
 * }
 * ```
 */

// Core input management
export { InputManager } from './InputManager';
export type { InputManagerConfig } from './InputManager';
export { InputSystem } from './InputSystem';

// Action system
export { InputAction } from './InputAction';
export type { InputActionConfig, ActionValueType, ActionState } from './InputAction';
export {
  InputBinding
} from './InputBinding';
export type {
  InputBindingConfig,
  DeviceType,
  InteractionType,
  ModifierKey,
  ProcessorType,
  ProcessorConfig
} from './InputBinding';
export { InputContext } from './InputContext';
export type { InputContextConfig } from './InputContext';

// Device handlers
export { Keyboard, KeyCodes } from './Keyboard';
export type { TextInputEvent } from './Keyboard';
export { Mouse, MouseButton } from './Mouse';
export {
  Touch
} from './Touch';
export type {
  TouchPoint,
  SwipeGesture,
  PinchGesture,
  RotateGesture
} from './Touch';
export { Gamepad, GamepadButton, GamepadAxis } from './Gamepad';
export {
  VirtualInput,
  VirtualJoystick,
  VirtualButton
} from './VirtualInput';
export type {
  VirtualJoystickConfig,
  VirtualButtonConfig
} from './VirtualInput';
