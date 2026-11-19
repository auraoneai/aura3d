/**
 * Hands-free play (`?autoplay=1`, alias `?autopilot=1`, O toggles): the closed-loop `Autopilot` starts the run, drags and
 * steers the ball into the gate of its own colour (rainbow: the nearest gate), and after a game over the results card
 * stays up for `AUTOPLAY_RESULTS_SECONDS` before the next run starts, looping forever. Everything goes through the sim's
 * normal `Input` and the page's own restart; the sim, its random stream and the recorded replays are unchanged.
 */
import { Autopilot, DEFAULT_AUTOPILOT, type AutopilotParams } from "./autopilot";
import { IDLE, type Input, type SplatRushSim } from "./sim";

export const AUTOPLAY_RESULTS_SECONDS = 3;
const STEP_SECONDS = 1 / 60;

/** True when the page asked for hands-free play (`?autoplay=1` or the older `?autopilot=1`). */
export function autoplayRequested(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.get("autoplay") === "1" || p.get("autopilot") === "1";
}

/**
 * Same `next` / `observe` surface as `Autopilot` (main.ts drives either), but it keeps its own run step count and loops:
 * `restart` is the page's PLAY AGAIN (it calls `sim.begin()` and resets the presentation).
 */
export class AutoplayLoop {
  private pilot: Autopilot;
  private runStep = 0;
  private overSteps = 0;
  private runs = 1;
  constructor(private readonly restart: () => void, private readonly params: AutopilotParams = DEFAULT_AUTOPILOT, private readonly resultsSeconds = AUTOPLAY_RESULTS_SECONDS) {
    this.pilot = new Autopilot(params);
  }
  /** `_stepIndex` (the page's global step count) is ignored: each run counts its own steps from 0 (start, drag, steer). */
  next(sim: SplatRushSim, _stepIndex?: number): Input {
    const phase = sim.o.phase;
    if (phase === "gameOver") {
      if (++this.overSteps * STEP_SECONDS < this.resultsSeconds) return IDLE;
      this.overSteps = 0;
      this.runStep = 0;
      this.runs++;
      this.pilot = new Autopilot(this.params);
      this.restart();
      return IDLE;
    }
    this.overSteps = 0;
    if (phase === "bursting") return IDLE;
    return this.pilot.next(sim, this.runStep++);
  }
  observe(sim: SplatRushSim): void { this.pilot.observe(sim); }
  /** Runs started so far (1 for the first run). */
  get runCount(): number { return this.runs; }
}
