import { games } from "@aura3d/engine";

/**
 * Iron Crown input map, touch bindings and the controls hint.
 *
 * Kept out of main.ts so unit tests can check that every touch binding names a declared action (audit IC-01: the touch
 * Left/Right buttons once drove the undeclared actions "left"/"right", so phone players could not walk).
 */

const fightingControls = games.fighting.controls();

/** Default bindings. Players can rebind these (see `loadBindings`); the defaults stay the reset target. */
export const DEFAULT_ACTIONS = {
  ...fightingControls.actions,
  moveLeft: ["KeyA", "ArrowLeft", "GamepadDPadLeft"],
  moveRight: ["KeyD", "ArrowRight", "GamepadDPadRight"],
  jump: ["KeyW", "ArrowUp", "GamepadDPadUp", "GamepadA"],
  crouch: ["KeyS", "ArrowDown", "GamepadDPadDown"],
  guard: ["KeyQ", "GamepadLB"],
  light: ["KeyJ", "Space", "KeyZ", "GamepadX"],
  heavy: ["KeyK", "KeyX", "GamepadY"],
  special: ["KeyL", "KeyC", "GamepadB"],
  throw: ["KeyU", "GamepadLT"],
  dash: ["ShiftLeft", "ShiftRight", "GamepadRB"],
  pause: ["Escape", "GamepadStart"]
} as const satisfies Record<string, readonly string[]>;

export type ActionId = keyof typeof DEFAULT_ACTIONS;

/** Actions shown (and rebindable) in the controls sheet, in display order. */
export const REBINDABLE_ACTIONS: readonly { readonly id: ActionId; readonly label: string }[] = [
  { id: "moveLeft", label: "Move left" },
  { id: "moveRight", label: "Move right" },
  { id: "jump", label: "Jump" },
  { id: "crouch", label: "Crouch" },
  { id: "guard", label: "Block" },
  { id: "dash", label: "Dash" },
  { id: "light", label: "Light" },
  { id: "heavy", label: "Heavy" },
  { id: "special", label: "Special" },
  { id: "throw", label: "Throw" }
];

/** Touch preset `dpad-4btn` control ids → declared actions. */
export const TOUCH_BINDINGS: Readonly<Record<string, ActionId>> = {
  left: "moveLeft",
  right: "moveRight",
  block: "guard",
  light: "light",
  heavy: "heavy",
  special: "special",
  jump: "jump"
};

/**
 * Extra touch buttons the preset has no slot for. Rects use the preset's safe-area-relative units
 * (w 0.125 x h 0.06 is about 49 x 51 CSS px at 390x844, the 48 px minimum).
 */
export const EXTRA_TOUCH_BUTTONS: readonly { readonly id: string; readonly action: ActionId; readonly label: string; readonly rect: { x: number; y: number; w: number; h: number } }[] = [
  { id: "throw", action: "throw", label: "Throw", rect: { x: 0.845, y: 0.785, w: 0.125, h: 0.06 } },
  { id: "dash", action: "dash", label: "Dash", rect: { x: 0.555, y: 0.785, w: 0.125, h: 0.06 } },
  { id: "crouch", action: "crouch", label: "Crouch", rect: { x: 0.1, y: 0.82, w: 0.125, h: 0.06 } },
  { id: "pause", action: "pause", label: "Pause", rect: { x: 0.845, y: 0.71, w: 0.125, h: 0.06 } }
];

/** Touch control values that are not declared actions (empty when the bindings are sound). */
export function undeclaredTouchActions(
  bindings: Readonly<Record<string, string>>,
  actions: Readonly<Record<string, readonly string[]>>
): string[] {
  return Object.entries(bindings)
    .filter(([, action]) => !(action in actions))
    .map(([control, action]) => `${control}→${action}`);
}

export type BindingMap = Record<ActionId, string[]>;

const STORAGE_KEY = "iron-crown.bindings.v1";

export function defaultBindings(): BindingMap {
  const out = {} as BindingMap;
  for (const [id, codes] of Object.entries(DEFAULT_ACTIONS)) out[id as ActionId] = [...codes];
  return out;
}

/**
 * Rebind `action`'s primary keyboard key to `code`. Gamepad bindings stay. A key already used by another action is moved
 * off that action, so one key never drives two actions.
 */
export function rebind(map: BindingMap, action: ActionId, code: string): BindingMap {
  const next = {} as BindingMap;
  for (const [id, codes] of Object.entries(map)) next[id as ActionId] = codes.filter((c) => c !== code);
  const pads = next[action].filter((c) => c.startsWith("Gamepad"));
  const keys = next[action].filter((c) => !c.startsWith("Gamepad"));
  next[action] = [code, ...keys.slice(1), ...pads];
  return next;
}

export function loadBindings(storage: Pick<Storage, "getItem"> | undefined): BindingMap {
  const base = defaultBindings();
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    for (const id of Object.keys(base) as ActionId[]) {
      const codes = saved[id];
      if (Array.isArray(codes) && codes.every((c) => typeof c === "string")) base[id] = [...codes];
    }
  } catch {
    // Corrupt storage falls back to the defaults.
  }
  return base;
}

export function saveBindings(storage: Pick<Storage, "setItem" | "removeItem"> | undefined, map: BindingMap | null): void {
  try {
    if (!map) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Private mode or a full quota: keep the in-memory binding only.
  }
}

/** Short key label for the hint and the controls sheet. */
export function keyLabel(code: string | undefined): string {
  if (!code) return "?";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const named: Record<string, string> = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "Space", ShiftLeft: "Shift", ShiftRight: "Shift",
    Escape: "Esc", Enter: "Enter", Tab: "Tab", ControlLeft: "Ctrl", AltLeft: "Alt"
  };
  return named[code] ?? code;
}

const firstKey = (map: Readonly<Record<string, readonly string[]>>, action: ActionId): string | undefined =>
  map[action]?.find((c) => !c.startsWith("Gamepad"));

/** The fight hint, generated from the live bindings so it never drifts from the input map (audit IC-14). */
export function controlsHint(map: Readonly<Record<string, readonly string[]>>): string {
  const k = (a: ActionId) => keyLabel(firstKey(map, a));
  return [
    `${k("moveLeft")}/${k("moveRight")} move`,
    `${k("jump")} jump`,
    `${k("crouch")} crouch`,
    `${k("guard")} or hold back to block`,
    `${k("dash")} dash`,
    `${k("light")} light`,
    `${k("heavy")} heavy`,
    `${k("special")} special (full SUPER)`,
    `${k("throw")} throw`
  ].join(" · ");
}
