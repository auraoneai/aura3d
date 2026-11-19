/**
 * Hands-free play (`?autoplay=1`, alias `?autopilot=1`, P toggles): the capture's closed-loop controller drives each leg
 * (balance the lean, brake for the platform), the doors open at every station and the tram departs once the riders
 * have boarded. When the service completes, the results card stays up for `AUTOPLAY_RESULTS_SECONDS`, then a new
 * service starts, looping forever. Everything goes through the sim's normal actions and `StepInput`; the sim itself is
 * unchanged (the reference replay drives the same actions).
 */
import { controllerInput, type ControllerParams } from "./replay";
import { DT, actionDepart, actionDoors, actionNewService, type SimData, type SimState, type StepInput } from "./sim";

export const AUTOPLAY_RESULTS_SECONDS = 3;

/** True when the page asked for hands-free play (`?autoplay=1` or the older `?autopilot=1`). */
export function autoplayRequested(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.get("autoplay") === "1" || p.get("autopilot") === "1";
}

export interface AutoplayDriver {
  /** Issues this step's actions on `sim` and returns the step input. `restarted` is true on the step a new service began. */
  step(sim: SimState, data: SimData): { input: StepInput; restarted: boolean };
  /** Seconds the completed service's results have been shown so far (0 while a service is running). */
  readonly resultsSeconds: number;
}

export function createAutoplayDriver(controller: ControllerParams, resultsSeconds = AUTOPLAY_RESULTS_SECONDS): AutoplayDriver {
  let shown = 0;
  return {
    get resultsSeconds() { return shown; },
    step(sim, data) {
      if (sim.attempt.status === "complete") {
        shown += DT;
        if (shown < resultsSeconds) return { input: {}, restarted: false };
        shown = 0;
        actionNewService(sim);
        return { input: {}, restarted: true };
      }
      shown = 0;
      if (sim.phase === "docked") { actionDoors(sim); return { input: {}, restarted: false }; }
      if (sim.phase === "ready") { actionDepart(sim); return { input: {}, restarted: false }; }
      return { input: sim.phase === "enroute" ? controllerInput(sim, data, controller) : {}, restarted: false };
    }
  };
}
