import { METRES_PER_UNIT } from "../contract";
import type { ControlsPort } from "./controls";

export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** match-engine.js `pointLabel`: the displayed point for `a` against `b` (deuce and advantage after 3-3). */
export function pointLabel(a: number, b: number): string {
  if (a >= 3 && b >= 3) {
    if (a === b) return "40";
    return a > b ? "AD" : "40";
  }
  return ["0", "15", "30", "40"][Math.min(a, 3)] as string;
}

/** Movement keys read as "arrows/WASD" when the bindings are the defaults (game.js `movementLabel`). */
export function movementLabel(controls: Pick<ControlsPort, "getBindings" | "labelFor">): string {
  const bindings = controls.getBindings("keyboard") as unknown as Record<string, readonly [string, string | null]>;
  const ids = ["up", "left", "down", "right"] as const;
  const arrows = ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
  const wasd = ["KeyW", "KeyA", "KeyS", "KeyD"];
  const isDefault = ids.every((id, index) => bindings[id]?.[0] === arrows[index] && bindings[id]?.[1] === wasd[index]);
  return isDefault ? "arrows/WASD" : ids.map((id) => controls.labelFor(id, "keyboard", { all: true })).join(" · ");
}

/** Replace control names in help copy with the player's current bindings (game.js `controlText`). */
export function controlText(text: string, controls: Pick<ControlsPort, "getBindings" | "labelFor">): string {
  const keyLabel = (action: string, all = false): string => controls.labelFor(action, "keyboard", { all });
  const move = movementLabel(controls);
  const labels: Record<string, string> = {
    Space: keyLabel("hit"), SPACE: keyLabel("hit").toUpperCase(), Shift: keyLabel("power", true),
    "Q/E": `${keyLabel("short")}/${keyLabel("deep")}`, Q: keyLabel("short"), E: keyLabel("deep"), R: keyLabel("lob"), C: keyLabel("placement"),
    "arrows/WASD": move, "Arrows/WASD": move
  };
  return text.replace(/\b(?:arrows\/WASD|Arrows\/WASD|SPACE|Space|Shift|Q\/E|Q|E|R|C)\b/g, (token) => labels[token] ?? token);
}

export const reducedMotion = (): boolean =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** physics.js `speedKph`: ball speed in km/h from normalised velocities. */
export const ballSpeedKph = (ball: { vx: number; vy: number; vz: number }): number =>
  Math.round(Math.hypot(ball.vx * METRES_PER_UNIT.x, ball.vy * METRES_PER_UNIT.y, ball.vz * METRES_PER_UNIT.z) * 3.6);
