/**
 * Pure input merging and the objective hint line, kept out of main.ts so unit tests can drive them without a DOM.
 */
import { gateOpen, objectiveOf, targetOf, type Input, type Sim } from "./sim";

/**
 * `qa`: a QA mode (objective jump, autopilot or manual stepping) with no pause on Esc / blur / Start.
 * `skipTitle`: `start=1` (QA modes skip the title too). `start=1` alone stays player mode: chapter changes and "Fly again"
 * reload with it.
 */
export function pageFlags(params: Pick<URLSearchParams, "has" | "get">): { qa: boolean; skipTitle: boolean } {
  const qa = params.has("objective") || params.has("autopilot") || params.has("manual");
  return { qa, skipTitle: params.get("start") === "1" };
}

/** What each input device reports this step; any field may be missing. */
export interface InputParts {
  readonly keys?: Partial<Input>;
  readonly pad?: Partial<Input>;
  readonly pointer?: Partial<Input>;
  /** the on-screen touch buttons: Hold (interact and brake) and Boost */
  readonly touch?: { readonly hold?: boolean; readonly boost?: boolean };
}

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));
const largest = (...values: number[]): number => values.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);

/**
 * Axes take the largest magnitude across devices; buttons OR together. The touch Hold button sends interact and brake
 * together, because every hold objective needs the rider slow (care, resonate, relay and tow under 5, the portal under 12)
 * and a finger on the canvas always asks for full throttle.
 */
export function mergeInput(parts: InputParts): Input {
  const { keys = {}, pad = {}, pointer = {}, touch = {} } = parts;
  return {
    throttle: clamp1(largest(keys.throttle ?? 0, pad.throttle ?? 0, pointer.throttle ?? 0)),
    steer: clamp1(largest(keys.steer ?? 0, pad.steer ?? 0, pointer.steer ?? 0)),
    lift: clamp1(largest(keys.lift ?? 0, pad.lift ?? 0, pointer.lift ?? 0)),
    brake: !!keys.brake || !!pad.brake || !!touch.hold,
    boost: (!!keys.boost || !!pad.boost || !!pointer.boost || !!touch.boost) && !touch.hold,
    interact: !!keys.interact || !!pad.interact || !!touch.hold
  };
}

export type Device = "keys" | "touch" | "pad";

const HOLD_NAME: Record<Device, string> = { keys: "F", touch: "the Hold button", pad: "X" };
const LIFT_NAME: Record<Device, string> = { keys: "E", touch: "a finger dragged up", pad: "the right stick up" };

export interface Hint { readonly text: string; readonly warn: boolean }

/**
 * The line under the objective: which control to hold for hold objectives, the timed gate's state and countdown, and the
 * altitude or speed limits of stealth and wake objectives (with a warning while the rider breaks them).
 */
export function objectiveHint(sim: Pick<Sim, "state" | "flight" | "time">, device: Device): Hint | null {
  const { state, flight } = sim;
  if (state.scene || state.completed) return null;
  const o = objectiveOf(state);
  const t = targetOf(state);
  const last = state.point === o.points.length - 1;
  const near = Math.hypot(state.x - t.x, state.z - t.z) < o.radius * 1.6;
  const speed = Math.abs(flight.speed);
  const hold = `${(o.hold || 1.2).toFixed(1)} s`;
  switch (o.kind) {
    case "care": case "resonate": case "relay":
      return { text: near && speed >= 5 ? `Slow down, then hold ${HOLD_NAME[device]} for ${hold}` : `In the ring, hold ${HOLD_NAME[device]} for ${hold}`, warn: near && speed >= 5 };
    case "tow":
      return state.towing ? { text: "Towing: fly the shell to the cradle", warn: false } : { text: `Slow down by the shell and hold ${HOLD_NAME[device]} for ${hold} to latch on`, warn: false };
    case "portal":
      return last ? { text: near && speed >= 12 ? `Too fast: slow down, then hold ${HOLD_NAME[device]} for ${hold}` : `At the doorway, hold ${HOLD_NAME[device]} for ${hold}`, warn: near && speed >= 12 } : null;
    case "lift":
      return { text: near && speed >= 6 ? `Slow down, then hold ${LIFT_NAME[device]} for ${hold}` : `Under the load, hold ${LIFT_NAME[device]} for ${hold}`, warn: near && speed >= 6 };
    case "timed": {
      const period = o.period || 11, open = o.open || 7, phase = sim.time % period;
      return gateOpen(sim.time, o)
        ? { text: `Gate open: ${Math.ceil(open - phase)} s left`, warn: false }
        : { text: `Gate shut (red): opens in ${Math.ceil(period - phase)} s`, warn: true };
    }
    case "stealth": {
      const max = o.maxY || 19;
      return state.y >= max ? { text: `Too high: drop below ${max} m (now ${state.y.toFixed(0)} m)`, warn: true } : { text: `Stay below ${max} m`, warn: false };
    }
    case "wake": {
      const min = o.minSpeed ?? 0, max = o.maxY ?? Infinity;
      if (state.y >= max) return { text: `Too high: skim below ${max} m`, warn: true };
      if (speed <= min && near) return { text: `Too slow: faster than ${min}`, warn: true };
      return { text: `Skim below ${max} m, faster than ${min}`, warn: false };
    }
    case "pollen":
      return speed <= 5 && near ? { text: "Keep moving to carry the pollen", warn: true } : null;
    default:
      return null;
  }
}
