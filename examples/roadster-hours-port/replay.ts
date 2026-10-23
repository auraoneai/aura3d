// Drive the ported simulation exactly the way the original game drives its own: one `input(state)` call per fixed step,
// then one `stepRun`. Shared by the unit tests (replay of the recorded reference) and the in-page hooks.

import { SIM_STEP, createRun, defaultCareer, stepRun, type Career, type Run, type RunInput } from "./sim";

export interface SimulateOptions {
  readonly level: number;
  /** Called with the state BEFORE step `step`; returns that step's input (the original's `skybreakDemo.input(z)`). */
  readonly input: (run: Run, step: number) => RunInput;
  /** Observation point: same moment the original's input hook sees the state. */
  readonly onStep?: (run: Run, step: number) => void;
  readonly maxSteps?: number;
  readonly career?: Career;
}

export interface SimulateResult { readonly run: Run; readonly career: Career; readonly steps: number }

export function simulateRun(options: SimulateOptions): SimulateResult {
  const career = options.career ?? defaultCareer();
  const run = createRun(options.level, career);
  const max = options.maxSteps ?? 120 * 600;
  let steps = 0;
  while (run.phase !== "complete" && steps < max) {
    options.onStep?.(run, steps);
    stepRun(run, options.input(run, steps), SIM_STEP, career);
    steps++;
  }
  return { run, career, steps };
}
