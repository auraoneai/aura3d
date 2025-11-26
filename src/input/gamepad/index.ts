/**
 * Gamepad input module - Complete gamepad/controller support
 *
 * Provides comprehensive gamepad input handling including:
 * - Device management with hot-plug support
 * - Button and axis mappings for Xbox, PlayStation, and generic controllers
 * - Dead zone handling with multiple modes
 * - Haptic feedback and vibration patterns
 * - Type detection and automatic mapping
 *
 * @module input/gamepad
 */

export * from './GamepadButtons';
export * from './GamepadAxes';
export * from './GamepadMapping';
export * from './GamepadDevice';
export * from './RumbleManager';
