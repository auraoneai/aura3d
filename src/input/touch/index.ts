/**
 * Touch input module - Complete multi-touch support
 *
 * Provides comprehensive touch input handling including:
 * - Multi-touch device management (10+ simultaneous touches)
 * - Touch point tracking with position, pressure, and radius
 * - Gesture recognition (tap, pan, pinch, rotate, swipe)
 * - Virtual joysticks and buttons for mobile
 * - Full touch lifecycle management
 *
 * @module input/touch
 */

export * from './TouchPoint';
export * from './TouchDevice';
export * from './GestureRecognizer';
export * from './TouchJoystick';
export * from './TouchButton';
