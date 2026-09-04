import type { VirtualJoystickConfig } from "./VirtualTouchControls";

export type TouchLayoutGenre = "fight" | "race" | "platform";

export interface TouchLayoutButtonBinding {
  /** DOM id the route creates for the on-screen button. */
  readonly elementId: string;
  /** `KeyboardEvent.code` the button synthesises (same path as physical keys). */
  readonly code: string;
  readonly kind: "hold" | "pulse";
  readonly label: string;
}

export interface TouchLayoutPreset {
  readonly kind: "touch-layout-preset";
  readonly genre: TouchLayoutGenre;
  /** Primary analog stick (move / steer). */
  readonly leftStick: VirtualJoystickConfig;
  /** Optional second stick (camera / aim). Present for fight + platform. */
  readonly rightStick?: VirtualJoystickConfig;
  readonly hold: readonly TouchLayoutButtonBinding[];
  readonly pulse: readonly TouchLayoutButtonBinding[];
}

export interface TouchLayoutPresetOptions {
  readonly width?: number;
  readonly height?: number;
  readonly elementIdPrefix?: string;
}

/**
 * Analog-stick + button layout presets per genre. Stick configs feed
 * `VirtualTouchJoystick`; button bindings feed the engine's
 * `bindGameTouchControls` as `{ hold, pulse }` (see also the engine-side
 * `touchLayoutBindingsForGenre`, which mirrors the button maps where the
 * engine cannot depend on this package).
 */
export function createTouchLayoutPreset(
  genre: TouchLayoutGenre,
  options: TouchLayoutPresetOptions = {}
): TouchLayoutPreset {
  const width = Math.max(1, options.width ?? 960);
  const height = Math.max(1, options.height ?? 540);
  const prefix = options.elementIdPrefix ?? `touch-${genre}`;
  const scale = Math.min(width, height) / 540;
  const stickRadius = 64 * scale;

  const leftStick: VirtualJoystickConfig = {
    center: [96 * scale, height - 96 * scale],
    radius: stickRadius,
    deadZone: 0.18,
    maxDistance: stickRadius * 0.8,
    fixed: false,
    returnToCenter: true
  };

  const hold = (elementId: string, code: string, label: string): TouchLayoutButtonBinding => ({
    elementId: `${prefix}:${elementId}`,
    code,
    kind: "hold",
    label
  });
  const pulse = (elementId: string, code: string, label: string): TouchLayoutButtonBinding => ({
    elementId: `${prefix}:${elementId}`,
    code,
    kind: "pulse",
    label
  });

  switch (genre) {
    case "fight":
      return {
        kind: "touch-layout-preset",
        genre,
        leftStick,
        rightStick: {
          center: [width - 96 * scale, height - 220 * scale],
          radius: 52 * scale,
          deadZone: 0.25,
          maxDistance: 40 * scale,
          fixed: true,
          returnToCenter: true
        },
        hold: [hold("left", "ArrowLeft", "Move left"), hold("right", "ArrowRight", "Move right"), hold("block", "KeyS", "Block")],
        pulse: [
          pulse("light", "KeyJ", "Light"),
          pulse("heavy", "KeyK", "Heavy"),
          pulse("special", "KeyL", "Special"),
          pulse("jump", "Space", "Jump")
        ]
      };
    case "race":
      return {
        kind: "touch-layout-preset",
        genre,
        leftStick: { ...leftStick, deadZone: 0.12 },
        hold: [
          hold("steer-left", "ArrowLeft", "Steer left"),
          hold("steer-right", "ArrowRight", "Steer right"),
          hold("throttle", "ArrowUp", "Throttle"),
          hold("brake", "ArrowDown", "Brake")
        ],
        pulse: [pulse("boost", "ShiftLeft", "Boost"), pulse("reset", "KeyR", "Reset")]
      };
    case "platform":
      return {
        kind: "touch-layout-preset",
        genre,
        leftStick,
        rightStick: {
          center: [width - 96 * scale, height - 220 * scale],
          radius: 48 * scale,
          deadZone: 0.3,
          maxDistance: 36 * scale,
          fixed: true,
          returnToCenter: true
        },
        hold: [hold("left", "ArrowLeft", "Move left"), hold("right", "ArrowRight", "Move right"), hold("dash", "ShiftLeft", "Dash")],
        pulse: [pulse("jump", "Space", "Jump"), pulse("attack", "KeyJ", "Attack")]
      };
  }
}

export const TOUCH_LAYOUT_GENRES: readonly TouchLayoutGenre[] = ["fight", "race", "platform"];
