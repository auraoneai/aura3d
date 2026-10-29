/**
 * Render failure policy (C1). The post chain throws `RenderDeviceError ... [WEBGL_LDR_POSTPROCESS_FAILED]` when it finds
 * any GL error pending, even one a single frame left behind. One such frame used to latch the game into "The road
 * could not load" for the rest of the session. Now a failed frame is skipped and counted; the game gives up only after
 * `limit` failures in a row, or at once when the WebGL context is lost (its GPU resources are gone).
 */
export const RENDER_FAIL_LIMIT = 30;

export type RenderVerdict = "skip" | "fatal";

export interface RenderGuard {
  /** A frame presented without throwing: the consecutive count resets. */
  ok(): void;
  /** A frame threw. `fatal` once the limit is reached or the context is lost. */
  fail(error: unknown): RenderVerdict;
  /** The context was lost: fatal at once. */
  contextLost(): void;
  readonly failed: boolean;
  readonly total: number;
  readonly consecutive: number;
  readonly lastError: string | null;
}

export function createRenderGuard(limit = RENDER_FAIL_LIMIT): RenderGuard {
  let total = 0, consecutive = 0, failed = false;
  let lastError: string | null = null;
  return {
    ok() { consecutive = 0; },
    fail(error) {
      total++;
      consecutive++;
      lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (consecutive >= limit) failed = true;
      return failed ? "fatal" : "skip";
    },
    contextLost() { failed = true; lastError = "WebGL context lost"; },
    get failed() { return failed; },
    get total() { return total; },
    get consecutive() { return consecutive; },
    get lastError() { return lastError; }
  };
}
