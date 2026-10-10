/**
 * T0-10 (PRD-16 §2): fail-fast scene-adapter waits.
 *
 * Before this module the aura3d adapter waited up to 90 s for the first draw
 * and 180 s for the HDRI chain, then published READY anyway — a failed mount
 * (zero draws, errors recorded) looked "ready" in ~1 s with a masked result,
 * and a hung pipeline burned the whole 240 s page timeout. These helpers make
 * the adapter throw instead: the page router publishes `__QR_ERROR__` and
 * capture.mjs records the real failure in seconds, not minutes.
 */

/** Zero draws past the wait deadline — the page mounts but renders nothing. */
export class NoDrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoDrawError";
  }
}

/** capture.mjs default --timeout, used when no ?timeout= URL param is present. */
export const DEFAULT_CAPTURE_TIMEOUT_MS = 240_000;

/**
 * Adapter-side budget: the adapter must conclude (READY or throw) inside the
 * page's own waitForFunction window, so its waits are capped at 0.8 × the
 * capture timeout that capture.mjs forwards as ?timeout=<ms>.
 */
export function adapterBudgetMs(captureTimeoutMs: number): number {
  return Math.max(1_000, Math.floor(captureTimeoutMs * 0.8));
}

/** Minimal app surface the draw wait needs (AuraApp satisfies it). */
export interface DrawWaitApp {
  step(dt: number): unknown;
  diagnostics(): { drawCalls: number; errors: readonly unknown[] };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" && message.length > 0 ? message : String(error);
}

/**
 * Step until the first real draw, then return.
 *
 * Throws NoDrawError immediately when the app has recorded errors while
 * producing zero draws — a mount or renderer-pipeline failure the draw wait
 * can never recover from — and throws NoDrawError when `deadlineMs` expires
 * with zero draws. A scene that drew at least once returns normally; its
 * errors stay in the ready payload for capture.mjs to classify.
 */
export async function waitForFirstDraw(
  app: DrawWaitApp,
  deadlineMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<void> {
  const deadline = performance.now() + deadlineMs;
  for (;;) {
    app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0) return;
    if (diagnostics.errors.length > 0) {
      throw new NoDrawError(
        `mount-failed: renderer produced no draws and recorded ${diagnostics.errors.length} error(s): ` +
          `${diagnostics.errors.map(errorText).join("; ").slice(0, 600)}`
      );
    }
    if (performance.now() >= deadline) {
      throw new NoDrawError(
        `no-draw-timeout: drawCalls=0 after ${Math.round(deadlineMs)} ms with zero recorded errors — ` +
          `the engine mounted but never rendered a frame`
      );
    }
    await sleep(50);
  }
}
