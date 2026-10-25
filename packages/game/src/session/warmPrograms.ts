/**
 * Settle every shader program the first frames need before the game shows its first frame.
 *
 * Programs compile asynchronously and a draw whose program is still compiling is skipped, so a game that renders
 * straight after `await app.ready()` shows a partial scene (a missing road, missing buildings) for as long as the
 * compile takes: seconds on a slow or busy GPU. `ready()` settles the mount; this settles the programs.
 *
 *  1. `precompile()` settles the programs predicted from the mounted scene.
 *  2. A frame is stepped so the renderer kicks the exact feature records (shadows, fog, image-based lighting).
 *  3. `precompile()` again settles any record that differed from the prediction.
 *  4. Frames are stepped until the draw-call count is the same on `stableFrames` frames in a row, because which
 *     variants an item needs depends on its state relative to the camera and only shows once it is drawn.
 *
 * Call it again after a large jump (a teleport) before capturing a frame.
 */
export interface WarmableApp {
  precompile?(): Promise<unknown>;
  step(dt?: number): unknown;
  diagnostics?(): { readonly drawCalls?: number };
}

export interface WarmProgramsOptions {
  /** Warm frames stepped between the two precompile passes. Default 1. */
  readonly frames?: number;
  /** Consecutive frames with the same draw-call count that count as settled. Default 3. Needs `app.diagnostics`. */
  readonly stableFrames?: number;
  /** Upper bound on the extra frames stepped while waiting for the draw-call count to settle. Default 12. */
  readonly maxFrames?: number;
}

export interface WarmProgramsResult {
  /** Precompile passes that ran (0 when the app has no `precompile`). */
  readonly passes: number;
  readonly frames: number;
  /** Extra frames stepped while the draw-call count settled. */
  readonly settleFrames: number;
  /** True when the draw-call count was stable on `stableFrames` frames in a row (always true without diagnostics). */
  readonly settled: boolean;
  readonly durationMs: number;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export async function warmPrograms(app: WarmableApp, options: WarmProgramsOptions = {}): Promise<WarmProgramsResult> {
  const startedAt = now();
  const frames = Math.max(0, Math.floor(options.frames ?? 1));
  const stableFrames = Math.max(2, Math.floor(options.stableFrames ?? 3));
  const maxFrames = Math.max(0, Math.floor(options.maxFrames ?? 12));
  let passes = 0;
  if (typeof app.precompile === "function") {
    await app.precompile();
    passes += 1;
  }
  for (let i = 0; i < frames; i++) app.step(0);
  if (typeof app.precompile === "function") {
    await app.precompile();
    passes += 1;
  }
  let settleFrames = 0;
  let settled = true;
  if (typeof app.diagnostics === "function") {
    settled = false;
    let last = Number.NaN;
    let run = 0;
    while (settleFrames < maxFrames) {
      app.step(0);
      settleFrames += 1;
      const calls = app.diagnostics().drawCalls;
      if (typeof calls === "number" && calls === last) run += 1;
      else {
        run = 1;
        last = typeof calls === "number" ? calls : Number.NaN;
      }
      if (run >= stableFrames) {
        settled = true;
        break;
      }
      if (typeof app.precompile === "function") await app.precompile();
    }
  }
  return { passes, frames, settleFrames, settled, durationMs: now() - startedAt };
}
