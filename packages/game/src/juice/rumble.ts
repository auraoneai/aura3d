/**
 * §6.6/§7.6 rumble — thin adapter over `@aura3d/input` Haptics (already probes
 * `vibrationActuator.playEffect` and `navigator.vibrate`). Maps
 * `{ ms, strong, weak }` to the Haptics request (Haptics collapses both
 * magnitudes to one `intensity` — `strong` wins), honors the settings toggle,
 * and reports Haptics' `via` in the `juice` evidence section. `playHaptic` is
 * async while `Juice.rumble` is synchronous, so the reported `via` is the
 * probe's routing verdict (the sink `playHaptic` will actually use).
 */
import { playHaptic, probeHaptics, type GamepadRumbleActuatorLike, type NavigatorVibrateLike } from "@aura3d/input";

export interface RumbleOptions {
  readonly ms: number;
  readonly strong?: number;
  readonly weak?: number;
}

export interface RumbleDriverDeps {
  readonly navigatorLike?: NavigatorVibrateLike;
  /** First capable gamepad actuator (default: first getGamepads() entry's vibrationActuator). */
  readonly actuator?: () => GamepadRumbleActuatorLike | null | undefined;
  /** Settings toggle — when false, rumble is a no-op reporting `via: "none"`. */
  readonly enabled?: () => boolean;
}

export function createRumbleDriver(deps: RumbleDriverDeps = {}) {
  const navigatorLike = deps.navigatorLike ?? (typeof navigator !== "undefined" ? (navigator as NavigatorVibrateLike) : undefined);
  const actuatorOf =
    deps.actuator ??
    (() => {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return undefined;
      for (const pad of navigator.getGamepads() ?? []) {
        const act = (pad as { vibrationActuator?: GamepadRumbleActuatorLike } | null)?.vibrationActuator;
        if (act) return act;
      }
      return undefined;
    });

  return (options: RumbleOptions): { readonly via: "navigator-vibrate" | "gamepad-rumble" | "none" } | void => {
    if (deps.enabled?.() === false) return { via: "none" };
    const intensity = options.strong ?? options.weak ?? 1;
    const actuator = actuatorOf();
    const capability = probeHaptics({ navigatorLike, actuators: [actuator ?? null] });
    void playHaptic({ durationMs: options.ms, intensity }, capability, { navigatorLike, actuator });
    return { via: capability.gamepadRumble ? "gamepad-rumble" : capability.vibrate ? "navigator-vibrate" : "none" };
  };
}
