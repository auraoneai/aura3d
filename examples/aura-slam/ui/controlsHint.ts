import type { ControlsPort } from "./controls";
import { movementLabel } from "./format";

/** Legacy swing aliases from the live page: J short, K deep with power, L lob. They work only while no action is bound to them. */
export const SWING_ALIAS_KEYS = { KeyJ: "short", KeyK: "deep", KeyL: "lob" } as const;
export type SwingAliasKey = keyof typeof SWING_ALIAS_KEYS;

/** True when every alias key is free (not bound to any keyboard action), so the hint may list them. */
export function swingAliasesFree(controls: Pick<ControlsPort, "actionForKey">): boolean {
  return (Object.keys(SWING_ALIAS_KEYS) as SwingAliasKey[]).every((code) => !controls.actionForKey(code));
}

/**
 * The bottom controls hint (C3), built from the live bindings instead of static HTML, so it names the right keys and follows
 * rebinds. Default text: "MOVE & AIM: ARROWS/WASD · SERVE & HIT: SPACE / J / K / L · SHORT: Q · DEEP: E · LOB: R (PRO/LEGEND) ·
 * POWER: SHIFT · PAUSE: P".
 */
export function controlsHintText(
  controls: Pick<ControlsPort, "getBindings" | "labelFor" | "actionForKey">,
  options: { lobAllLevels?: boolean } = {}
): string {
  const key = (action: string, all = false): string => controls.labelFor(action, "keyboard", { all });
  const hit = swingAliasesFree(controls) ? `${key("hit")} / J / K / L` : key("hit");
  const power = key("power", true).replace(/^(Left |Right )?Shift( \/ (Left |Right )?Shift)?$/i, "Shift");
  const lobGate = options.lobAllLevels ? "" : " (Pro/Legend)";
  return [
    `Move & aim: ${movementLabel(controls)}`,
    `Serve & hit: ${hit}`,
    `Short: ${key("short")}`,
    `Deep: ${key("deep")}`,
    `Lob: ${key("lob")}${lobGate}`,
    `Power: ${power}`,
    "Pause: P"
  ].join(" · ").toUpperCase();
}
