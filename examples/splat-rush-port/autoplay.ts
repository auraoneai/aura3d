/**
 * Hands-free play (`?autoplay=1`, alias `?autopilot=1`, O toggles): the closed-loop `Autopilot` starts the run, drags and
 * steers the ball into the gate of its own colour (rainbow: the nearest gate), and after a game over the results card
 * stays up for `AUTOPLAY_RESULTS_SECONDS` before the next run starts, looping forever. Everything goes through the sim's
 * normal `Input` and the page's own restart; the sim, its random stream and the recorded replays are unchanged.
 */
import { createAutoplayHarness, type AutoplayHarness } from "@aura3d/engine/game";
import { Autopilot, DEFAULT_AUTOPILOT, type AutopilotParams } from "./autopilot";
import { IDLE, type Input, type SplatRushSim } from "./sim";

export const AUTOPLAY_RESULTS_SECONDS = 3;
const STEP_SECONDS = 1 / 60;

/** True when the page asked for hands-free play (`?autoplay=1` or its aliases): the shared reader in `@aura3d/engine/game`. */
export { readAutoplayFlag as autoplayRequested } from "@aura3d/engine/game";

/**
 * Same `next` / `observe` surface as `Autopilot` (main.ts drives either), but it keeps its own run step count and loops
 * via `@aura3d/engine/game` `createAutoplayHarness`: `restart` is the page's PLAY AGAIN (it calls `sim.begin()` and resets
 * the presentation).
 */
export class AutoplayLoop {
  private pilot: Autopilot;
  private runStep = 0;
  private finished = false;
  private readonly harness: AutoplayHarness<void>;
  constructor(private readonly restart: () => void, private readonly params: AutopilotParams = DEFAULT_AUTOPILOT, resultsSeconds = AUTOPLAY_RESULTS_SECONDS) {
    this.pilot = new Autopilot(params);
    this.harness = createAutoplayHarness({
      isFinished: () => this.finished,
      restartDelay: resultsSeconds,
      onRestart: () => {
        this.runStep = 0;
        this.pilot = new Autopilot(this.params);
        this.restart();
      }
    });
  }
  /** `_stepIndex` (the page's global step count) is ignored: each run counts its own steps from 0 (start, drag, steer). */
  next(sim: SplatRushSim, _stepIndex?: number): Input {
    const phase = sim.o.phase;
    this.finished = phase === "gameOver";
    if (this.finished) {
      this.harness.tick(STEP_SECONDS);
      return IDLE;
    }
    this.harness.reset();
    if (phase === "bursting") return IDLE;
    return this.pilot.next(sim, this.runStep++);
  }
  observe(sim: SplatRushSim): void { this.pilot.observe(sim); }
  /** Runs started so far (1 for the first run). */
  get runCount(): number { return this.harness.runs; }
  diag() { return this.harness.diag(); }
}
