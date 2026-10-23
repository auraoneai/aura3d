/**
 * M-INPUT mapper: turns device state into the engine's `InputFrame` for the human side, exactly as game.js
 * `directionInput()` / `readInput` do, plus the press-edge commands (swing, lob, shot presets, pause) and the touch
 * stick. Implements the contract's `InputMapper`. Pure: no DOM, no clocks, storage is injected.
 */
import type { ControllerBindings, InputFrame, InputSample, KeyboardBindings, RawSwipeGesture, SwipeShot } from "../contract/input";
import type { InputMapper } from "../contract/modules";
import type { ShotPreset } from "../contract/sim";
import { createBindingsStore, type BindingsStore, type StorageLike } from "./bindings";
import { axisWithDeadZone, createGamepadPoller, type GamepadGates, type GamepadPoller, type GamepadResult, type PadLike } from "./gamepad";
import { createKeyboardTracker, type KeyboardCommand, type KeyboardTracker } from "./keyboard";
import { classifyGesture, createSwipePreferences, type SwipePreferences } from "./swipe";

export const TOUCH_DEAD_ZONE = 10;
export const TOUCH_RADIUS = 48;
export const TOUCH_TAP_MS = 280;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Everything `directionInput()` consults besides the devices. Defaults describe ordinary offline play. */
export interface FrameContext {
  swipeActive: boolean;
  overlayOpen: boolean;
  online: boolean;
  touchPlayEnabled: boolean;
  /** The engine advertises serve targeting (`capabilities.serveTargeting`). */
  modernServe: boolean;
  server: "player" | "ai";
  phase: string;
  practice: boolean;
  /** Pro or Legend difficulty. */
  strategic: boolean;
  playerSelectedShot: ShotPreset;
}
export const DEFAULT_FRAME_CONTEXT: FrameContext = Object.freeze({
  swipeActive: false, overlayOpen: false, online: false, touchPlayEnabled: true, modernServe: false,
  server: "player", phase: "rally", practice: false, strategic: false, playerSelectedShot: "neutral",
});

/* ---- touch stick (moveTouchStick / pointer handlers in game.js) ---- */

export interface TouchStickState {
  pointerId: number | null; originX: number; originY: number; x: number; y: number;
  dragged: boolean; usedSecondFinger: boolean; startedAt: number; target: "canvas" | "joystick" | null; radius: number;
}
export type TouchDownOutcome = "started" | "second-finger-swing" | "ignored";

export interface TouchStick {
  readonly state: Readonly<TouchStickState>;
  /** Canvas: first finger starts the stick, a second finger swings. Joystick: only starts when idle. */
  pointerDown(input: { pointerId: number; x: number; y: number; now: number; target: "canvas" | "joystick"; radius?: number }): TouchDownOutcome;
  pointerMove(input: { pointerId: number; x: number; y: number }): void;
  /** Returns `tap` when a short, undragged, single-finger canvas touch should swing. */
  pointerUp(input: { pointerId: number; x: number; y: number; now: number; touchPlayEnabled: boolean }): { tap: boolean };
  cancel(pointerId: number): void;
  clear(): void;
  vector(): { x: number; y: number };
}

export function createTouchStick(): TouchStick {
  const stick: TouchStickState = { pointerId: null, originX: 0, originY: 0, x: 0, y: 0, dragged: false, usedSecondFinger: false, startedAt: 0, target: null, radius: TOUCH_RADIUS };
  function clear(): void {
    stick.pointerId = null; stick.target = null; stick.x = 0; stick.y = 0; stick.dragged = false; stick.usedSecondFinger = false;
  }
  function pointerMove({ pointerId, x, y }: { pointerId: number; x: number; y: number }): void {
    if (pointerId !== stick.pointerId) return;
    const dx = x - stick.originX, dy = y - stick.originY;
    const distance = Math.hypot(dx, dy);
    if (distance > TOUCH_DEAD_ZONE) stick.dragged = true;
    // Keep the origin fixed so holding an offset continues running. Returning to the origin stops; the same finger can
    // reverse direction indefinitely.
    const strength = Math.min(1, Math.max(0, (distance - TOUCH_DEAD_ZONE) / (stick.radius - TOUCH_DEAD_ZONE)));
    stick.x = distance ? (dx / distance) * strength : 0;
    stick.y = distance ? (dy / distance) * strength : 0;
  }
  return {
    state: stick,
    pointerDown({ pointerId, x, y, now, target, radius }) {
      if (target === "canvas") {
        if (stick.pointerId !== null) { stick.usedSecondFinger = true; return "second-finger-swing"; }
        Object.assign(stick, { pointerId, originX: x, originY: y, x: 0, y: 0, dragged: false, usedSecondFinger: false, startedAt: now, target: "canvas", radius: radius ?? TOUCH_RADIUS });
        return "started";
      }
      if (stick.pointerId !== null) return "ignored";
      Object.assign(stick, { pointerId, originX: x, originY: y, x: 0, y: 0, dragged: false, usedSecondFinger: false, target: "joystick", radius: radius ?? TOUCH_RADIUS });
      pointerMove({ pointerId, x, y });
      return "started";
    },
    pointerMove,
    pointerUp({ pointerId, x, y, now, touchPlayEnabled }) {
      if (pointerId !== stick.pointerId) return { tap: false };
      pointerMove({ pointerId, x, y });
      const tap = stick.target === "canvas" && !stick.dragged && !stick.usedSecondFinger && now - stick.startedAt <= TOUCH_TAP_MS && touchPlayEnabled;
      clear();
      return { tap };
    },
    cancel(pointerId) { if (pointerId === stick.pointerId) clear(); },
    clear,
    vector: () => ({ x: stick.x, y: stick.y }),
  };
}

/* ---- commands (press edges) ---- */

export type InputCommand =
  | KeyboardCommand
  | { type: "swipeShot"; shot: SwipeShot };

export interface PadPoll { result: GamepadResult; commands: InputCommand[] }

export interface DeviceInputMapper extends InputMapper {
  readonly bindings: BindingsStore;
  readonly keyboard: KeyboardTracker;
  readonly gamepad: GamepadPoller;
  readonly touch: TouchStick;
  readonly swipePreferences: SwipePreferences;
  /** Same as `InputMapper.frame` with the engine-side context (serve state, difficulty, overlays). */
  frame(sample: InputSample, context?: Partial<FrameContext>): InputFrame;
  /** Poll connected pads: updates the internal gated pad vector used by `frame` and returns the press commands. */
  pollGamepad(pads: ReadonlyArray<PadLike | null | undefined>, gates: GamepadGates, options?: { selectedShot?: ShotPreset; intentionalLob?: boolean }): PadPoll;
  /** Commands implied by this sample's press edges (device-neutral path: QA drivers, tests, replays). */
  commands(sample: InputSample, options?: { selectedShot?: ShotPreset; swipeActive?: boolean; touchPlayEnabled?: boolean; fullscreen?: boolean }): InputCommand[];
  /** `clearInputs()` for devices: keys stay blocked until released, pad and touch stick are zeroed. */
  clearAll(): void;
}

export function createInputMapper({ storage }: { storage?: StorageLike | null } = {}): DeviceInputMapper {
  const bindings = createBindingsStore({ storage });
  const keyboard = createKeyboardTracker(bindings);
  const gamepad = createGamepadPoller(bindings);
  const touch = createTouchStick();
  const swipePreferences = createSwipePreferences({ storage });

  /** Convert a code set to the `keys` object `bindings.isDown` reads. */
  const asKeys = (set: ReadonlySet<string>): { [code: string]: boolean } => {
    const out: { [code: string]: boolean } = Object.create(null) as { [code: string]: boolean };
    for (const code of set) out[code] = true;
    return out;
  };

  function padVector(sample: InputSample): { x: number; y: number; power: boolean } {
    const g = sample.gamepad;
    if (!g) {
      const state = gamepad.state;
      return { x: state.x, y: state.y, power: state.power };
    }
    const b = g.buttons;
    const x = b[14] || b[15] ? Number(!!b[15]) - Number(!!b[14]) : axisWithDeadZone(g.axes[0]);
    const y = b[12] || b[13] ? Number(!!b[13]) - Number(!!b[12]) : axisWithDeadZone(g.axes[1]);
    const power = !!b[bindings.buttonFor("power") as number];
    return { x, y, power };
  }

  function frame(sample: InputSample, context: Partial<FrameContext> = {}): InputFrame {
    const ctx: FrameContext = { ...DEFAULT_FRAME_CONTEXT, ...context };
    // actionDown gate: swipe play, any overlay, or online play without touch play ignore every device.
    if (ctx.swipeActive || ctx.overlayOpen || (ctx.online && !ctx.touchPlayEnabled)) {
      return { x: 0, y: 0, vertical: false, active: false, power: false } as InputFrame;
    }
    const keys = asKeys(sample.keysDown);
    const pad = padVector(sample);
    const stick = sample.touchStick ?? touch.vector();
    const down = (action: string): boolean => bindings.isDown(action, keys);
    const left = down("left"), right = down("right"), up = down("up"), downKey = down("down");
    const x = clamp(Number(right) - Number(left) + stick.x + pad.x, -1, 1);
    const y = clamp(Number(downKey) - Number(up) + stick.y + pad.y, -1, 1);
    const frame: InputFrame & { active: boolean } = {
      x, y,
      vertical: up || downKey || Math.abs(stick.y) > 0.2 || Math.abs(pad.y) > 0.2,
      active: left || right || up || downKey || Boolean(stick.x || stick.y || pad.x || pad.y),
      power: down("power") || pad.power,
    };
    if (ctx.modernServe && ctx.server === "player" && (ctx.phase === "serve" || ctx.phase === "serveToss")) {
      const length = Math.max(1, Math.hypot(x, y));
      frame.serveAimX = x / length; frame.serveAimY = y / length;
    }
    if (ctx.strategic && ctx.phase === "rally" && !ctx.practice && !ctx.online && touch.state.pointerId === null && (left || right)) {
      const selected = ctx.playerSelectedShot;
      const shot = selected === "lob" ? "lob" : frame.vertical ? (y < 0 ? "deep" : y > 0 ? "short" : "neutral") : selected;
      // C adds placement margin without changing the direction's movement speed. Analog touch, serves, drops and lobs
      // keep their usual range.
      if (shot !== "short" && shot !== "lob" && down("placement")) frame.aimX = (x * 0.64) / 0.72;
    }
    return frame;
  }

  function toggleShot(selected: ShotPreset, target: "short" | "deep"): ShotPreset { return selected === target ? "neutral" : target; }

  function pollGamepad(pads: ReadonlyArray<PadLike | null | undefined>, gates: GamepadGates, options: { selectedShot?: ShotPreset; intentionalLob?: boolean } = {}): PadPoll {
    const result = gamepad.poll(pads, gates);
    const commands: InputCommand[] = [];
    if (result.pause) commands.push({ type: "pause" });
    let selected: ShotPreset = options.selectedShot ?? "neutral";
    if (result.pressed.short) { selected = toggleShot(selected, "short"); commands.push({ type: "selectShot", shot: selected }); }
    if (result.pressed.deep) { selected = toggleShot(selected, "deep"); commands.push({ type: "selectShot", shot: selected }); }
    if (result.pressed.lob && options.intentionalLob) { selected = selected === "lob" ? "neutral" : "lob"; commands.push({ type: "selectShot", shot: selected }); }
    if (result.pressed.hit) commands.push({ type: "swing" });
    return { result, commands };
  }

  function commands(sample: InputSample, options: { selectedShot?: ShotPreset; swipeActive?: boolean; touchPlayEnabled?: boolean; fullscreen?: boolean } = {}): InputCommand[] {
    const out: InputCommand[] = [];
    let selected: ShotPreset = options.selectedShot ?? "neutral";
    const playing = options.touchPlayEnabled ?? true;
    for (const code of sample.pressedThisFrame) {
      if (code === "KeyP" || (code === "Escape" && !options.fullscreen)) { out.push({ type: "pause" }); continue; }
      if (code === "KeyF") { out.push({ type: "fullscreen" }); continue; }
      const action = bindings.actionForKey(code);
      if (!action || !playing || options.swipeActive) continue;
      // Alternate keys are one logical button: release both before a second hit.
      const others = new Set(sample.keysDown); others.delete(code);
      if (bindings.isDown(action, asKeys(others))) continue;
      if (action === "hit") out.push({ type: "swing" });
      else if (action === "lob") out.push({ type: "lobSwing" });
      else if (action === "short" || action === "deep") { selected = toggleShot(selected, action); out.push({ type: "selectShot", shot: selected }); }
    }
    if (sample.swipe && options.swipeActive) out.push({ type: "swipeShot", shot: sample.swipe });
    return out;
  }

  return {
    bindings, keyboard, gamepad, touch, swipePreferences,
    getBindings: (device) => bindings.getBindings(device) as KeyboardBindings | ControllerBindings,
    applyBindings: (device, profile) => {
      const result = bindings.applyBindings(device, profile);
      return { ok: result.ok, saved: result.saved, errors: result.errors.map(({ action, message }) => ({ action, message })) };
    },
    frame, pollGamepad, commands,
    classifyGesture: (gesture: RawSwipeGesture) => classifyGesture(gesture),
    clearAll() { keyboard.clear(); gamepad.block(); touch.clear(); },
  };
}
