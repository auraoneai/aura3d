/**
 * Capability-gated haptics: `navigator.vibrate` patterns plus gamepad rumble
 * (`vibrationActuator.playEffect`). Every entry point probes first and reports
 * `{ played: false, reason }` instead of fake success on unsupported hosts.
 */

export interface NavigatorVibrateLike {
  vibrate?: (pattern: number | readonly number[]) => boolean;
}

export interface GamepadRumbleActuatorLike {
  playEffect?: (type: string, params: Record<string, number>) => Promise<string> | string;
}

export interface HapticProbeInput {
  readonly navigatorLike?: NavigatorVibrateLike;
  readonly actuators?: readonly (GamepadRumbleActuatorLike | null | undefined)[];
}

export interface HapticsCapability {
  readonly vibrate: boolean;
  readonly gamepadRumble: boolean;
  readonly details: string;
}

export interface HapticRequest {
  /** Vibration pattern in ms (single buzz or on/off pulses). */
  readonly pattern?: number | readonly number[];
  /** Rumble intensity in [0, 1]. Defaults to 1 when rumbling without an explicit value. */
  readonly intensity?: number;
  /** Rumble duration in ms. Defaults to 60. */
  readonly durationMs?: number;
}

export interface HapticResult {
  readonly played: boolean;
  readonly via: "navigator-vibrate" | "gamepad-rumble" | "none";
  readonly reason: string;
}

/** Probe what the host actually supports. Never touches hardware. */
export function probeHaptics(input: HapticProbeInput = {}): HapticsCapability {
  const vibrate = typeof input.navigatorLike?.vibrate === "function";
  const gamepadRumble = (input.actuators ?? []).some((actuator) => typeof actuator?.playEffect === "function");
  const parts: string[] = [];
  parts.push(vibrate ? "navigator.vibrate available" : "navigator.vibrate unavailable");
  parts.push(gamepadRumble ? "gamepad rumble available" : "gamepad rumble unavailable");
  return { vibrate, gamepadRumble, details: parts.join("; ") };
}

function validateRequest(request: HapticRequest): string | null {
  if (request.intensity !== undefined && (!Number.isFinite(request.intensity) || request.intensity < 0 || request.intensity > 1)) {
    return "Haptic intensity must be in [0, 1].";
  }
  if (request.durationMs !== undefined && (!Number.isFinite(request.durationMs) || request.durationMs < 0)) {
    return "Haptic durationMs must be a non-negative finite number.";
  }
  return null;
}

/**
 * Play a haptic effect through the first capable sink. Prefers gamepad rumble
 * when an actuator is supplied, else falls back to `navigator.vibrate`.
 * Capability-gated: returns `played: false` with a cause instead of claiming
 * feedback on an incapable host.
 */
export async function playHaptic(
  request: HapticRequest,
  capability: HapticsCapability,
  sinks: { readonly navigatorLike?: NavigatorVibrateLike; readonly actuator?: GamepadRumbleActuatorLike | null } = {}
): Promise<HapticResult> {
  const invalid = validateRequest(request);
  if (invalid) return { played: false, via: "none", reason: invalid };

  if (sinks.actuator?.playEffect && capability.gamepadRumble) {
    const durationMs = Math.max(0, request.durationMs ?? 60);
    const intensity = request.intensity ?? 1;
    try {
      const outcome = await sinks.actuator.playEffect("dual-rumble", {
        duration: durationMs,
        strongMagnitude: intensity,
        weakMagnitude: intensity
      });
      if (outcome === "complete") {
        return { played: true, via: "gamepad-rumble", reason: "dual-rumble effect completed" };
      }
      return { played: false, via: "none", reason: `gamepad rumble rejected with outcome "${String(outcome)}"` };
    } catch (error) {
      return { played: false, via: "none", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  if (sinks.navigatorLike?.vibrate && capability.vibrate) {
    const pattern = request.pattern ?? request.durationMs ?? 60;
    let vibrated = false;
    try {
      vibrated = sinks.navigatorLike.vibrate(pattern) === true;
    } catch (error) {
      return { played: false, via: "none", reason: error instanceof Error ? error.message : String(error) };
    }
    return vibrated
      ? { played: true, via: "navigator-vibrate", reason: "vibration pattern accepted" }
      : { played: false, via: "none", reason: "navigator.vibrate returned false" };
  }

  return { played: false, via: "none", reason: `no capable haptic sink (${capability.details})` };
}
