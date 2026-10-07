import type { VirtualJoystickConfig } from "./VirtualTouchControls";

export type TouchLayoutGenre = "fight" | "race" | "platform" | "twin-stick" | "aim-drag" | "flight" | "lane-swipe" | "flippers";

export interface TouchLayoutButtonBinding {
  /** DOM id the route creates for the on-screen button. */
  readonly elementId: string;
  /** `KeyboardEvent.code` the button synthesises (same path as physical keys). */
  readonly code: string;
  readonly kind: "hold" | "pulse";
  readonly label: string;
}

/** Normalized rect in safe-area-relative units ([0,1] inside the usable area, y down). */
export interface TouchLayoutRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
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
  /**
   * Placement rects for every control (sticks + buttons), in safe-area units.
   * The shell renders each rect ≥ 48 CSS px on its smallest axis at any
   * supported viewport (asserted at 390×844 in tests).
   */
  readonly rects: Readonly<Record<string, TouchLayoutRect>>;
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

  // Safe-area-relative rects: w=0.125/h=0.06 ≈ 48.8 × 50.6 CSS px at 390×844.
  const BTN: TouchLayoutRect = { x: 0, y: 0, w: 0.125, h: 0.06 };
  const btn = (x: number, y: number): TouchLayoutRect => ({ ...BTN, x, y });
  // Bottom row cluster (right side): buttons step up-left like a gamepad diamond.
  const B = { x0: 0.845, y0: 0.86, dx: -0.145, dy: -0.075 };
  const stickL = { x: 0.04, y: 0.78 };
  const stickR = { x: 0.74, y: 0.78 };

  const rects = (entries: Readonly<Record<string, TouchLayoutRect>>): Readonly<Record<string, TouchLayoutRect>> =>
    Object.freeze({ ...entries });

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
        ],
        rects: rects({
          leftStick: { x: stickL.x, y: stickL.y, w: 0.21, h: 0.15 },
          rightStick: { x: stickR.x, y: stickR.y - 0.18, w: 0.21, h: 0.15 },
          left: btn(0.03, 0.9),
          right: btn(0.17, 0.9),
          block: btn(0.31, 0.9),
          light: btn(B.x0, B.y0),
          heavy: btn(B.x0 + B.dx, B.y0),
          special: btn(B.x0 + B.dx, B.y0 + B.dy),
          jump: btn(B.x0 + B.dx * 2, B.y0)
        })
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
        pulse: [pulse("boost", "ShiftLeft", "Boost"), pulse("reset", "KeyR", "Reset")],
        rects: rects({
          leftStick: { x: stickL.x, y: stickL.y, w: 0.21, h: 0.15 },
          "steer-left": btn(0.03, 0.9),
          "steer-right": btn(0.17, 0.9),
          throttle: btn(0.845, 0.78),
          brake: btn(0.845, 0.9),
          boost: btn(0.7, 0.9),
          reset: btn(0.03, 0.02)
        })
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
        pulse: [pulse("jump", "Space", "Jump"), pulse("attack", "KeyJ", "Attack")],
        rects: rects({
          leftStick: { x: stickL.x, y: stickL.y, w: 0.21, h: 0.15 },
          rightStick: { x: stickR.x, y: stickR.y - 0.18, w: 0.21, h: 0.15 },
          left: btn(0.03, 0.9),
          right: btn(0.17, 0.9),
          dash: btn(0.31, 0.9),
          jump: btn(B.x0, B.y0),
          attack: btn(B.x0 + B.dx, B.y0)
        })
      };
    case "twin-stick":
      // Two equal sticks: move + aim. One confirm/cancel pair.
      return {
        kind: "touch-layout-preset",
        genre,
        leftStick,
        rightStick: {
          center: [width - 96 * scale, height - 96 * scale],
          radius: stickRadius,
          deadZone: 0.18,
          maxDistance: stickRadius * 0.8,
          fixed: false,
          returnToCenter: true
        },
        hold: [],
        pulse: [pulse("confirm", "Enter", "Confirm"), pulse("cancel", "Escape", "Cancel")],
        rects: rects({
          leftStick: { x: stickL.x, y: stickL.y, w: 0.21, h: 0.15 },
          rightStick: { x: stickR.x, y: stickR.y, w: 0.21, h: 0.15 },
          confirm: btn(0.845, 0.9),
          cancel: btn(0.03, 0.02)
        })
      };
    case "aim-drag":
      // Single aim stick on the right, confirm/cancel buttons. Used by
      // deliberate aim-and-release games (billiards, mini-golf).
      return {
        kind: "touch-layout-preset",
        genre,
        leftStick: { ...leftStick, fixed: true },
        rightStick: {
          center: [width - 96 * scale, height - 96 * scale],
          radius: 72 * scale,
          deadZone: 0.08,
          maxDistance: 58 * scale,
          fixed: true,
          returnToCenter: false
        },
        hold: [hold("charge", "Space", "Charge")],
        pulse: [pulse("confirm", "Enter", "Confirm"), pulse("cancel", "Escape", "Cancel")],
        rects: rects({
          leftStick: { x: stickL.x, y: stickL.y, w: 0.21, h: 0.15 },
          rightStick: { x: stickR.x, y: stickR.y, w: 0.24, h: 0.2 },
          charge: btn(0.845, 0.9),
          confirm: btn(0.7, 0.9),
          cancel: btn(0.03, 0.02)
        })
      };
    case "flight":
      // Left stick is pitch/roll with spring-off (plane holds an attitude),
      // throttle/brake holds, fire + camera-reset pulses.
      return {
        kind: "touch-layout-preset",
        genre,
        leftStick: { ...leftStick, returnToCenter: false, deadZone: 0.1 },
        hold: [hold("throttle", "ArrowUp", "Throttle"), hold("brake", "ArrowDown", "Brake")],
        pulse: [pulse("fire", "Space", "Fire"), pulse("camera-reset", "KeyC", "Reset camera")],
        rects: rects({
          leftStick: { x: stickL.x, y: stickL.y, w: 0.21, h: 0.15 },
          throttle: btn(0.845, 0.74),
          brake: btn(0.845, 0.9),
          fire: btn(0.7, 0.9),
          "camera-reset": btn(0.03, 0.02)
        })
      };
    case "lane-swipe":
      // No stick: lane games swipe. Big pulse pads for left/right/jump/duck.
      return {
        kind: "touch-layout-preset",
        genre,
        leftStick: { ...leftStick, radius: 0, maxDistance: 0 },
        hold: [],
        pulse: [
          pulse("lane-left", "ArrowLeft", "Lane left"),
          pulse("lane-right", "ArrowRight", "Lane right"),
          pulse("jump", "ArrowUp", "Jump"),
          pulse("duck", "ArrowDown", "Duck")
        ],
        rects: rects({
          "lane-left": btn(0.03, 0.88),
          "lane-right": btn(0.845, 0.88),
          jump: btn(0.4375, 0.78),
          duck: btn(0.4375, 0.9)
        })
      };
    case "flippers":
      // Pinball: two huge side zones + plunger pulse.
      return {
        kind: "touch-layout-preset",
        genre,
        leftStick: { ...leftStick, radius: 0, maxDistance: 0 },
        hold: [hold("flip-left", "ShiftLeft", "Left flipper"), hold("flip-right", "ShiftRight", "Right flipper")],
        pulse: [pulse("plunger", "ArrowDown", "Plunger"), pulse("tilt", "KeyT", "Nudge")],
        rects: rects({
          "flip-left": { x: 0.03, y: 0.74, w: 0.3, h: 0.24 },
          "flip-right": { x: 0.67, y: 0.74, w: 0.3, h: 0.24 },
          plunger: btn(0.845, 0.6),
          tilt: btn(0.03, 0.02)
        })
      };
  }
}

export const TOUCH_LAYOUT_GENRES: readonly TouchLayoutGenre[] = [
  "fight",
  "race",
  "platform",
  "twin-stick",
  "aim-drag",
  "flight",
  "lane-swipe",
  "flippers"
];
