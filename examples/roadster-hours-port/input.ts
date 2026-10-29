/**
 * Saltwind Highway input: key bindings (remappable, persisted), held and tapped state, touch buttons, and the mapping from
 * that state to one simulation step's `RunInput`. Pure apart from the optional `Storage` passed in, so it is unit tested.
 *
 * Touch buttons dispatch virtual key codes (`touch:<action>`) through the same keydown/keyup path as the keyboard, so a
 * rebound key never breaks a touch button.
 */
import type { Run, RunInput } from "./sim";

export type Action = "left" | "right" | "up" | "down" | "thrust" | "nitro" | "rollLeft" | "rollRight" | "recover" | "pause" | "mute";
export type Bindings = Readonly<Record<Action, readonly string[]>>;

export const ACTIONS: readonly Action[] = ["up", "down", "left", "right", "thrust", "nitro", "rollLeft", "rollRight", "recover", "pause", "mute"];
export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  up: "Drive", down: "Brake (with steer to drift)", left: "Steer left, spin in the air", right: "Steer right, spin in the air",
  thrust: "Thrust", nitro: "Nitro", rollLeft: "Roll left in the air", rollRight: "Roll right in the air",
  recover: "Recover", pause: "Pause", mute: "Mute"
};

export const DEFAULT_BINDINGS: Bindings = {
  up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
  thrust: ["Space"], nitro: ["ShiftLeft", "ShiftRight"], rollLeft: ["KeyQ"], rollRight: ["KeyE"],
  recover: ["KeyR"], pause: ["Escape", "KeyP"], mute: ["KeyM"]
};

/** Virtual code a touch button sends for an action. */
export const touchCode = (action: Action): string => `touch:${action}`;

/** Codes the page never lets a player bind (they open or start things). */
const RESERVED = new Set(["Enter", "Tab"]);

/** Rebinds an action's primary key; the code is removed from every other action so one key never drives two actions. */
export function rebind(bindings: Bindings, action: Action, code: string): Bindings {
  if (RESERVED.has(code) || code.startsWith("touch:")) return bindings;
  const next = {} as Record<Action, readonly string[]>;
  for (const a of ACTIONS) next[a] = bindings[a].filter((c) => c !== code);
  next[action] = [code, ...next[action].slice(1)];
  return next;
}

const STORAGE_KEY = "saltwind-highway:bindings";
export function loadBindings(storage?: Pick<Storage, "getItem"> | null): Bindings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BINDINGS;
    const parsed = JSON.parse(raw) as Partial<Record<Action, unknown>>;
    const out = {} as Record<Action, readonly string[]>;
    for (const a of ACTIONS) {
      const v = parsed[a];
      out[a] = Array.isArray(v) && v.length && v.every((c) => typeof c === "string") ? (v as string[]) : DEFAULT_BINDINGS[a];
    }
    return out;
  } catch {
    return DEFAULT_BINDINGS;
  }
}
export function saveBindings(bindings: Bindings, storage?: Pick<Storage, "setItem"> | null): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch { /* private mode: keep in memory */ }
}

/** Readable key name for the menu: `KeyW` -> `W`, `ArrowUp` -> `Up`, `ShiftLeft` -> `Shift`. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "Escape") return "Esc";
  return code;
}

/** Held and tapped key state between simulation steps. */
export class InputState {
  readonly down = new Set<string>();
  readonly pressed = new Set<string>();
  constructor(public bindings: Bindings = DEFAULT_BINDINGS) {}

  actionOf(code: string): Action | null {
    if (code.startsWith("touch:")) {
      const a = code.slice(6) as Action;
      return ACTIONS.includes(a) ? a : null;
    }
    for (const a of ACTIONS) if (this.bindings[a].includes(code)) return a;
    return null;
  }
  keydown(code: string): void { this.down.add(code); this.pressed.add(code); }
  keyup(code: string): void { this.down.delete(code); }
  /** Window blur: nothing stays held. */
  clear(): void { this.down.clear(); this.pressed.clear(); }
  /** Called after every simulation step: a tap counts for exactly one step. */
  endStep(): void { this.pressed.clear(); }

  private codes(action: Action): readonly string[] { return [...this.bindings[action], touchCode(action)]; }
  /** Held now, or tapped since the last step (a tap shorter than one step still counts once). */
  held(action: Action): boolean { return this.codes(action).some((c) => this.down.has(c) || this.pressed.has(c)); }
  /** Pressed since the last step (edge): one-shot actions read this, never `held`. */
  tapped(action: Action): boolean { return this.codes(action).some((c) => this.pressed.has(c)); }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** One simulation step's input from the held/tapped state. Recover is edge-triggered: one tap recovers once. */
export function runInput(run: Pick<Run, "grounded" | "phase" | "v">, input: InputState): RunInput {
  const air = !run.grounded && run.phase === "running";
  const right = input.held("right"), left = input.held("left"), fwd = input.held("up"), back = input.held("down");
  const steer = clamp(+right - +left, -1, 1);
  const stopping = !air && back;
  return {
    throttle: !stopping && fwd && !air ? 1 : 0, brake: stopping ? (Math.abs(steer) > 0.3 && run.v > 18 ? 0.15 : 1) : 0, steer: air ? 0 : steer,
    thrust: input.held("thrust"), drift: stopping && Math.abs(steer) > 0.3 && run.v > 18, nitro: input.held("nitro"),
    roll: clamp(+input.held("rollRight") - +input.held("rollLeft"), -1, 1), spin: air ? steer : 0, flip: air ? clamp(+fwd - +back, -1, 1) : 0,
    recover: input.tapped("recover")
  };
}

/** Touch buttons: element id suffix, action, and whether the button holds (drive, steer, thrust, nitro) or taps (recover, pause). */
export const TOUCH_BUTTONS: readonly { readonly id: string; readonly action: Action; readonly hold: boolean; readonly label: string }[] = [
  { id: "touch-left", action: "left", hold: true, label: "Steer left" },
  { id: "touch-right", action: "right", hold: true, label: "Steer right" },
  { id: "touch-roll-left", action: "rollLeft", hold: true, label: "Roll left" },
  { id: "touch-roll-right", action: "rollRight", hold: true, label: "Roll right" },
  { id: "touch-brake", action: "down", hold: true, label: "Brake" },
  { id: "touch-throttle", action: "up", hold: true, label: "Drive" },
  { id: "touch-thrust", action: "thrust", hold: true, label: "Thrust" },
  { id: "touch-nitro", action: "nitro", hold: true, label: "Nitro" },
  { id: "touch-recover", action: "recover", hold: false, label: "Recover" }
];

/** Toasts and coach lines name keys; on a touch device they name the on-screen buttons instead. */
export function promptText(text: string, touch: boolean, bindings: Bindings = DEFAULT_BINDINGS): string {
  const recover = touch ? "TAP RECOVER" : `${keyLabel(bindings.recover[0]!).toUpperCase()} TO RECOVER`;
  let out = text.replace("R TO RECOVER", recover);
  if (touch) out = out.replace("tap Shift again", "tap Nitro again").replace("double-tap Shift", "double-tap Nitro").replace("Space", "Thrust");
  else if (bindings.nitro[0] !== "ShiftLeft") out = out.replace(/Shift/g, keyLabel(bindings.nitro[0]!));
  return out;
}
