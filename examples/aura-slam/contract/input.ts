import type { ShotPreset } from "./sim";

/**
 * One input frame, applied with `applyInput(side, frame)` before a step. Field names and clamping are verbatim from
 * match-engine.js `applyInput`: axes are clamped to [-1, 1]; `active` is derived (x||y||vertical).
 */
export interface InputFrame {
  x?: number; y?: number;
  /** True when the vertical axis aims depth (up = deep, down = short) instead of moving. */
  vertical?: boolean;
  power?: boolean;
  serveAimX?: number; serveAimY?: number; serveFine?: boolean;
  /** Pro/Legend only: continuous lateral aim in [-1, 1]. */
  aimX?: number;
  shot?: ShotPreset;
  /** Request a swing/toss this step (press edge). `eventTime` is the sim-time stamp of the press for timing windows. */
  swing?: boolean; eventTime?: number; forcePower?: boolean;
}

/** Logical actions; devices map to these in module M-INPUT (controls.js). Reserved keys: KeyP pause, KeyF fullscreen. */
export type KeyboardAction = "left" | "right" | "up" | "down" | "hit" | "power" | "short" | "deep" | "lob" | "placement";
export type ControllerAction = "hit" | "power" | "short" | "deep" | "lob";

export type KeyboardBindings = { readonly [A in KeyboardAction]: readonly [string, string | null] };
export type ControllerBindings = { readonly [A in ControllerAction]: number };

export const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindings = {
  left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"],
  hit: ["Space", null], power: ["ShiftLeft", "ShiftRight"], short: ["KeyQ", null], deep: ["KeyE", null], lob: ["KeyR", null], placement: ["KeyC", null],
};
export const DEFAULT_CONTROLLER_BINDINGS: ControllerBindings = { hit: 0, power: 7, short: 2, deep: 1, lob: 3 };
export const CONTROLS_STORAGE_KEY = "baseline.controls.v1";
export const CONTROLS_VERSION = 1;

/** Raw touch gesture and the classified shot it produces (mobile-swipe.js `classifyGesture`). */
export interface RawSwipeGesture { startX: number; startY: number; endX: number; endY: number; startTime: number; endTime: number; width: number; height: number }
export interface SwipeShot { targetX: number; targetDepth: number; directionX: number; directionY: number; strength: number }
export type ControlStyle = "classic" | "swipe";
export const SWIPE_STORAGE_KEY = "baseline.mobileGameplay.v1";

/** Device-neutral sample the renderer shell feeds to the mapper each frame. */
export interface InputSample {
  readonly keysDown: ReadonlySet<string>;
  readonly pressedThisFrame: ReadonlySet<string>;
  readonly gamepad?: { readonly axes: readonly number[]; readonly buttons: readonly boolean[] };
  readonly touchStick?: { readonly x: number; readonly y: number };
  readonly swipe?: SwipeShot | null;
  readonly time: number;
}
