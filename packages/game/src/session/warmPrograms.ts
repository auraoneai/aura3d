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
 *  5. A requested environment HDRI that is still loading is waited for (bounded), and steps 3 and 4 run again:
 *     when the HDRI lands, every material switches to its image-based-lighting program variant at once, which
 *     recompiles the whole scene and drops frames after the game believed it was settled.
 *  6. Textures upgrade one material at a time after mount (`renderer.runtime.texturedMaterials`, status `pending` until the
 *     upload lands). A material that gains its texture switches to a textured program variant, which compiles
 *     asynchronously too, so the ground, the road or a facade can drop out for frames after the game believed it was
 *     settled. Pending upgrades are waited for (bounded) and steps 3 and 4 run again.
 *
 * Call it again after a large jump (a teleport) before capturing a frame.
 */
export interface WarmableApp {
  precompile?(): Promise<unknown>;
  step(dt?: number): unknown;
  diagnostics?(): {
    readonly drawCalls?: number;
    readonly renderer?: {
      readonly environment?: { readonly hdriStatus?: string };
      readonly runtime?: { readonly texturedMaterials?: readonly { readonly status?: string }[] };
    };
  };
}

export interface WarmProgramsOptions {
  /** Warm frames stepped between the two precompile passes. Default 1. */
  readonly frames?: number;
  /** Consecutive frames with the same draw-call count that count as settled. Default 3. Needs `app.diagnostics`. */
  readonly stableFrames?: number;
  /** Upper bound on the extra frames stepped while waiting for the draw-call count to settle. Default 12. */
  readonly maxFrames?: number;
  /** Wait for a requested environment HDRI (`renderer.environment.hdriStatus === "pending"`) before settling. Default true. Needs `app.diagnostics`. */
  readonly waitForEnvironment?: boolean;
  /** Upper bound on that wait, in milliseconds. Default 20000. */
  readonly environmentTimeoutMs?: number;
  /** Wait for materials whose texture upgrade is still `pending` (`renderer.runtime.texturedMaterials`) before settling. Default true. Needs `app.diagnostics`. */
  readonly waitForTextures?: boolean;
  /** Upper bound on that wait, in milliseconds. Default 20000. */
  readonly textureTimeoutMs?: number;
}

export interface WarmProgramsResult {
  /** Precompile passes that ran (0 when the app has no `precompile`). */
  readonly passes: number;
  readonly frames: number;
  /** Extra frames stepped while the draw-call count settled. */
  readonly settleFrames: number;
  /** True when the draw-call count was stable on `stableFrames` frames in a row (always true without diagnostics). */
  readonly settled: boolean;
  /** Frames stepped while waiting for the environment HDRI (0 when none was pending). */
  readonly environmentFrames: number;
  /** False only when an HDRI was still pending when the wait timed out. */
  readonly environmentReady: boolean;
  /** Frames stepped while waiting for pending texture upgrades (0 when none was pending). */
  readonly textureFrames: number;
  /** False only when an upgrade was still pending when the wait timed out. */
  readonly texturesReady: boolean;
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
  const settleCounts = async (): Promise<void> => {
    settled = false;
    let last = Number.NaN;
    let run = 0;
    for (let pass = 0; pass < maxFrames; pass++) {
      app.step(0);
      settleFrames += 1;
      const calls = app.diagnostics!().drawCalls;
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
  };
  if (typeof app.diagnostics === "function") await settleCounts();
  let environmentFrames = 0;
  let environmentReady = true;
  const hdriPending = (): boolean => app.diagnostics?.().renderer?.environment?.hdriStatus === "pending";
  if (options.waitForEnvironment !== false && typeof app.diagnostics === "function" && hdriPending()) {
    const deadline = now() + Math.max(0, options.environmentTimeoutMs ?? 20_000);
    while (hdriPending() && now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
      app.step(0);
      environmentFrames += 1;
    }
    environmentReady = !hdriPending();
    if (typeof app.precompile === "function") {
      await app.precompile();
      passes += 1;
    }
    await settleCounts();
  }
  let textureFrames = 0;
  const texturesPending = (): boolean => (app.diagnostics?.().renderer?.runtime?.texturedMaterials ?? []).some((row) => row.status === "pending");
  let texturesReady = true;
  if (options.waitForTextures !== false && typeof app.diagnostics === "function" && texturesPending()) {
    const deadline = now() + Math.max(0, options.textureTimeoutMs ?? 20_000);
    while (texturesPending() && now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
      app.step(0);
      textureFrames += 1;
    }
    texturesReady = !texturesPending();
    if (typeof app.precompile === "function") {
      await app.precompile();
      passes += 1;
    }
    await settleCounts();
  }
  return { passes, frames, settleFrames, settled, environmentFrames, environmentReady, textureFrames, texturesReady, durationMs: now() - startedAt };
}
