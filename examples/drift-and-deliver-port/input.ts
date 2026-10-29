/**
 * Gridlock Courier: keyboard mapping. Keys are read by physical position (`KeyboardEvent.code`), so WASD sits under
 * the same fingers on AZERTY, QWERTZ and Dvorak. `key` is only a fallback for synthetic events that carry no `code`.
 */
import type { Keys } from "./sim";

export const KEYMAP: Readonly<Record<string, keyof Keys>> = {
  KeyW: "w", ArrowUp: "w", KeyA: "a", ArrowLeft: "a", KeyS: "s", ArrowDown: "s", KeyD: "d", ArrowRight: "d",
  ShiftLeft: "shift", ShiftRight: "shift", Space: "space"
};
const KEY_FALLBACK: Readonly<Record<string, keyof Keys>> = { w: "w", arrowup: "w", a: "a", arrowleft: "a", s: "s", arrowdown: "s", d: "d", arrowright: "d", shift: "shift", " ": "space" };
const CODE_FALLBACK: Readonly<Record<string, string>> = { l: "KeyL", m: "KeyM", p: "KeyP", r: "KeyR", escape: "Escape", enter: "Enter" };

export type KeyLike = Pick<KeyboardEvent, "code" | "key">;

/** The physical code of a key event (`code`, or one derived from `key` when `code` is empty). */
export const codeOf = (e: KeyLike): string => e.code || CODE_FALLBACK[(e.key || "").toLowerCase()] || "";

/** Which driving key an event holds, or undefined. */
export function drivingKey(e: KeyLike): keyof Keys | undefined {
  if (e.code) return KEYMAP[e.code];
  return KEY_FALLBACK[(e.key || "").toLowerCase()];
}

export type KeyAction = "headlights" | "pause" | "mute" | "restart";

/** One-shot actions fire on the first keydown only (`repeat` is ignored), so holding L no longer flickers the lights. */
export function keyAction(e: KeyLike & Pick<KeyboardEvent, "repeat">): KeyAction | undefined {
  if (e.repeat) return undefined;
  const code = codeOf(e);
  if (code === "KeyL") return "headlights";
  if (code === "KeyP" || code === "Escape") return "pause";
  if (code === "KeyM") return "mute";
  if (code === "KeyR") return "restart";
  return undefined;
}
